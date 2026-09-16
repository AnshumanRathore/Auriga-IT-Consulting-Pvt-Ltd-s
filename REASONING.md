# REASONING.md
# Cinema Ticket Pricing Engine — Engineering Reasoning

> This document explains **how the solution was understood, designed, implemented, tested, and prepared for submission**.
>
> The goal is not to describe every line of code. The goal is to make the engineering decisions easy for an evaluator to follow from the original problem statement to the final working system.

---

## 1. Starting from the problem

The problem describes a cinema counter on a busy Friday night. The counter has three ticket tiers:

- **Silver**
- **Gold**
- **Recliner**

Each tier can have a different price. A tier may also sell out before the show, which means it must no longer be bookable.

The counter also has several money rules:

```text
Ticket prices
     ↓
Flat festival discount
     ↓
Member percentage discount
     ↓
Member discount cap
     ↓
Per-ticket convenience fee
     ↓
GST
     ↓
Exact final amount
```

The final requirement is especially important: the amount must be correct **to the exact paisa**, and customers must receive a **clear line-by-line breakup**.

This led to one central design principle:

> **The pricing calculation must be deterministic, auditable, configurable, and independent from the user interface.**

---

# 2. Turning an intentionally short statement into requirements

The statement does not provide a long specification, so the first engineering task is to derive the requirements instead of waiting for more clarification.

I converted the statement into five groups.

### A. Ticket rules

The system needs to know:

```text
Tier
Price
Availability
```

A booking must fail if the requested tier is sold out.

### B. Booking rules

A booking contains one or more ticket lines:

```json
{
  "tier": "Gold",
  "quantity": 2
}
```

Quantity must be a positive integer.

### C. Discount rules

There are two different discount mechanisms:

```text
Festival → fixed amount
Member   → percentage with a maximum cap
```

They should be represented separately because they have different calculation behaviour.

### D. Additional charges

The statement says the convenience fee is **per ticket**, not per booking.

Therefore:

```text
fee = total number of tickets × fee per ticket
```

### E. Receipt

The result should not only be a single number.

It should expose:

```text
Ticket subtotal
Festival discount
Member discount
Taxable amount
Convenience fee
GST
Grand total
```

That makes the calculation transparent to the customer and easier to audit.

---

# 3. The most important design decision: money is stored as paise

A pricing engine must not depend on unreliable decimal floating-point arithmetic.

Instead of internally representing:

```text
₹250.75
```

as a JavaScript decimal, the engine represents it as:

```text
25075 paise
```

So:

```text
₹100.00 → 10000
₹125.50 → 12550
₹0.01   → 1
```

All calculations are performed using integer paise.

Only at the final presentation boundary is the value converted back into:

```text
₹250.75
```

This makes the calculation deterministic and directly addresses the requirement that the total must be exact to the paisa.

---

# 4. The pricing pipeline

The core calculation is intentionally performed in a fixed sequence.

```text
                    BOOKING
                       │
                       ▼
                Validate input
                       │
                       ▼
             Check tier availability
                       │
                       ▼
              Calculate subtotal
                       │
                       ▼
             Festival discount
                       │
                       ▼
          Member discount + cap
                       │
                       ▼
             Discounted tickets
                       │
                       ▼
       Convenience fee × ticket count
                       │
                       ▼
                    GST
                       │
                       ▼
                GRAND TOTAL
```

This sequence is important because changing the order can change the final amount.

For example, calculating the member discount before the festival discount can produce a different result from calculating it after the festival discount.

Therefore the order is kept explicit in `src/pricing.ts`.

If the complete official assignment document specifies a different ordering or tax base, that documented rule must take precedence.

---

# 5. Ticket subtotal

For every selected tier:

```text
line total = tier price × quantity
```

For example, conceptually:

```text
Silver × 2
Gold   × 1
```

becomes:

```text
Silver line = Silver price × 2
Gold line   = Gold price × 1
```

The subtotal is the sum of all line totals.

This is calculated before applying discounts.

---

# 6. Handling sold-out tiers

Availability is treated as a business rule, not merely a UI feature.

The UI visually marks unavailable tiers as:

```text
SOLD OUT
```

But the backend also checks availability.

This is deliberate.

A malicious or manually constructed API request should not be able to book a sold-out tier simply because the UI normally prevents selecting it.

Therefore validation exists in the pricing layer as well as the frontend.

---

# 7. Festival discount

The festival offer is a fixed monetary amount.

The implementation protects against an invalid negative subtotal:

```text
festival discount
=
minimum(configured discount, current subtotal)
```

