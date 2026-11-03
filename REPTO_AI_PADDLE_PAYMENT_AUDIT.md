# Repto AI — Paddle Payment System Audit

| | |
|---|---|
| **Audit date** | 2026-11-03 |
| **Scope** | `services/api` (Express + Prisma + BullMQ), `web` (Next.js checkout hook), `docker-compose.yml`, CI/deploy scripts |
| **Mode** | READ-ONLY. No production code, schema, config, env or payment data was modified. The only artifacts created are this report and three throwaway scripts in the session scratchpad (outside the repo). |
| **Paddle integration** | **Paddle Billing** (not Paddle Classic). `@paddle/paddle-node-sdk` 3.8.0 (server), `@paddle/paddle-js` (client). Paddle API version is whatever SDK 3.8.0 pins; it is not set explicitly in code. |
| **Secrets** | No secret values appear in this report. Env var *names* only. |

> **PHASE 2 UPDATE (2026-11-03):** fixes were implemented after this audit. Sections A–L below describe the system **as audited (pre-fix)**. The implementation record — per-finding status, the **14-day trial root cause and fix**, test evidence, deployment steps and the updated readiness assessment — is in **sections M–R at the end of this file**.

## Evidence legend

Every finding is tagged with how it was established:

| Tag | Meaning |
|---|---|
| **[EXEC]** | Verified by actually executing code/tests during this audit |
| **[CODE]** | Verified by reading the exact code path (static inspection) |
| **[DOCS]** | Verified against Paddle's official developer documentation (developer.paddle.com) |
| **[SUSPECTED]** | Plausible risk that could **not** be fully confirmed from the repo; needs a production check |

Executed during this audit:
1. `jest` on `paddle-webhook-service`, `paddle-webhook-controller`, `billing-service-flow`, `billing-scheduler`: **4 suites, 24 tests, all pass.** (All mock the DB, Paddle SDK and queue, which is why they miss F-01.)
2. A script calling BullMQ 5.78.1 `Queue.add()` against a **local, throwaway** Redis queue with the exact job-ID shapes the app uses (queue obliterated afterwards; no app queues touched).
3. A read of the installed Paddle SDK signature validator.

Nothing was tested against Paddle sandbox/production, no charges/refunds/cancellations were made, and no real database was touched. Failure-scenario "tests" in §I are therefore **code inspection unless marked [EXEC]**.

The two earlier in-repo audits (`BILLING_SYSTEM_AUDIT.md`, `docs/PAYMENT_SERVICE_AUDIT_REPORT.md`) were **not relied upon**. The first rates the webhook path 92/100 and does not mention F-01.

---

# A. Executive Summary

**Overall health: NOT production-ready for automated billing.** The *design* is good: webhook signature verification via the official SDK, a durable queue between ingestion and processing, server-side price resolution, ownership scoping by `teamId`, and unique constraints on Paddle IDs. But one verified defect breaks the whole webhook pipeline, and several lifecycle gaps follow from it.

**Headline risk (F-01, CRITICAL, [EXEC]).** The webhook controller enqueues each event with `jobId: "paddle-evt:<eventId>"`. BullMQ 5.78.1 rejects any custom job ID containing `:` unless it has exactly three colon-separated parts. I reproduced the rejection against a live Redis. Result: **every verified Paddle webhook returns HTTP 500 at the enqueue step and is never processed.** The same defect silently drops most billing emails (receipt, upgrade, cancellation, trial-started, payment-failed), because `enqueueBillingJob` swallows the error. It looks like the system "works" only because the frontend calls `POST /billing/sync` after `checkout.completed`, which reads Paddle directly. Renewals, cancellations, payment failures, refunds and chargebacks have no such fallback. Caveat: this is verified against the library and a live queue, not against production logs. Check production logs for `Failed to persist webhook event into BullMQ queue` (§J, P0-1) to confirm.

**Other major risks**
- **Entitlement abuse:** `POST /billing/sync` (and every duplicate/replayed paid-transaction event) resets `meetingsUsed` to 0, so a paid ADMIN can reset their quota on demand (F-04).
- **Refund handling is not idempotent and not status-aware:** `adjustment.created` followed by `adjustment.updated` double-counts the refund, and pending/rejected refunds downgrade the customer (F-03).
- **No ordering protection and no dedupe store:** Paddle explicitly does not guarantee order; the code never compares `occurred_at` or the subscription ID (F-05).
- **Events that can't be resolved to a team are acknowledged and discarded:** a paying customer with no access and no retry (F-06).
- **Duplicate-subscription path:** checkout during `past_due`/`paused`, or a second tab after the lock expires, can create a second live Paddle subscription that the DB overwrites and orphans (F-09).
- **Schema drift:** `prisma/migrations` contains only Stripe columns. The Paddle columns, `refunds`, `billing_audit_logs` and `gracePeriodEnd` exist only in `schema.prisma` (F-02). Deploy docs say production uses `migrate deploy`.
- **No reconciliation:** nothing compares Paddle with the DB on a schedule, and the manual sync cannot repair a missed cancellation (F-13).

**Integration completeness:** checkout, customer reuse, plan change, cancel-at-period-end, portal, invoices list, refund/adjustment ingestion, past-due grace and trial handling all exist. Pause/resume exists only as webhook handlers (no app-initiated pause). Dispute/chargeback exists only incidentally (F-03). Reconciliation and alerting are missing.

| Dimension | Rating |
|---|---|
| Payment correctness | **Fail** (F-01, F-03, F-04) |
| Data integrity | **At risk** (F-02, F-09, F-14) |
| Security | **Acceptable core, one abuse path** (F-04; no IDOR found) |
| Idempotency | **Weak** (F-03, F-04, F-09) |
| Webhook reliability | **Fail** (F-01), otherwise good design |
| Subscription lifecycle | **Incomplete** (F-05, F-07, F-12) |
| Performance | **Adequate for current scale** |
| Observability | **Weak** (F-13) |
| Disaster recovery | **Weak** (single Redis, no reconciliation) |

---

# B. Architecture Overview

## B.1 Components (discovered, not assumed)

| Layer | Files |
|---|---|
| Paddle SDK singleton | `services/api/src/services/paddle.client.ts` |
| HTTP API | `src/modules/billing/billing.{routes,controller,validator}.ts`, mounted at `/api/v1/billing` (`src/app.ts:156`) |
| Business logic | `src/modules/billing/billing.service.ts` |
| Data layer | `src/modules/billing/billing.repository.ts` |
| Webhook ingress | `src/modules/webhooks/webhooks.routes.ts` (`POST /api/webhooks/paddle` and `/api/v1/webhooks/paddle`), `paddle.webhook.controller.ts` |
| Webhook processing | `src/queues/workers/billing-webhook.worker.ts` → `paddle.webhook.service.ts` (`processEvent`) |
| Plan/price config | `src/config/plans.config.ts` (`PLAN_LIMITS`, `PADDLE_PRICE_MAP`, reverse map) |
| Entitlement enforcement | `src/middleware/plan-limits.middleware.ts` (meetings), `teams.service.ts` (members), `integrations.service.ts` (integrations) |
| Cron | `src/queues/scheduler.ts` `runBillingCycleResetCron` |
| Frontend | `web/src/features/billing/hooks/useCheckout.ts`, `billing.api.ts`, Paddle.js overlay |
| Legacy | `src/modules/webhooks/stripe.webhook.ts`: not mounted in any router (dead code); Stripe columns remain in schema |

## B.2 Data model (`prisma/schema.prisma`)

- **Billing unit is the Team** (workspace), not the User. `Team.paddleCustomerId` (indexed, **not unique**, by design, commit `61f611c`) and `Team.plan` (denormalized entitlement) and `Team.gracePeriodEnd`, `billingCycleStart/End`, `meetingsUsed`.
- `Subscription`: `teamId @unique`, `paddleSubscriptionId @unique`. **One row per team**, so history is overwritten.
- `Invoice`: `paddleTransactionId @unique`, amounts as `Int` minor units, `status` free-text string.
- `Refund`: `paddleAdjustmentId @unique`.
- `BillingAuditLog`: `eventId @unique` (nullable), written after the business transaction.
- There is **no webhook-event inbox table**; idempotency relies on the BullMQ job ID.

## B.3 Lifecycle as implemented

```
Browser ──POST /billing/checkout──▶ billing.service.createCheckoutSession
   (requireAuth → injectTenant → requireRole('ADMIN') → zod {planId, interval})
   • price ID resolved server-side from env map
   • Redis lock lock:checkout:<teamId> (15s)
   • existing active/trialing sub?  yes → paddle.subscriptions.update (prorated_immediately) + optimistic local write
                                    no  → getOrCreatePaddleCustomer → paddle.transactions.create(customData{teamId,planId,interval})
   ◀── { transactionId, checkoutUrl }
Browser opens Paddle.js overlay → payment
   ├─ Paddle.js event checkout.completed → POST /billing/sync (reads Paddle API, writes DB)   ← only reliable path today
   └─ Paddle → POST /webhooks/paddle
        • SDK unmarshal (HMAC-SHA256, 5s timestamp tolerance)
        • billingWebhookQueue.add(jobId "paddle-evt:<id>")      ← FAILS (F-01)
        • 200 only after enqueue succeeds
        BullMQ worker (concurrency 5, 5 attempts, exp. backoff 5s)
          → processEvent switch → repository $transaction → audit log → cache invalidate → socket → notifyQueue email
Entitlement = Team.plan (+ Redis cache 1h, invalidated on change) → checkMeetingLimit / member limit / integration limit
Cron: free-tier quota reset, grace-period expiry (7d), period-end cancellation
```

## B.4 Events handled by `processEvent`
`transaction.completed|paid|billed`, `subscription.created|imported|updated|activated|resumed|trialing|canceled|past_due|paused`, `adjustment.created|updated`, `transaction.payment_failed`. Unknown events are logged and acknowledged. Event names were checked against Paddle's event lists [DOCS]. All exist, except that `subscription.cancelled` (British spelling) is a harmless extra case label.

---

# C. Detailed Audit Findings

Severity scale: CRITICAL (money/security/outage now) · HIGH · MEDIUM · LOW · INFO.

## F-01: Every Paddle webhook fails at enqueue (invalid BullMQ job ID) — **CRITICAL** [EXEC]

- **Location:** `src/modules/webhooks/paddle.webhook.controller.ts:79` (`const jobId = \`paddle-evt:${eventId}\``), `:80-91`; also `src/modules/webhooks/paddle.webhook.service.ts:452, 509, 551, 697, 819` (notify-queue job IDs).
- **Existing behavior:** After a valid signature, `billingWebhookQueue.add(..., { jobId: "paddle-evt:evt_…" })` throws; the `catch` returns **HTTP 500** `Failed to persist webhook event`. Nothing is queued, so the worker never runs.
- **Expected:** Event is persisted and acknowledged with 200, then processed.
- **Root cause:** BullMQ `Job.validateOptions` (`node_modules/bullmq/dist/cjs/classes/job.js:1046-1050`) throws `Custom Id cannot contain :` when the ID contains `:` and does not split into exactly 3 parts. `paddle-evt:<id>` has 2 parts.
- **Evidence ([EXEC], live Redis, BullMQ 5.78.1):**
  ```
  REJECTED paddle-evt:evt_01abc                      -> Custom Id cannot contain :
  REJECTED billing-confirmation:txn_01abc            -> Custom Id cannot contain :
  REJECTED subscription-upgraded:evt_01abc           -> Custom Id cannot contain :
  OK       payment-past-due:sub_01:1793711070512     (3 parts)
  ACCEPTED paddle-evt-evt_01abc                      (no colon)
  ```
  The unit test `paddle-webhook-controller.test.ts` passes because it mocks `billingWebhookQueue.add` (`:13`, `:103`), so the real validator never runs.
- **Why safeguards failed:** Queue mocked in tests; no integration test against real BullMQ; `enqueueBillingJob` (`paddle.webhook.service.ts:286-304`) catches and only logs, so the notify-queue failures are invisible; the frontend `/billing/sync` path masks the missing webhook for first purchases.
- **Impact:** Webhook-driven state never updates: renewals (`period` dates, `meetingsUsed` reset), cancellations, `past_due`, payment failures, refunds and chargebacks, and upgrades/downgrades made in the portal. Paddle retries per its policy (live: up to 60 attempts over ~2 days; sandbox: 3 attempts in ~2 min [DOCS: respond-to-webhooks]) and then marks the delivery `failed`. Customers can keep premium after cancelling or refunding. Customers who pay a renewal can fail to get their quota reset. No receipt, trial or payment-failed emails go out.
- **Affected, related:** F-05, F-06, F-13 (all assume the pipeline works).
- **Recommended solution:** Remove the colon from every custom job ID, e.g. `paddle-evt-${eventId}`, `billing-confirmation-${transactionId}`, `subscription-upgraded-${eventId}`, `subscription-cancelled-${eventId}`, `trial-started-${subId}`, `payment-failed-${txnId}`. Make `enqueueBillingJob` rethrow (or record the failure) so the worker retries instead of dropping the email silently. Add a BullMQ integration test that uses a real Redis.
- **Verification:** Integration test (real Redis) posts a signed fixture to the webhook route and asserts 200 and a queued job. Replaying the same `event_id` yields one job. In production, `Failed to persist webhook event into BullMQ queue` is absent after the fix. Paddle dashboard → Notifications shows deliveries `delivered`.
- **Production confirmation still needed:** Check production logs and the Paddle notification log. Prior commits suggest someone believed the pipeline worked; the sync fallback explains how that belief could persist.

## F-02: Migration history does not contain the Paddle schema — **HIGH** [CODE] / production state [SUSPECTED]

