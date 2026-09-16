# Ticket Pricing Engine — Friday Night at the Multiplex

A pricing engine a box-office counter can trust: tiered seats (Silver /
Gold / Recliner — or anything a venue defines), live seat availability,
a flat festival discount and a capped member percentage discount stacked
correctly, a per-ticket convenience fee, slab-based GST, and a full
line-by-line bill breakup that is **exact to the paisa, every time**.

It ships as:
- a **pricing engine** (`src/pricing.ts`) — pure functions, no framework, unit-testable in isolation
- a **REST API** (Express) exposing that engine to any client
- a **responsive counter UI** (`public/`) — a box-office terminal a clerk can actually use during a busy Friday show, with a live "printed receipt" breakup

Not tied to one show: `Show`, `SeatTier`, and `PricingConfig` (tax slabs,
fee, active offers) are all data, not hard-coded logic. Swap `src/config.ts`
for a database-backed store and every other file is unchanged.

## Tech stack

- TypeScript + Node.js
- Express 5 for the API
- Zod for request validation
- Vitest + Supertest for tests
- Vanilla HTML/CSS/JS for the counter UI (no build step, no framework — loads instantly on a counter machine)

## Project layout

```
src/
  money.ts     # integer-paise arithmetic, rounding, largest-remainder allocator
  types.ts     # domain types + Zod request schemas
  config.ts    # EXAMPLE shows + pricing config (tiers, tax slabs, fee, offers) — swap freely
  pricing.ts   # priceBooking() — the actual pricing pipeline (framework-free)
  priceImporter.ts # cleans messy seat-class prices and returns an import report
  server.ts    # Express app + routes
  index.ts     # server entrypoint
public/
  index.html   # counter UI shell
  style.css    # box-office terminal styling, responsive
  app.js       # fetches /api/v1/*, renders the live receipt
tests/
  money.test.ts    # rounding + largest-remainder allocator
  pricing.test.ts  # the engine itself — offers, tax slabs, exact-paisa invariants, validation
  priceImporter.test.ts # normalization, duplicate handling, and rejected price rows
  api.test.ts      # HTTP layer via supertest
REASONING.md   # design write-up
AI_LOGS.md     # AI conversation log (see note inside — must be replaced with the real transcript)
```

## Setup

Requires Node.js 18+ (tested on Node 22).

```bash
npm install
```

## Running it

```bash
npm run dev
```

Then open **http://localhost:3000** for the counter UI, or hit the API
directly (see below). `npm run dev` uses `tsx watch`, so edits to `src/`
reload automatically.

For a production-style run:

```bash
npm run build   # compiles src/ -> dist/
npm start       # runs dist/index.js
```

`PORT` is configurable: `PORT=3001 npm start`.

## Running the tests

```bash
npm test
```

29 tests across four files, all passing:
- **money.test.ts** — paise conversion/formatting, rounding, and the largest-remainder allocator (sums always reconcile exactly)
- **pricing.test.ts** — plain pricing, GST slab boundary behavior, discount stacking + capping (both directions), the exact-paisa/no-leakage invariant under a deliberately awkward discount, both fee-taxation modes, and every validation/rejection path (sold out, over-booked, unknown tier, empty booking)
- **priceImporter.test.ts** — normalizes case and currency formats, keeps the first valid price per seat class, and reports duplicate and rejected rows
- **api.test.ts** — the HTTP layer: health check, listing shows, quoting, booking (and that booking actually decrements availability), and error status codes (404/409/400)

## API reference

### `GET /health`
Liveness check.

### `GET /api/v1/shows`
Lists all shows with each tier's price and live availability.

### `GET /api/v1/shows/:showId`
Full detail for one show.

### `POST /api/v1/shows/:showId/quote`
Prices a booking **without** reserving seats (used to show the customer a quote before they commit).

Request:
```json
{
  "lines": [
    { "tierName": "Silver", "quantity": 2 },
    { "tierName": "Gold", "quantity": 3 }
  ],
  "applyFestivalDiscount": true,
  "isMember": true
}
```