Therefore if the subtotal is ₹100 and the configured festival discount is ₹150, the engine applies only ₹100.

The resulting ticket amount cannot become negative.

---

# 8. Member discount

The member discount is percentage-based.

The engine first calculates:

```text
percentage discount
=
remaining amount × member percentage
```

Then it applies the configured cap.

Conceptually:

```text
member discount
=
minimum(
    calculated percentage discount,
    member discount cap,
    remaining amount
)
```

The third limit prevents the discount itself from creating a negative amount.

If the customer is not a member:

```text
member discount = ₹0.00
```

This keeps the receipt explicit and easy to understand.

---

# 9. Convenience fee

The statement specifically says:

> "per-ticket convenience fee"

So the engine counts all tickets, not ticket lines.

For example:

```text
Silver × 2
Gold × 3
```

means:

```text
5 tickets
```

and therefore:

```text
convenience fee = 5 × fee per ticket
```

This distinction prevents a common interpretation bug where a fee is accidentally charged once per tier.

---

# 10. GST

The implementation calculates GST after the discounts and convenience fee according to the interpretation documented in this repository:

```text
GST base
=
discounted ticket amount + convenience fee
```

Then:

```text
GST = GST base × GST percentage
```

The resulting GST is rounded to the nearest paisa.

Again, if the complete official assignment specifies another tax base, the official rule should be implemented instead.

---

# 11. Why the pricing engine is separate from Express

The most important business function is:

```text
calculateBill(...)
```

It does not depend on:

- Express
- HTTP
- browser code
- DOM elements
- network requests

That means the same calculation can be reused by:

```text
Web application
Mobile application
Cinema POS
REST API
Automated tests
```

The architecture is therefore:

```text
             ┌───────────────┐
             │  Browser UI   │
             └───────┬───────┘
                     │
                     ▼
             ┌───────────────┐
             │  Express API  │
             └───────┬───────┘
                     │
                     ▼
             ┌───────────────┐
             │ Pricing Engine │
             └───────┬───────┘
                     │
             ┌───────┴────────┐
             ▼                ▼
          Config            Money
```

This makes the business logic easier to test and maintain.

---

# 12. Why configuration is separated

The problem says the engine should work for:

> "any cinema counter, not one show."

Therefore business values are placed in:

```text
src/config.ts
```

rather than scattered throughout the program.

The configuration contains:

```text
Silver price
Gold price
Recliner price

Tier availability

Festival discount
Member percentage
Member discount cap

Convenience fee
GST percentage
```

The algorithm can remain unchanged while the cinema's pricing configuration changes.

This is a simple form of separation between:

```text
BUSINESS DATA
```

and:

```text
BUSINESS LOGIC
```

---

# 13. Why an API is useful

A cinema pricing engine should ideally be usable by more than one interface.

The project exposes:

```http
POST /api/v1/ticket-pricing/quote
```

The caller sends the booking:

```json
{
  "tickets": [
    {
      "tier": "Silver",
      "quantity": 2
    }
  ],
  "member": true
}
```

The server returns the calculated bill.

The browser UI therefore does not independently calculate money.

Instead:

```text
UI
 ↓
API
 ↓
Pricing Engine
 ↓
Bill
 ↓
UI receipt
```

This prevents the frontend and backend from accidentally producing different totals.

---

# 14. Validation strategy

There are two validation layers.

## API validation

Zod checks the shape of incoming requests.

It verifies that:

- `tickets` is an array
- at least one ticket is supplied
- tier is one of the supported values
- quantity is a positive integer
- member is boolean

## Domain validation

The pricing engine performs business validation independently.

It verifies:

- the booking exists
- the booking contains tickets
- the tier is known
- quantity is valid
- the tier is available

This means the core pricing function remains safe even when called without the HTTP layer.

---

# 15. Why the UI is deliberately simple

The assignment is a builder round, not a request for a full movie-booking platform.

Therefore I avoided unnecessary complexity such as:

```text
Authentication
Payment gateway
Database
Movie catalogue
Seat map
User accounts
Admin dashboard
```

Those features would consume development time without solving the stated pricing problem.

Instead, the UI focuses on the evaluator's core journey:

```text
Select tier
    ↓
Choose quantity
    ↓
Choose member status
    ↓
Calculate
    ↓
Inspect detailed bill
```

The interface is responsive and provides clear visual feedback for:

- available tiers
- sold-out tiers
- quantities
- calculation state
- errors
- discounts
- fees
- GST
- final total

---

# 16. Testing strategy

Pricing systems need tests around business rules and boundaries.