- **Location:** `services/api/prisma/migrations/` (5 migrations) vs `prisma/schema.prisma:295-337, 675-760`.
- **Existing behavior:** `20260611135304_init` creates `subscriptions`/`invoices` with `stripeSubscriptionId`, `stripeInvoiceId`, etc. A repo-wide search of all migration SQL finds **no** `paddle*` columns, no `refunds` table, no `billing_audit_logs`, no `gracePeriodEnd`.
- **Expected:** Every schema change is represented by a migration so `prisma migrate deploy` reproduces the schema.
- **Root cause:** Schema was evolved with `prisma db push` (CI uses `npx prisma db push`, `.github/workflows/ci.yml:90`) while `docs/DEVOPS_DEPLOYMENT.md:181` says production runs `migrate deploy`.
- **Impact:** A fresh environment (DR restore, staging, new region) built via `migrate deploy` has a billing schema that does not match the code; all billing writes fail (`column does not exist`). Whether *current production* is affected depends on how it was provisioned [SUSPECTED]. If production relies on a hand-synced schema, drift is undetectable.
- **Recommended solution:** Generate a baseline/forward migration from the live production schema (`prisma migrate diff` against the real DB; mark applied with `migrate resolve`). Make CI run `migrate deploy` against an empty DB and then `migrate diff --exit-code` against `schema.prisma`.
- **Verification:** `prisma migrate deploy` on an empty Postgres yields a DB for which `prisma migrate diff --from-url … --to-schema-datamodel … --exit-code` returns 0.

## F-03: Refund/chargeback processing is non-idempotent and ignores adjustment type/status — **HIGH** [CODE] + [DOCS]

- **Location:** `paddle.webhook.service.ts:707-731` (`handleAdjustmentCreated`), `billing.repository.ts:393-453` (`processRefundAdjustmentTransaction`, especially `:429-449`).
- **Existing behavior:**
  1. Both `adjustment.created` and `adjustment.updated` call the same handler.
  2. The `Refund` row is upserted by `paddleAdjustmentId` (idempotent), **but** `invoice.amountRefunded` is recomputed as `invoice.amountRefunded + amountRefunded` on **every** call.
  3. `action` and `status` are never inspected; `status` defaults to `'completed'` when absent.
- **Expected:** One adjustment affects the invoice exactly once, and only when it is an approved refund. Paddle docs: `action` ∈ {`credit`, `refund`, `chargeback`, `chargeback_reverse`, `chargeback_warning`, `chargeback_warning_reverse`, `credit_reverse`}; `status` ∈ {`pending_approval`, `approved`, `rejected`, `reversed`}; "most refunds for live accounts must be approved by Paddle", so a refund typically produces `adjustment.created` (pending) then `adjustment.updated` (approved/rejected) [DOCS].
- **Root cause:** Delta is applied instead of derived from state; no filter on `action`/`status`.
- **Failure scenarios:**
  - created(pending) + updated(approved) → refund counted twice → `isFullRefund` true for a partial refund → team downgraded to FREE and subscription marked `refunded` though Paddle still bills.
  - A `pending_approval` refund downgrades immediately; if Paddle then **rejects** it, access is not restored.
  - Webhook redelivery (at-least-once [DOCS: how-webhooks-work]) re-adds the amount.
  - `credit`, `chargeback_warning`, `*_reverse` adjustments are treated as refunds. A reversed chargeback is counted as additional money out.
  - `Invoice not found` throws (`:410`), which retries forever up to 5 attempts and lands in the failed set. This is acceptable but unobserved (F-13).
- **Impact:** Paying customers lose access (support/chargeback risk), or revenue metrics (`amountRefunded`, MRR) are wrong.
- **Recommended solution:** Treat adjustment as state: if the `Refund` row for this `paddleAdjustmentId` already exists, update status only. Compute `invoice.amountRefunded` as `SUM(refunds where status = approved and action = refund)` inside the same transaction. Downgrade only on approved *full* refunds. Handle `chargeback` as its own path (suspend/flag) and `*_reverse`/`rejected` by restoring state. Add an `action` column to `Refund`.
- **Verification:** Unit + DB integration tests: created→updated, duplicate delivery, rejected, partial+partial, chargeback then reverse; invoice `amountRefunded` stays equal to the sum of approved refunds.

## F-04: Quota reset on every paid-transaction event and on manual sync — entitlement abuse / duplicate-processing side effect — **HIGH** [CODE]

- **Location:** `billing.repository.ts:211-221` (`activateSubscriptionTransaction` sets `meetingsUsed: 0`), invoked from `paddle.webhook.service.ts:405` and `billing.service.ts:505` (`syncSubscription`).
- **Existing behavior:** `meetingsUsed` is zeroed whenever the function runs. Paddle's checkout sequence emits `transaction.paid` then `transaction.completed` for the same transaction [DOCS: how-webhooks-work], and the code maps `paid`, `completed` and `billed` to the same handler (`:15-18`). Each distinct event ID is a separate job, so the reset runs 2–3 times per payment. `syncSubscription` also resets it on every call.
- **Expected:** Quota resets once per billing period, only when a new period starts.
- **Impact (abuse):** Any workspace ADMIN with an active paid subscription can `POST /api/v1/billing/sync` repeatedly to reset the meeting counter at will (global limiter is 100 req/min/IP; there is no per-route limit). That defeats the plan quota on paid tiers (STARTER 40, GROWTH 120, BUSINESS 300 meetings/month).
- **Root cause:** Reset is tied to "activation", not to "period changed". No comparison of the incoming `billingCycleStart` against the stored one.
- **Recommended solution:** Reset only when the new `currentPeriodStart` is later than the stored `team.billingCycleStart` (compare inside the transaction). `syncSubscription` must not reset usage. Separate "activate entitlement" from "start new period".
- **Verification:** Test: two events for one transaction → single reset; repeated `/billing/sync` → `meetingsUsed` unchanged; genuine renewal → reset.

## F-05: No out-of-order or stale-event protection — **HIGH** [CODE] + [DOCS]

- **Location:** `paddle.webhook.service.ts:9-52` and all handlers; `billing.repository.ts` upserts.
- **Existing behavior:** Handlers apply every event unconditionally. `occurred_at` is never read. Handlers don't verify that the event's `subscription_id` equals the stored `paddleSubscriptionId`. Queue concurrency is 5 (`billing-webhook.worker.ts:51`) with no per-team serialization.
- **Expected:** Paddle states "We can't guarantee the order of delivery" and says to "store and check `occurred_at` … before making changes" [DOCS: respond-to-webhooks].
- **Failure scenarios:** A late `subscription.updated(active)` after `subscription.canceled` reactivates a cancelled team. A delayed `subscription.canceled` for an *old* subscription (user cancelled, then re-subscribed; the new `subscription.created` overwrote the row) resolves the team via `customData.teamId` and runs `downgradeTeamToFree` (`:681-684`) on the **new, paying** subscription. Two events for the same team racing in parallel jobs: last writer wins.
- **Recommended solution:** Persist `lastEventOccurredAt` (and last event ID) on `Subscription`; skip events older than it inside the same DB transaction (row lock via `SELECT … FOR UPDATE` or an optimistic version check). Reject cancel/pause events whose `subscription_id` doesn't match the row. Use BullMQ job grouping or a per-team lock to serialize processing.
- **Verification:** Tests replaying events in reversed order and with mismatched subscription IDs leave state unchanged.

## F-06: Unresolvable events are acknowledged and permanently dropped — **HIGH** [CODE]

- **Location:** `paddle.webhook.service.ts:309-315` (transaction.completed returns when `teamId`/`planId` null), `:466-472, 523-529, 587, 627, 655-661, 773-779`.
- **Existing behavior:** Handlers `return` without throwing, so the BullMQ job completes successfully, never retries, and writes no `BillingAuditLog` (it needs a `teamId`).
- **Impact:** A real payment with an unmapped price ID (missing/changed `PADDLE_PRICE_*` env), a missing `customData`, or a transient DB lookup error (`resolveTeamAndPlan` swallows lookup errors at `:222, :238, :259`) yields **money taken, no access, no retry, no durable record**. The brief requirement that "a successful HTTP response must not indicate success if critical operations failed" is violated in spirit.
- **Root cause:** "Cannot resolve" is treated as a terminal skip instead of an error.
- **Recommended solution:** Throw (retry) on lookup errors; for genuinely unresolvable events, persist the raw event in a durable store (see F-10) with status `needs_attention` and alert. Do not mark success.
- **Verification:** Test with unmapped price ID: job fails or event stored as `needs_attention`; alert fires.

## F-07: Plan resolution precedence and fail-open fallbacks can wrongly downgrade or upgrade — **MEDIUM** [CODE]

- **Location:** `paddle.webhook.service.ts:264-282` (customData plan wins over price), `:105` (`plan = resolvedPlan ?? FREE`), `:71-87` (unknown status → `active`), `billing.repository.ts:281-293`.
- **Existing behavior:**
  - `customData.planId` takes precedence over the price ID, so if a plan is changed by any path that doesn't update `custom_data` (e.g. customer portal), the stored plan is stale. Price ID is the authoritative signal.
  - If neither resolves, `plan = FREE`; then for an `active` status `updateSubscriptionTransaction` writes `team.plan = FREE`. A paying customer is downgraded.
  - Unknown Paddle status maps to `active` (fail-open entitlement).
  - `updateSubscriptionPlan` (`paddle.client.ts:236-239`) sends `customData: {planId, interval}` **without `teamId`**. Whether Paddle replaces or merges `custom_data` on PATCH is **not documented on the pages read** [SUSPECTED]; if it replaces, later transaction events lose the primary team anchor and rely on DB lookups.
- **Recommended solution:** Resolve plan from `items[0].price.id` first, `customData` second; if neither resolves, throw. Send the complete `customData` including `teamId` on every update. Map unknown statuses to a non-entitling state and alert.
- **Verification:** Table-driven tests for precedence; unknown status test.

## F-08: Plan-change response does not match what the frontend expects — **MEDIUM** [CODE]

- **Location:** `billing.service.ts:228-231` returns `{ transactionId: <sub_…>, checkoutUrl: null }`. `web/.../useCheckout.ts:84, 93, 106-111` checks `data.updated`, then `transactionId` starting `txn_`, then `checkoutUrl`.
- **Existing behavior:** For an in-place upgrade/downgrade neither branch matches, so the UI shows "No checkout URL or transaction ID returned from server." even though Paddle has already been charged/credited (`prorated_immediately`, `paddle.client.ts:235`).
- **Impact:** Users see an error after a successful paid change and retry; the second call hits the lock/409 or, once state diverges, repeats operations. Support burden and distrust.
- **Recommended solution:** Return `{ updated: true, plan, status }` from the service for plan changes (typed `CheckoutResult` union) and handle it in the hook.
- **Verification:** Hook test with `updated: true`; E2E: upgrade shows success state.

## F-09: Duplicate / orphaned Paddle subscription possible — **HIGH** [CODE]

