# AI Logs - I ask these questions for cross breifing 

**Explain me this Project in 60 Seconds**

“I built a configurable Ticket Pricing Engine for a multiplex cinema counter. The system supports multiple ticket tiers such as Silver, Gold, and Recliner, checks ticket availability, applies a festival discount and a capped membership discount, adds a per-ticket convenience fee, calculates GST, and generates an itemized bill.

I used TypeScript with Node.js and Express for the backend, Zod for request validation, Jest for testing, and HTML, CSS and JavaScript for the responsive frontend.

One important design decision was handling all monetary calculations in integer paise instead of floating-point rupees, which helps avoid financial precision errors. I also separated configuration, money handling, business logic, API routes, frontend, and tests so that the engine is reusable for different cinema counters.

The main REST endpoint is a POST pricing quote API. It receives the booking details, validates them, runs the pricing engine, and returns the complete breakdown including discounts, fees, GST, and final total.”

**Explain Your Flow**

“The flow starts when the customer selects ticket categories and quantities. The frontend sends this information to the backend. The backend first validates the request using Zod. Then the pricing engine checks ticket availability and calculates the ticket subtotal. After that, it applies the festival discount, then the capped membership discount if applicable. It calculates the per-ticket convenience fee and GST, and finally produces the total and itemized bill. All monetary calculations are performed in paise to maintain exact precision.”

**Where Is the Core Logic?**

“The core logic is in pricing.ts. I kept the pricing rules separate from Express routes so that the business logic can be tested independently and reused by other interfaces in the future.”


**How Did You Test It?**

“I used Jest and tested both normal and edge cases. I tested normal bookings, membership discount caps, sold-out tickets, discount limits, and monetary precision. My objective was not only to test the happy path but also the business rules where incorrect calculations are more likely to occur.”

**Why Integer Paise?**

“Because JavaScript uses floating-point numbers for normal numeric calculations, financial calculations can suffer from precision issues. I represent ₹1 as 100 paise and perform the calculations using integers. I only format the result as rupees when displaying it.”

**Why Zod?**

“Zod gives me runtime validation for incoming API data. TypeScript provides compile-time type safety, but data coming from an HTTP request is still untrusted at runtime. Zod allows me to validate that data before passing it to the pricing engine.”

**Difference in REASONING.md vs AI_LOGS.md**


These two files have different purposes.

*REASONING.md*

This explains:

Why I designed the solution this way.

It should explain:

Problem
↓
Requirements
↓
Design decisions
↓
Architecture
↓
Business rules
↓
Money handling
↓
Validation
↓
Testing
↓
Trade-offs

This is your engineering explanation.

*AI_LOGS.md*

This is different.

Auriga specifically asks for the complete AI conversation, pasted as-is and unmodified.

Therefore, your actual submission should contain your real AI conversation.

You should not create a fake conversation and present it as your actual AI log.

**What If the Cinema Changes Its Pricing?**

"Suppose tomorrow the cinema changes:

Gold ticket price
GST rate
festival discount
membership cap
convenience fee

Because these are configuration-driven, I don't need to redesign the entire application.

I can update the configuration values while keeping the core architecture intact.

That is one of the reasons I designed the system as a reusable pricing engine rather than a single hard-coded calculation script."

***What the Twist means***

Your system now needs to accept a messy price list such as:

Silver, ₹250
GOLD, 300
gold, Rs. 300.00
RECLINER, 599.50
silver, 250
Gold, 
Recliner, -100
VIP, abc



INPUT
────────────────────────
Silver      ₹250
GOLD        300
gold        ₹300.00
RECLINER    ₹599.50
silver      250
Gold        blank
Recliner    -100
VIP         abc

             ↓

CLEAN + NORMALIZE
             ↓

VALID PRICE LIST
────────────────────────
Silver       ₹250.00
Gold         ₹300.00
Recliner     ₹599.50

             ↓

IMPORT REPORT
────────────────────────
Imported:       3
De-duplicated:  2
Rejected:       3