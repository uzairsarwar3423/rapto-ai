# Vocaply — Day 23: Billing API (Paddle Checkout, Subscriptions, Webhooks)
## Full Scalable Industry-Level Build Plan — Paddle Edition (Pakistan-Compatible)
> Senior Backend Engineer Edition | Production-Grade | Security-First | 1M+ Users
> No Code — Pure Architecture, Logic, Security & Performance Plan
> Document: DAY-23-PLAN-001 | Version 2.0 (Paddle Edition) | June 2026

---

## ⚠️ Why This Day Is Different From the Original Plan: Stripe → Paddle

```
ORIGINAL PLAN ASSUMED: Stripe Checkout + Stripe Customer Portal + Stripe
  webhooks, with Stripe acting as a payment PROCESSOR (Vocaply itself is
  the "merchant of record," responsible for its own tax/VAT compliance).

REALITY: Stripe does not support direct payouts/merchant accounts for
  businesses based in Pakistan. Vocaply therefore uses PADDLE instead.

THIS IS NOT A COSMETIC SWAP — Paddle has a fundamentally different
COMMERCIAL MODEL that changes some logic, not just some function names:

  Stripe = Payment Processor          Paddle = Merchant of Record (MoR)
  ───────────────────────────────────────────────────────────────────────
  Vocaply collects payment directly    Paddle LEGALLY SELLS the subscription
  Vocaply handles sales tax/VAT         Paddle handles ALL global sales
                                        tax/VAT/GST automatically — Vocaply
                                        NEVER calculates or remits tax itself
  "Customer" = Stripe Customer object   "Customer" = Paddle Customer object
                                        (same concept, different API shape)
  Stripe Billing Portal (hosted)        Paddle Customer Portal (hosted,
                                        same self-serve idea, different API)
  Webhook signing: Stripe SDK helper    Webhook signing: Paddle's own HMAC
                                        scheme (Paddle-Signature header,
                                        ts;h1 format) — NOT the same code path

WHY THIS MATTERS FOR THE PLAN BELOW: every section below is written
NATIVELY for Paddle's actual architecture — not a Stripe plan with
find-and-replace. Where Paddle's model REQUIRES different business logic
(e.g., tax handling, webhook signature format, "subscription update" via
direct API call instead of portal-only), that difference is called out
explicitly.
```

---

## Table of Contents

