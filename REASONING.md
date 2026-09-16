# Reasoning

## Reading the problem

Stripped down, the brief asks for five things done *correctly*, in this order:

1. A trustworthy **plain** total (tiered seats × quantity).
2. **Availability** — sold-out tiers must be un-bookable, not just visible with a warning.
3. **Offers** that *stack* sensibly — a flat discount and a capped percentage discount.
4. A **fee** and **tax** layered on top, correctly.
5. **Exact-paisa** totals with a **line-by-line breakup**, because customers are explicitly demanding to see it.

And, explicitly: *"build it for any cinema counter, not one show"* — so
tiers, prices, tax rules, fees and offers are all **configuration**, never
constants inside the pricing logic. I built the engine in exactly that
order — plain total → availability → offers → fee/tax → breakup —
committing to the data shapes early so later layers didn't force a rewrite
of earlier ones. Everything specific to *this* example cinema (prices,
GST %, fee amount, discount %) lives in one file, `src/config.ts`, clearly
marked as illustrative; `src/pricing.ts` never references a literal price
or rate.

## Why integer paise, everywhere

The single biggest source of "why doesn't this total match" bugs in
billing systems is floating-point money math — `0.1 + 0.2 !== 0.3` in
every mainstream language. So no rupee-with-decimals value is ever allowed
to exist inside the pricing pipeline: everything is an integer number of
paise from the moment a price enters (`toPaise()`) to the moment it's
displayed (`formatPaise()`). This alone eliminates an entire class of
"off by ₹0.01" bugs, and it's the actual mechanism behind the brief's
"total to the exact paisa" requirement — not just a rounding function
applied at the end, but a constraint on every intermediate value.

## Why a largest-remainder allocator for discounts

A discount is calculated once, against the booking's *total*. But the
brief demands a **line-by-line breakup**, so that single number has to be
attributed back across tiers. Splitting it naively
(`discount * lineGross / grossTotal`, rounded per line) does not
generally sum back to the original discount — a paisa or two can be
gained or lost. I used the **Largest Remainder Method** (the same
apportionment algorithm used to allocate parliamentary seats
proportionally): compute each line's ideal fractional share, floor it,
then hand the leftover whole paise to the lines with the largest
fractional remainders first. This *guarantees*
`sum(line discounts) === total discount` exactly, while staying as close
as mathematically possible to a fair proportional split — the mechanism
that makes "exact to the paisa" actually true rather than usually true.
It's unit-tested directly (`money.test.ts`) with deliberately awkward
numbers (e.g. distributing 10 across three equal weights, where the ideal
share is a repeating decimal).

## Order of offer application — a documented choice, not an accident

The brief lists a flat festival discount and a capped member percentage
discount without specifying stacking order, and order genuinely changes
the result (10% off, *then* ₹50 off, differs from the reverse). I made an
explicit choice: **flat discount first, then the percentage discount on
what remains, then its own cap is enforced.** Rationale: a festival promo
behaves like a storefront-level price adjustment (a coupon on the sticker
price), while a member discount is a loyalty benefit that should apply to
whatever the customer is actually being asked to pay after other
promotions — this also matches how most retail/e-commerce stacking works
in practice, and is the more conservative choice for the business (it
never lets both discounts calculate independently against the original
price and over-discount). The decision lives in one clearly commented
block in `pricing.ts` precisely so a reviewer — or a cinema with a
different policy — can find and change it in one place.

Both discounts are independently capped from below at zero and from above
at the amount remaining, so a misconfigured discount (say, a ₹10,000
festival promo on a ₹300 booking) can never produce a negative bill.

The API also deliberately does **not** let a client send an arbitrary
discount amount — it only sends booleans (`applyFestivalDiscount`,
`isMember`); the actual amounts are config-driven business rules the
counter clerk shouldn't need to know or be able to override, which
matches "a pricing engine the counter can trust" more literally than a
form where the clerk types in numbers.

## GST: slab-based, and keyed off face value by default