The tests therefore include:

### Normal calculation

Checks the ordinary non-member path.

### Festival discount

Ensures the flat discount is applied.

### Member discount

Ensures the percentage discount is calculated.

### Member cap

Ensures a large percentage discount cannot exceed the configured cap.

### Sold-out tier

Ensures unavailable tickets cannot be booked.

### Discount floor

Ensures a flat discount cannot make the amount negative.

### Convenience fee

Ensures the fee is based on the number of tickets.

### GST

Ensures tax is calculated from the intended base.

### Paisa rounding

Ensures percentage calculations produce deterministic two-decimal currency output.

The tests are intended to protect the business rules rather than simply increase line coverage.

---

# 17. Complexity

If `n` is the number of ticket lines:

```text
Validation       → O(n)
Line calculation → O(n)
Subtotal         → O(n)
Ticket counting  → O(n)
```

Therefore the overall calculation is:

```text
Time  → O(n)
Space → O(n)
```

This is more than sufficient for a cinema booking request, while remaining straightforward to reason about.

---

# 18. Error handling

The API returns a clear `400` response for invalid booking input.

Examples include:

```text
At least one ticket is required.
Unknown tier.
Quantity must be a positive integer.
Recliner tickets are sold out.
```

Unknown routes return:

```text
404 Route not found.
```

This gives the client a predictable API contract.

---

# 19. Security and repository hygiene

The repository should never contain:

```text
API keys
Passwords
.env secrets
Private credentials
node_modules
Generated build artifacts
```

`.gitignore` protects common local/generated files.

Before making the repository public, the code should be reviewed with:

```bash
git status
git diff
```

to ensure no sensitive or accidental files are being committed.

---

# 20. Final verification before submission

The intended verification sequence is:

```bash
npm install
```

then:

```bash
npm test
```

then:

```bash
npm run build
```

then:

```bash
npm start
```

Then manually verify the browser UI and API.

Finally:

```bash
git status
git diff
git add .
git commit -m "Build cinema ticket pricing engine"
git push
```

The public repository root must contain:

```text
README.md
REASONING.md
AI_LOGS.md
```

---

# 21. What I would explain to an evaluator

The whole solution can be summarized as one engineering story:

```text
The requirement is a configurable cinema pricing engine.

I separated configuration, money arithmetic, pricing rules,
validation, API transport, and presentation.

Money is stored as integer paise so the result is exact.

Sold-out tiers are rejected in the business layer.

Discounts are applied in a deterministic order and capped safely.

Convenience fee is calculated per ticket.

GST is calculated after the configured discounts and fee.

The API exposes the calculation as a reusable service.

The UI provides a clear line-by-line customer receipt.

Automated tests cover normal cases and important boundaries.
```

That is the reasoning behind the architecture.

---

# 22. Important specification boundary

The short problem statement provided with the project does not expose all numerical values.

Therefore `src/config.ts` currently contains example configuration values.

Before an actual assessment submission, the official `ticket_pricing` document must be used as the source of truth for:

- exact ticket prices
- exact festival discount
- member percentage
- member cap
- convenience fee
- GST
- discount ordering
- GST/tax base
- rounding rules
- any additional edge cases

The code structure is deliberately designed so those values/rules can be changed without redesigning the application.

---

# 23. AI-assisted development principle

AI is treated as a development assistant, not as an authority.

A good workflow is:

```text
Understand requirement
        ↓
Ask AI to identify ambiguities
        ↓
Choose the business rules
        ↓
Ask AI for implementation help
        ↓
Inspect generated code
        ↓
Run tests
        ↓
Give actual errors to AI
        ↓
Fix
        ↓
Review edge cases
        ↓
Run tests again
        ↓
Submit
```

The final developer remains responsible for understanding and validating the code.

This is particularly important for a builder round because a working-looking generated solution can still contain incorrect business rules.

---

# 24. Final design outcome

The resulting project is intentionally:

**Correct** — deterministic pricing and exact-paisa arithmetic.

**Reusable** — configuration-driven rather than tied to one show.

**Testable** — pricing logic is independent of HTTP/UI.

**Defensive** — sold-out and invalid bookings are rejected.

**Expressive** — the receipt explains where every rupee goes.

**Responsive** — the interface works across common screen sizes.

**Maintainable** — business logic is separated into small modules.

**Practical** — no unnecessary infrastructure was added to a 2.5-hour builder task.

The central objective remains simple:

> **Given a valid booking and the cinema's pricing configuration, produce one correct, explainable, exact-paisa bill.**