Response: `{ "breakup": { "lines": [...], "summary": {...} } }` — every
monetary field is an integer number of paise; `summary.grandTotalPaise`
always exactly equals the sum of `lines[].lineTotalPaise`.

Errors: `404` unknown show, `400` malformed request, `409` with an
`errors[]` array (e.g. `SOLD_OUT`, `UNKNOWN_TIER`, `INVALID_QUANTITY`,
`EMPTY_BOOKING`) if the booking itself is invalid.

### Importing a messy seat-class price list

`importPriceList()` in `src/priceImporter.ts` accepts rows shaped like
`{ seatClass, price }`. It normalizes supported seat classes (`Silver`,
`Gold`, and `Recliner`) and rupee formats such as `₹250`, `Rs. 300.00`,
`INR 1,250.50`, and plain numbers. Prices are returned as integer paise.

The returned report contains the cleaned `imported` list, row-level
`duplicates` and `rejected` entries, plus summary counts. Blank, malformed,
negative, and unknown-seat-class rows are rejected; duplicate names are
matched case-insensitively and only the first valid row is imported.

### `POST /api/v1/shows/:showId/book`
Same request/validation as `/quote`, but on success also decrements
`availableSeats` and returns a `bookingId`.

## Configuration

`src/config.ts` is intentionally the only file with example numbers in
it — everything the engine actually computes with is passed in as
`PricingConfig` / `Show` data:

- **Tiers & prices** — `shows[].tiers[]`, any names, any prices, any seat counts.
- **Tax slabs** — `pricingConfig.taxSlabs`, an ordered list of `{ maxPricePaiseInclusive, gstPercent }`. Defaults to India's real cinema-GST rule (≤₹100 → 12%, above → 18%); replace for another jurisdiction.
- **Tax basis** — `taxSlabBasis: 'original' | 'discounted'` — whether the GST slab is chosen by the seat's face price or its post-discount price.
- **Convenience fee** — `pricingConfig.fee`, flat per ticket, with `taxation: 'combined' | 'separate'` controlling whether it's taxed together with the ticket at the ticket's slab rate, or independently at its own rate.
- **Offers** — `pricingConfig.offers`: a flat festival discount (on/off + amount) and a capped member percentage discount. The API only takes booleans (`applyFestivalDiscount`, `isMember`) from the client — the actual amounts live in config, so a counter clerk never has to know or type a discount value.

## Debugging

- **"totals don't add up"** — shouldn't happen; `pricing.test.ts` has a
  dedicated test asserting `grandTotalPaise === sum(line.lineTotalPaise)`
  for an intentionally awkward discount amount. If you see a mismatch,
  check whether something outside the engine is doing rupee-float math
  (e.g. `price * 1.18` in JS) instead of staying in integer paise.
- **"wrong GST rate applied"** — check `taxSlabBasis` in `src/config.ts`.
  Default is `'original'` (slab decided by face value); some jurisdictions
  tax the discounted price instead — set it to `'discounted'`.
- **"booking wrongly rejected as sold out"** — `SeatTier.availableSeats`
  is the single source of truth and is only decremented by `/book`
  (never by `/quote`). If it looks wrong, check whether a previous
  `/book` call already reduced it, or restart the server to reset the
  in-memory example data.
- **Port already in use** — `PORT=3001 npm run dev`.
- **Dependency issues** — `rm -rf node_modules package-lock.json && npm install`.
- **Quick manual check**:
  ```bash
  curl -s -X POST http://localhost:3000/api/v1/shows/SHOW-101/quote \
    -H "Content-Type: application/json" \
    -d '{"lines":[{"tierName":"Silver","quantity":2}],"applyFestivalDiscount":true,"isMember":true}'
  ```
- **UI shows "Network error"** — the frontend calls same-origin `/api/v1/*`
  routes, so it only works served by this Express app (`npm run dev` /
  `npm start`), not opened as a bare `file://` HTML file.

## Notes on scope

This is a pricing *engine* with a thin API and counter UI around it, not
a full booking/ticketing platform — there is no persistence layer,
authentication, or payment integration, since the brief is specifically
about getting the money math right. See `REASONING.md` for the full
design rationale and what was deliberately left out.