This is the deliberately "messy" part of the brief. Real Indian
cinema-ticket GST is not a flat rate — it's **12% for tickets priced
≤₹100 and 18% above that** — and the slab used is conventionally based on
the ticket's stated (face) price, not whatever discounted price the
customer ends up paying. I modeled this as a configurable, ordered list
of `TaxSlab { maxPrice, rate }` entries, with a
`taxSlabBasis: 'original' | 'discounted'` switch — defaulting to
`'original'` to match real practice, but overridable, because the brief
says "any cinema counter," not specifically an Indian one. Tax is then
computed on the discounted (taxable) value, i.e. you pay GST on what you
actually pay, at the rate your ticket's original price puts you in.

## The convenience fee's tax treatment is configurable, not assumed

Whether a booking fee should be taxed together with the ticket (at the
ticket's slab rate) or as an independent taxable service (at its own
rate) is a genuine real-world ambiguity — different venues and
jurisdictions do this differently, and the brief doesn't specify. Rather
than picking one silently, `FeeConfig.taxation` exposes both modes
(`'combined'` / `'separate'`) explicitly, defaults to `'combined'` (GST
computed on taxable-ticket-amount + fee, matching a plain reading of
"adds a small per-ticket convenience fee and GST on top" as one combined
step), and both modes are unit-tested so the choice is visible and
verifiable rather than buried.

## Availability as a first-class concern, not an edge case

*"By showtime some tiers sell out and shouldn't be bookable"* is a
business rule, so it's validated **before** any money math runs:
`priceBooking()` checks unknown tiers, non-positive/non-integer
quantities, and insufficient `availableSeats` up front, returning a
structured list of `PricingError`s (with machine-readable `code`s like
`SOLD_OUT`, `UNKNOWN_TIER`) instead of throwing — so the counter UI can
show a specific, useful message per problem line rather than a generic
failure. Seats are only decremented by an explicit `commitBooking()` /
`POST /book` call, kept separate from pricing, so the counter can show a
customer a live quote (`POST /quote`) without accidentally reserving
seats out from under someone else mid-conversation.

## Why an API, and why a UI on top of it

The brief says "build a pricing engine the counter can trust" — a counter
is a person under pressure, at a machine, during a Friday-night rush; a
bare library isn't something they can use. So the engine
(`pricing.ts`) is framework-free and independently testable, sitting
behind a small Express API (so it's usable from any future client — a
POS system, a website, a mobile app), with a minimal, fast, responsive
static counter UI on top that mirrors the actual demand in the brief:
select tiers (sold-out ones visibly disabled), toggle the two offers, and
see the **line-by-line breakup print out live**, styled as a receipt —
directly answering "customers keep demanding a clear line-by-line breakup
of the bill."

## What was deliberately left out, and why

- **Persistence** — `Show`/`SeatTier` live in memory (`config.ts`); the
  brief asks for a pricing *engine*, not a booking platform. Swapping in
  a real database only touches `config.ts` and possibly `server.ts`
  handlers — `pricing.ts` and its tests are unaffected.
- **Auth / payments** — orthogonal to "get the money math right," which
  is the actual point of the round.
- **Currency other than INR** — the *shape* (integer minor units, slabs,
  capped percentage discounts, per-item fee) is currency-agnostic; only
  the specific default GST slabs and example prices are India-specific,
  and both are overridable through config.

## Testing strategy

27 tests across three files, chosen to directly interrogate the "messy
money rules" the brief calls out rather than just happy-path coverage:
- rounding and the largest-remainder allocator, including deliberately
  awkward, non-evenly-divisible numbers
- GST slab boundary behavior (exactly ₹100)
- discount stacking order and capping from both directions
- the exact-paisa/no-leakage invariant under an intentionally awkward
  discount amount, asserted directly (`grandTotal === sum(lineTotals)`)
  plus every field checked to be an integer
- both convenience-fee taxation modes
- every rejection path: sold out, over-booked, unknown tier, empty
  booking
- the HTTP layer end-to-end via supertest: status codes, that `/quote`
  never mutates availability while `/book` does, and that the public
  `shows` listing reflects live seat counts