1. [Day Overview & Strategic Importance](#1-day-overview--strategic-importance)
2. [8-Hour Time Allocation](#2-8-hour-time-allocation)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Layer 1 — Paddle Client Setup](#4-layer-1--paddle-client-setup)
5. [Layer 2 — Data Layer (Repository)](#5-layer-2--data-layer-repository)
6. [Layer 3 — Business Logic (Service)](#6-layer-3--business-logic-service)
7. [Layer 4 — Paddle Webhook Handler (6 Real Events)](#7-layer-4--paddle-webhook-handler-6-real-events)
8. [Layer 5 — HTTP Layer (Controller + Routes)](#8-layer-5--http-layer-controller--routes)
9. [Layer 6 — Validation Layer](#9-layer-6--validation-layer)
10. [plans.config.ts — Finalized for Paddle](#10-plansconfigts--finalized-for-paddle)
11. [API Endpoints — Full Specification](#11-api-endpoints--full-specification)
12. [Security Architecture](#12-security-architecture)
13. [Performance & Scalability Architecture](#13-performance--scalability-architecture)
14. [Error Handling Strategy](#14-error-handling-strategy)
15. [Caching Strategy](#15-caching-strategy)
16. [Multi-Tenant Isolation Design](#16-multi-tenant-isolation-design)
17. [Types & Interfaces](#17-types--interfaces)
18. [Testing Plan](#18-testing-plan)
19. [End-of-Day Checklist](#19-end-of-day-checklist)

---

## 1. Day Overview & Strategic Importance

### Why Today Matters More Than a Normal Feature Day

Aaj Vocaply paisa lena shuru karta hai — lekin Pakistan-based business hone ki wajah se Stripe directly nahi le sakte, isliye **Paddle as Merchant of Record (MoR)** use hoga. Yeh architecturally Stripe se behtar bhi hai ek tarah se: Paddle khud hi global sales tax/VAT/GST handle karta hai, Vocaply ko kabhi bhi tax calculation ka code likhna nahi padega — lekin iska matlab yeh bhi hai ke "Vocaply IS the seller" wala mental model chhodna padega aur "Paddle is the seller, Vocaply is the product behind it" wala model apnaana padega.

```
WHY THIS IS A ZERO-TOLERANCE-FOR-AMBIGUITY DAY (unchanged from original intent):
  1. Webhook se galat plan sync hua → team ko wrong features milte hain
     (ya paisay liye bina premium milta hai, ya paisay ke baad bhi FREE
     plan dikhta hai) — dono customer trust kharab karte hain.
  2. Idempotency na ho → ek hi payment event do baar process ho sakta hai
     → duplicate confirmation emails, ya worse, duplicate internal state changes.
  3. teamId webhook payload se trust kiya gaya (na ke Paddle's own
     customData/custom_data field se) → cross-tenant billing corruption
     possible ho jata hai.

PRINCIPLE FOR TODAY (same as original, restated for Paddle):
  "Paddle is the single source of truth for subscription state. Vocaply's
   own subscriptions/invoices tables are a FAST LOCAL MIRROR, kept in
   sync ONLY through verified webhooks — never assumed, never guessed."
```

### What Gets Built Today

```
✅ Paddle client setup (server-side API key + client-side token separation)
✅ 6 REST API endpoints (plans, checkout, portal, subscription, invoices, usage)
✅ Paddle Checkout integration (overlay/hosted checkout via Transactions API)
✅ Paddle Customer Portal session generation (self-serve plan management)
✅ 6 real webhook handlers (subscription lifecycle + transaction lifecycle)
✅ plans.config.ts finalized — PADDLE_PRICE_MAP replacing STRIPE_PRICE_MAP
✅ Webhook signature verification using Paddle's native HMAC scheme
   (Paddle-Signature header, ts;h1 format — NOT Stripe's SDK method)
```

### Downstream Impact

```
Day 24  — /billing/usage's Redis cache key is shared with the SAME
           plan-limits.middleware cache key from Day 16/17 — unchanged
           by the Paddle switch, since that middleware never cared WHICH
           payment provider populates teams.plan, only that it's correct.
Day 42  — Settings → Billing UI calls these same 6 endpoints; the ONLY
           frontend-visible difference from a Stripe-based plan is that
           "Checkout" opens Paddle's overlay (Paddle.js) instead of
           redirecting to a Stripe-hosted page, and "Manage Billing"
           opens Paddle's Customer Portal instead of Stripe's.
Day 84-85 — Billing UI build later in the roadmap consumes this exact
           contract — today's job is making sure that contract is
           PROVIDER-AGNOSTIC in its response shape, so the frontend never
           needs to know or care that Paddle, not Stripe, is behind it.
```

---

## 2. 8-Hour Time Allocation

```
9:00 AM  – 9:45 AM    → Paddle account/sandbox setup verification +
                         paddle.client.ts (server SDK init, env validation)
9:45 AM  – 10:30 AM   → plans.config.ts finalized (PADDLE_PRICE_MAP,
                         reverse lookup map built at module load)
10:30 AM – 11:15 AM   → billing.repository.ts (subscriptions + invoices queries)
11:15 AM – 12:00 PM   → billing.service.ts — createCheckoutSession,
                         createPortalSession, getSubscription, getUsage
12:00 PM – 1:00 PM    → Lunch break
1:00 PM  – 2:15 PM    → stripe-style webhook → RENAMED paddle.webhook.ts:
                         signature verification (Paddle's HMAC scheme),
                         idempotency, event router skeleton
2:15 PM  – 3:30 PM    → 6 real webhook handlers (subscription.created/
                         updated/canceled, transaction.completed/
                         payment_failed, subscription.trialing — mapped
                         to Paddle's actual event taxonomy, see Section 7)
3:30 PM  – 4:15 PM    → billing.controller.ts + billing.routes.ts + validator
4:15 PM  – 5:00 PM    → Security pass: signature verification correctness,
                         custom_data trust-anchor audit, ADMIN-only gate review
5:00 PM  – 5:30 PM    → Performance pass: edge-cache headers, local-mirror
                         read paths, cache-key consistency with Day 16/17
5:30 PM  – 6:00 PM    → Paddle sandbox test-checkout walkthrough + checklist sign-off
```

---

## 3. File Structure to Create

```
services/api/src/modules/billing/
├── billing.controller.ts               ← HTTP layer ONLY
├── billing.service.ts                  ← checkout/portal/subscription/usage logic
├── billing.repository.ts               ← subscriptions + invoices DB queries ONLY
├── billing.validator.ts                ← Zod schemas
├── billing.types.ts                    ← TypeScript interfaces
├── billing.routes.ts                   ← Route + middleware chain
└── plans.config.ts                     ← Already scaffolded Day 16 — FINALIZED
                                           today with PADDLE_PRICE_MAP

services/api/src/services/
└── paddle.client.ts                    ← NEW — Paddle server SDK singleton,
                                           env validation, sandbox/live switch

services/api/src/modules/webhooks/
└── paddle.webhook.ts                   ← NEW — replaces the Day 18 Stripe
                                           scaffold; 6 real Paddle event handlers
```

### Dependency Flow (No Circular Dependencies)

```
billing.routes.ts
  └── billing.controller.ts
        └── billing.service.ts
              ├── billing.repository.ts        (DB access — subscriptions/invoices)
              ├── teams.repository.ts           (ALREADY EXISTS — Day 16, reused
              │                                  for paddleCustomerId storage)
              ├── paddle.client.ts               (Paddle server SDK calls)
              └── cache.service.ts               (ALREADY EXISTS — Day 11)

paddle.webhook.ts
  ├── webhooks.validator.ts             (multi-scheme signature utility,
  │                                       ALREADY EXTENDED Day 18/21/22 —
  │                                       Paddle's scheme is a NEW case
  │                                       added today, not a new file)
  ├── billing.repository.ts             (subscriptions/invoices upserts)
  ├── teams.repository.ts               (plan + meetingsUsed updates)
  └── notify queue                      (ALREADY EXISTS — Day 18/24, reused
                                          for confirmation/payment-failed emails)

RULE CARRIED FORWARD FROM DAY 21/22: the controller NEVER touches Paddle's
SDK directly — only billing.service.ts calls into paddle.client.ts. This
means if Vocaply ever needs to ADD a second payment provider for a
specific region in the future, the swap point is isolated to one file,
exactly like the provider-abstraction discipline applied to Jira/Slack/
Linear/Notion in Days 21-22.
```

---

## 4. Layer 1 — Paddle Client Setup

### File: `paddle.client.ts`

**Responsibility:** The ONLY file in the entire codebase that directly imports and configures Paddle's server-side SDK. Everything else calls through this file's exported functions.

### Two Distinct Credential Types (Critical Distinction From Stripe's Single-Key Model)

```
PADDLE_API_KEY (SECRET — server-side only, never sent to the browser)
  → Used for: creating transactions/checkout links, creating customer
    portal sessions, fetching subscription details server-side
  → Lives ONLY in this file + env.ts validation — never logged, never in
    any error response

PADDLE_CLIENT_TOKEN (PUBLIC — safe to expose to the frontend)
  → Used by Paddle.js (the frontend checkout overlay library, wired on
    Day 42) to render the actual checkout UI in the browser
  → THIS IS NOT A SECRET — unlike every other credential handled since
    Day 21, this one is INTENTIONALLY public, and today's design
    explicitly documents WHY: Paddle's overlay-checkout model requires
    a client-visible token by design, scoped narrowly to "open a
    checkout," with no power to read/modify subscriptions on its own.
    This distinction is called out so no future engineer mistakenly
    treats this token with the same secrecy as PADDLE_API_KEY and, e.g.,
    refuses to let the frontend team see it.

PADDLE_WEBHOOK_SECRET (SECRET — used ONLY for verifying inbound webhooks)
  → A THIRD, distinct credential — never reused for API calls, only for
    HMAC verification of webhook payloads (Section 7)
```

### Functions to Implement

```
getServerClient()
  → Returns a configured Paddle server SDK instance (or a thin wrapper
    if using raw HTTP calls instead of an official SDK — Paddle Billing's
    REST API is straightforward enough that either approach is valid;
    today's plan assumes a thin typed wrapper for consistency with how
    every other provider file in this codebase is structured)
  → Sandbox vs Live mode switched via PADDLE_ENVIRONMENT env var
    ('sandbox' | 'production') — NEVER inferred from NODE_ENV directly,
    since a staging environment may legitimately want to test against
    Paddle's LIVE catalog with test cards in some setups, or vice versa;
    keeping this an independent, explicit env var avoids that coupling

createTransaction({ priceId, customerId?, customData })
  → Wraps Paddle's Transactions API call used to generate a checkout —
    returns a transaction object containing a checkout URL/token that
    Paddle.js (frontend) or a hosted-checkout redirect can use
  → customData is WHERE Vocaply's teamId/planId metadata travels through
    Paddle — this is the Paddle-native equivalent of Stripe's
    `metadata` field, and is treated with the SAME "trust anchor, not
    user input" discipline established Day 23's original Stripe design

createCustomerPortalSession(paddleCustomerId)
  → Wraps Paddle's Customer Portal Sessions API — returns a hosted URL
    the team's admin is redirected to for self-serve plan
    changes/cancellation/payment-method updates

getOrCreatePaddleCustomer(team, requesterEmail)
  → IF team.paddleCustomerId exists → fetch and return it (a cheap,
    cached lookup — see Section 13)
  → ELSE → create a new Paddle Customer via the API, persist the
    returned ID onto teams.paddleCustomerId, return it
  → This function is the Paddle-equivalent of Stripe's
    `stripe.customers.create` inline step from the original plan — but
    factored into its OWN function today rather than left inline inside
    createCheckoutSession, since Day 24's testConnection-style pattern
    (small, single-purpose provider functions) is applied here too
```

---

## 5. Layer 2 — Data Layer (Repository)

### File: `billing.repository.ts`

**Responsibility:** All Prisma queries against `subscriptions` and `invoices`. Zero business logic. Zero Paddle SDK imports — this file only knows Postgres.

### Functions to Implement

```
findSubscriptionByTeam(teamId): Promise<Subscription | null>
  → Used by GET /billing/subscription — single indexed lookup
    (subscriptions.teamId is UNIQUE per the schema doc)

upsertSubscription(teamId, data): Promise<Subscription>
  → Used by webhook handlers — create on first subscription event,
    update on every subsequent lifecycle event
  → data shape: { paddleSubscriptionId, plan, status, currentPeriodStart,
    currentPeriodEnd, cancelAtPeriodEnd, billingInterval }

upsertInvoice(teamId, paddleTransactionId, data): Promise<Invoice>
  → Used by transaction.completed / transaction.payment_failed handlers
  → data shape: { amountDue, amountPaid, currency, status,
    hostedInvoiceUrl (Paddle calls this a "receipt URL" — mapped onto
    the SAME column name used in the original Stripe-based schema so
    NOTHING downstream, including the frontend's invoice table, needs to
    know which provider populated it), paidAt }

findInvoicesByTeam(teamId, cursor, limit): Promise<{invoices, nextCursor}>
  → Cursor-paginated, used by GET /billing/invoices

markSubscriptionCancelled(teamId): Promise<void>
  → status='cancelled', used by the subscription.canceled handler

resetMeetingsUsedForTeam(teamId): Promise<void>
  → Sets teams.meetingsUsed = 0 — called at the correct billing-cycle
    boundary (first successful transaction AND every renewal transaction)
```

### Query Performance Notes

- `subscriptions.teamId` and `invoices.teamId` both already indexed per the DB schema doc (`idx_subscriptions_team_id`, `idx_invoices_team_id`) — today verifies these are used via EXPLAIN ANALYZE, no new indexes needed.
- `upsertSubscription` keyed on the UNIQUE `(teamId)` constraint, meaning every webhook-driven update is a single, fast, conflict-free write — no read-then-write race window.

---

## 6. Layer 3 — Business Logic (Service)

### File: `billing.service.ts`

### Function: `getPlans()`

```
1. Returns PLAN_LIMITS reshaped for pricing display — name, priceMonthly,
   priceAnnual, meetings/members/storage limits, feature flags
2. NO Paddle API call at all — this is 100% local static config, exactly
   as in the original plan, UNCHANGED by the provider switch (pricing
   DISPLAY data lives in Vocaply's own config regardless of which
   payment provider processes the actual charge)
```

### Function: `createCheckoutSession(teamId, userId, { planId, interval })`

```
1. Validate planId against PLAN_LIMITS keys (allow-list — UNCHANGED
   principle from the original plan: never trust a raw Paddle price ID
   from the client, only ever resolve it server-side from the validated planId)
2. team = teamRepo.findById(teamId)
3. requester = userRepo.findById(userId)
4. paddleCustomerId = await paddleClient.getOrCreatePaddleCustomer(team, requester.email)
   (persists onto teams.paddleCustomerId on first call, exactly mirroring
   the original plan's stripeCustomerId persistence step — just a
   different column name and a different underlying API)
5. priceId = PADDLE_PRICE_MAP[planId][interval]   // config-driven, see Section 10
6. transaction = await paddleClient.createTransaction({
     priceId,
     customerId: paddleCustomerId,
     customData: { teamId, planId }   ← THE PADDLE TRUST ANCHOR, exact
       functional equivalent of Stripe's `metadata` field from the
       original plan — every webhook handler resolves teamId from HERE,
       never from anywhere else in the payload
   })
7. Return { checkoutUrl: transaction.checkoutUrl } OR, if using Paddle's
   overlay-checkout model instead of a hosted redirect URL, return
   { transactionId: transaction.id } for the frontend's Paddle.js call
   to open the overlay directly — BOTH shapes are documented here because
   the final choice (hosted-redirect vs. in-app-overlay) is a Day 42
   frontend decision; today's backend returns WHICHEVER shape Paddle's
   Transactions API naturally provides, and that contract is treated as
   fixed once chosen, not re-litigated on the frontend day
```

### Function: `createPortalSession(teamId)`

```
1. team = teamRepo.findById(teamId)
2. IF !team.paddleCustomerId → throw AppError('NO_BILLING_ACCOUNT', 404)
   (a team that has never checked out has nothing to manage — UNCHANGED
   logic from the original Stripe-based plan, just renamed the field)
3. portalUrl = await paddleClient.createCustomerPortalSession(team.paddleCustomerId)
4. Return { portalUrl }
```

### Function: `getSubscription(teamId)`

```
Reads ONLY from billing.repository.findSubscriptionByTeam — NEVER a live
Paddle API call on this hot path. UNCHANGED principle from the original
plan: Paddle (like Stripe) is the source of truth via WEBHOOKS, and
Vocaply's local `subscriptions` table is the fast mirror every
user-facing read goes through.
```

### Function: `getInvoices(teamId, cursor, limit)`

```
Reads from billing.repository.findInvoicesByTeam — each invoice's
hostedInvoiceUrl is Paddle's actual receipt/invoice URL (Paddle generates
and hosts these itself, just like Stripe did — Vocaply never stores or
serves a payment document directly, UNCHANGED principle).
```

### Function: `getUsage(teamId)`

```
UNCHANGED FROM THE ORIGINAL PLAN — this function has ZERO Paddle-specific
logic. It reads the SAME denormalized teams.meetingsUsed value, through
the SAME Redis cache key (cache:team:plan:{teamId}) already established
by Day 16/17's plan-limits.middleware. This is the clearest proof point
in today's entire plan that the payment-provider swap is correctly
ISOLATED: the quota-enforcement system built two weeks ago does not
care, and does not need to know, that Paddle replaced Stripe underneath it.
```

---

## 7. Layer 4 — Paddle Webhook Handler (6 Real Events)

### File: `paddle.webhook.ts`

### Signature Verification — Paddle's Native Scheme (NOT Stripe's SDK Method)

```
POST /webhooks/paddle

Paddle signs webhooks with an HMAC-SHA256 scheme, delivered in a
`Paddle-Signature` header formatted as:  ts={timestamp};h1={hex_hmac}

VERIFICATION STEPS:
  1. Extract ts and h1 from the Paddle-Signature header
  2. Build the signed payload string: `${ts}:${rawBody}`
  3. Compute HMAC-SHA256(signed_payload, PADDLE_WEBHOOK_SECRET) → hex
  4. Constant-time compare against h1
  5. ALSO verify |now - ts| is within a reasonable tolerance window
     (Paddle's own docs recommend ~5 minutes) — replay protection,
     conceptually identical to Stripe's built-in tolerance check, just
     implemented manually here since there's no Paddle SDK helper doing
     it automatically the way Stripe's constructEvent() does

THIS IS WHY webhooks.validator.ts's multi-scheme design (established
Day 18, extended Day 21/22) PAYS OFF AGAIN today: a NEW case
('paddle-ts-colon-hmac') is added to that shared utility's scheme
parameter, rather than writing a brand-new, one-off verification function
from scratch. The original plan's note — "Stripe specifically, use the
official SDK method since its signing scheme has versioning nuances the
SDK already handles" — no longer applies; Paddle's scheme is simple
enough that a correct manual implementation, reviewed carefully today, is
both necessary (no equivalent first-party Node SDK helper as
battle-tested as Stripe's) and entirely sufficient.
```

### Idempotency (Unchanged Principle, Paddle's Own Event ID)

```
Idempotency key: paddle:event:{event.event_id}   (Paddle's own unique
event identifier, the direct equivalent of Stripe's event.id)
Stored in Redis, TTL 86400s, checked BEFORE any handler logic runs —
EXACTLY the same defensive pattern as the original plan, just renamed
the Redis key prefix from stripe: to paddle:.
```

### The 6 Real Handlers — Mapped to Paddle's Actual Event Taxonomy

```
Paddle Billing's event names differ from Stripe's — today's handlers are
named and triggered to match Paddle's REAL webhook catalog, not a
literal Stripe rename:

1. transaction.completed
   (Paddle's equivalent of Stripe's checkout.session.completed — fires
   when a transaction, whether the FIRST checkout or a renewal, is
   successfully paid)
   → transaction.custom_data.teamId resolves the team (the trust anchor)
   → IF this is a NEW subscription (first transaction for this customer):
       Create/update subscriptions row: plan, status='active',
       paddleSubscriptionId (Paddle returns the associated subscription
       ID on the transaction object)
       team.plan = planId (from custom_data), team.meetingsUsed = 0
   → IF this is a RENEWAL transaction:
       billing.repository.resetMeetingsUsedForTeam(teamId) at the new
       currentPeriodStart boundary
   → upsertInvoice(...) with status='paid', the Paddle-hosted receipt URL
   → redis.del(`cache:team:plan:${teamId}`)
   → Send confirmation email (queued via notify, not sent inline —
     UNCHANGED fast-ack principle)

2. subscription.created
   → Fires when Paddle creates the subscription record tied to a
     completed transaction — used to capture currentPeriodStart/End and
     billingInterval fields that may not be fully present on the
     transaction.completed event alone
   → Upserts the subscriptions row with these period fields

3. subscription.updated
   → Covers BOTH upgrades and downgrades (Paddle fires this single event
     for plan changes, same dual-purpose behavior as Stripe's
     customer.subscription.updated)
   → Resolve new plan from the subscription's price ID → PADDLE_PRICE_MAP
     reverse lookup (built once at module load, identical pattern to the
     original STRIPE_PRICE_MAP reverse-map design)
   → IF downgrade AND team.meetingsUsed > newPlan.limit: do NOT delete
     excess meetings — same non-destructive principle as the original plan
   → Update subscriptions.status/currentPeriodEnd/cancelAtPeriodEnd
   → Cache invalidate

4. subscription.canceled
   → team.plan = 'FREE', subscriptions.status = 'cancelled'
   → Historical data (meetings, commitments) NEVER deleted — UNCHANGED
   → Cache invalidate + queued "sorry to see you go" email

5. transaction.payment_failed
   → Upserts invoices row (status='past_due' or similar Paddle-reported
     state)
   → Queues PAYMENT_FAILED notification via the SAME notify queue
     infra used everywhere else (Day 18/24) — no bespoke email path
   → Paddle has its OWN dunning/retry schedule (configurable in the
     Paddle dashboard) — exactly like Stripe Smart Retries in the
     original plan, Vocaply does NOT reimplement retry logic itself,
     it only reacts to whatever Paddle ultimately reports
   → IF Paddle eventually cancels the subscription after exhausting
     retries → that arrives as event #4 above, handled there

6. subscription.trialing (if/when trials are enabled — Paddle's name for
   this state may appear as a `status` field value on subscription.created/
   updated rather than a fully separate event type, depending on Paddle's
   exact API version in use; today's handler is written defensively to
   check the subscription's `status` field for a trialing value on EITHER
   the created or updated event, rather than assuming a dedicated event
   type exists)
   → Queue a trial-ending reminder notification — scaffold-level today,
     exactly as the original plan treated this (a v1.1 feature-flagged
     capability, wired now so enabling it later requires zero
     webhook-layer changes)
```

### Why Paddle's Model Removes One Entire Class of Logic Vocaply Doesn't Need

```
NOTABLE OMISSION (intentional, not an oversight): there is NO handler
here for anything resembling "calculate tax," "apply VAT," or
"determine customer's tax jurisdiction." Under Stripe-as-processor, a
SaaS business in some setups must handle this itself (or via Stripe Tax,
a separate paid add-on). Under Paddle-as-MoR, Paddle is legally the
seller and handles ALL of this BEFORE Vocaply ever sees a webhook —
every amount Vocaply receives in transaction.completed is already
tax-correct from Paddle's side. This is documented here explicitly so no
future engineer wonders why "tax logic" is missing from the billing
module — it's missing because Paddle's commercial model makes it
unnecessary, not because it was forgotten.
```

---

## 8. Layer 5 — HTTP Layer (Controller + Routes)

### File: `billing.controller.ts`

Every function follows the same thin-translation pattern established since Day 16:

```
getPlansController              → service.getPlans() → 200
createCheckoutController        → service.createCheckoutSession(...) → 200 { checkoutUrl } or { transactionId }
createPortalController          → service.createPortalSession(teamId) → 200 { portalUrl }
getSubscriptionController       → service.getSubscription(teamId) → 200
getInvoicesController            → service.getInvoices(teamId, cursor, limit) → 200
getUsageController               → service.getUsage(teamId) → 200
```

### File: `billing.routes.ts`

```
GET    /billing/plans
  chain: requireAuth → controller
  (no injectTenant — usable pre-onboarding, UNCHANGED from original plan)

POST   /billing/checkout
  chain: requireAuth → injectTenant → requireRole('ADMIN') →
         idempotencyMiddleware → validate(checkoutSchema) → controller

POST   /billing/portal
  chain: requireAuth → injectTenant → requireRole('ADMIN') → controller

GET    /billing/subscription
  chain: requireAuth → injectTenant → controller

GET    /billing/invoices
  chain: requireAuth → injectTenant → requireRole('ADMIN') →
         validate(paginationSchema) → controller

GET    /billing/usage
  chain: requireAuth → injectTenant → controller

POST   /webhooks/paddle
  chain: NONE of the above — raw-body preserved, signature-verified
  inside the handler itself, exactly like every other webhook route
  since Day 18 (no requireAuth, no JWT — trust comes entirely from the
  HMAC signature)
```

---

## 9. Layer 6 — Validation Layer

### File: `billing.validator.ts`

```
checkoutSchema
  planId: enum ['STARTER','GROWTH','BUSINESS'] (FREE and ENTERPRISE are
    NEVER valid checkout targets — FREE needs no payment, ENTERPRISE is
    a custom sales-quote flow outside this endpoint entirely)
  interval: enum ['month','year']

paginationSchema (for invoice listing)
  cursor: string, optional
  limit: number coerced, min 1, max 100, default 20
```

---

## 10. `plans.config.ts` — Finalized for Paddle

```
PLAN_LIMITS object itself is 100% UNCHANGED from the original plan —
meetings/members/storage/historyDays/integrations/apiAccess/ssoEnabled/
priceMonthly/priceAnnual per tier are pure Vocaply business decisions,
entirely independent of which payment provider is wired underneath.

THE ONLY THING THAT CHANGES IS THE PRICE-ID MAP:

  REPLACED:  STRIPE_PRICE_MAP { STARTER: { month, year }, ... } using
             process.env.STRIPE_PRICE_STARTER_M, etc.

  WITH:      PADDLE_PRICE_MAP { STARTER: { month, year }, ... } using
             process.env.PADDLE_PRICE_STARTER_M, etc. — Paddle calls
             these "Price IDs" too (created in the Paddle dashboard's
             product catalog, one Price per plan+interval combination,
             exactly mirroring the Stripe setup conceptually)

  The REVERSE lookup map (priceId → planId, used by webhook handlers to
  resolve which plan a given Paddle subscription/transaction corresponds
  to) is built ONCE at module load — IDENTICAL pattern, IDENTICAL
  performance rationale (O(1) webhook-time lookup, never a linear scan)
  as the original Stripe-based design.
```

---

## 11. API Endpoints — Full Specification

### `GET /api/v1/billing/plans`

| Aspect | Detail |
|---|---|
| Auth | Required (any logged-in user) |
| Cache | Edge-cached 1hr, `Cache-Control: public, max-age=3600` — UNCHANGED |
| Response | Plan comparison data, zero Paddle API call |

### `POST /api/v1/billing/checkout`

| Aspect | Detail |
|---|---|
| Auth | Required + injectTenant |
| Role | ADMIN+ |
| Idempotency | Required |
| Body | `{ planId, interval }` |
| Response | `200 { checkoutUrl }` or `{ transactionId }` (final shape locked once Day 42's frontend integration choice — hosted vs. overlay — is made) |

### `POST /api/v1/billing/portal`

| Aspect | Detail |
|---|---|
| Auth | Required + injectTenant |
| Role | ADMIN+ |
| Response | `200 { portalUrl }` |
| Errors | `404 NO_BILLING_ACCOUNT` if never checked out |

### `GET /api/v1/billing/subscription`

| Aspect | Detail |
|---|---|
| Auth | Required + injectTenant |
| Role | Any |
| Response | Local-mirror subscription row — `{ plan, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, billingInterval }` |

### `GET /api/v1/billing/invoices`

| Aspect | Detail |
|---|---|
| Auth | Required + injectTenant |
| Role | ADMIN+ |
| Response | Cursor-paginated list, each row includes `hostedInvoiceUrl` (Paddle's receipt link) |

### `GET /api/v1/billing/usage`

| Aspect | Detail |
|---|---|
| Auth | Required + injectTenant |
| Role | Any |
| Response | `{ meetingsUsed, meetingsLimit, membersCount, membersLimit, billingCycleEnd, percentUsed }` — shares the EXACT cache key as plan-limits.middleware |

### `POST /webhooks/paddle`

| Aspect | Detail |
|---|---|
| Auth | None (Paddle-Signature HMAC verified internally) |
| Response | `200 OK` fast-ack, then 6 possible event-driven side effects |

---

## 12. Security Architecture

### Merchant-of-Record Scope (Paddle's Equivalent of "PCI Scope" From the Original Plan)

```
Vocaply NEVER touches raw card data — Paddle's checkout overlay/hosted
page is fully Paddle-controlled, zero card fields ever rendered or
submitted through Vocaply's own servers, IDENTICAL principle to the
original Stripe-based design. ADDITIONALLY, because Paddle is Merchant
of Record, Vocaply is not even the LEGAL seller of record for tax
purposes — a stronger compliance position than the Stripe-as-processor
model would have given a Pakistan-based entity selling globally.
```

### Webhook Signature — Now a Manual, Carefully-Reviewed Implementation

```
UNLIKE the original plan's "use Stripe's SDK method, never reimplement"
rule, Paddle's signature verification IS implemented manually today
(Section 7) — because there's no equivalently mature first-party Node
helper to defer to. This SHIFTS the burden: today's manual HMAC
implementation gets EXTRA scrutiny in the security pass (Section 14 of
the time allocation), specifically checking:
  - Constant-time comparison used (timingSafeEqual), never `===` string
    comparison, on the computed vs. received signature
  - The timestamp-tolerance check is genuinely enforced (not accidentally
    skipped), since Paddle provides the building blocks but not a
    single all-in-one verified-event helper the way Stripe's SDK does
```

### custom_data as the Trust Anchor (Paddle's Metadata Equivalent)

```
teamId/planId are read from the transaction/subscription's custom_data
field — SET BY VOCAPLY at checkout-creation time, NEVER from any other
part of the webhook payload, and NEVER trusted if it were somehow also
present as a query param or header. This is the EXACT same discipline as
the original plan's Stripe metadata rule, just pointed at Paddle's
differently-named equivalent field — closing the "I'll just tell you my
team is on GROWTH" attack vector identically.
```

### ADMIN-Only Billing Mutations (Unchanged)

```
requireRole('ADMIN') on checkout + portal + invoice list — UNCHANGED
from the original plan. A MEMBER must never be able to change the team's
plan, view payment history, or generate a portal session, regardless of
which payment provider is behind the scenes.
```

### Idempotent Webhook Processing (Unchanged Principle, Paddle's Event ID)

```
Same event_id replayed (a real possibility with any webhook provider,
Paddle included) → guaranteed no-op via the Redis idempotency key,
checked before any DB write — UNCHANGED principle, just keyed on
Paddle's own event identifier format instead of Stripe's.
```

### Public Token vs. Secret Key Separation (NEW Discipline, Specific to Paddle)

```
This is a security consideration that DID NOT EXIST in quite this form
under the original Stripe-only plan (Stripe's publishable key is
similarly public, but the original plan's narrative didn't dwell on it).
Today's plan explicitly documents and enforces: PADDLE_CLIENT_TOKEN is
safe in frontend bundles/env files prefixed for client exposure;
PADDLE_API_KEY and PADDLE_WEBHOOK_SECRET are NEVER allowed in any
client-reachable code path, bundle, or log — a code-review gate today
confirms grep across the frontend build output contains ONLY the client
token, never the other two.
```

---

## 13. Performance & Scalability Architecture

### Edge-Cached Plans Endpoint (Unchanged)

```
/billing/plans cached 1hr at the CDN — zero DB/Paddle API hits for the
most-viewed billing page, identical rationale and implementation to the
original plan.
```

### Local-Mirror Reads, Never Live Paddle Calls on Hot Paths (Unchanged Principle)

```
/billing/subscription and /billing/usage read LOCAL tables only —
Paddle (like Stripe before it) is consulted ONLY for the two explicit
ACTION endpoints (checkout, portal) where a live API call is
unavoidable because Vocaply is asking Paddle to DO something (generate a
checkout/portal URL), not merely report status that's already mirrored
locally via webhooks.
```

### paddleCustomerId Caching at the Team Level

```
getOrCreatePaddleCustomer checks teams.paddleCustomerId FIRST (a single
indexed Postgres read, effectively free) before EVER calling Paddle's
Customer API — meaning a team's SECOND, THIRD, Nth checkout attempt
(e.g., re-subscribing after a cancellation) never re-creates a duplicate
Paddle customer record, and never pays the latency cost of an
unnecessary "does this customer exist" round trip.
```

### Webhook Handler — Minimum Write, Maximum Queue (Unchanged Fast-Ack Principle)

```
The Paddle webhook handler does the SAME minimum-DB-write-then-queue-
everything-else pattern as the original Stripe design — confirmation
emails, payment-failed alerts, all queued via the notify infra (Day 18/24),
never sent inline inside the webhook's own response cycle.
```

### PADDLE_PRICE_MAP Reverse Lookup Built Once

```
Restated from Section 10 as a performance point: building the priceId→
planId reverse map ONCE at module load (not reconstructed per webhook
call) keeps every webhook's plan-resolution step an O(1) object lookup,
regardless of how many price IDs exist across however many plan tiers
and billing intervals Vocaply eventually offers.
```

---

## 14. Error Handling Strategy

### Billing-Specific Error Codes (Renamed Where Provider-Specific, Otherwise Unchanged)

```
NO_BILLING_ACCOUNT            404  → portal requested before any checkout
PLAN_INVALID                  422  → planId not in the allow-listed enum
PADDLE_CHECKOUT_FAILED        502  → Paddle's Transactions API unreachable
                                      or returned an error (renamed from
                                      the original plan's implicit
                                      "Stripe unreachable" case)
PADDLE_WEBHOOK_INVALID_SIGNATURE 400 → HMAC verification failed or
                                      timestamp outside tolerance window
                                      — logged as a SECURITY event, not a
                                      normal application error
```

### Graceful Handling of Paddle-Specific Edge Cases

```
- A transaction.completed event arriving for a team whose checkout was
  somehow abandoned/re-attempted (e.g., a browser refresh during overlay
  checkout creating a duplicate transaction object on Paddle's side) →
  the idempotency key (keyed on Paddle's event_id, not the transaction
  id alone) ensures each DISTINCT event is processed once; if Paddle
  itself reports two genuinely separate transactions for what a human
  considers "one purchase attempt," that's surfaced as-is — Vocaply does
  not attempt to de-duplicate Paddle's own transaction records, only its
  own webhook-processing idempotency.
- subscription.updated arriving with a price ID NOT found in
  PADDLE_PRICE_MAP (e.g., a manually-created custom Paddle price outside
  the configured catalog, or an ENTERPRISE custom quote handled outside
  the standard checkout flow) → logged as a warning, the subscription
  row is still updated with whatever fields ARE resolvable, but
  team.plan is left UNCHANGED rather than set to an invalid/undefined
  value — never silently corrupt the plan field with a lookup miss.
```

---

## 15. Caching Strategy

```
KEY                                   TTL      INVALIDATED ON
cache:team:plan:{teamId}              3600s    transaction.completed,
                                                subscription.updated,
                                                subscription.canceled
(SAME exact key as Day 16/17's plan-limits.middleware — UNCHANGED,
deliberately shared so a Paddle-driven plan change and a meeting-creation
quota check are ALWAYS looking at the same cache entry, never two
independently-stale copies of "what plan is this team on")

/billing/plans response  →  CDN edge cache, 1hr, public — UNCHANGED
```

---

## 16. Multi-Tenant Isolation Design

```
LAYER 1 — Application:
  Every billing.service function takes teamId explicitly; the
  webhook handler resolves teamId EXCLUSIVELY from custom_data, never
  from any client-reachable input.

LAYER 2 — Repository / Prisma Middleware:
  subscriptions and invoices were ALREADY in the TENANT_TABLES list
  (per the DB schema doc's RLS section) — today CONFIRMS this, no new
  middleware work needed since the Paddle swap doesn't change the
  underlying table structure.

LAYER 3 — Database RLS:
  Same confirmation step as every prior integration day — RLS policies
  on subscriptions/invoices verified ACTIVE on the live database.

PADDLE-SPECIFIC NOTE: because Paddle (not Vocaply) holds the actual
customer/payment relationship, there is NO scenario where a Paddle API
call could "leak" cross-tenant data the way a misconfigured internal
query might — the ISOLATION RISK today is entirely on Vocaply's OWN
side (the webhook → teamId resolution step, and the repository's teamId
scoping), not on anything Paddle exposes.
```

---

## 17. Types & Interfaces

### `billing.types.ts`

```
PaddleCheckoutResult       — { checkoutUrl?: string, transactionId?: string }
                             (one or the other present depending on the
                             final hosted-vs-overlay integration choice)

PaddlePortalResult         — { portalUrl: string }

SubscriptionDetail         — { plan, status, currentPeriodStart,
                               currentPeriodEnd, cancelAtPeriodEnd,
                               billingInterval }

InvoiceListItem            — { id, amountDue, amountPaid, currency,
                               status, hostedInvoiceUrl, paidAt, createdAt }

UsageDetail                — { meetingsUsed, meetingsLimit, membersCount,
                               membersLimit, billingCycleEnd, percentUsed }

PaddleWebhookEvent         — { eventId, eventType, occurredAt, data: {...} }
                             (a typed envelope wrapping whichever of the
                             6 handled event shapes is currently being processed)
```

---

## 18. Testing Plan

### Checkout / Portal Tests

```
Test 1 — GET /billing/plans → correct limits, cached headers present,
  zero Paddle API call observed (mock call-count assertion).
Test 2 — POST /billing/checkout (mocked Paddle Transactions API) → valid
  checkoutUrl/transactionId returned, teams.paddleCustomerId persisted
  on first call.
Test 3 — Second checkout attempt for the SAME team → getOrCreatePaddleCustomer
  reuses the EXISTING paddleCustomerId, confirmed via mock call-count
  (zero additional "create customer" calls).
Test 4 — POST /billing/portal before any checkout → 404 NO_BILLING_ACCOUNT.
Test 5 — MEMBER role attempting checkout or portal → 403 on both.
```

### Webhook Tests

```
Test 6 — Valid Paddle-Signature + transaction.completed (mocked) →
  subscriptions row created, team.plan updated, cache invalidated,
  confirmation email queued (not sent inline — verified via mock
  notify-queue call, not a real send).
Test 7 — Tampered body with an otherwise correctly-formatted signature
  header → rejected, logged as a SECURITY event distinct from a normal error.
Test 8 — Replayed event_id → second delivery confirmed as a no-op (mock
  call-count on the repository stays at 1 write, not 2).
Test 9 — subscription.updated representing a DOWNGRADE where
  meetingsUsed already exceeds the new plan's limit → confirmed NO
  meetings are deleted/modified, only future creation is implicitly
  blocked via the UNCHANGED plan-limits.middleware logic.
Test 10 — subscription.canceled → team.plan flips to FREE, historical
  meetings/commitments confirmed still queryable/visible.
Test 11 — transaction.payment_failed → invoice row reflects the failed
  state, PAYMENT_FAILED notification confirmed queued via the shared
  notify infra (same queue Day 18/24 already built, no bespoke path found).
Test 12 — Timestamp outside the tolerance window (simulate an old,
  otherwise-validly-signed payload) → rejected as a replay attempt.
```

### Cache Consistency Test

```
Test 13 — Trigger a transaction.completed webhook for team X → IMMEDIATELY
  call GET /billing/usage for team X → confirm the response reflects the
  NEW plan's limits, proving the SHARED cache key with
  plan-limits.middleware (Day 16/17) stays consistent across the
  provider swap, not just in isolation.
```

---

## 19. End-of-Day Checklist

### Paddle Client Setup
```
[ ] paddle.client.ts confirmed as the ONLY file importing the Paddle SDK
[ ] PADDLE_API_KEY / PADDLE_WEBHOOK_SECRET confirmed NEVER reachable from
    any client-facing bundle or log
[ ] PADDLE_CLIENT_TOKEN confirmed correctly exposed to the env layer the
    frontend will read from (documented for Day 42, not wired yet)
[ ] PADDLE_ENVIRONMENT (sandbox/production) confirmed independently
    configurable, not coupled to NODE_ENV
```

### Checkout / Portal
```
[ ] POST /billing/checkout → valid Paddle checkout URL/transaction,
    redirects/opens correctly in a sandbox test
[ ] Test sandbox payment completes → transaction.completed → plan updated
[ ] POST /billing/portal → valid portal URL, MEMBER role → 403
[ ] Repeat checkout for an existing team → paddleCustomerId reused, no duplicate
```

### Webhooks
```
[ ] All 6 handlers (transaction.completed, subscription.created/updated/
    canceled, transaction.payment_failed, trialing-state handling) verified
    against Paddle's actual sandbox-fired payloads, not just hand-written fixtures
[ ] Signature verification: valid → processed; tampered → rejected +
    logged as security event; replayed event_id → confirmed no-op
[ ] meetings_used resets to 0 exactly at the new billing-cycle boundary
    (verified against the renewal transaction.completed path specifically,
    not just the FIRST checkout)
[ ] Downgrade scenario → no destructive deletion of over-limit historical data
[ ] Cancellation → downgraded to FREE, all historical meetings/commitments
    still visible
```

### Cache & Cross-System Consistency
```
[ ] cache:team:plan:{teamId} confirmed SHARED and consistent between
    /billing/usage and the existing plan-limits.middleware
[ ] /billing/plans edge-cache headers present and correct
```

### Security Sign-Off
```
[ ] Manual HMAC verification reviewed line-by-line for constant-time
    comparison and correct timestamp-tolerance enforcement
[ ] custom_data confirmed as the ONLY source of teamId/planId trust in
    every webhook handler — no fallback to any other payload field
[ ] requireRole('ADMIN') confirmed enforced on checkout/portal/invoices,
    tested explicitly with a MEMBER-role token
```

---

## Appendix A — Environment Variables Required Today

```
# Paddle (required — server fails to start without these)
PADDLE_API_KEY=...
PADDLE_CLIENT_TOKEN=...                 # public, safe for frontend exposure
PADDLE_WEBHOOK_SECRET=...
PADDLE_ENVIRONMENT=sandbox              # or 'production' — explicit, not
                                         # derived from NODE_ENV

# Price IDs — one per plan tier per billing interval, created in the
# Paddle dashboard's product/price catalog
PADDLE_PRICE_STARTER_M=...
PADDLE_PRICE_STARTER_Y=...
PADDLE_PRICE_GROWTH_M=...
PADDLE_PRICE_GROWTH_Y=...
PADDLE_PRICE_BUSINESS_M=...
PADDLE_PRICE_BUSINESS_Y=...

# Already set from previous days — reused, not re-declared
REDIS_URL=...
DATABASE_URL=...
FRONTEND_URL=...
```

## Appendix B — Quick Decision Reference

```
QUESTION                                          ANSWER
────────────────────────────────────────────────────────────────────────────
Why Paddle instead of Stripe?                     Stripe does not support
                                                   direct payouts for
                                                   Pakistan-based merchants
Who handles sales tax/VAT/GST?                    Paddle entirely — Vocaply
                                                   never calculates or
                                                   remits tax itself
Where does teamId travel through Paddle?           custom_data field on
                                                   transactions/subscriptions
                                                   — the trust anchor
Is PADDLE_CLIENT_TOKEN a secret?                   No — intentionally
                                                   public, used by Paddle.js
                                                   in the browser
How is webhook signature verified?                 Manual HMAC-SHA256 over
                                                   `${ts}:${rawBody}`,
                                                   constant-time compared
                                                   against the Paddle-Signature
                                                   header's h1 value
Does /billing/usage know which provider is used?    No — reads the SAME
                                                   denormalized field and
                                                   cache key as before,
                                                   fully provider-agnostic
What changed in plans.config.ts?                   Only the price-ID map
                                                   (PADDLE_PRICE_MAP
                                                   replacing STRIPE_PRICE_MAP)
                                                   — PLAN_LIMITS itself unchanged
```

---

*Document: DAY-23-PLAN-001 | Vocaply | Day 23: Billing API — Paddle Checkout, Subscriptions, Webhooks*
*Full Scalable Industry-Level Build Plan | Senior Engineer Edition | Paddle Edition (Pakistan-Compatible)*
*Merchant of Record Architecture · Manual HMAC Verification · Provider-Agnostic Quota System*
*Security-first · Performance-optimized · Production-grade · No Code, Pure Architecture*