- **Location:** `billing.service.ts:117-232` (lock + existing-sub check), `billing.repository.ts:111-146, 184-208` (upsert keyed on `teamId`).
- **Existing behavior / paths:**
  1. The "already subscribed" guard only considers DB statuses `active|trialing`. A team whose DB status is `past_due`, `paused` or `incomplete` falls through to "new purchase" and creates a **second** Paddle subscription. (Paddle also refuses plan updates while `past_due` [DOCS: update-subscription], so the code can't update it either.)
  2. The Redis lock is a 15-second `SET NX EX`; it protects double-click but not a second tab/device after 15 s, nor the window between payment completion and webhook/sync.
  3. When the second subscription's events arrive, `Subscription` is upserted by `teamId`; the unique `paddleSubscriptionId` is **overwritten**. The first Paddle subscription is no longer tracked locally but keeps billing.
  4. No idempotency key is sent on `transactions.create`. Whether the SDK/API supports one was not verified.
- **Impact:** Double charges, an orphaned billing relationship the app can't see, and wrong plan state.
- **Recommended solution:** Before creating a transaction, check Paddle (`subscriptions.list({customerId, status: active, trialing, past_due, paused})`) and block or route to the portal. Keep one row per Paddle subscription (key on `paddleSubscriptionId`; derive "current" per team), or refuse to overwrite a different live `paddleSubscriptionId` and alert. Add a DB-level partial uniqueness guard on live subscriptions per team.
- **Verification:** Tests: checkout during `past_due`/`paused` is rejected; second `subscription.created` with a different ID raises an alert and does not silently replace.

## F-10: Webhook durability and idempotency rely only on Redis/BullMQ — **MEDIUM** [CODE]

- **Location:** `queue.client.ts:122-131`, `redis` service `docker-compose.yml:308` (`--save 60 1`, no AOF).
- **Existing behavior:** Dedupe key is the BullMQ job ID; `removeOnComplete: {count: 1000}` removes completed jobs (and with them the dedupe record) once 1000 newer jobs complete; a Paddle redelivery after that is re-processed. There is no persisted record of "event X processed". Redis snapshot-only persistence can lose up to ~60 s of acknowledged-but-unprocessed events on a crash. Retry window is 5 attempts at exponential 5 s (~75 s total) which does not outlast a DB outage; after that the job sits in the failed set with no alert or consumer.
- **Recommendation (justified by findings, not generic):** Add a small `PaddleWebhookEvent` table (`eventId UNIQUE`, `eventType`, `occurredAt`, `payload`, `status`, `attempts`, `processedAt`). Insert it before acking (so ack means durable in Postgres); process from it; use it for dedupe, F-05 ordering, F-06 `needs_attention`, and F-13 reconciliation. Keep BullMQ for scheduling. This is the only new table recommended. Also enable Redis AOF if Redis stays in the path, and extend the retry policy (or add a delayed re-drive).
- **Verification:** Kill the worker mid-event and restart, redeliver an old event; both leave exactly one processed record.

## F-11: Handler steps after the DB transaction are not atomic with it — **LOW** [CODE]

- **Location:** `paddle.webhook.service.ts:405-454`, `:593-601`, `:618`.
- **Existing behavior:** DB transaction → audit log → cache invalidation → socket → email enqueue. A failure at the audit-log step (non-P2002) retries the whole job, re-running the transaction (and F-04's reset). `handleSubscriptionPastDue` updates `team` and `subscription` in two separate statements (not atomic) and uses `Date.now()` inside the notify job ID (`:618`), so each retry sends another email. Every `subscription.updated` with status active enqueues a "subscription-upgraded" email (`:537-553`), including non-upgrade updates (payment method change, pause→resume).
- **Recommendation:** Put audit-log insert inside the transaction (it is the natural dedupe key); make job IDs deterministic; send "upgraded" only when the plan actually changed.

## F-12: Cancellation and expiry paths — **MEDIUM** [CODE]

- **Location:** `billing.service.ts:377-413`, `scheduler.ts:260-295`.
- **Existing behavior:**
  - `cancelSubscription` wraps Paddle cancel **and** the local DB update in one `try`; if Paddle succeeds and the DB write fails, the user sees `PADDLE_CANCEL_FAILED` though cancellation is scheduled; a retry hits Paddle again.
  - Period-end cancellation is executed by a cron using the **locally stored** `currentPeriodEnd` and marks the subscription `cancelled` itself, independent of Paddle's `subscription.canceled`.
  - Nothing downgrades an `active` subscription whose `currentPeriodEnd` is long past because renewal webhooks were lost (see F-01, scenario 19).
- **Recommendation:** Separate Paddle failure from local failure. Treat Paddle's webhook (or the reconciliation job) as the source of truth for expiry; add an "overdue by N days" sweep that asks Paddle before downgrading.

## F-13: No reconciliation, alerting or failed-event visibility — **HIGH** [CODE]

- **Location:** `billing.service.ts:447-553` (`syncSubscription`), `billing-webhook.worker.ts:55-67`, `queue.client.ts:135-143`, `billing.controller.ts:139-158`.
- **Existing behavior:** `syncSubscription` is manual, per team, and only looks at Paddle subscriptions in `active|trialing` (`:463-466`). If Paddle has no active subscription it returns `synced: false` and **never downgrades**, so it cannot repair a missed cancellation, pause, `past_due` or refund. Only the first active subscription is considered (`activeSubs[0]`). Failed jobs are only logged; there is no metric/alert, no dead-letter processing, and no admin view. `/billing/webhook-status` only reports "last webhook received" from a Redis key written before enqueue, so it reports "healthy" even while every event fails (F-01).
- **Impact:** Silent divergence between Paddle and the DB is undetectable until a customer complains.
- **Recommendation:** Nightly reconciliation job: for each team with a `paddleCustomerId`, list Paddle subscriptions (all statuses) and transactions since last run; compare plan/status/period; write discrepancies to a table or alert; auto-repair only for clear-cut cases. Alert on failed-set growth and on "no successful webhook processed in N hours". Expose `GET /admin/billing/discrepancies`.

## F-14: Fabricated data is persisted as if it came from Paddle — **MEDIUM** [CODE]

- **Location:** `paddle.webhook.service.ts:117-160, 322-324, 401-402`; `billing.repository.ts:72-99`; `billing.service.ts:189-191, 484, 496`; `scripts/heal-subscriptions.js:22-24`.
- **Existing behavior:** Missing periods become `now` / `now + 30|365 days`; missing trial dates become `+14 days`; `unitAmount` of 0 or missing becomes the list price from `PLAN_LIMITS` (annual = 10 × monthly, which is an undeclared pricing assumption and always USD); `paidAt` is processing time (`new Date()`), overwritten on every replay. A genuine zero-total transaction on a paid plan (100% discount code, free renewal) is classified as a trial (`:350-357`). `transaction.billed` (an invoice awaiting payment, "not a paid state" [DOCS: transaction-billed]) is processed as paid, marking the invoice `paid` and activating the plan (relevant only if manual collection is ever used).
- **Impact:** Wrong billing-cycle dates feeding the free-tier/period cron, wrong displayed prices, and the possibility of granting access for unpaid invoices.
- **Recommendation:** Persist only Paddle-provided values (nullable otherwise) and fix price display from Paddle's price entity. Handle `transaction.completed` (and `paid`) only; ignore `billed`. Use Paddle's timestamps (`billed_at`, `occurred_at`).

## F-15: Invoice PDF/receipt URL is never actually obtained — **MEDIUM** [CODE]

- **Location:** `paddle.webhook.service.ts:401, 448` (`data.invoice_url ?? data.hostedInvoiceUrl`), `billing.service.ts:434-435`.
- **Existing behavior:** The SDK transaction entity has no `invoice_url` field (search of the SDK `dist` finds none). The SDK exposes `transactions.getInvoicePDF(transactionId)` (`resources/transactions/index.js:59`), which the app never calls. `getInvoicePdf` falls back to a field that doesn't exist, so it returns `null` and the controller replies 404 "Invoice PDF not available".
- **Recommendation:** Call `paddle.transactions.getInvoicePDF` on demand (short-lived URL, do not store).

## F-16: Entitlements — only some plan limits are enforced — **MEDIUM** [CODE]

- **Enforced:** meetings per cycle (`checkMeetingLimit`, `meetings.routes.ts:54, 66`), team members (`teams.service.ts:426`), integrations (`integrations.service.ts:70-76`).
- **Defined in `PLAN_LIMITS` but not enforced anywhere** (search of `src`): `historyDays`, `storageGB`, `apiAccess`, `ssoEnabled`; they are only returned for display (`teams.service.ts:287-289`). A BUSINESS-only `apiAccess` feature is advertised in the plan table.
- `Team.plan` is the single entitlement source and is denormalized from `Subscription`; they are mutated by different code paths (webhook, sync, cancel cron, grace cron, refund), so divergence is possible (e.g. grace cron sets `plan = FREE` but leaves `Subscription.status = past_due`; if Paddle later recovers the payment but the webhook is lost, access is not restored).
- **Also:** `checkMeetingLimit` is check-then-act; the counter increments at `DONE`, so concurrent creations can exceed the limit (low severity, outside payment correctness).
- **Recommendation:** Confirm which of these limits are product commitments; enforce them or remove them from marketing/plan display. Derive entitlement through one function `getEffectivePlan(team, subscription)`.

## F-17: Minor correctness / hygiene — **LOW**

- `getOrCreatePaddleCustomer` calls `paddle.customers.get` on every checkout while its doc comment says "zero API call" (`paddle.client.ts:59-63, 78`); extra latency per checkout.
- Customer is created with the *requesting admin's email* as both email and name (`billing.controller.ts:38`); invoices/receipts go to whichever admin first paid.
- `PADDLE_ENVIRONMENT` default is `sandbox` in code (`paddle.client.ts:27`, `config/env.ts:47`) but `production` in `docker-compose.yml:88, 158`. There is no startup check that the API key matches the environment.
- `paddle.client.ts` throws at import if `PADDLE_API_KEY` is missing; `billing.service.ts` imports it statically, so the whole API fails to boot without it, even in dev.
- Root of `services/api` contains many ad-hoc scripts (`test-paddle*.ts`, `scratch*.ts`, `check-plan.ts`); none contained a secret literal in my search, but they sit next to production code.
- Signature failure logs the first 40 characters of the `Paddle-Signature` header (`paddle.webhook.controller.ts:39`); minor information in logs.

---

# D. Security Findings

| ID | Finding | Severity | Status |
|---|---|---|---|
| S-1 | Webhook signature verification uses the official SDK `paddle.webhooks.unmarshal` over the **raw body** (`rawBody` captured by `express.json({verify})` at `app.ts:116-121`, before routing). Missing secret → 500 (fail-closed); missing/invalid signature → 400. Uses HMAC-SHA256 `ts:body` with a 5-second timestamp window (`webhooks-validator.js`, [EXEC] read). | — (good) | Verified |
| S-2 | Replay protection = 5 s timestamp tolerance in the SDK only. Paddle's docs read did not say whether retries carry a fresh `ts`; if retries keep the original timestamp, retried deliveries would be rejected with 400 (and clock skew > 5 s would reject valid ones). | MEDIUM | [SUSPECTED]. Verify with Paddle's webhook simulator/support and keep NTP healthy. |
| S-3 | **Quota-reset abuse** via `POST /billing/sync` (F-04). | HIGH | Verified [CODE] |
| S-4 | Billing endpoints authorization: `requireAuth → injectTenant (teamId from JWT) → requireRole('ADMIN')` with a live DB role/membership check (`role.middleware.ts`). Invoice PDF is scoped `findFirst({id, teamId})`. Team ID is never taken from the request body/params. **No IDOR found.** `GET /subscription` and `/usage` are available to all members by design. | — (good) | Verified |
| S-5 | Price/plan tampering: `planId`/`interval` validated by Zod enum (`billing.validator.ts`), price ID resolved server-side from env (`billing.service.ts:107-115`), customData set server-side. Client cannot choose a price or amount. | — (good) | Verified |
| S-6 | No dedicated rate limit on `/billing/checkout`, `/billing/sync`, `/billing/cancel`, `/billing/portal`; only the global per-IP 100 req/min limiter (`rate-limit.middleware.ts:157-168`), which exempts all `/webhooks` paths. Each call can hit Paddle's API. | LOW–MEDIUM | Verified |
| S-7 | Webhook endpoint is exempt from rate limiting and does an authenticated-only expensive path (signature then Redis); acceptable. Body limit is 10 MB (`app.ts:117`). | INFO | — |
| S-8 | Secrets: only env names appear in code/compose; `.env.production.example` contains placeholders; no secret literals found in the repo scan (one `pdl_ntfset_…` string in `paddle-webhook-controller.test.ts:34` is a test fixture). Job payloads (`event`) are stored whole in Redis and failed jobs retained forever (`removeOnFail: false`); they contain Paddle customer/transaction identifiers. Restrict Redis access and set a retention policy. | LOW | Verified |
| S-9 | No application-initiated refund or subscription-modification endpoint exists besides cancel/plan-change; refunds happen only in the Paddle dashboard. There is no refund authorization surface to attack. | INFO | Verified |
| S-10 | Sandbox/production separation relies on env only; no cross-check between `PADDLE_ENVIRONMENT`, API key prefix and client token (F-17). | LOW | Verified |

---

# E. Data Integrity Findings

| ID | Finding | Evidence |
|---|---|---|
| D-1 | Migration history lacks Paddle tables/columns (F-02). | [CODE] |
| D-2 | `Subscription` is one row per team (`teamId @unique`) and upserts overwrite `paddleSubscriptionId` (F-09); subscription history and replaced subscriptions are lost. | `schema.prisma:675-701` |
| D-3 | `Team.paddleCustomerId` is intentionally non-unique (multi-workspace accounts). The webhook fallback correctly refuses ambiguous matches (`paddle.webhook.service.ts:253-258`), but `Subscription.paddleCustomerId` and `Invoice.paddleCustomerId` are plain strings with no FK. | [CODE] |
| D-4 | Idempotency anchors that **do** exist: `Subscription.paddleSubscriptionId @unique`, `Invoice.paddleTransactionId @unique`, `Refund.paddleAdjustmentId @unique`, `BillingAuditLog.eventId @unique`; invoice/subscription writes are upserts inside `$transaction` (`billing.repository.ts:182-240`). Good. The *side effects* around them are not idempotent (F-03, F-04). | [CODE] |
| D-5 | `Invoice.status` and `Refund.status` are free strings; `billingInterval` is a free string (`'month'\|'year'`). Add enums or CHECK constraints. | `schema.prisma` |
| D-6 | Money: stored as `Int` minor units (no float) with `currency` text. `parseMinorAmount` uses `Number()` + `Math.round` (safe at these magnitudes). Fabricated/USD-assumed fallback amounts (F-14); currency lower-cased inconsistently (`usd`) vs Paddle's upper-case ISO codes. | [CODE] |
| D-7 | Timestamps: stored as UTC `DateTime`; fabricated and processing-time values mixed with Paddle values (F-14). Cron uses server `now` and local 30-day cycle for FREE teams (`scheduler.ts:213`). | [CODE] |
| D-8 | Orphaned/stale: after a lost cancellation the team keeps its paid `plan` with an `active` subscription row and no expiry job (scenario 19). `Team` delete is `Restrict` against subscription/invoice (good), while `Refund.team` is `Cascade` but `Refund.invoice` is `Restrict`. | [CODE] |
| D-9 | Indexes: `Invoice(teamId, createdAt desc)`, `Subscription(status, paddleCustomerId, plan)`, `Team(paddleCustomerId)` exist. Cron filters on `Team(gracePeriodEnd)`, `Team(plan, billingCycleEnd)`, `Subscription(cancelAtPeriodEnd, currentPeriodEnd)` have no supporting index; trivial now, relevant at scale. | [CODE] |
| D-10 | Legacy Stripe columns (`Team.stripeCustomerId/stripeSubId`, and per init migration `subscriptions.stripe*`) remain; `stripe.webhook.ts` is dead code. | [CODE] |

Transaction flow trace: Checkout → `transactions.create` (customData) → payment → `transaction.paid/completed` → queue (**broken**, F-01) → `activateSubscriptionTransaction` ($transaction: Subscription upsert + Team plan/quota/grace + Invoice upsert) → audit log → cache invalidate → socket. Atomicity inside the `$transaction` is correct; post-commit steps are not atomic (F-11). Scenarios where Paddle succeeds but the app does not activate: F-01, F-06, F-07. Scenarios where the app grants access without confirmed payment: F-05 (stale events), F-14 (`transaction.billed`, unknown status → `active`), F-04 (quota).

---

# F. Idempotency Findings

| Area | State | Finding |
|---|---|---|
| Duplicate webhook delivery (same `event_id`) | Partial | BullMQ job ID dedupe (broken by F-01); dedupe record expires after 1000 completions (F-10); no persisted processed-events store |
| Replays of the same underlying transaction via different events (`paid`/`completed`/`billed`) | **Not handled** | Each runs the full handler; resets quota (F-04) |
| Refund/adjustment redelivery or created→updated | **Not handled** | Double count (F-03) |
| Subscription upserts | Handled | Unique keys + upsert (D-4) |
| Invoice upserts | Handled | `paddleTransactionId` unique; `paidAt` overwritten (F-14) |
| Audit log | Handled | Unique `eventId`, P2002 ignored (`billing.repository.ts:471-476`); but not used as a processing gate |
| Email/notify jobs | Intended deterministic IDs | Currently rejected (F-01); `payment-past-due:<sub>:<Date.now()>` is non-deterministic (F-11) |
| Double-click checkout | Handled (single node) | Redis `SET NX EX 15` + token-checked release (`billing.service.ts:117-127, 261-266`); UI also gates on `checkoutState` |
| Second tab / repeated checkout after lock expiry; checkout while `past_due` | **Not handled** | F-09 |
| Paddle-side idempotency | Not used | No idempotency key sent on `transactions.create` / `subscriptions.update`; SDK/API support not verified |
| Plan-change retry | Not handled | A retry after F-08's false error re-sends the update |
| Cancel retry | Partly | Paddle rejects repeated scheduled cancel; local update may be skipped after Paddle success (F-12) |
| Credit/usage allocation | Not handled | Quota reset repeats (F-04) |

**Paddle's idempotency vs. app-level:** Paddle provides at-least-once delivery and a unique `event_id` for the app to dedupe on [DOCS]; it does not make the app's side effects idempotent. The app needs a persisted processed-event record (F-10) and period-aware state transitions (F-04, F-05).

---

# G. Performance Findings

| ID | Finding | Severity |
|---|---|---|
| P-1 | Webhook ack path is lean (verify → one Redis add) and well within Paddle's 5-second window [DOCS], good design once F-01 is fixed. | INFO |
| P-2 | Each checkout does a live `customers.get` before reuse (F-17); `syncSubscription` does a Paddle list per call and is exposed to repeated calls (S-6). Add per-team rate limit and cache the result briefly. | LOW |
| P-3 | Worker concurrency 5 with no per-team ordering (F-05); total webhook volume is low, but correctness, not throughput, is the constraint. | MEDIUM |
| P-4 | Cron loops do per-row `update` + `invalidatePlanCache` (N+1 writes) for free-tier resets, grace expiry and cancellations (`scheduler.ts:212-223, 242-251, 271-288`). Fine for hundreds of teams; batch with `updateMany` before thousands. | LOW |
| P-5 | Dynamic `import()` inside hot handlers (`resolveTeamAndPlan`, socket emit) adds small overhead; cached after first load. | INFO |
| P-6 | Redis single instance with snapshot persistence is both the queue, lock and cache; a Redis outage blocks webhook acks (500 → Paddle retries, which is acceptable) and loses recent unprocessed events (F-10). | MEDIUM |
| P-7 | Paddle SDK calls have no explicit timeout/retry configuration in code; behaviour under Paddle outage depends on SDK defaults (not verified). Checkout lock TTL (15 s) could expire during a slow Paddle call. | LOW |

Capacity verdict: current architecture can handle several thousand subscriptions and webhook volume; what limits growth is correctness (ordering, durability, reconciliation), not throughput. Recommend only the F-10 table and the indexes in D-9.

---

# H. Missing Implementations

**Genuinely required (production-grade baseline)**
1. Durable processed-event store + stale-event guard (F-05, F-10).
2. Reconciliation job and failed-webhook alerting (F-13).
3. Chargeback/dispute handling as a distinct state (F-03). Paddle's `chargeback`, `chargeback_warning` and `*_reverse` actions are not distinguished.
4. Schema migrations for Paddle tables (F-02).
5. Idempotent, period-aware quota reset (F-04).
6. Entitlement expiry sweep driven by Paddle truth (F-12, scenario 19).
7. Integration tests against real Redis/Postgres (§K).

**Nice-to-have / optional**
- App-initiated pause/resume (only webhook handlers exist; not needed unless it is a product requirement).
- Per-subscription history table (to replace single-row `Subscription`).
- Admin billing console (failed events, discrepancies, manual re-drive).
- Enforcement of `historyDays`, `storageGB`, `apiAccess`, `ssoEnabled` — *required only if sold as plan features* (F-16).
- Paddle webhook simulator-based E2E in CI.

Verified present (do not rebuild): signature verification, BullMQ queue, server-side price mapping, checkout lock, portal session, invoice list, refund ingestion (needs fixes), grace period, trial handling, billing emails (pipeline broken by F-01), audit log, admin MRR/churn.

---

# I. Failure Scenario Matrix

Legend: ✅ handled · ⚠️ partially · ❌ not handled. Method: **C** = code inspection, **E** = executed, **D** = Paddle docs.

| # | Scenario | Result | Actual failure point / root cause | Impact | Corrective action | Method |
|---|---|---|---|---|---|---|
| 1 | User closes checkout before payment | ✅ | Transaction stays draft in Paddle; no local state changed (`createTransaction` writes nothing locally) | None | — | C |
| 2 | Paid but frontend never gets confirmation | ⚠️ | Only recovery is webhook, which fails (F-01); no polling/sync on next page load | Paid customer stays on FREE until they manually sync | Fix F-01; auto-sync on billing page load; reconciliation | C, E |
| 3 | Paddle confirms payment but webhook delivery fails | ❌ | Same as F-01: all deliveries 500, later `failed` after 60 live attempts/2 days [D] | State never updates | F-01, F-10, F-13 | E, D |
| 4 | Webhook delivered multiple times | ⚠️ | Job-ID dedupe expires/broken; handlers re-run quota reset and refund delta (F-03/F-04/F-10) | Quota reset, double refund | Persisted event store; idempotent handlers | C, D |
| 5 | Webhooks arrive out of order | ❌ | No `occurred_at`/sub-ID checks (F-05) | Cancelled customer reactivated or paying customer downgraded | Ordering guard | C, D |
| 6 | Database unavailable during webhook processing | ⚠️ | Job throws and retries 5× over ~75 s (`queue.client.ts:125-127`); then stays failed with no alert/re-drive; `resolveTeamAndPlan` swallows DB errors and the event is dropped as "unresolvable" (F-06) | Lost event | Throw on lookup errors; longer retry; alert | C |
| 7 | Backend crashes after receiving webhook | ⚠️ | If crash occurs after enqueue: BullMQ resumes (stalled-job recovery). Redis snapshot every 60 s can lose events (F-10). Before enqueue: Paddle retries | Possible rare loss | Postgres inbox; Redis AOF | C |
| 8 | User clicks checkout multiple times | ✅ | UI state gate + Redis lock (single request wins, others 409) | None | — | C (unit test `billing-service-flow` for 409 passes, E) |
| 9 | Renewal succeeds but DB sync fails | ❌ | Period/quota not updated (F-01); no reconciliation; `currentPeriodEnd` goes stale; renewal transaction not recorded as invoice | Wrong quota/usage, missing invoice | F-01, F-13 | C |
| 10 | Subscription renewal fails | ⚠️ | `subscription.past_due` sets 7-day app-defined grace (`:591`) independent of Paddle's dunning settings; grace cron downgrades even if Paddle is still retrying; recovery relies on `subscription.updated` webhook | Premature downgrade or lingering access | Align grace to Paddle dunning; reconcile | C, D |
| 11 | User cancels during active period | ⚠️ | Paddle cancel + local `cancelAtPeriodEnd`; DB failure after Paddle success reports failure (F-12); cron downgrades from local date | Mostly works; UX/retry hazard | Split error handling | C |
| 12 | Upgrade while another subscription op is processing | ⚠️ | Redis lock (15 s) serializes API calls only; webhook jobs run concurrently with API writes and each other (F-05) | Last-writer-wins | Row-level lock / versioning | C |
| 13 | Refund after activation | ❌ | F-03 double count; pending/rejected refunds downgrade; webhook pipeline broken | Wrong access, wrong revenue | F-03 | C, D |
| 14 | Payment disputed / chargeback | ❌ | `chargeback*` actions treated as refunds; no suspension/flag state; reversals double-count | Lost access incorrectly or retained access after chargeback | Distinct chargeback handling | C, D |
| 15 | User accesses another user's billing info | ✅ | `teamId` from JWT; live role check; invoice lookup scoped by team | None found | Keep; add authorization tests | C |
| 16 | Paddle API temporarily unavailable | ⚠️ | Checkout returns 502 with message passthrough (`Paddle Error: …`, leaks provider text to client); no retry/timeout config; webhook path unaffected | Failed checkout; verbose errors | Sanitize messages; set SDK timeouts | C |
| 17 | Network fails during checkout | ⚠️ | Overlay completes in Paddle; the frontend sync may not run; relies on webhook (F-01) | Delayed entitlement | Auto-sync on load; fix F-01 | C |
| 18 | Payment succeeds, entitlements not updated | ❌ | F-01, F-06 (dropped), F-07 (plan resolves to FREE) | Paying customer without access | F-01/F-06/F-07 + alerts | C, E |
| 19 | Subscription expires but premium remains | ❌ | No sweep for active subscriptions past `currentPeriodEnd`; sync never downgrades (F-12/F-13) | Free premium use | Expiry sweep + reconciliation | C |
| 20 | Two events update same subscription concurrently | ❌ | Worker concurrency 5, no locking/versioning (F-05) | Inconsistent plan/status | Per-team serialization | C |

---

# J. Prioritized Remediation Roadmap

Order of execution is top to bottom within a tier. Nothing here has been implemented.

### P0: critical financial / security (do first, in this order)

| # | Task | Depends on | Notes |
|---|---|---|---|
| P0-1 | **Confirm F-01 in production** (logs + Paddle notification log), then change all custom job IDs to colon-free (F-01) and make `enqueueBillingJob` fail loudly | — | One-line class of fix; highest value |
| P0-2 | Add a real-Redis integration test for the webhook route and for each job-ID shape | P0-1 | Prevents regression |
| P0-3 | Make quota reset period-aware and remove it from `syncSubscription` (F-04) | — | Closes the abuse path |
| P0-4 | Fix refund/adjustment handling: state-based, status/action aware (F-03) | — | Stops wrongful downgrades |
| P0-5 | Replay missed Paddle events: after P0-1, use Paddle's notification replay (events become `failed` after retries; replay via API is documented [DOCS]) or run a one-off reconciliation | P0-1 | Repairs divergence accumulated while broken |

### P1: reliability and integrity

| # | Task | Depends on |
|---|---|---|
| P1-1 | Baseline migration from live schema + CI `migrate diff` gate (F-02) | — |
| P1-2 | `PaddleWebhookEvent` inbox table: durable ack, dedupe, `occurred_at` ordering, `needs_attention` (F-05, F-06, F-10) | P1-1 |
| P1-3 | Throw/persist on unresolvable events; throw on lookup errors (F-06) | P1-2 |
| P1-4 | Stale-event & subscription-ID guards; per-team serialization (F-05) | P1-2 |
| P1-5 | Duplicate-subscription prevention: Paddle-side check, never overwrite a different live subscription (F-09) | — |
| P1-6 | Reconciliation job + alerts on failed set / no-processed-webhook (F-13) | P1-2 |
| P1-7 | Plan resolution by price ID first; complete `customData` on updates; fail-closed for unknown status (F-07) | — |
| P1-8 | Fix plan-change response contract (F-08) | — |
| P1-9 | Expiry sweep driven by Paddle truth (F-12) | P1-6 |

### P2: performance and architecture

| # | Task | Depends on |
|---|---|---|
| P2-1 | Per-route rate limits for `/billing/*` (S-6) | — |
| P2-2 | Redis AOF / managed Redis; longer retry + re-drive (F-10) | — |
| P2-3 | Stop persisting fabricated data; use Paddle timestamps and amounts (F-14) | P1-7 |
| P2-4 | Real invoice URLs via `getInvoicePDF` (F-15) | — |
| P2-5 | Indexes for cron filters; batch `updateMany` (D-9, P-4) | — |
| P2-6 | Single `getEffectivePlan()` entitlement function; enforce or retire unenforced limits (F-16) | — |
| P2-7 | Align grace period with Paddle dunning settings (scenario 10) | P1-6 |

### P3: optional

Subscription history table; admin billing console; sandbox E2E using Paddle's simulator; sanitize provider error messages; startup env cross-check; remove dead Stripe code and scratch scripts.

---

# K. Testing Strategy

Stack: Jest + ts-jest (already installed); `tests/support/test-db.ts` and `queue-test-harness.ts` already exist (not inspected in depth; evaluate for reuse). No new framework required.

**Existing coverage (executed, 24 passing tests):** webhook controller (missing signature, invalid signature, ping, enqueue), webhook service happy paths (transaction.completed incl. trial, adjustment full refund, cancel, past_due, subscription.created/trialing), checkout lock + same-plan 409, cancel, usage, invoice PDF, billing cron. All use mocks for DB, Paddle SDK and queue.

**Gaps and required tests**

| Area | Test | Level | Acceptance criterion |
|---|---|---|---|
| Queue contract | Signed fixture → route → **real BullMQ/Redis**; all job-ID shapes | Integration | 200 + job present; no `Custom Id` errors |
| Signature | Valid, tampered body, stale ts (>5 s), missing header, wrong secret | Unit/Integration | 400 unless valid; fixtures signed with test secret |
| Duplicate delivery | Same `event_id` twice | Integration (real Postgres) | Single state change; single email |
| Same transaction, many events | `paid` + `completed` (+ `billed`) | Integration | One quota reset; invoice paid once |
| Ordering | Reversed `updated`/`canceled`; stale old-sub cancel | Integration | State unchanged by stale events |
| Refunds | created→updated, partial+partial, rejected, chargeback, reverse | Integration | `amountRefunded` = sum of approved refunds |
| Unresolvable events | Unmapped price, missing customData | Integration | Not silently acknowledged |
| Checkout concurrency | Parallel calls; second tab after TTL; `past_due`/`paused` teams | Integration | At most one live Paddle subscription |
| Plan change | Upgrade/downgrade/response contract; frontend hook test | Unit + component | UI shows success on `updated: true` |
| Authorization | Member vs ADMIN vs other team on every `/billing/*` route; cross-team invoice ID | Integration | 403/404 as appropriate |
| Entitlements | Plan vs limits matrix; expiry; refunded; paused | Integration | Effective plan matches subscription state |
| Sync endpoint | Repeated calls | Integration | `meetingsUsed` unchanged |
| Reconciliation | Seed divergence, run job | Integration | Discrepancy reported/repaired |
| Failure injection | DB down mid-handler; worker killed mid-job | Integration | Event retried, final state correct once |
| E2E (optional) | Paddle sandbox + simulator | E2E | Full checkout → entitlement |

---

# L. Final Production Readiness Assessment

| Dimension | Assessment |
|---|---|
| **Payment correctness** | **Not ready.** Webhook processing is non-functional (F-01); refund math wrong (F-03); quota logic exploitable (F-04). |
| **Data integrity** | **Not ready.** Migration drift (F-02), overwritten subscription rows (F-09), fabricated values (F-14). Unique constraints and `$transaction` use are solid foundations. |
| **Security** | **Mostly sound.** Signature verification, server-side pricing and tenant scoping are correct; no IDOR found. Fix S-3 (quota abuse) and add billing rate limits. S-2 needs a production check. |
| **Idempotency** | **Weak.** Unique keys exist, but side effects and dedupe lifetime are not idempotent (§F). |
| **Webhook reliability** | **Fail today** (F-01); architecture (verify → durable queue → worker) is the right shape, needs an inbox, ordering and alerting. |
| **Subscription lifecycle** | **Incomplete.** Creation/trial/cancel paths are reasonable; renewal, past_due recovery, expiry, refund and chargeback depend on a pipeline that does not run. |
| **Performance** | **Adequate** for current scale. |
| **Observability** | **Weak.** Logs and audit rows exist, but no alerts, no discrepancy view, health endpoint reports healthy while failing. |
| **Disaster recovery** | **Weak.** Redis-only durability, no reconciliation, migrations cannot rebuild the schema. |

**Verdict:** Do not rely on automated billing in production until P0-1 through P0-5 are done and verified, and P1-1/P1-2/P1-6 are scheduled. Until then, treat `/billing/sync` plus manual Paddle-dashboard review as the real system of record.

---

## Appendix: Open items needing production access or Paddle confirmation

1. Production logs / Paddle notification log: do webhook deliveries show `failed`/500? (confirms F-01 impact and the extent of drift.)
2. How was the production schema provisioned: `db push` or `migrate deploy`? (F-02)
3. Does Paddle re-sign retries with a fresh `ts`? (S-2)
4. Does `PATCH /subscriptions` replace or merge `custom_data`? (F-07)
5. Does the customer portal allow customer-initiated plan changes in your account? (F-07)
6. Is manual collection (invoices) ever used? (F-14, `transaction.billed`)
7. Are `historyDays`, `storageGB`, `apiAccess`, `ssoEnabled` contractual plan features? (F-16)


---
---

# PHASE 2 — IMPLEMENTATION RECORD (2026-11-03)

> Sections **A–L above describe the system as audited in Phase 1 (before any change)**. Sections **M–Q below record what was
> changed, how each finding was re-verified against the code, and what was actually tested.**
>
> **Evidence rules used below.** "Tests executed" means executed in this session against a **throwaway local PostgreSQL 16 container
> (`rapto-payment-test-pg`, `127.0.0.1:55432`, database `rapto_payment_test`)** with the real Prisma schema, the real repository /
> handlers / inbox / sweeper, real JWT authentication and role checks, the real Paddle SDK signature verifier, and BullMQ's real
> job-id validator. Only network edges are stubbed (Paddle HTTP API, Redis transport, Socket.IO). **No production or `.env` database
> was touched, no Paddle sandbox/production call was made, no real charge/refund occurred.** A Paddle-sandbox end-to-end run has
> **not** been performed; items that depend on real Paddle behavior are labelled accordingly.

---

# M. Finding-by-finding implementation status

Status vocabulary: **FIXED AND VERIFIED** (change made and proven by executed tests) · **IMPLEMENTED — VERIFICATION PENDING**
(change made; proof needs production / Paddle-sandbox access) · **PARTIALLY IMPLEMENTED** · **NOT IMPLEMENTED** ·
**NOT REPRODUCIBLE** · **REQUIRES BUSINESS DECISION**.

Test file shorthand: **LC** = `tests/integration/billing-payment-lifecycle.db.test.ts` (35) · **WH** = `tests/integration/paddle-webhook-endpoint.db.test.ts` (12) ·
**HTTP** = `tests/integration/billing-http-security.db.test.ts` (42) · **ENT** = `tests/unit/entitlement.test.ts` (17) ·
**MAP** = `tests/unit/paddle-mapper.test.ts` (13) · **EML** = `tests/unit/billing-email-flow.test.ts` (58) ·
**SCH** = `tests/unit/billing-scheduler.test.ts` · **SVC** = `tests/integration/billing-service-flow.test.ts`.

## F-01 — Every Paddle webhook fails at enqueue (BullMQ job id contains `:`) — **FIXED AND VERIFIED**
- **Root cause: CONFIRMED** (re-executed in Phase 1 against live Redis; Phase 2 added a permanent regression guard).
- **Files:** `src/modules/webhooks/paddle.webhook.controller.ts`, `paddle.webhook.service.ts`, `src/queues/jobs/billing-webhook.job.ts`, `src/queues/workers/billing-webhook.worker.ts`; new `tests/support/bullmq-validate.ts`.
- **Changes:** job id is `paddle-evt-<eventId>` (colon-free). All five notify-queue ids are colon-free and deterministic (`billing-confirmation-<txn>`, `payment-failed-<txn>`, `trial-started-<sub>`, `subscription-cancelled-<evt>`, `subscription-upgraded-<evt>`). `enqueueBillingJob` now **propagates** failures (the job retries) instead of swallowing them. The queue payload carries only `{eventId,eventType,receivedAt}`; the Paddle payload lives in Postgres.
- **Tests:** WH (valid signed event → 200 + enqueue with `paddle-evt-<id>`; the queue mock runs **BullMQ's real `validateOptions`**, so a `:` would throw), LC (all notify jobs pass the same validator), EML (static guard: no job id template contains `:`).
- **Result:** pass. **Remaining risk:** production logs were not available to confirm how long the outage lasted — events delivered while broken are in Paddle's `failed` notification list and must be **replayed** (see §P, step 6).

## F-02 — Migration history lacks the Paddle schema — **FIXED AND VERIFIED** (scoped to billing) / **PARTIALLY IMPLEMENTED** (whole schema)
- **Root cause: CONFIRMED.** `prisma migrate diff` of a migrations-only database against `schema.prisma` showed the missing billing objects — **and also unrelated drift** (`risks`, `admin_*`, `waitlist_entries`, `platform_metrics_daily`, `cohort_retention_snapshots`, `blockers`/`decisions`/`meetings` columns). The non-billing drift is real but **out of scope and untouched**.
- **Migrations created (both idempotent, additive, data-preserving; `down.sql` provided for the second):**
  1. `20260901000000_billing_enum_values` — `ADD VALUE IF NOT EXISTS` for `SubscriptionStatus.refunded` and four `NotificationType` values.
  2. `20260901000100_paddle_billing_schema_and_webhook_inbox` — Paddle columns/indexes on `teams`/`subscriptions`/`invoices`; `refunds`, `billing_audit_logs` (+FKs); **new** `paddle_webhook_events`; **new** columns `subscriptions.lastEventOccurredAt`, `refunds.action`; new indexes `(status,trialEnd)`, `(cancelAtPeriodEnd,currentPeriodEnd)`, `teams(gracePeriodEnd)`. Legacy Stripe columns are **kept** and relaxed to nullable (nothing dropped); Paddle `NOT NULL` is applied only if no existing row violates it.
- **Executed verification:** (a) `migrate deploy` on an empty DB → success; re-running the SQL → no-op. (b) A database built with `db push` from the **pre-change** schema with sample team/subscription/invoice/refund rows → both migrations applied → **all rows intact**, `refunds.action` defaulted to `refund`, **zero remaining billing drift** in `migrate diff`.
- **Remaining risk:** run `prisma migrate resolve --applied` is **not** needed for these two (they are idempotent); production should still be backed up first. A CI gate (`migrate diff --exit-code`) is **not** added because the unrelated drift would fail it until that is fixed separately.

## F-03 — Refund / chargeback processing — **FIXED AND VERIFIED**
- **Root cause: CONFIRMED** (delta added on every call; `action`/`status` ignored).
- **Files:** `billing.repository.ts` (`processAdjustmentTransaction`), `paddle.webhook.service.ts` (`handleAdjustment`), `schema.prisma` (`Refund.action`).
- **Changes:** `invoice.amountRefunded` is now **derived** (`SUM` of `approved` refund/chargeback rows) — never incremented; access is revoked only when an **approved** refund/chargeback covers the team's **most recent paid** invoice; `pending_approval`/`rejected` change nothing; `chargeback`/`chargeback_warning` return `NEEDS_ATTENTION` + alert; a missing invoice **throws** (retry) instead of being dropped; a reversal that follows a revocation triggers a Paddle reconcile.
- **Tests (LC):** pending→approved (no double count), repeated `adjustment.updated`, rejected, two partial refunds + redelivery, chargeback, refund-before-invoice retry. **All pass.**
- **REQUIRES BUSINESS DECISION:** the policy "full approved refund/chargeback ⇒ Free plan" was **already the product behavior** and was preserved, not invented. Whether a *partial* refund should shorten access, and the dispute policy beyond "revoke + alert", were not specified.

## F-04 — Quota reset on every paid event and on `/billing/sync` — **FIXED AND VERIFIED**
- **Root cause: CONFIRMED.**
- **Files:** `billing.repository.ts` (`applySubscriptionState`), `billing.service.ts` (`syncSubscription`).
- **Changes:** `meetingsUsed` resets **only when the billing period start strictly advances** (`newStart > team.billingCycleStart`). `transaction.paid` / `transaction.billed` are ignored; sync no longer has its own activation path.
- **Tests:** LC (renewal resets once; same-period replay via `subscription.updated` + duplicate transaction does not), HTTP (`/billing/sync` ×4 leaves `meetingsUsed = 33`). **Pass.**

## F-05 — No out-of-order / stale-event protection — **FIXED AND VERIFIED**
- **Changes:** `Subscription.lastEventOccurredAt`; per-team **Postgres advisory lock** serializes every billing mutation across processes; subscription events older than the newest applied are ignored; an event for a **different** Paddle subscription never overwrites a **live** one (→ `NEEDS_ATTENTION`).
- **Tests (LC):** stale `updated` after `canceled` cannot resurrect access; stale `canceled` for an old subscription cannot downgrade the new one; three concurrent events converge to the newest `occurred_at` (BUSINESS). **Pass.**
- **Discovered by the tests:** the first version of the lock used `$queryRaw` on a `void`-returning function and **failed on a real database** (every write threw). Fixed with `$executeRaw`. This is exactly the class of defect the mocked Phase-1 tests could not see.

## F-06 — Unresolvable events silently acknowledged and dropped — **FIXED AND VERIFIED**
- **Changes:** DB lookup errors propagate (retry); genuinely unresolvable events (unmapped price, unknown status, ambiguous shared customer, non-numeric amount) raise `UnresolvableEventError` → inbox status `NEEDS_ATTENTION` with the reason, an `alert: billing.unresolvable_event` log, and **no state change**. Unknown Paddle statuses no longer default to `active`.
- **Tests (LC, MAP):** unmapped price / shared customer / unknown status. **Pass.**

## F-07 — Plan resolution precedence & fail-open fallbacks — **FIXED AND VERIFIED** (code) / **IMPLEMENTED — VERIFICATION PENDING** (Paddle `custom_data` semantics)
- **Changes:** price ID is authoritative; `custom_data` is only a fallback and can never be `FREE`; unresolved ⇒ throw (never default to FREE); `updateSubscriptionPlan` now sends `teamId` in `customData`.
- **Tests (MAP):** price beats stale custom_data; fallback only when unmapped; throws when neither. **Pass.**
- **Not verified:** whether Paddle `PATCH /subscriptions` *replaces* or *merges* `custom_data` was **not documented in the pages read**. Sending the full object is correct under either behavior.

## F-08 — Plan-change response contract — **FIXED AND VERIFIED** (backend contract) / **IMPLEMENTED — VERIFICATION PENDING** (browser)
- **Changes:** `createCheckoutSession` returns `{updated:true, plan, status, transactionId, checkoutUrl:null}`; the existing `useCheckout` branch for `data.updated` now matches; `billing.api.ts` return type extended. Local state is written from Paddle's **response** through the single writer.
- **Tests (HTTP):** plan change returns the contract and updates the team; a Paddle failure leaves state untouched. The React hook itself was **not** exercised in a browser or component test.

## F-09 — Duplicate / orphaned Paddle subscription — **FIXED AND VERIFIED**
- **Changes:** (a) `past_due`/`paused` ⇒ `409 SUBSCRIPTION_NEEDS_ATTENTION` (use the portal); (b) before any new transaction, `assertNoLiveSubscriptionInPaddle` lists the customer's live subscriptions in Paddle — if one exists the DB is **healed** and checkout is refused (409); if Paddle cannot be queried it **fails closed** (503); (c) webhook/sync can no longer overwrite a live subscription with a different one; replaced dead subscriptions are archived in `BillingAuditLog`.
- **Tests (HTTP, LC):** past_due checkout blocked; Paddle-live/DB-empty blocked + healed; Paddle down ⇒ 503 and no transaction; 3 concurrent checkouts ⇒ one `200` + two `409`; second live subscription flagged and not applied; history preserved on replacement.

## F-10 — Durability relied on Redis only — **FIXED AND VERIFIED**
- **Changes:** new table `paddle_webhook_events` (`eventId UNIQUE`). The endpoint verifies the signature, **inserts the event, then replies 200** (so 200 = durably stored). BullMQ is now only a delivery mechanism: the worker `claim`s the row atomically (`RECEIVED|FAILED → PROCESSING`), processes, and marks `PROCESSED|IGNORED|NEEDS_ATTENTION|FAILED`. A 5-minute sweeper re-drives `RECEIVED` / `FAILED` (exponential backoff, cap 20 attempts) / crashed-`PROCESSING` rows with a unique per-attempt job id, and processes **inline** if the queue itself is down.
- **Tests (WH, LC):** redelivery ⇒ one row; already-processed redelivery ⇒ `duplicate:true`, not re-enqueued; DB down ⇒ 500 (Paddle retries); Redis down ⇒ 200 and the sweeper recovers it (queue and inline paths); 8 concurrent workers on one event ⇒ exactly one runs; transient handler error ⇒ `FAILED` then retried successfully. **Pass.**
- **Remaining risk:** Redis snapshot-only persistence (`--save 60 1`) is unchanged — it no longer holds the only copy of any event.

## F-11 — Post-commit steps not atomic with the transaction — **FIXED AND VERIFIED**
- **Changes:** audit-log insert moved **inside** the DB transaction (`createMany skipDuplicates` — does not abort the transaction like catching `P2002`); email jobs are deterministic (no `Date.now()`); "upgraded" email only when the effective plan genuinely changed between two paid plans.

## F-12 — Cancellation and expiry paths — **FIXED AND VERIFIED**
- **Changes:** Paddle failure vs local-mirror failure are separated (Paddle success + local failure ⇒ success + `alert: billing.local_write_failed_after_paddle`); cancel is idempotent; period-end cancellation and grace expiry are executed by the new sweeper from `resolveEntitlement` instead of three divergent cron rules; Paddle error text is no longer returned to clients.
- **Tests (HTTP, LC, SCH):** idempotent cancel (Paddle called once), local-failure tolerance, grace expiry → Free → restored on payment, scheduler no longer mutates paid plans.

## F-13 — No reconciliation / alerting / failed-event visibility — **FIXED AND VERIFIED** (mechanism) / **IMPLEMENTED — VERIFICATION PENDING** (alert routing)
- **Changes:** hourly `runReconciliation` (live subscriptions whose period should have renewed; recently locally-ended subscriptions) heals DB-vs-Paddle drift and flags **duplicate live Paddle subscriptions**; `/billing/sync` now reconciles **both directions** (activation, cancellation, pause, past_due) from Paddle by subscription ID; structured `alert:` log fields (`billing.needs_attention`, `billing.inbox_backlog`, `billing.duplicate_subscription`, `billing.reconciliation_healed`, …); `/billing/webhook-status` now reports inbox counts and the **caller's own** events needing attention.
- **Tests (LC):** reconciliation heals an expired-locally-but-active-in-Paddle customer; `/webhook-status` tenant isolation (HTTP).
- **Remaining risk:** no alert *destination* exists in the repo (logs only). Route `alert:*` log lines to your log/alerting system (§P).

## F-14 — Fabricated data persisted as Paddle data — **PARTIALLY IMPLEMENTED**
- **Done:** `transaction.billed` / `transaction.paid` ignored; `paidAt` uses Paddle's `billed_at` and is not overwritten on replay; fabricated period dates removed from the transaction handler; `unitAmount` falls back to list price **only on first insert** and never overwrites a stored value; invoice replays cannot lower `amountRefunded`.
- **Not done:** the list-price (USD, annual = 10× monthly) fallback still exists for the first insert when Paddle omits an amount; the one-off `scripts/heal-subscriptions.js` (invents 14-day trial dates and prices) was left untouched. **REQUIRES BUSINESS DECISION** on the annual-price assumption.

## F-15 — Invoice PDF link never obtained — **IMPLEMENTED — VERIFICATION PENDING**
- **Changes:** `getInvoicePdf` calls `paddle.transactions.getInvoicePDF` (exists in SDK 3.8.0) with an 8 s timeout; ownership still enforced by `(id, teamId)`. Cross-tenant fetch ⇒ 404 and no Paddle call (HTTP). The success path against Paddle itself was **not** exercised.

## F-16 — Only some plan limits are enforced — **REQUIRES BUSINESS DECISION**
- Not changed. `historyDays`, `storageGB`, `apiAccess`, `ssoEnabled` remain display-only. Decide whether they are contractual before enforcing or removing them. What **was** fixed: every *enforced* limit (meetings, members, integrations, plan display, usage, custom bot name) now reads the **effective plan** (§N).

## F-17 — Hygiene — **PARTIALLY IMPLEMENTED**
- **Done:** removed the signature header substring from failure logs; provider error text removed from client responses; Paddle SDK calls wrapped with an 8 s timeout; per-workspace rate limit.
- **Not done:** `PADDLE_ENVIRONMENT` default mismatch (`sandbox` in code vs `production` in compose) and a startup key-vs-environment cross-check; one extra `customers.get` per checkout; ad-hoc root scripts.

## Security findings
| ID | Status | Notes |
|---|---|---|
| S-1 signature verification | **Verified, unchanged** | Now covered by executed tests with the **real SDK**: forged secret, tampered body, missing header ⇒ 400 and nothing stored (WH). |
| S-2 replay / retry re-signing | **REQUIRES VERIFICATION** | SDK enforces a 5-second timestamp window (WH test: a 120 s-old signature is rejected). Whether Paddle re-signs retries with a fresh `ts` is **undocumented in the pages read**. If it does not, retries older than 5 s would be rejected — confirm with Paddle's webhook simulator. |
| S-3 quota-reset abuse via `/sync` | **FIXED AND VERIFIED** | See F-04. |
| S-4 authorization / IDOR | **Verified, no defect found** | HTTP: 9 routes ⇒ 401 unauthenticated; 5 ADMIN-only routes ⇒ 403 for MEMBER; forged JWT secret ⇒ 401; stale/forged `teamId` claim ⇒ 403; cross-tenant invoice/PDF/cancel ⇒ no access, no Paddle call. |
| S-5 price tampering | **Verified** | `priceId/amount/teamId` in the body are ignored; `FREE`/`ENTERPRISE`/unknown plans and bad intervals are rejected before any Paddle call (HTTP). |
| S-6 rate limiting | **FIXED AND VERIFIED** | `billingMutationRateLimiter`: 10/min per workspace on checkout, portal, cancel, sync; other workspaces unaffected (HTTP). |
| S-8 job payloads in Redis | **FIXED** | Queue payload no longer contains the Paddle event; it is stored in Postgres. Failed-job retention policy unchanged. |

---

# N. 14-DAY FREE TRIAL EXPIRATION — ROOT CAUSE AND FIX

## N.1 What the trial actually is (discovered, not assumed)
- **The trial is managed by Paddle, not by Repto.** A team is created with `plan: 'FREE'` (`teams.repository.ts:82`); no registration code creates a trial or a subscription row (searched `src/` for `trial`: only the notify worker, billing and admin metrics). The trial starts when an admin checks out a paid plan whose **Paddle price has a trial period configured**. Paddle then emits `subscription.created`/`trialing` with `items[].trial_dates` and a `$0` `transaction.completed`.
- The code stored `trialStart`/`trialEnd` and `status = trialing`, and set `Team.plan` to the paid plan.
- **Discrepancy with the stated flow:** the report was that "a user *registers* and receives a 14-day trial". **No such automatic-at-registration trial exists in the code.** If the product intends one, it is **not implemented** and needs a business decision (internal trial vs. Paddle trial). The UI copy "No credit card required" (`PlanComparisonSheet.tsx:388`) is also **unverified** against the Paddle price configuration (a Paddle trial price can require a payment method). Both are listed in §P.

## N.2 Original behavior
After day 14 the database kept `Subscription.status = 'trialing'` and `Team.plan = <paid plan>` indefinitely; the billing screen showed "Trial ends <past date>" with the paid plan; paid features (meeting quota, member and integration limits, plan display) stayed available.

## N.3 Confirmed root causes (there were four, all contributing)
1. **No time-driven transition existed.** `runBillingCycleResetCron` handled only (a) FREE-tier quota resets, (b) `gracePeriodEnd`, (c) `cancelAtPeriodEnd`. **Nothing selected `status = trialing AND trialEnd <= now`.** The only trial exit was a Paddle webhook.
2. **The webhook path was dead (F-01)** — every webhook returned 500 at the enqueue step — so even Paddle's own trial-end events (`subscription.updated`/`past_due`/`canceled`) never updated the database.
3. **Entitlement ignored time.** `Team.plan` was a stored column read verbatim by the quota middleware, member limit, integration limit, usage and team APIs; nothing compared `trialEnd` with the clock.
4. **Stale caches.** The plan was cached in Redis for 1 hour (`cache:team:plan`) and team detail for 5 minutes, with no regard for an entitlement boundary; the billing screen read the raw subscription row.

A contributing data defect: `isTrialTransaction` classified any `$0` transaction on a paid plan as a trial (a 100 %-discounted renewal would have been treated as a trial).

## N.4 Implemented solution (layered; none of the layers depends on webhook delivery)
| Layer | Mechanism | Files |
|---|---|---|
| **Single source of truth** | `resolveEntitlement(team, subscription, now)` — pure function, server clock. `trialing` is entitled only while `trialEnd > now` (**fails closed** if no end date); `active` honours `cancelAtPeriodEnd`/`currentPeriodEnd`; `past_due` only inside the grace window; everything else ⇒ Free. | `billing/entitlement.ts`, `entitlement.service.ts` |
| **Read-time enforcement** | Meeting-quota middleware, member invites, integrations limit, team detail, `GET /billing/subscription`, `GET /billing/usage` and the custom-bot-name check all use the **effective** plan, so access ends **at the exact boundary even if no cron or webhook has run**. | `plan-limits.middleware.ts`, `teams.service.ts`, `integrations.service.ts`, `meetings.service.ts`, `billing.service.ts` |
| **Cache correctness** | Cached plan/team-detail TTL = `min(configured TTL, seconds until the entitlement boundary)` — the cache entry dies at the boundary. | `plan-limits.middleware.ts`, `teams.service.ts`, `entitlement.ts#ttlSecondsUntil` |
| **Persisted transition** | `runEntitlementSync` every **5 minutes** (lock-protected, idempotent): finds `trialing AND trialEnd <= now`, **asks Paddle first** (`subscriptions.get`) so a customer who converted but whose webhook is late is *healed, not downgraded*, then runs `expireTeamEntitlement`: a **conditional** `UPDATE … WHERE status='trialing' AND trialEnd <= now` + `Team.plan` recompute + audit row `TRIAL_EXPIRED`, all in one transaction under the per-team advisory lock. Paddle unreachable ⇒ expires on the server clock. | `subscription-lifecycle.service.ts`, `billing.repository.ts#expireTeamEntitlement`, `scheduler.ts` |
| **Self-healing** | Hourly `runReconciliation` re-checks recently-ended subscriptions against Paddle; a late webhook (`occurred_at` newer than the last applied event) restores a customer who actually converted. | `subscription-lifecycle.service.ts` |
| **Realtime / session refresh** | Expiry emits `BILLING_PLAN_UPDATED` to the team room and invalidates plan/team caches, so a logged-in user's dashboard refreshes; every API read is server-derived, so a stale JWT/session cannot grant a plan (the JWT does not carry the plan). | `subscription-lifecycle.service.ts` |
| **Billing screen** | `GET /billing/subscription` returns `null` when the effective plan is Free (expired trial, ended cancellation, refund, exhausted grace) — the existing Free-plan UI path — and the real plan otherwise. | `billing.service.ts#getSubscription` |
| **Not downgrading paying users** | The expiry `UPDATE` only matches `status='trialing'`; a converted (`active`) subscription is never a candidate; Paddle is consulted before any local expiry; a late `subscription.updated(active)` restores access. | `billing.repository.ts` |

**Policy choices made (documented, and the only places behavior was decided rather than preserved):**
1. After a trial, a **failed first charge** (`past_due` and the team has **never paid an invoice**) gets **no 7-day grace** — otherwise an expired trial would keep premium for a week, contradicting the requirement. Customers who have paid before keep the existing 7-day grace. *(REQUIRES BUSINESS CONFIRMATION.)*
2. A locally-expired trial is stored as `status = cancelled` (no new enum value) with an `TRIAL_EXPIRED` audit row; Paddle's later events can still move it back (`active`, `past_due`).
3. **One trial per workspace is not enforced** — repeated checkouts can start repeated Paddle trials if the price carries a trial. *(REQUIRES BUSINESS DECISION; cannot be enforced from our side alone — see §P.)*
4. A team with **no subscription row** keeps its stored `Team.plan` (needed for manually-granted ENTERPRISE). A manually-granted team must therefore not carry a stale subscription row.

## N.5 Required edge-case tests — all executed (LC / HTTP / ENT)
| # | Scenario | Test | Result |
|---|---|---|---|
| 1 | Trial expires normally after 14 days | LC "automatic Free transition via the 5-minute sweeper"; ENT "stays revoked afterwards" | pass |
| — | 14-day creation + dates | LC "trial creation: 14 days, Paddle-provided dates" (`trialEnd − trialStart = 14 d`, paid features during trial, TRIAL_STARTED email) | pass |
| — | Exact boundary | ENT (`trialEnd−1ms` entitled / `trialEnd` revoked); LC (`expireTeamEntitlement` no-op at `−1 ms`, expires at `trialEnd`) | pass |
| 2 | Upgrade before expiration | LC "paid upgrade BEFORE expiration is never downgraded by the sweeper" | pass |
| 3 | Upgrade around the boundary | LC "upgrade AROUND the boundary with a LATE webhook" (Paddle says `active`; sweeper heals, no `TRIAL_EXPIRED`) | pass |
| 4 | Paddle webhook arrives late | LC "late Paddle webhook after a local expiry restores a customer who actually converted"; LC reconciliation heal | pass |
| 5 | Expiration job executes more than once | LC "repeated and concurrent expiration runs" (6 parallel + 2 sequential ⇒ **1** transition, **1** audit row) | pass |
| 6 | Database unavailable during expiration | LC "database failure during expiration" (one team errors, others still expire, next run completes; read-time entitlement already denies access in between) | pass |
| 7 | User remains logged in when the trial expires | HTTP "user stays logged in, refreshes after the boundary" (same JWT; subscription ⇒ `null`; usage limit 40 ⇒ 5 with **no cron and no webhook**) | pass |
| 8 | Dashboard refresh after expiration | same test (fresh GETs) + LC "premium entitlement removed … EVEN IF the cron never ran" | pass |
| 9 | Multiple sessions / devices | LC "two sessions / devices see the same server-derived plan" (entitlement is per team, JWT carries no plan) | pass |
| 10 | Paid subscription exists when the job runs | LC "a paid (active) subscription whose old trialEnd is in the past is untouched" | pass |
| — | Expired user can upgrade | HTTP "after expiry the user can upgrade normally"; LC "an expired user can start a NEW paid subscription" (old subscription archived, not deleted) | pass |
| — | Invariant | LC property test: 12 seeded random orderings/duplicates of lifecycle events + sweeps ⇒ `Team.plan == resolveEntitlement(subscription)` after every step | pass |

**What was not tested:** the frontend rendering of the Free state in a browser; behavior against the real Paddle API/sandbox (trial-end conversion timing, `requires_payment_method`); production-scale load.

---

# O. Webhook & idempotency design (as implemented)

```
Paddle ──POST──▶ verify signature (official SDK, raw body, 5 s window)        400 on any failure, nothing stored
                 INSERT paddle_webhook_events (eventId UNIQUE)                 500 if the DB is down  → Paddle redelivers
                 best-effort BullMQ add  jobId=paddle-evt-<eventId>            failure tolerated (row is durable)
                 200   ← means "durably stored", not "processed"
Worker / sweeper ─▶ claimEvent (atomic RECEIVED|FAILED|stale PROCESSING → PROCESSING)   loser skips
                    handler  (advisory lock per team; stale/foreign-subscription guards; derived Team.plan)
                    PROCESSED | IGNORED | NEEDS_ATTENTION (no retry, alert) | FAILED (retry with backoff, cap 20)
Every 5 min: redrive RECEIVED/FAILED/crashed rows · expire trials / cancellations / grace · alert on backlog
Every hour : reconcile suspicious subscriptions with Paddle
```
Idempotency layers: inbox `eventId UNIQUE` → atomic claim → unique keys (`paddleSubscriptionId`, `paddleTransactionId`, `paddleAdjustmentId`, `BillingAuditLog.eventId`) → state-based handlers (derived refund totals, period-advance quota reset, `occurred_at` ordering) → deterministic email job ids.
Event policy: `transaction.completed` activates; `transaction.paid` and `transaction.billed` are ignored (Paddle docs: `completed` follows `paid`; `billed` is an issued, unpaid invoice).

---

# P. Deployment requirements, configuration and manual Paddle steps

**Order of deployment**
1. **Back up the production database.**
2. Deploy the API/worker image (it contains the 2 migrations; the existing runbook step `prisma migrate deploy` applies them — both are idempotent and additive). **Do not** use `db push`.
3. Verify: `select count(*) from paddle_webhook_events;` works; `\d subscriptions` shows `lastEventOccurredAt`.
4. Confirm the **worker** process is running (it hosts the queue worker and all crons; the API container does not).
5. In Paddle → Developer tools → Notifications: confirm the destination URL (`/api/v1/webhooks/paddle`) is subscribed to **at least**: `transaction.completed`, `transaction.payment_failed`, `subscription.created`, `subscription.activated`, `subscription.trialing`, `subscription.updated`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `subscription.canceled`, `adjustment.created`, `adjustment.updated`.
6. **Replay the events Paddle could not deliver while F-01 was live** (Paddle notification log → failed → replay, or `POST /notifications/{id}/replay`). The inbox makes replay safe (idempotent, ordered by `occurred_at`). Then run `/billing/sync` per affected team or wait for the hourly reconciliation.
7. Watch the logs for `alert:` fields for 24 h (§ below).

**Environment variables:** **none added, none removed.** Existing names used: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_CLIENT_TOKEN`, `PADDLE_ENVIRONMENT`, `PADDLE_PRICE_{STARTER,GROWTH,BUSINESS}_{M,Y}`, `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`/redis settings. Test-only (optional): `TEST_BILLING_DATABASE_URL`.

**Alerting to wire up (log fields, no new infrastructure):** `billing.needs_attention`, `billing.unresolvable_event`, `billing.inbox_backlog`, `billing.webhook_retries_exhausted`, `billing.duplicate_subscription`, `billing.subscription_mismatch`, `billing.dispute`, `billing.reconciliation_healed`, `billing.entitlement_sync_failed`, `billing.local_write_failed_after_paddle`, `billing.webhook_persist_failed`.

**Manual Paddle / product decisions (not changeable from code)**
- Confirm each paid **price has the 14-day trial** configured and whether it **requires a payment method**; align the "No credit card required" copy accordingly.
- Decide whether trials are allowed **once per workspace** (Paddle price-level trials repeat on every checkout).
- Confirm **payment-recovery (dunning) settings** in Paddle against the app's 7-day grace window.
- Decide the policies listed under F-03, F-14, F-16, N.4 (1–4).
- Verify with the Paddle webhook simulator whether retried deliveries carry a fresh signature timestamp (S-2).
- Decide whether an automatic trial **at registration** (not via Paddle) is wanted — it does not exist today.

---

# Q. Test execution record (this session)

| Suite | Tests | Result |
|---|---|---|
| `entitlement.test.ts` (unit) | 17 | **pass** |
| `paddle-mapper.test.ts` (unit) | 13 | **pass** |
| `billing-email-flow.test.ts` (unit, updated) | 58 | **pass** |
| `billing-scheduler.test.ts` (unit, updated) | 2 | **pass** |
| `billing-service-flow.test.ts` (integration, updated) | 8 | **pass** |
| `billing-payment-lifecycle.db.test.ts` (real Postgres) | 35 | **pass** |
| `paddle-webhook-endpoint.db.test.ts` (real Postgres + real SDK signature) | 12 | **pass** |
| `billing-http-security.db.test.ts` (real Postgres + real JWT/roles) | 42 | **pass** |
| **Billing set total** | **187** | **all pass** (run in one invocation, `--runInBand`) |

**Wider regression run (pre-existing suites, excluding the billing DB suites).** Executed against a second throwaway database (`rapto_regression_test`, full schema via `db push`) so the remote `.env` database was never touched. **The run did NOT complete**: I stopped it after 27 of 40 suites finished (12 pass, 15 fail) because several suites wait on unreachable external services for ~200 s each. The failures I inspected are **not attributable to the billing changes**: TypeScript errors inside untouched test files (`integrations-e2e`, `linear`, `notion`, `outlook-calendar` — e.g. `RequestInfo` not found, missing exports), `connect ETIMEDOUT` to external services / 30 s test timeouts (`score-trigger-audit`, others), and a foreign-key violation because the test expects a pre-seeded user (`auth-session-refresh`, `refresh_tokens_userId_fkey`). No failure output mentions billing, entitlement, Paddle or subscription code. **A baseline comparison on the pre-change commit was not executed**, so this is an inspection-based conclusion, not a proven one; the remaining ~13 suites were not run. Suites that did pass include `auth-middleware-oauth`, `mrr-calculator`, `cross-channel-isolation`, `slack-notifications`, `email-templates`.

**Deleted tests:** `tests/unit/paddle-webhook-service.test.ts` and `tests/unit/paddle-webhook-controller.test.ts`. They mocked the old repository functions/queue and **asserted the colon job id that caused F-01**; every scenario they covered is re-tested against the real pipeline in LC/WH/MAP.

**How to run the billing suites locally**
```
docker run -d --name rapto-payment-test-pg -e POSTGRES_PASSWORD=paymenttest -e POSTGRES_DB=rapto_payment_test -p 55432:5432 postgres:16-alpine
DATABASE_URL=postgresql://postgres:paymenttest@127.0.0.1:55432/rapto_payment_test DIRECT_URL=$DATABASE_URL npx prisma migrate deploy
npm run test:billing          # tests/support/billing-test-env.ts hard-pins the DB and refuses anything else
```

**Not executed / known gaps:** Paddle sandbox end-to-end; real Redis/BullMQ worker run; React component/E2E tests for checkout and the billing screen; load testing; `deadline.worker` still reads the persisted `Team.plan` (≤ 5-minute lag after an expiry — it only gates reminder notifications).

---
# R. Updated production-readiness assessment (supersedes §L)

**Verdict: materially improved, still NOT production-ready until the deployment steps in §P are done and verified in a Paddle sandbox.**
Code-level correctness is now evidenced by executed tests against a real database; what is missing is evidence from the real environment.

| Dimension | Phase 1 | Now | What still stands between this and "ready" |
|---|---|---|---|
| Payment correctness | Fail | **Good (tested)** | Sandbox end-to-end run (checkout → trial → conversion → renewal → refund) |
| Data integrity | At risk | **Good** | Apply + verify the migrations on a production **copy**; non-billing schema drift still exists |
| Security | Core OK, abuse path | **Good** | S-2 (retry re-signing) unconfirmed; alert routing; secrets rotation hygiene unchanged |
| Idempotency | Weak | **Good (tested)** | Production replay of events missed during F-01 |
| Webhook reliability | Fail | **Good (tested)** | Confirm the worker + cron process is running in production |
| Subscription lifecycle | Incomplete | **Good for the Paddle-managed trial** | Business decisions in §P; no registration-time trial exists |
| Performance | Adequate | Adequate | Not load-tested; one extra Paddle list call per **new** checkout (fail-closed by design) |
| Observability | Weak | **Improved** | `alert:` log fields exist but no alert destination is configured |
| Disaster recovery | Weak | **Improved** | Events are in Postgres, schema reproducible from migrations (billing scope); no restore drill performed |

**Critical remaining items**
1. Replay missed webhooks (§P.6) — until then production data may still be wrong.
2. Decide the trial policies (once-per-workspace, payment-method requirement, registration trial).
3. Paddle sandbox verification of: trial-end conversion timing, `custom_data` on update, retry signature timestamps.
4. Wire `alert:` log lines to an alerting channel.

*End of Phase 2 record.*


---

# S. Incident: checkout 403 → 502 → "CORS error" (2026-11-03)

**Production symptom:** every plan selection failed. API log: `ApiError … CustomersResource.get() … forbidden / 403`, response `502 PADDLE_CHECKOUT_FAILED "Unable to initialize billing customer"`, browser: "blocked by CORS policy … No Access-Control-Allow-Origin header".

## S.1 Root cause of the 403
- The failing call is `paddle.customers.get(team.paddleCustomerId)` — the **pre-checkout "verify the stored customer still exists" call** in `getOrCreatePaddleCustomer` (`paddle.client.ts`, old line ~56). It runs only when the team **already has** a stored `paddleCustomerId`, which matches the log.
- Paddle's documentation (read this session, `/errors/shared/forbidden`): `403 forbidden` = "the authentication method you used doesn't have permission to perform that request" — a **valid key that lacks the permission** (here `customer.read`), including keys created before Paddle added new permissions (new permissions are **not** auto-applied to existing keys). `GET /customers/{id}` requires `customer.read`.
- **What I could and could not verify.** I have no access to the production key or Paddle account, so I could not read the key's permission set. The evidence points to a missing permission on the live key, not a sandbox/live mix-up: a customer id from the *other* environment is documented to return **404 `not_found`**, not 403. A wrong-environment *key* is also possible, but the docs read do not state what status that returns. **Confirm in Paddle → Developer tools → Authentication: the key's permissions, and that it is a `pdl_live_…` key** (never print the key itself).
- The code's own comment ("zero API call") was wrong: the function made an extra Paddle call on every checkout, creating a hard dependency on a permission nothing else needed.

## S.2 Why 502
`createCheckoutSession` wrapped *every* customer-initialization failure into `AppError('PADDLE_CHECKOUT_FAILED', 502, …)`. The SDK's `ApiError` has **no HTTP status field** (`type, code, detail, documentationUrl, errors, retryAfter` only), so existing checks such as `err.status === 404` could never be true and nothing could distinguish 401/403/404/422/429/5xx. A permission problem on **our** key was reported to the user as a gateway error.

## S.3 CORS — secondary, a symptom
- The app's CORS configuration is correct: `cors()` is the first middleware (before body parsing, logging, routes and the error handler); `https://app.rapto.cloud` is in the static allow-list; the nginx config adds **no** CORS headers and does not intercept upstream errors (`proxy_intercept_errors` unset).
- Executed test: preflight `OPTIONS /billing/checkout` → 204 with `Access-Control-Allow-Origin: https://app.rapto.cloud` (never `*`), credentials, Authorization header allowed; the header is **also present on 503, 429, 409/422 and 401 responses**; an unlisted origin gets none.
- So an error response **produced by the API** carries CORS headers. The browser saw none, which means the response it received was **not the API's**: the most likely explanation is an edge/CDN layer in front of `api.rapto.cloud` replacing an origin **502** with its own error page (CDNs commonly do this for 502/504 — e.g. Cloudflare), which has no CORS headers; the browser then reports a CORS failure. **I could not verify this from the repository** — the repo shows only the nginx config. Verify with `curl -i -H "Origin: https://app.rapto.cloud" …` against a failing path and look at the `server:`/`cf-ray` headers.
- **Mitigation implemented:** the API no longer returns 502/504 for provider problems (see S.4), so the edge no longer substitutes its own page. Also note nginx's `limit_req` rejects with a bare 503 that carries no CORS headers (a separate potential source of the same misleading browser message).

## S.4 Changes (files)
| File | Change |
|---|---|
| `src/services/paddle.errors.ts` (new) | Classifies SDK `ApiError` by `code`/`type` into permission / not_found / conflict / validation / rate_limited / upstream / timeout / network; preserves upstream code/type/detail/retryAfter for logs; **redacts** credential-shaped text and caps length; maps to safe client errors; never 502/504. |
| `src/services/paddle.client.ts` | `getOrCreatePaddleCustomer` **no longer calls `customers.get`**; the stored id is trusted. Customer creation persists with a **compare-and-set** (`updateMany … WHERE paddleCustomerId IS NULL`) so a racing request cannot overwrite; `customer_already_exists` reuses the existing customer (searches `active,archived`, reactivates an archived one — per Paddle docs email is unique and archived customers still count); new `replaceStaleCustomer`. |
| `src/modules/billing/billing.service.ts` | Customer init, transaction create, plan change, portal and cancel use the classifier. A stale stored customer (Paddle `not_found` **naming that customer**) is replaced and the transaction retried once; a `not_found` for anything else (e.g. `PADDLE_PRICE_*` from the wrong environment) is a **503 configuration alert**, not a missing-customer fix. Request context (`requestId`, `userId`, `teamId`, `operation`) added to logs. |
| `src/modules/billing/subscription-lifecycle.service.ts` | Pre-checkout duplicate-subscription guard: if the key lacks `subscription.read` (403) the guard is **degraded with an alert** instead of blocking all checkouts; network/5xx still **fail closed**. |
| `src/middleware/request-logger.middleware.ts` | **`teamId: null` was a logging bug**, not an auth inconsistency: `injectTenant` sets `req.teamId`, the logger read `req.team?.id` (never set). It now logs `req.teamId`. |
| `src/app.ts` | The later `X-Request-ID` middleware overwrote the id the logger had recorded, so the id returned to the client never matched the logs; it no longer overwrites. |
| `src/middleware/error.middleware.ts` | Sets `Retry-After` for 429 AppErrors. |
| `src/modules/billing/billing.controller.ts` | Passes the request id into the service. |
| Tests | `tests/unit/paddle-errors.test.ts` (30), `tests/integration/paddle-customer-checkout.db.test.ts` (35); two earlier HTTP assertions changed from 502 to 503. |

No database schema change. No new environment variables. Pricing, plan ids, subscription logic and billing ownership are unchanged.

## S.5 Status mapping now returned to the browser
| Paddle failure | HTTP | App code |
|---|---|---|
| 403 `forbidden`, `authentication_*`, `invalid_token` (our credentials/permissions) | **503** | `BILLING_UNAVAILABLE` + `alert: billing.paddle_credentials_or_permissions` |
| 429 `too_many_requests` | **429** + `Retry-After` | `BILLING_RATE_LIMITED` |
| 422/400 validation | **422** | `BILLING_REQUEST_INVALID` |
| 409 conflict | **409** | `BILLING_CONFLICT` |
| 404 for the stored customer | recovered transparently (new customer) | — |
| 404 for any other id (price) | **503** + `alert: billing.price_or_entity_not_found_in_paddle` | `BILLING_UNAVAILABLE` |
| Paddle 5xx / timeout / network | **503** | `BILLING_UPSTREAM_UNAVAILABLE` |

503 is used instead of 502/504 deliberately (S.3). Permission errors are **never retried** (one Paddle call, asserted by test).

## S.6 Tests executed (real Postgres + real routes/auth/CORS/error middleware; only the Paddle SDK object faked, throwing genuine `ApiError`s)
All of the following **passed**: existing customer reused with `customers.get` forbidden-and-never-called; new customer created and persisted once; returning customer; all 6 plan×interval combinations map to the configured price ids; stale/sandbox customer replaced and retried; price-not-found not mistaken for a stale customer; `customer_already_exists` (id from detail; archived reactivated via list); 3 concurrent first checkouts → one `200`, two `409`, one customer; compare-and-set against a racing writer; insufficient permissions (`forbidden`) → 503, no customer/subscription/invoice state, structured alert with requestId/userId/teamId/operation/upstream code and **no credential text in any log**; invalid credentials (`authentication_malformed`, `invalid_token`, `authentication_missing`) → 503; 429 → 429 + `Retry-After` + CORS; 422; 5xx and network → 503; duplicate-guard degraded on 403 and fail-closed on 5xx; OPTIONS preflight; CORS headers on success, 503, 4xx and 401; unlisted origin gets no header; request log carries `teamId`/`userId`/`requestId`; `X-Request-ID` consistent.

Full billing set run in one invocation: 252 tests, 249 passed. The 3 failures were two obsolete 502 assertions (updated to 503) and one cold-start timing flake in the webhook test (module warm-up added). After those edits I re-ran only the two affected suites (54/54 passed); I did **not** re-run all 10 suites together afterwards.

**Not tested / cannot be tested here:** the real production key's permissions; real Paddle responses for a sandbox key against the live URL (undocumented); the edge/CDN behavior; any live checkout (no live transaction or charge was created).

## S.7 Required Paddle API-key permissions (from Paddle's permissions docs)
| Operation | Permission |
|---|---|
| Create customer / find by email (list) | `customer.write` / `customer.read` |
| Create transaction (checkout) | `transaction.write` |
| Pre-checkout duplicate guard, sync, reconciliation (`subscriptions.list/get`) | `subscription.read` |
| Plan change, cancel (`subscriptions.update/cancel`) | `subscription.write` |
| Customer portal | `customer_portal_session.write` |
| Invoice PDF | `transaction.read` |

Keys can be edited in the Paddle dashboard after creation; a key's permissions are not auto-extended when Paddle adds new ones. `customer.read` is **no longer required for checkout** (it is only used when a customer must be found by email).

## S.8 Deployment and verification
1. Deploy the image (no migration, no env change). **Also fix the key**: in Paddle → Developer tools → Authentication, confirm the **live** key (`pdl_live_…`) has the permissions above; rotate it if needed, update `PADDLE_API_KEY` on the server, then `docker compose up -d`.
2. Confirm `PADDLE_ENVIRONMENT=production`, `PADDLE_CLIENT_TOKEN` is a `live_…` token, and `PADDLE_PRICE_*` are **live** price ids (do not print the values into shared logs).
3. Try a Growth checkout in the app and stop at the Paddle overlay — do **not** complete a live payment unless intended.
4. Check logs: no `alert: billing.paddle_credentials_or_permissions`; request log lines now show `teamId`/`userId`.
5. From outside: `curl -i -X OPTIONS https://api.rapto.cloud/api/v1/billing/checkout -H "Origin: https://app.rapto.cloud" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"` → expect `204` and `access-control-allow-origin: https://app.rapto.cloud`. If a failing call still lacks CORS headers, inspect `server:` / `cf-ray` to see whether a CDN substitutes error pages.
6. Teams whose stored `paddleCustomerId` came from sandbox are healed automatically on their next checkout (stale-customer replacement).


---

# T. Incident: paid Growth trial, application still shows Free (2026-11-03)

**Evidence supplied:** checkout `200` (`txn_…` created); `billing.duplicate_subscription` alert with **one** id (`sub_01m6h1v8…`); `POST /billing/sync` → `200` after ~3 s; team still Free; "caches invalidated" logged more than once.

## T.1 What was proven, and what was not
**Proven by executing a reproduction against the code as it was (9 of 18 new tests failed, with exactly the production symptoms):**
- When the team **already has a stored subscription row that Paddle reports as cancelled/ended** (typically an earlier trial) and the customer then buys a **new** subscription, `reconcileTeamFromPaddle` treated the *dead stored subscription* as authoritative, applied its (cancelled) state, and then reported the customer's **new, live** subscription as an **"additional live subscription"** — the `billing.duplicate_subscription` alert — instead of adopting it. The team stayed Free. Repeating the sync produced the same result forever (the stored row never changed).
- When the stored row was still *locally* "live" but stale, the **webhook** for the new subscription hit the `subscription_mismatch` guard and was parked as `NEEDS_ATTENTION` instead of being applied — so webhook delivery could not repair it either.
- `/billing/sync` answered **HTTP 200** even when Paddle could not be reached or when the Paddle subscription could not be mapped, so the UI and logs reported "success" while nothing was persisted.

**Not observable from here:** the actual production rows and webhook inbox for team `cmtgr1gi3000cl308adp45rdh`. The diagnosis above is the only code path that produces *this exact combination* (alert with a single id that is the new subscription + `200` sync + Free), but it must be confirmed with the read-only queries in T.7 before anyone concludes the production data matches. A second possibility the logs cannot exclude — two genuinely live subscriptions — is handled correctly now (see T.3) and the queries below distinguish the two.

## T.2 Answers to the questions asked
1. **Exact root cause:** the reconcile/adoption logic (introduced in Phase 2) could not replace a dead stored subscription with the customer's new live one, and the webhook guard (`subscription_mismatch`) had no way to ask Paddle which of the two is real. The stored-subscription-always-wins rule was wrong.
2. **Why checkout succeeded but the DB stayed on Free:** checkout only creates a Paddle transaction; entitlement comes from the Subscription row. That row could not be switched to the new subscription (above), and `/billing/sync` hid the failure behind a `200`.
3. **Webhook failure or sync-logic failure?** Both paths shared the same defect (a dead/stale stored subscription blocks adoption). Whether Paddle's webhook for this purchase was received at all is **unknown** — check T.7 query 3 and Paddle's notification log.
4. **The duplicate alert:** `ids` is the list of live Paddle subscriptions **other than the one chosen as authoritative**. Because the dead stored one was chosen, the *new* subscription was listed as the "duplicate". **It was not a second subscription.** `trialing` counts as live (correct: Paddle bills it). Cancelled/expired subscriptions are not listed (the list call filters to `active, trialing, past_due, paused`).
5. **Records involved (redacted):** one `subscriptions` row for the team (`teamId` is UNIQUE) holding the **old** `paddleSubscriptionId`; the new Paddle subscription had no row. Related tables: `teams.paddleCustomerId`, `invoices`, `billing_audit_logs`, `paddle_webhook_events`.
6. **Repeated cache invalidation:** harmless. Each state-change path (`reconcile`, webhook handler, `/sync`, checkout callback) calls `invalidatePlanCache`; `DEL` on a missing key is idempotent. One call was a genuine duplicate (`syncSubscription` invalidated again after reconcile already had) — removed. The plan is derived from the database at read time, so a stale cache cannot override a newer row; the cache TTL is also capped at the entitlement boundary.

## T.3 Fix (smallest correction to the existing architecture; no schema change, no new tables)
| Change | Where |
|---|---|
| `chooseAuthoritativeSubscription()` — the tracked subscription wins **only while Paddle says it is live**; otherwise the customer's live subscription replaces it; among several live ones: `active > trialing > past_due > paused`, then newest. **Only the extra live ones are reported as duplicates**, and nothing is ever cancelled. | `subscription-lifecycle.service.ts` |
| If our row says live but Paddle says the tracked subscription is dead, it is **retired** (conditional, locked, audited as `SUBSCRIPTION_RETIRED_DEAD_IN_PADDLE`) before the new one is applied. History is preserved (`SUBSCRIPTION_REPLACED` audit row); no record is deleted. | `billing.repository.ts#retireDeadSubscription` |
| Webhook mismatch no longer guesses: it **reconciles with Paddle**. Adopted ⇒ `PROCESSED`; event for a superseded subscription ⇒ `PROCESSED`; a genuine second live subscription ⇒ `NEEDS_ATTENTION` + alert; Paddle unreachable ⇒ the event is **retried**, not dropped. | `paddle.webhook.service.ts#resolveOutcome` |
| `/billing/sync` is **truthful**: `200` + `outcome` (`synced` / `no_change` / `no_subscription`) with `plan`, `status`, `subscriptionId`, `trialEnd`; **`503`** `BILLING_SYNC_UNAVAILABLE` if Paddle cannot be read; **`409`** `BILLING_SYNC_UNRESOLVED` if the subscription cannot be mapped/applied (alert logged). A structured `reconcile decision` log records stored vs Paddle ids and statuses. | `billing.service.ts`, `subscription-lifecycle.service.ts` |
| Cache invalidation happens once, strictly **after** the commit. | `subscription-lifecycle.service.ts` |
| Frontend never infers a plan from checkout success: the success banner shows only when the **server** reports a paid plan; otherwise "confirming your subscription…"; post-checkout sync retries the **server** reconciliation (6 × 3 s); the plan card shows **"Free trial ends <date>"** from the server's `status=trialing`/`trialEnd`. | `web/.../billing.api.ts`, `useCheckout.ts`, `BillingView.tsx` |

Trialing is a paid entitlement: `resolveEntitlement` grants the subscription's plan while `status = trialing` and `trialEnd > now` (Growth limits: 120 meetings / 25 members), enforced by the quota middleware, invites, integrations, usage and team APIs — asserted by tests below.

## T.4 Tests executed (real Postgres; Paddle SDK object faked; no live calls)
New suite `tests/integration/billing-subscription-adoption.db.test.ts` — **18 tests, all pass after the fix (9 failed before it, reproducing the incident):** dead stored subscription adopted without a duplicate alert; repeated syncs idempotent; locally-live-but-stale row + webhook for the new subscription adopted; genuine second live subscription flagged (`ids` = extras only, tracked kept, no cancel call); no stored row + one live Paddle subscription adopted; sync outcomes over HTTP (200 synced with Growth limits visible through `/subscription` and `/usage`, 503 Paddle down, 200 `no_subscription`, 409 unmappable price); 6 concurrent reconciliations → one row, one replacement audit; trialing Growth enforced by `checkMeetingLimit` (and the same usage blocked on Free); Free→Growth webhooks (transaction, trialing, created, duplicate delivery, any order) → one row; trial → active; cancellation → Free; replacement of an ended subscription keeps history; failed persistence → event `FAILED` and retryable, no partial state; cache invalidated only after the row is visible, repeats harmless.
Two older tests were updated because the mismatch path now consults Paddle. **Full billing set in one invocation: 11 suites, 270 tests, all pass.** Web type-check: no errors in `features/billing`.
**Not tested:** real Paddle responses/sandbox, the production database, browser rendering of the new banner/label.

## T.5 Remaining risks
- Teams already stuck (same cause) are healed by **any** successful reconcile: the admin "Sync" button, the post-checkout sync, or a webhook retry. They are **not** found automatically by the hourly job (it targets stale-live and recently-ended rows). Run the read-only query T.7-2 to list candidates, then have each team admin press Sync, or run the sync for them.
- Whether Paddle delivers the webhooks to the configured URL is still an operations question (§P.5).
- The trial/payment-method policy questions in §P are unchanged.

## T.6 Deployment and verification
1. Deploy the image — **no migration, no new environment variable**.
2. For the affected team: have its admin open Billing and press **Sync** (or call `POST /api/v1/billing/sync`). Expected response: `200 {"outcome":"synced","plan":"GROWTH","status":"trialing","subscriptionId":"sub_01m6h1v8…","trialEnd":…}`. A `503` means Paddle was unreachable (retry); a `409` means an operator must look (alert `billing.reconcile_failed`).
3. Logs: a `[lifecycle] reconcile decision` line showing `stored` (old, dead) → `chosen` (the new subscription); **no** `billing.duplicate_subscription`.
4. Verify in Paddle that the customer has exactly one live subscription; **do not cancel anything** unless the business decides to.

## T.7 Read-only diagnostics (run as-is; they only SELECT)
```sql
-- 1. What does our DB hold for the team? (expect the OLD subscription id and a dead status)
select "paddleSubscriptionId", status, plan, "billingInterval", "trialEnd", "currentPeriodEnd",
       "cancelledAt", "lastEventOccurredAt", "updatedAt"
from subscriptions where "teamId" = 'cmtgr1gi3000cl308adp45rdh';

-- 2. Teams that look like this one (customer exists, subscription missing or dead, plan Free)
select t.id, t."paddleCustomerId", s."paddleSubscriptionId", s.status, s."updatedAt"
from teams t left join subscriptions s on s."teamId" = t.id
where t."paddleCustomerId" is not null and t.plan = 'FREE'
  and (s.id is null or s.status in ('cancelled','refunded','paused','unpaid','incomplete','incomplete_expired'));

-- 3. Did the webhooks for the new subscription arrive, and what happened to them?
select "eventType", status, attempts, "lastError", "occurredAt", "receivedAt"
from paddle_webhook_events
where payload::text like '%sub_01m6h1v8bq3cxndr5h000zp6x4%' or "teamId" = 'cmtgr1gi3000cl308adp45rdh'
order by "receivedAt" desc limit 30;
-- 0 rows = Paddle never delivered (check the notification destination/events/secret).
-- NEEDS_ATTENTION with "different Paddle subscription" = this bug, via the webhook path.
```
