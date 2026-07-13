# Vocaply — Day 59: Jira Webhook (Inbound Reverse Sync)
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-59-PLAN-001 | Version 1.0 | Phase 5 — Integrations | Planning Only — No Code

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Architecture Philosophy](#2-architecture-philosophy)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Dependency Flow & Layering](#4-dependency-flow--layering)
5. [Data Model — What Already Exists vs. What's Added](#5-data-model--what-already-exists-vs-whats-added)
6. [Layer 1 — Webhook Self-Registration (At Connect Time)](#6-layer-1--webhook-self-registration-at-connect-time)
7. [Layer 2 — Webhook Deregistration (At Disconnect Time)](#7-layer-2--webhook-deregistration-at-disconnect-time)
8. [Layer 3 — jira.webhook.ts (Ingestion Handler)](#8-layer-3--jirawebhookts-ingestion-handler)
9. [Layer 4 — jira-sync.service.ts (Reverse-Sync Business Logic)](#9-layer-4--jira-syncservicets-reverse-sync-business-logic)
10. [Layer 5 — Signature Verification](#10-layer-5--signature-verification)
11. [Layer 6 — Idempotency Design](#11-layer-6--idempotency-design)
12. [Layer 7 — Route Registration & the "Reusability Proof"](#12-layer-7--route-registration--the-reusability-proof)
13. [The teamId Query Parameter — Advisory, Not Authoritative](#13-the-teamid-query-parameter--advisory-not-authoritative)
14. [Commitment Cascade — Linking Action Items to Commitments](#14-commitment-cascade--linking-action-items-to-commitments)
15. [Status Name Mapping & Configurability](#15-status-name-mapping--configurability)
16. [Frontend Deliverables](#16-frontend-deliverables)
17. [State & Lifecycle Design](#17-state--lifecycle-design)
18. [Security Architecture](#18-security-architecture)
19. [Performance & Scalability Architecture](#19-performance--scalability-architecture)
20. [Reliability & Failure Handling](#20-reliability--failure-handling)
21. [Observability & Monitoring](#21-observability--monitoring)
22. [Redis Key Space Additions](#22-redis-key-space-additions)
23. [API / Webhook Endpoint Specification](#23-api--webhook-endpoint-specification)
24. [Error Taxonomy](#24-error-taxonomy)
25. [Hour-by-Hour Execution Plan](#25-hour-by-hour-execution-plan)
26. [Testing & Verification Plan](#26-testing--verification-plan)
27. [End-of-Day Checklist](#27-end-of-day-checklist)
28. [Risks & Edge Cases Register](#28-risks--edge-cases-register)

---

## 1. Day Overview & Goals

### What Gets Built Today

Day 58 made Vocaply write **outward** into Jira — action items become real
tickets on a real board. But a one-way sync is only half a promise: the
whole value proposition of "accountability that lives where your team
already works" collapses if a person can mark a ticket "Done" in Jira and
Vocaply never finds out. Day 59 closes that loop. It is the **first inbound
webhook from any provider other than Recall.ai and Stripe**, and it exists
to prove something specific and consequential about the codebase's own
architecture: that the generic webhook ingestion pattern built on Day 18
(raw-body preservation, signature verification, idempotency, structured
logging) was actually generic, not secretly Recall.ai-shaped.

```
TODAY BUILDS:
  ✅ Jira webhook self-registration — called at the end of Day 58's OAuth
     connect flow, registering a per-team, per-project webhook with Jira
     Cloud's own webhook API
  ✅ Jira webhook self-deregistration — called from Day 58's disconnect
     flow, completing the "disconnect always fully undoes" principle for
     a THIRD external side effect this sprint (Google token revocation,
     Day 56; now Jira webhook removal, alongside Day 58's OAuth revocation)
  ✅ jira.webhook.ts — the ingestion handler, proving reuse of Day 18's
     rawBodyMiddleware and idempotency pattern with ZERO duplication
  ✅ HMAC signature verification for Jira's shared-secret webhook scheme
  ✅ jira-sync.service.ts — the reverse-sync business logic, deliberately
     separated from the webhook handler per the Day 18 layering rule
  ✅ Action item ↔ commitment cascade: a Jira ticket marked Done can
     automatically fulfill the linked commitment, closing the full
     "meeting → extraction → Jira ticket → completed in Jira →
     commitment fulfilled, all without touching Vocaply's UI" loop
  ✅ Status-name mapping (Done/Closed/Resolved → "complete") as a
     documented, extensible design, not a hardcoded assumption
  ✅ New webhook route registered alongside Recall.ai and Stripe, sharing
     100% of their middleware configuration

DOWNSTREAM IMPACT:
  Day 61/62 — if Linear or Notion ever grow a reverse-sync requirement,
           today's jira-sync.service.ts is the template: webhook handler
           stays a thin translator, business logic lives in its own
           service file, tenant verification happens independently of
           whatever the payload claims
  Day 65 — "Integration testing — all providers end-to-end" explicitly
           exercises today's full loop (Vocaply → Jira → Vocaply) as one
           of its named scenarios
  Any future third-party inbound webhook (a hypothetical GitHub, Asana,
           or ClickUp integration) inherits today's proof that Day 18's
           infrastructure needs zero modification to onboard a new
           provider — this is the architectural payoff of today's work,
           not just the Jira feature itself

DO NOT SKIP OR RUSH:
  A webhook handler that trusts payload-supplied identifiers for
  authorization is a textbook confused-deputy vulnerability — Jira webhook
  payloads carry no Vocaply-specific proof of tenancy at all, which makes
  today's "teamId is advisory, TeamIntegration lookup is authoritative"
  rule (§13) the single most security-critical design decision in this
  day's work, not a minor detail. Getting the idempotency key composition
  wrong (§11) means either silently dropping legitimate status changes or
  double-processing a redelivered event into a duplicate commitment
  fulfillment — both are real correctness bugs, not cosmetic ones.
```

### 8-Hour Time Allocation

```
9:00 AM  – 9:45 AM   → Webhook self-registration logic: Jira Cloud webhook
                        API call, secret generation, metadata persistence
9:45 AM  – 10:15 AM  → Webhook self-deregistration logic (disconnect flow)
10:15 AM – 11:00 AM  → jira.webhook.ts: signature verification + fast ACK +
                        idempotency check + event routing
11:00 AM – 12:00 PM  → jira-sync.service.ts: handleStatusChange() — the
                        defensive-lookup, tenant-verification, status-
                        mapping, action-item-update sequence
12:00 PM – 1:00 PM   → Lunch break
1:00 PM  – 1:45 PM   → Commitment cascade logic: linkedCommitmentId
                        resolution + commitmentsService.updateStatus() call
1:45 PM  – 2:15 PM   → webhooks.validator.ts: Jira HMAC verification utility
                        (reused pattern, new call site)
2:15 PM  – 2:45 PM   → webhooks.routes.ts: register /webhooks/jira alongside
                        Recall.ai and Stripe, confirm middleware reuse
2:45 PM  – 3:30 PM   → Real-time Socket.io event wiring + frontend listener
                        for action_item:completed with source: 'jira'
3:30 PM  – 4:15 PM   → Observability: structured logs, metrics, correlation
                        with existing webhook dashboards
4:15 PM  – 5:00 PM   → Manual E2E test against a real Jira Cloud sandbox:
                        mark a ticket Done, verify the full cascade
5:00 PM  – 5:30 PM   → Security review pass: replay, spoofing, cross-tenant
                        attempts, signature tampering
5:30 PM  – 6:00 PM   → Checklist review + sign-off
```

---

## 2. Architecture Philosophy

### Four Guiding Principles for Today's Build

```
PRINCIPLE 1 — The Webhook Handler Translates, It Never Decides
  jira.webhook.ts's entire job is: verify this is really Jira, acknowledge
  fast, deduplicate, and hand off a narrow, typed payload to a service
  function. Every decision about WHAT a status change means for Vocaply's
  data model — is this "complete," does it cascade to a commitment, does
  it matter at all — lives in jira-sync.service.ts. This is not a stylistic
  preference; it's what makes the reverse-sync logic unit-testable without
  spinning up an Express server, and what makes the pattern reusable for a
  fourth, fifth, sixth inbound webhook provider without touching the
  ingestion layer again.

PRINCIPLE 2 — Nothing in the Payload Is Trusted for Authorization
  A webhook payload proves "someone who knows our shared secret sent this
  request." It does NOT prove "this event genuinely belongs to the team
  whose ID appears in a query parameter." Every single field used for
  tenant resolution — teamId, issue key, project — is independently
  cross-checked against Vocaply's own persisted records before any write
  happens. This principle is restated at least three times across this
  document deliberately, because it is the one invariant a future
  "quick fix" is most likely to accidentally violate under time pressure.

PRINCIPLE 3 — Every Third-Party Side Effect Vocaply Creates, Vocaply Undoes
  Day 56 taught this for OAuth token revocation. Day 58 applied it to the
  Jira OAuth grant itself. Today extends it to a THIRD category of
  external side effect: a registered webhook subscription living on
  Jira's servers. "Disconnect" continues to mean, unambiguously, "leave no
  trace on the third party's side" across every distinct kind of footprint
  Vocaply has left there.

PRINCIPLE 4 — Reuse Is the Deliverable, Not Just the Feature
  The Jira reverse-sync feature itself is valuable, but today's deeper
  purpose is validating that Day 18's webhook infrastructure investment
  pays off exactly as designed. A code review today asks two questions in
  parallel: "does the Jira reverse-sync work correctly?" AND "did building
  it require changing anything about how Recall.ai or Stripe webhooks are
  processed?" The second question having a definitive "no" answer is
  itself a today's-deliverable, tracked explicitly in the checklist (§27).
```

---

## 3. File Structure to Create

```
services/api/src/
│
├── modules/webhooks/
│   ├── jira.webhook.ts                     ← NEW: ingestion handler
│   ├── webhooks.validator.ts               ← MODIFY: add Jira HMAC verify fn
│   └── webhooks.routes.ts                  ← MODIFY: register POST /jira
│
├── modules/action-items/
│   ├── jira-sync.service.ts                ← NEW: reverse-sync business logic
│   └── action-items.repository.ts          ← MODIFY: add findByJiraIssueId()
│
├── modules/integrations/
│   ├── providers/
│   │   └── jira.provider.ts                ← MODIFY (Day 58 origin): add
│   │                                          registerWebhook() and
│   │                                          deregisterWebhook() methods
│   └── integrations.service.ts             ← MODIFY: wire webhook
│                                              registration into
│                                              completeProviderConnect()
│                                              (Jira branch) and
│                                              disconnectProvider()
│                                              (Jira branch)
│
├── modules/commitments/
│   └── commitments.service.ts              ← MODIFY: confirm updateStatus()
│                                              accepts a `source` metadata
│                                              field distinguishing
│                                              JIRA_REVERSE_SYNC from a
│                                              human-initiated status change
│                                              (audit-trail clarity, no
│                                              schema change needed — see §5)
│
└── config/
    └── metrics.config.ts                   ← MODIFY: register webhook-
                                                specific counters for Jira

apps/web/src/features/action-items/
├── components/
│   └── ActionItemCard.tsx                  ← MODIFY: render a distinct
│                                              "Synced from Jira" badge when
│                                              an item's most recent status
│                                              change source is external
└── hooks/
    └── useActionItems.ts                   ← MODIFY: cache invalidation on
                                                'action_item:completed'
                                                Socket.io event (already
                                                wired generically since Day
                                                39; confirmed, not rebuilt,
                                                today)
```

### What Is Explicitly NOT Built Today

No new database tables. No new columns beyond confirming `metadata.jiraWebhookId`
and `metadata.jiraWebhookSecret` fit inside the already-existing
`team_integrations.metadata` JSONB column (§5). No assignee reverse-sync
(explicitly out of scope, §18). No support for Jira Server/Data Center's
different webhook model (Jira Cloud only, consistent with Day 58's scope).
No per-team-configurable "completed" status names UI (§15 documents the
design for this as a near-term follow-up, not built today).

---

## 4. Dependency Flow & Layering

```
INGESTION PATH (Jira → Vocaply, triggered by a real status change):

Jira Cloud (external)
  │  POST /webhooks/jira?teamId={teamId}
  ▼
webhooks.routes.ts
  │  rawBodyMiddleware (SHARED, unmodified from Day 18)
  ▼
jira.webhook.ts
  │  1. verifyJiraSignature(req)        → webhooks.validator.ts
  │  2. res.status(200).json(...)       → fast ACK, per Day 18 contract
  │  3. idempotency check/set           → redis (SAME pattern as Recall.ai/Stripe)
  │  4. filter to jira:issue_updated + status field changes only
  ▼
jira-sync.service.ts
  │  handleStatusChange()
  ├──► integrations.repository.ts (findActive — tenant verification)
  ├──► action-items.repository.ts (findByJiraIssueId, update)
  ├──► Socket.io (io.to(`team:${teamId}`).emit(...))
  └──► commitments.service.ts (updateStatus, ONLY if linkedCommitmentId
                                 present AND newly complete)

REGISTRATION PATH (Vocaply → Jira, triggered at OAuth connect/disconnect time):

integrations.service.ts.completeProviderConnect('JIRA', ...)   [Day 58]
  │  (after cloudId resolution, before returning)
  ▼
jira.provider.ts.registerWebhook(accessToken, cloudId, projectKey, callbackUrl)
  │  generates a per-team secret, POSTs to Jira's webhook API
  ▼
persisted into team_integrations.metadata.jiraWebhookId / .jiraWebhookSecret

integrations.service.ts.disconnectProvider('JIRA', ...)   [Day 58]
  │  (before the row is deleted)
  ▼
jira.provider.ts.deregisterWebhook(accessToken, cloudId, webhookId)
```

**Design rule enforced today:** `jira.webhook.ts` imports `jira-sync.service.ts`
and nothing else business-logic-shaped — no direct Prisma access, no direct
Redis access beyond the idempotency check itself (which is a thin, generic
pattern, not business logic). This mirrors `recall.webhook.ts`'s existing
shape (Day 17/18) exactly, which is the concrete, file-level evidence that
Principle 4 (§2) is actually true and not just asserted.

---

## 5. Data Model — What Already Exists vs. What's Added

### Already Exists (Day 3 / Day 58 schema) — Confirmed, No Migration Needed Today

```sql
-- team_integrations.metadata (JSONB, already exists) gains two NEW KEYS
-- within the existing JIRA metadata shape (Day 58 established
-- cloudId/projectKey/defaultIssueType/defaultPriority; today adds):
--   jiraWebhookId      — Jira's own webhook registration ID (for deregistration)
--   jiraWebhookSecret  — per-team-generated HMAC signing secret

-- action_items (already exists, Day 3):
jira_issue_id           VARCHAR(50)    -- the lookup key today's handler uses
completed                BOOLEAN
completed_at             TIMESTAMPTZ
completed_by_id          VARCHAR(36)   REFERENCES users(id) ON DELETE SET NULL
                          -- NULLABLE — today's system-attributed completion
                          -- (completedById = null) uses exactly this existing
                          -- nullability, not a new column

CREATE UNIQUE INDEX idx_ai_jira_issue ON action_items (jira_issue_id)
  WHERE jira_issue_id IS NOT NULL;
  -- Already exists (Day 3/Day 58) — TODAY IS ITS FIRST REAL CONSUMER.
  -- This index was built two days ago specifically anticipating today's
  -- lookup pattern (findByJiraIssueId) — confirming it here closes the
  -- loop on that forward-planning.
```

### What About a `linkedCommitmentId` Field on `action_items`?

The Day 58 planning document (and this day's inherited context) references
`actionItem.linkedCommitmentId` as the mechanism connecting an action item
back to its originating commitment for the cascade logic in §14. **This
requires verification against the actual Day 3 schema before implementation
begins today** — the DB-SCHEMA-001 document's `action_items` table (as
currently specified) does not itself carry an explicit FK column to
`commitments`. Two resolution paths, evaluated at the start of today's work:

```
PATH A (preferred, if verified true): the extraction pipeline (Day 46-54,
  AI Pipeline phase) already links a "both a commitment AND an action item"
  extraction (per the extraction rules: "I'll take care of X" → BOTH) via
  a shared originating identifier — e.g. both records reference the SAME
  meeting_id AND were extracted from the same normalized_text/speaker
  match. If so, "linkedCommitmentId" is not a literal column but a
  RESOLVED relationship, computed via a repository query
  (findLinkedCommitment(actionItemId)) rather than a stored FK — today's
  jira-sync.service.ts calls that resolution function rather than reading
  a column directly.

PATH B (fallback, if no such linkage mechanism exists yet): today adds a
  SINGLE NULLABLE column, action_items.linked_commitment_id VARCHAR(36)
  REFERENCES commitments(id) ON DELETE SET NULL, as a minimal, explicit,
  additive migration — consistent with the platform's own migration
  philosophy (Day 3 DB-SCHEMA-001 §13: "backward-compatible first," "add
  nullable column, no lock") — populated at extraction time (Day 46-54's
  domain, a small addition to that pipeline's own persistence step, cross-
  referenced but not re-implemented today) and simply READ by today's
  cascade logic.

This ambiguity is called out explicitly, rather than silently assumed,
because it is the ONE point in today's plan where the exact implementation
depends on a fact about an earlier day's actual delivered schema that this
document cannot verify from the provided source material alone. The
cascade logic itself (§14) is written to be indifferent to which path is
true — it calls a single function, resolveLinkedCommitment(actionItemId),
whose internal implementation is Path A or Path B, decided at the start of
today's session against the real, current schema.
```

### Net Result

**Zero required table-level migrations for today's CORE deliverable**
(webhook registration/ingestion/sync) — the two new `metadata` JSONB keys
require no migration (JSONB is schemaless by nature). The
`linked_commitment_id` question (Path B) is the **only** possible schema
change today, and it is a small, additive, backward-compatible one if
required at all.

---

## 6. Layer 1 — Webhook Self-Registration (At Connect Time)

### Why Registration Is Per-Team, Not Global (Restated From Context, Justified Further)

Recall.ai and Stripe webhooks are configured **once**, globally, in each
provider's own dashboard, because Vocaply is Recall.ai's and Stripe's
*single* customer relationship for those integrations — one webhook URL
receives every event for every Vocaply team. Jira Cloud is structurally
different: each Vocaply **team** connects its **own, separate** Jira Cloud
site (a separate Atlassian tenant), so there is no single "Vocaply's Jira
account" to configure a webhook against — the webhook must be registered
**within each team's own Jira site**, using that team's own OAuth-granted
credentials, at the moment they connect.

### `jira.provider.ts` — New Method: `registerWebhook()`

```
Signature: registerWebhook(
  accessToken: string, cloudId: string, projectKey: string, callbackUrl: string
): Promise<{ webhookId: string; secret: string }>

Sequence:
  1. Generate a fresh, cryptographically random signing secret
     (crypto.randomBytes(32).toString('hex')) — UNIQUE PER TEAM, never
     shared across teams and never reused from any other provider's
     secret (Recall.ai's RECALL_WEBHOOK_SECRET and Stripe's
     STRIPE_WEBHOOK_SECRET are global, environment-level secrets, by
     contrast — Jira's design REQUIRES a per-registration secret because
     each team's webhook is a genuinely separate subscription).
  2. POST to https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/webhook
     with:
       events: ["jira:issue_updated"]
       jqlFilter: `project = ${projectKey}`   — scopes the subscription to
         ONLY the configured project, meaning Jira itself filters out
         irrelevant events before they ever reach Vocaply's endpoint,
         reducing both noise and unnecessary idempotency-check volume
       url: callbackUrl (constructed by the caller as
         `${API_URL}/webhooks/jira?teamId=${teamId}`)
     Note: whether Jira Cloud's webhook registration API accepts an
     explicit signing-secret parameter varies by API version/configuration
     path; if a native signing-secret registration parameter is available,
     it is passed here; if not, the generated secret is instead embedded
     as a query parameter alongside teamId on the callback URL itself
     (e.g. `?teamId=${teamId}&sig=${secretIdentifier}`) as a fallback
     verification mechanism — the FINAL verification approach is decided
     during today's implementation against Jira Cloud's actual current
     API contract, with HMAC-over-shared-secret as the PREFERRED design
     and a documented fallback if that specific API shape isn't available
     at implementation time. This is flagged explicitly rather than
     silently assumed, per the same spirit as §5's schema-verification note.
  3. Returns { webhookId, secret } to the caller.

Error handling: wrapped in the SAME retry/timeout/typed-error-mapping
discipline established in Day 58 for every other jira.provider.ts method
— a registration failure during connect is NOT silently swallowed; it
surfaces as a connect-flow failure (§17), because an OAuth-connected-but-
webhook-unregistered Jira integration would silently never receive reverse
sync, a much worse outcome than a visible connect-time error the admin can
retry.
```

### Where This Is Called From

Inside `integrations.service.ts`'s `completeProviderConnect('JIRA', ...)`
(Day 58 §12), as an **additional step appended after** cloudId resolution
and **before** the final `TeamIntegration` row is persisted — the webhook
registration's returned `{ webhookId, secret }` is merged into the SAME
`metadata` object write that already persists `cloudId`, in a single
database operation, not a separate follow-up update. This keeps the
connect flow's persistence atomic: either the fully-configured integration
(tokens + cloudId + webhook registration) is saved, or none of it is, on
any step's failure.

---

## 7. Layer 2 — Webhook Deregistration (At Disconnect Time)

### `jira.provider.ts` — New Method: `deregisterWebhook()`

```
Signature: deregisterWebhook(
  accessToken: string, cloudId: string, webhookId: string
): Promise<void>

Sequence:
  DELETE https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/webhook
  with the webhookId in the request body's array (Jira's deletion API
  accepts a batch of IDs).

  A 404 (webhook already removed — e.g. an admin manually deleted it via
  Jira's own UI, or Jira garbage-collected it after prolonged delivery
  failures) is treated as SUCCESS, not an error — identical idempotent-
  deletion discipline to Day 17's recallService.removeBot() and Day 56's
  Google token revocation handling: "the thing we wanted gone is gone,
  regardless of who removed it."
```

### Where This Is Called From

Inside `integrations.service.ts`'s `disconnectProvider('JIRA', ...)`
(Day 58 §12), **before** the `TeamIntegration` row is deleted — reading
`metadata.jiraWebhookId` from the still-present row, exactly mirroring the
ordering already established for OAuth token revocation ("revoke first,
delete local record second"). A deregistration failure logs a `WARN` (per
Day 58's identical precedent for Google's revoke-endpoint-unreachable case)
but does **not** block the local row deletion — the user's disconnect
intent takes priority, with the warning making any lingering third-party
footprint traceable for support rather than silently swallowed.

---

## 8. Layer 3 — jira.webhook.ts (Ingestion Handler)

### Full Handler Sequence

```
STEP 1 — Signature Verification (FIRST, before any parsing of req.body
         beyond what's needed to verify):
  verifyJiraSignature(req) — throws immediately on failure, logged as a
  SECURITY event (§18), not a normal error, before any business logic
  executes. Uses the raw, unparsed body bytes (preserved by
  rawBodyMiddleware, SHARED unmodified from Day 18) — never the
  JSON-parsed object, since signature computation must be byte-exact.

STEP 2 — Fast Acknowledge:
  res.status(200).json({ received: true }) — sent BEFORE any database
  work, identical contract to Recall.ai's webhook handler (Day 18): Jira,
  like every other provider Vocaply integrates with, expects a fast 2xx
  regardless of how long downstream processing takes, and a slow ACK
  risks Jira's own retry/backoff logic kicking in and generating
  redundant redeliveries — which the idempotency layer (Step 4) handles
  correctly, but avoiding unnecessary redelivery churn in the first place
  is still the right default behavior.

STEP 3 — Extract Relevant Fields:
  Destructure { webhookEvent, issue, changelog } from the parsed body,
  and teamId from req.query — the query param is captured here but its
  TRUST LEVEL is deliberately downgraded to "hint," fully explained in §13.

STEP 4 — Idempotency Check (BEFORE any further processing):
  Build the idempotency key per §11's exact composition rule, check/set
  in Redis using the SAME `webhook:processed:{provider}:*` namespace
  convention already established for Recall.ai (`bot.done` events) and
  Stripe (`event.id`) — today's key is namespaced `jira:...`, following
  the identical pattern, not inventing a new one.

STEP 5 — Event Type Filter:
  If webhookEvent !== 'jira:issue_updated' → return immediately (a no-op
  — remember the webhook SUBSCRIPTION itself, per §6, only requests
  jira:issue_updated events in the first place, so this check is a
  defensive belt-and-suspenders guard against Jira ever sending an
  unexpected event type, not the primary filtering mechanism).

STEP 6 — Field-Level Filter:
  Search changelog.items for an entry where field === 'status'. If none
  found → return immediately (this webhook fired for a DIFFERENT field
  change on the same issue — e.g. someone edited the description or
  changed the assignee — which is explicitly irrelevant to today's scope,
  per §18's "never trust assignee from the payload" rule).

STEP 7 — Hand Off to the Service Layer:
  await jiraSyncService.handleStatusChange({ teamId, jiraIssueKey: issue.key,
  newStatusName: statusChange.toString }) — a narrow, fully-typed,
  webhook-shape-agnostic input. Notice this is the LAST thing the handler
  does, and it does NOT inspect the result or write any further response
  (the HTTP response was already sent in Step 2) — this is intentionally
  fire-and-forget from the HTTP layer's perspective, with all subsequent
  error handling living inside handleStatusChange() itself (§9) or
  surfacing via the standard unhandled-promise-rejection → structured log
  → Sentry capture path already established platform-wide.
```

---

## 9. Layer 4 — jira-sync.service.ts (Reverse-Sync Business Logic)

### `handleStatusChange(input): Promise<void>` — Full Sequence, Justified Step by Step

```
STEP 1 — Defensive Tenant Verification (THE Security-Critical Step, §13):
  Look up teamIntegrationRepo.findActive(input.teamId, 'JIRA'). If no
  active integration exists for this team → log a WARN and RETURN, never
  throw. This mirrors the Day 18 "Stripe event for unknown team: defensive
  lookup, log + skip, never throw" pattern EXACTLY — a webhook event for
  a team with no matching integration is either a stale subscription
  (disconnected but Jira hasn't finished processing the deregistration
  yet, a benign race) or a probing/malformed request, and in either case
  the correct behavior is silent, logged non-action, not a 500 that could
  leak information about which teamIds are valid via response-time or
  error-shape differences.

STEP 2 — Resolve the Action Item:
  actionItemRepo.findByJiraIssueId(input.jiraIssueKey) — using the
  GLOBAL unique index (idx_ai_jira_issue, §5) to find the action item,
  if any, that this Jira issue key was synced FROM.

  If not found → return (this Jira issue was never created by Vocaply —
  e.g. someone manually created it in Jira directly, coincidentally
  inside a project Vocaply also syncs to — correctly and silently ignored).

STEP 3 — EXPLICIT Cross-Tenant Check (Restated Even Though the Index Is
         Global, Per §18):
  if (actionItem.teamId !== input.teamId) → return, without acting.
  This check is REDUNDANT with the structural near-impossibility already
  discussed in Day 58 §19 (two teams sharing one Jira site + identical
  project + identical issue key), but it is written EXPLICITLY anyway —
  defense in depth applies even against a scenario judged "exceptionally
  unlikely," because the cost of writing the check is trivial and the
  cost of a real cross-tenant action-item mutation, however unlikely, is
  a serious data-integrity incident.

STEP 4 — Status Mapping:
  isNowComplete = COMPLETED_STATUS_NAMES.has(input.newStatusName) — see
  §15 for the full design and future-configurability discussion of this
  mapping.

STEP 5 — No-Op Short-Circuit:
  if (isNowComplete === actionItem.completed) → return. This guards
  against two distinct redundant-trigger scenarios: (a) Jira redelivering
  an event the idempotency layer already caught via a DIFFERENT changelog
  ID for what amounts to the same logical transition (a real, if rare,
  possibility if Jira's changelog IDs aren't perfectly stable across
  redeliveries), and (b) a genuinely NEW status transition that happens
  to land on the SAME boolean outcome (e.g. moving from "In Review" to
  "In Progress" — neither complete — generates a real status-field
  changelog entry that reaches this function, correctly resulting in a
  no-op since neither state is "complete").

STEP 6 — Persist the Update (System-Attributed):
  actionItemRepo.update(actionItem.id, { completed: isNowComplete,
  completedAt: isNowComplete ? new Date() : null, completedById: null }).
  completedById: null is the deliberate signal distinguishing THIS
  completion path from a human clicking "mark complete" inside Vocaply's
  own UI (Day 20 §6.2, which sets completedById: req.user.id) — the
  existing NULLABLE column (§5) already supports this distinction with
  zero schema change; today is simply the SECOND real writer of this
  column, and the first to intentionally leave it null as meaningful
  signal rather than an oversight.

STEP 7 — Real-Time Emission:
  io.to(`team:${input.teamId}`).emit('action_item:completed', {
  actionItemId, completed: isNowComplete, source: 'jira' }) — the
  `source: 'jira'` field lets the frontend (§16) distinguish this event
  from a same-named event a future in-app completion action might also
  emit, without needing two differently-named Socket.io events for what
  is conceptually the same state change with a different origin.

STEP 8 — Commitment Cascade (Conditional):
  See §14 for full detail — only triggered when isNowComplete is true AND
  a linked commitment is resolved.
```

---

## 10. Layer 5 — Signature Verification

### `verifyJiraSignature(req)` — Added to `webhooks.validator.ts`

```
Design: reuses the EXACT SAME constant-time HMAC-SHA256 comparison
utility function already used by verifyRecallSignature() (Day 18) —
today's addition is a NEW CALL SITE with Jira-specific parameters, NOT a
new comparison algorithm. This is the concrete, auditable proof of
Principle 4 (§2): the cryptographic core of "verify this HMAC signature
against this shared secret using a timing-safe comparison" is written
EXACTLY ONCE in the codebase and has now been proven to serve THREE
distinct providers (Recall.ai, and today, Jira — Stripe uses its own SDK's
native constructEvent() per Day 18, a deliberate, documented exception
noted then and unchanged today).

Sequence:
  1. Extract the signature header (Jira's specific header name — verified
     against Jira Cloud's actual current webhook documentation during
     implementation, since Atlassian's exact header naming convention
     for this feature is confirmed at build time, consistent with §6's
     flagged uncertainty about the precise registration-time signing
     mechanism).
  2. Extract teamId from the query string to look up WHICH secret to
     verify against (metadata.jiraWebhookSecret for that team's
     TeamIntegration row) — this is the ONE legitimate use of the
     query-param teamId before full tenant verification has occurred: to
     select which stored secret to attempt verification with. If the
     signature check FAILS using that team's secret, the request is
     rejected outright — the query param never grants any access itself,
     it only narrows which secret to test against, and a failed test
     means REJECTED regardless of what team was claimed.
  3. Compute HMAC-SHA256 over the raw body bytes using the selected
     team's secret.
  4. Constant-time comparison (crypto.timingSafeEqual, or the platform's
     existing wrapped equivalent) against the provided signature.
  5. On mismatch or missing signature/secret → throw immediately, logged
     as a SECURITY event distinct from a normal validation error (§18,
     §21) — mirroring Day 18's explicit requirement that "signature
     failures logged distinctly as security-relevant events."
```

---

## 11. Layer 6 — Idempotency Design

### Key Composition, Justified

```
idempotencyKey = `webhook:processed:jira:${issue.id}:${changelog?.id ?? webhookEvent}`

WHY issue.id (Jira's internal numeric issue ID), NOT issue.key
("TECH-142"): Jira issue KEYS can change if an issue is moved between
projects (a real, if uncommon, Jira feature) — the internal issue.id is
immutable for the life of the issue, making it the more STABLE half of the
idempotency key. issue.key is still used for the actual action-item
LOOKUP (§9, Step 2) because that's what's stored in Vocaply's
jira_issue_id column — but the DEDUPLICATION key deliberately uses the
more stable identifier, a subtle but deliberate distinction between "how
we find the record" and "how we detect a duplicate delivery of the same
event."

WHY changelog?.id ?? webhookEvent (a fallback, not just changelog.id
alone): if Jira's payload for a given delivery somehow lacks a changelog
id (an edge case, not the documented common case, but defended against
rather than assumed away), falling back to the broader webhookEvent
string still provides SOME deduplication granularity rather than the key
composition throwing or producing "undefined" as part of the Redis key —
this fallback is a deliberate robustness choice, not a design gap.

TTL: 86400s (24 hours) — IDENTICAL to Recall.ai's and Stripe's existing
idempotency TTLs (Day 18), continuing the platform-wide "24 hours is our
standard redelivery-window assumption" convention rather than inventing a
Jira-specific duration.
```

### Why the Idempotency Check Happens BEFORE the Event-Type and Field Filters (§8, Step 4 Before Steps 5–6)

A deliberate ordering choice: checking idempotency first means a
redelivered event for an ALREADY-PROCESSED status change is rejected in a
single Redis round-trip, without even parsing the changelog array — the
cheapest possible short-circuit for what is expected to be the highest-
volume category of "nothing to do" request (Jira's own retry behavior on
transient network issues between Jira and Vocaply's endpoint). Filtering
by event type or field FIRST would mean paying that filtering cost on
every redelivery, not just every genuinely-new event.

---

## 12. Layer 7 — Route Registration & the "Reusability Proof"

### `webhooks.routes.ts` — Final State After Today

```
router.post('/recall', rawBodyMiddleware, handleRecallEvent)   // Day 18
router.post('/stripe', rawBodyMiddleware, handleStripeEvent)   // Day 18
router.post('/jira',   rawBodyMiddleware, handleJiraWebhook)   // Day 59 — NEW
```

### The Explicit Code-Review Gate for Today

Per §2 Principle 4 and the Day 18 promise this day exists to validate,
today's code review includes a **mandatory, named check**: diff
`webhooks.routes.ts` and confirm the ONLY change is the single new route
line above — no modification to `rawBodyMiddleware`'s configuration, no
new middleware inserted into the shared chain, no Jira-specific branching
added to any function that Recall.ai's or Stripe's handlers also pass
through. If this check fails — if making Jira's webhook work required
touching shared infrastructure — that is treated as a **finding to
remediate**, not a acceptable cost of adding a third provider, and is
explicitly called out in the end-of-day checklist (§27) as its own line
item, not folded into a generic "webhook works" checkbox.

---

## 13. The teamId Query Parameter — Advisory, Not Authoritative

This deserves its own dedicated section given how consequential the
distinction is, restated from three separate angles for absolute clarity:

```
WHAT THE teamId QUERY PARAM ACTUALLY PROVES:
  Nothing, on its own. It is a plain, unsigned, attacker-visible-and-
  guessable string appended to a webhook URL. Anyone who has ever seen a
  Vocaply webhook URL (or simply enumerates short cuid2-style IDs) could
  construct a POST request to /webhooks/jira?teamId={any_id_they_choose}.

WHAT ACTUALLY PROVIDES SECURITY IN THIS DESIGN:
  The HMAC signature (§10), verified using a secret that is:
    a. Unique per team (generated fresh at registration time, §6)
    b. Never transmitted anywhere except at registration (stored
       encrypted-at-rest-adjacent in the metadata JSONB — note: see §18
       for the explicit discussion of whether this secret itself needs
       AES-256-GCM encryption or whether JSONB storage is acceptable,
       given it is functionally a webhook signing key, not an OAuth token)
    c. Verified via constant-time comparison BEFORE any business logic runs

HOW THE QUERY PARAM IS ACTUALLY USED, PRECISELY:
  1. To select WHICH team's stored secret to attempt signature
     verification against (§10, Step 2) — an attacker supplying a
     WRONG or GUESSED teamId will have their signature check FAIL,
     because they do not know that team's actual secret (they'd need
     to have compromised the real Jira instance's webhook registration
     to know it, at which point they have far more direct means of
     causing harm than this webhook endpoint).
  2. AFTER signature verification succeeds, to narrow the subsequent
     TeamIntegration lookup (§9, Step 1) — but even here, this lookup
     is a REAL, INDEPENDENT DATABASE QUERY, not a trust decision. A
     teamId that happens to pass signature verification (meaning the
     attacker somehow legitimately knows a real team's real secret —
     at which point they are, definitionally, a party Jira itself
     trusted to receive that secret) is STILL subject to the same
     "does this team have an active Jira integration, does this issue
     key belong to this team's action items" checks as every other
     request.

THE PRECISE ATTACK THIS DESIGN CLOSES:
  Without the HMAC-first-then-lookup ordering, a naive implementation
  might do: "look up TeamIntegration by teamId from the query param,
  then use THAT record's stored secret to verify the signature." This
  subtle reordering looks almost identical but is NOT — it means an
  attacker who submits ANY teamId with ANY signature at all successfully
  triggers a real database lookup and a real secret-comparison attempt
  for a team they specify, which is a larger surface for enumeration/
  timing attacks than the design actually implemented today, where the
  team is selected FIRST (to pick a secret to try) but the request is
  REJECTED before any action-item-level work happens if that specific
  team's specific secret doesn't match. This ordering nuance is worth
  internalizing precisely, not just approximately.
```

---

## 14. Commitment Cascade — Linking Action Items to Commitments

### Why This Cascade Exists At All

Per the platform's own extraction rules (documented in the AI Pipeline's
`extraction_system.txt`, referenced across the HLD and LLD): a self-
volunteered statement like *"I'll take care of the payment bug"* is
extracted as **both** a commitment (a first-person promise, tracked in
`commitments`, subject to the PENDING → FULFILLED/MISSED lifecycle) **and**
an action item (an assigned task, tracked in `action_items`, subject to its
own `completed` boolean). These are two independent database rows
representing, conceptually, the SAME underlying real-world obligation. If a
person closes the resulting Jira ticket, it would be a broken, confusing
product experience for the action item to update while its "sibling"
commitment stays stubbornly PENDING, silently drifting toward an incorrect
MISSED status at the next deadline sweep despite the work genuinely being
done.

### Cascade Logic

```
Triggered ONLY when (§9, Step 8's precondition): isNowComplete === true
AND a linked commitment is successfully resolved for this action item
(via whichever mechanism §5 determines is the actual current schema
reality — a stored FK or a computed resolution query).

await commitmentsService.updateStatus(
  linkedCommitmentId,
  'FULFILLED',
  { source: 'JIRA_REVERSE_SYNC' }
)

This call REUSES the existing commitment status-update service function
(Day 19's updateCommitmentStatus, extended today only to the extent that
it must accept and record a `source` value distinguishing this SYSTEM-
INITIATED transition from the MEMBER/MANAGER-INITIATED transitions Day 19
already handles) — it does NOT bypass that function's existing validation
(the PENDING/DEFERRED → FULFILLED transition rules, §9's Day 19-established
ALLOWED_TRANSITIONS table already permits this exact transition) and does
NOT duplicate the score-recalculation, Socket.io emission, or Jira-status-
sync-back logic that function already performs for every other fulfillment
path.

IMPORTANT GUARD, EXPLICIT: if the linked commitment is ALREADY in a
terminal, non-PENDING/DEFERRED state (e.g. already FULFILLED via a
DIFFERENT path — a manager marked it done directly in Vocaply moments
before the Jira webhook arrived, a genuine, plausible race), the existing
updateCommitmentStatus() function's own transition-validation logic
(Day 19's ALLOWED_TRANSITIONS map, already enforcing "FULFILLED → any is
invalid") correctly REJECTS the redundant transition attempt — today's
cascade code catches that specific, EXPECTED rejection and logs it at INFO
level (not ERROR — a commitment already being fulfilled through a
different, faster path is not a failure of today's system, it's a benign
race between two legitimate completion signals), rather than letting an
unhandled exception propagate out of an otherwise-successful webhook
processing run.
```

### What the Cascade Deliberately Does NOT Do

It does not attempt the REVERSE direction (a commitment marked FULFILLED
inside Vocaply does not push a Jira status change) — that would require a
`updateExternalItemStatus()` call (already present as an OPTIONAL method on
the `IntegrationProvider` interface, Day 58 §6, unimplemented for Jira
today) and is explicitly deferred, since building bidirectional-in-both-
literal-directions sync today would roughly double this day's scope for a
capability not requested in the current feature definition. This is a
scope boundary, stated plainly, not an oversight.

---

## 15. Status Name Mapping & Configurability

### Today's Implementation — A Fixed, Documented Set

```
const COMPLETED_STATUS_NAMES = new Set(['Done', 'Closed', 'Resolved'])
```

These three names cover Jira's own default, out-of-the-box workflow scheme
(the same one nearly every fresh Jira Cloud project starts with) — chosen
deliberately to match the highest-probability real-world case with zero
configuration burden on the connecting team, exactly mirroring Day 58 §11's
identical design tradeoff for the OUTBOUND priority mapping (fixed defaults,
not a day-one configurable scheme).

### The Explicit, Documented Limitation

A team using a **customized** Jira workflow (a common enough Jira pattern —
renamed statuses like "Shipped," "QA Passed," "Deployed") will find that
marking their custom-named "complete" status does **not** trigger today's
cascade, because the literal string comparison in `COMPLETED_STATUS_NAMES`
will not match. This is an accepted, documented Day 59 scope boundary,
**not** silently mishandled — the correct behavior in this case is a benign
no-op (§9, Step 5's no-op short-circuit correctly does nothing, since
`isNowComplete` evaluates false for an unrecognized status name), never an
error, and never an incorrect cascade.

### Near-Term Follow-Up Design (Documented, Not Built Today)

The natural extension — surfaced here so it's an intentional, tracked
follow-up rather than a surprise discovered later — would store a team-
configurable `metadata.completedStatusNames: string[]` (populated via a
future addition to Day 58's `configureJiraController`/`configureProviderMetadata`
flow, reusing that already-generic JSONB-merge-update mechanism with zero
new infrastructure) and have `handleStatusChange()` read from
`integration.metadata.completedStatusNames ?? DEFAULT_COMPLETED_STATUS_NAMES`
rather than the hardcoded constant. This is flagged, not implemented, today
— today's fixed set is a deliberate, scoped MVP for the reverse-sync
capability's first release, matching the platform's stated build philosophy
of shipping the 80% case first and instrumenting for real signal on
whether the remaining 20% (custom workflow teams) is common enough to merit
the added UI/configuration surface.

---

## 16. Frontend Deliverables

### `ActionItemCard.tsx` — Modification, Not New Component

Today's frontend work is intentionally small — the real-time event
infrastructure (`useRealtimeCommitments`-equivalent listening pattern,
established Day 39) and the action item card component (Day 36) both
already exist. Today's addition:

```
When an action item's most recent update carries source: 'jira' (surfaced
via the Socket.io payload, §9 Step 7, and reflected into the TanStack
Query cache via the existing invalidateQueries pattern already wired for
this event name, per Day 39's WebSocketProvider event-handler registration
design), ActionItemCard renders a small, distinct badge — "Synced from
Jira" with the Jira icon (already present in the platform's icon set,
Day 1) — next to the completed checkbox, giving a team member visible
confirmation that the item's completion state reflects EXTERNAL activity,
not something they or a teammate did inside Vocaply's own UI. This is a
small trust-and-transparency detail: without it, a user might be confused
about why an item shows complete when nobody on the team remembers
checking it off in Vocaply.
```

No new hooks are required — `useActionItems()`'s existing TanStack Query
cache-invalidation-on-Socket.io-event wiring (Day 39) already covers this
new event's payload shape, since `action_item:completed` was anticipated
generically (not Jira-specifically) in the platform's original event
catalog (HLD §8's event catalog already lists `action_item:completed` as a
board-level event, one this day is simply the first to genuinely populate
with the `source: 'jira'` variant).

---

## 17. State & Lifecycle Design

### Webhook Subscription Lifecycle (Jira-Side Resource, Tracked Vocaply-Side via Metadata)

```
                    ┌──────────────────────┐
                    │  NO WEBHOOK EXISTS    │  ← before Jira connect completes
                    └───────────┬───────────┘
                                │ completeProviderConnect('JIRA', ...)
                                │ succeeds through registerWebhook()
                    ┌───────────▼───────────┐
                    │  WEBHOOK REGISTERED   │  metadata.jiraWebhookId set
                    │  (reverse sync live)  │
                    └───────────┬───────────┘
                                │ disconnectProvider('JIRA', ...) calls
                                │ deregisterWebhook() before row deletion
                    ┌───────────▼───────────┐
                    │  NO WEBHOOK EXISTS    │  (both the Jira-side
                    │  (post-disconnect)     │   registration AND the local
                    └───────────────────────┘   metadata are gone)

FAILURE-DURING-CONNECT CASE:
  If registerWebhook() itself fails (§6) DURING completeProviderConnect,
  the entire connect operation fails as a unit (per §6's "atomic
  persistence" design) — the team is NOT left in a state where OAuth
  succeeded, cloudId was resolved, but the webhook silently never got
  registered. The admin sees a clear connect-failure and can retry the
  entire flow from the beginning, which will attempt registration again.

RECONNECT-AFTER-NEEDS_RECONNECT CASE (per Day 58 §18's existing pattern):
  If a team's integration was auto-disabled (5 consecutive OUTBOUND sync
  failures, Day 58 §15) and the admin reconnects, today's registration
  logic runs AGAIN as part of that reconnect flow — this WOULD create a
  SECOND webhook registration on Jira's side alongside any still-active
  original one, UNLESS explicitly guarded against. Today's implementation
  MUST check metadata.jiraWebhookId for an EXISTING value before calling
  registerWebhook() again on a reconnect — if one already exists, skip
  re-registration (the original webhook subscription almost certainly
  survived the OUTBOUND-sync-failure auto-disable, since that failure mode
  is unrelated to the INBOUND webhook subscription's health) rather than
  blindly creating a duplicate. This is called out explicitly here and
  tracked as its own test case in §26, because it's a subtle interaction
  between Day 58's auto-disable/reconnect design and today's new webhook-
  registration step that would be easy to overlook.
```

---

## 18. Security Architecture

```
THREAT                                MITIGATION
─────────────────────────────────────────────────────────────────────────
Confused deputy via teamId query      HMAC signature verified against a
param spoofing                        per-team secret BEFORE any tenant-
                                       scoped action, per §13's exhaustive
                                       treatment — this is today's single
                                       most important security property

Replay of a legitimate, previously-   Idempotency layer (§11) makes a
processed webhook event               replayed event a guaranteed no-op,
                                       functioning as Jira's de facto
                                       replay protection (Jira Cloud
                                       webhooks don't carry a timestamp-
                                       based freshness signal the way
                                       Stripe's do, so idempotency is the
                                       PRIMARY replay defense here, not a
                                       secondary one — worth noting
                                       explicitly since Stripe's design,
                                       Day 18, layers idempotency ON TOP
                                       OF a timestamp-tolerance check;
                                       Jira's design relies on idempotency
                                       alone)

Signature/secret storage              metadata.jiraWebhookSecret is a
                                       genuine cryptographic secret (an
                                       HMAC signing key), NOT business
                                       configuration like cloudId/
                                       projectKey — today's implementation
                                       explicitly evaluates whether this
                                       warrants AES-256-GCM encryption
                                       (matching OAuth tokens) rather than
                                       plaintext JSONB storage (matching
                                       cloudId/projectKey per Day 58 §19's
                                       "config vs secret" distinction).
                                       DECISION FOR TODAY: encrypt it,
                                       using the SAME crypto.service.ts
                                       already in use — this secret's
                                       compromise would allow forging
                                       webhook payloads for that team,
                                       which is a materially different
                                       (and worse) risk than a leaked
                                       projectKey, and it is treated with
                                       token-grade protection accordingly,
                                       correcting what might otherwise be
                                       an easy category-error carried over
                                       too literally from Day 58's config-
                                       vs-secret framing.

Malicious/buggy Jira automation       Explicitly NOT acted upon — only
reassigning an issue                  the status field changelog entry
                                       is inspected (§8, Step 6); assignee
                                       data anywhere in the payload is
                                       never read for any mutating purpose

Tenant isolation for the cascade      Every write (action item, then
write path                            commitment) remains scoped through
                                       the SAME repository functions and
                                       teamId parameters already enforcing
                                       the platform's 3-layer isolation
                                       (application/Prisma-middleware/RLS)
                                       — today introduces no new write
                                       path that bypasses those layers

Webhook endpoint DoS / flood          Sits behind the SAME IP-level rate
                                       limiting already applied to every
                                       route (Day 18 §8.4) — no
                                       Jira-specific additional throttle
                                       introduced today, consistent with
                                       Recall.ai's and Stripe's existing
                                       treatment
```

---

## 19. Performance & Scalability Architecture

### Why This Is a Low-Volume, Low-Concern Path Relative to Days 56–58

```
Calendar sync (Day 56): hourly, fan-out across EVERY connected user —
  potentially thousands of jobs per hour at scale.

Jira ticket creation (Day 58): triggered per action item, potentially
  bursty (many action items from one large meeting).

Jira reverse-sync webhooks (today): triggered ONLY by a human (or a Jira
  automation rule) changing a ticket's status — inherently bounded by
  actual human activity in Jira, not by any Vocaply-internal batch
  process. Even a large team with hundreds of synced tickets generates
  webhook traffic proportional to how often people update tickets, which
  is a fundamentally lower and more naturally-paced volume than any of
  the prior three days' producers.
```

Given this, today deliberately does **not** introduce a queue for webhook
processing — the entire `handleStatusChange()` sequence runs synchronously
inside the webhook handler's post-ACK continuation (§8), consistent with
Recall.ai's own webhook handler design (Day 18: signature verify → fast ACK
→ **async, but NOT queued** processing, distinct from queued work like
`transcribe`/`extract`). This is a deliberate choice, not an oversight: the
work involved (two-to-three lookups, one or two updates, one Socket.io
emit) is fast and has no external, slow, retryable side effect of its own
(unlike Recall.ai's `bot.done` handler, which triggers MongoDB storage and
queues a transcription job) — queuing it would add latency and complexity
for no correctness or throughput benefit at this volume profile.

### `idx_ai_jira_issue`'s Role in Keeping This Fast

The single, unique, partial index backing `findByJiraIssueId()` (§5) is
what keeps Step 2 of `handleStatusChange()` (§9) a sub-millisecond, indexed
point lookup regardless of how many total action items exist platform-wide
— confirmed, not re-derived, since this index was purpose-built two days
ago anticipating exactly this access pattern.

---

## 20. Reliability & Failure Handling

```
FAILURE MODE                          BEHAVIOR
─────────────────────────────────────────────────────────────────────────
Jira redelivers the same event         Idempotency layer (§11) catches it,
multiple times (their own retry        zero duplicate side effects,
logic on a slow/timed-out ACK)         regardless of how many redeliveries
                                       arrive

Webhook arrives for a team that        Defensive lookup returns early,
disconnected moments earlier            logged at WARN, no error surfaced
(registration/deregistration race)     to any user — this is an expected,
                                       benign timing window, not a bug

Action item was deleted between        findByJiraIssueId() returns null,
Jira sync (Day 58) and this status     handled as "not found," return
change webhook arriving                 early — same benign-no-op pattern
                                       already established for the
                                       identical race in Day 58's
                                       integrate.worker.ts (§14 there)

Commitment cascade's updateStatus()    Caught and logged at INFO (§14) —
call is rejected by the existing       an EXPECTED race between two
transition-validation logic (e.g.      legitimate completion signals, not
already FULFILLED via a different      a failure of today's system
path)

Socket.io emission fails               Per the platform-wide rule (Day 18
                                       §10.4): "If Socket.io emission
                                       fails for any reason, it must never
                                       throw and block the underlying
                                       state update" — today's io.to(...)
                                       .emit() call is wrapped so a
                                       transient Socket.io/Redis-adapter
                                       issue never prevents the actual
                                       database write (which already
                                       happened in Step 6, BEFORE the
                                       emission in Step 7) from being
                                       considered successful

Reconnect creates a DUPLICATE          Explicitly guarded (§17) — existing
webhook registration on Jira's side    metadata.jiraWebhookId is checked
                                       before attempting a new registration
```

---

## 21. Observability & Monitoring

### Structured Log Events (New Today)

```
webhook.jira.received              { teamId (from query, unverified at
                                      this point), issueKey }
webhook.jira.signature_failed      { teamId } — SECURITY level, distinct
                                      from normal errors per §18
webhook.jira.idempotent_skip       { issueId, changelogId }
webhook.jira.unknown_team          { teamId } — WARN, per §9 Step 1
webhook.jira.action_item_not_found { jiraIssueKey } — INFO, benign
webhook.jira.status_updated        { teamId, actionItemId, completed,
                                      newStatusName }
webhook.jira.cascade_triggered     { teamId, actionItemId,
                                      linkedCommitmentId }
webhook.jira.cascade_rejected      { linkedCommitmentId, reason } — INFO,
                                      per §14's race-condition handling
integrations.jira.webhook_registered   { teamId, webhookId }
integrations.jira.webhook_deregistered { teamId, webhookId }
integrations.jira.webhook_registration_failed { teamId, err } — this ONE
                                      fails the whole connect flow (§6),
                                      logged at ERROR
```

### Metrics (Grafana Dashboard Additions)

```
webhook.jira.received_total
webhook.jira.signature_failures_total     — alertable, see below
webhook.jira.idempotent_skips_total
webhook.jira.status_updates_total
webhook.jira.commitment_cascades_total
```

Tagged consistently with the existing `webhook.{provider}.*` naming
convention already established for Recall.ai/Stripe metrics (Day 18/19),
so today's Jira metrics slot into the SAME dashboard panels via a
`provider="jira"` label, exactly mirroring the identical design decision
already made for Day 58's `integrate.*` metrics (§22 there).

### Alerting Additions

```
CRITICAL (per the EXISTING Day 19 rule, "Recall.ai webhook failures > 10
in 5 minutes," extended today to a second provider):
  → webhook.jira.signature_failures_total > 10 in 5 minutes — a spike
    here could indicate either a misconfigured/stale secret after an
    unnoticed reconnect, OR a genuine probing/attack attempt, and merits
    the same page-worthy urgency already assigned to Recall.ai's
    equivalent failure mode
```

---

## 22. Redis Key Space Additions

```
NAMESPACE                    KEY FORMAT                                    TTL      VALUE
────────────────────────────────────────────────────────────────────────────────────────
Webhook idempotency (Jira,   webhook:processed:jira:{issueId}:{changelogId  86400s   "1"
extending the EXISTING       ?? webhookEvent}
namespace already used by
Recall.ai/Stripe — NOT a
new namespace)
```

This is the smallest Redis footprint of any Phase 5 day so far — a single
key format, reusing an already-established namespace convention, with no
new locking, caching, or rate-limiting keys introduced.

---

## 23. API / Webhook Endpoint Specification

### `POST /webhooks/jira`

No `requireAuth` (signature-secured, per the Day 18 route-group design,
identical to `/webhooks/recall` and `/webhooks/stripe`). Query: `teamId`
(advisory only, §13). Body: Jira's native `jira:issue_updated` webhook
payload shape (raw, unmodified — Vocaply does not request any custom
payload transformation from Jira). Response: always `200
{ received: true }` sent immediately (§8, Step 2), regardless of what
downstream processing subsequently determines — **the HTTP response
carries no information about whether a status change was actually
processed**, by design, since Jira's own retry/redelivery behavior should
be driven purely by "did my HTTP request succeed," not by Vocaply's
internal business-logic outcome for that event.

### No New Customer-Facing REST Endpoints Today

Unlike Days 56 and 58, today introduces **zero** new endpoints under
`/api/v1/...` — the ONLY new route is the inbound webhook itself. This is
explicitly noted because it's a departure from the pattern of the prior two
integration days, and worth confirming as intentional (the reverse-sync
capability has no user-facing configuration surface beyond what Day 58
already built, since today's only "configuration" — which status names
count as complete — is a fixed default per §15, not yet exposed as a
setting).

---

## 24. Error Taxonomy

```
No new customer-facing AppError subclasses are introduced today, mirroring
Day 18's own webhook handlers (Recall.ai, Stripe) — a webhook endpoint's
error handling is fundamentally different from a REST endpoint's: there is
no client waiting on a meaningful error response body (the ACK is sent
before any business logic runs, §8 Step 2), so "errors" in this domain are
entirely about STRUCTURED LOGGING AND METRICS, not about shaping an HTTP
error response for a caller to act on.

The one exception: registerWebhook()/deregisterWebhook() (§6/§7), which
run inside the SYNCHRONOUS connect/disconnect HTTP request flows (Day 58's
existing endpoints) and therefore DO need typed, customer-facing errors on
failure:

  JIRA_WEBHOOK_REGISTRATION_FAILED   502-class  → surfaces during connect,
                                                   blocks the whole connect
                                                   flow (§6, §17)
  JIRA_WEBHOOK_DEREGISTRATION_FAILED  —          → logged WARN only, does
                                                   NOT block disconnect (§7)
```

---

## 25. Hour-by-Hour Execution Plan

```
9:00 – 9:45    jira.provider.ts: registerWebhook() — secret generation,
               Jira webhook API call, verification of Jira's actual
               current signing-mechanism API shape (§6's flagged
               uncertainty resolved here, at implementation time)

9:45 – 10:15   jira.provider.ts: deregisterWebhook() — idempotent DELETE,
               404-as-success handling

10:15 – 11:00  jira.webhook.ts: signature verify → fast ACK → idempotency
               → event/field filtering → handoff, wired against the
               SHARED rawBodyMiddleware with zero modifications to it

11:00 – 12:00  jira-sync.service.ts: handleStatusChange() full sequence —
               tenant verification, action item resolution, cross-tenant
               explicit check, status mapping, system-attributed update,
               Socket.io emission

12:00 – 1:00   Lunch

1:00 – 1:45    Commitment cascade: resolveLinkedCommitment() (Path A or B
               per §5's schema verification, decided first thing this
               hour against the actual current schema), cascade call +
               race-condition INFO-level handling

1:45 – 2:15    webhooks.validator.ts: verifyJiraSignature(), reusing the
               existing constant-time comparison utility, new call site only

2:15 – 2:45    webhooks.routes.ts: register POST /jira, diff-reviewed
               against the "zero shared-infrastructure changes" gate (§12)

2:45 – 3:30    Real-time wiring confirmation (frontend ActionItemCard
               badge) + integrations.service.ts wiring of register/
               deregister into the Day 58 connect/disconnect flows,
               including the reconnect-duplicate-registration guard (§17)

3:30 – 4:15    Observability: structured logs, metrics, Grafana panel,
               CRITICAL alert rule for signature failure spikes

4:15 – 5:00    Manual E2E test against a real Jira Cloud sandbox: mark a
               synced ticket "Done," verify action item AND linked
               commitment both update in Vocaply within seconds

5:00 – 5:30    Security review pass: attempt a spoofed teamId, a tampered
               signature, a replayed payload — confirm all three are
               correctly rejected/deduplicated

5:30 – 6:00    Checklist review + sign-off
```

---

## 26. Testing & Verification Plan

### Signature & Ingestion (Unit + Integration)

```
Test 1 — Valid signature, valid teamId → processed successfully
Test 2 — Valid signature computed with the WRONG team's secret (i.e. an
         attacker who knows Team A's secret submits it against Team B's
         teamId) → rejected (proves §13's ordering: secret selection by
         teamId does not itself grant trust)
Test 3 — Missing signature header → rejected before any parsing
Test 4 — Tampered body (valid signature for the ORIGINAL body, body then
         modified in transit) → rejected — proves raw-body-based
         verification, not JSON-re-serialized verification
Test 5 — Duplicate delivery (identical issue.id + changelog.id) →
         second delivery is a confirmed no-op (assert zero DB writes,
         zero Socket.io emissions on the second call)
Test 6 — Non-status field change (e.g. description edited) → correctly
         filtered out at Step 6, zero downstream processing
```

### Business Logic (Unit, Mocked Repositories)

```
Test 1 — Unknown team (no active TeamIntegration) → early return, WARN
         logged, zero writes
Test 2 — Unknown Jira issue key (no matching action item) → early
         return, zero writes
Test 3 — Cross-tenant mismatch (action item found but its teamId !=
         input.teamId — an artificially constructed test case, since
         this should be structurally near-impossible per Day 58 §19) →
         early return, zero writes
Test 4 — Status change to a NON-complete status (e.g. "In Progress") →
         isNowComplete = false, no-op if actionItem.completed was
         already false
Test 5 — Status change to "Done" on a previously-incomplete item →
         completed=true, completedAt set, completedById=null, Socket.io
         emitted with source: 'jira'
Test 6 — Same as Test 5, but the item has a resolvable linked commitment
         → commitmentsService.updateStatus called with FULFILLED and
         source: JIRA_REVERSE_SYNC
Test 7 — Linked commitment already FULFILLED via a different path →
         updateStatus's own transition guard rejects it, caught and
         logged at INFO, no exception propagates
```

### Registration Lifecycle (Integration)

```
Test 1 — Connect flow: registerWebhook() called exactly once, its
         returned webhookId + secret persisted into metadata
Test 2 — Disconnect flow: deregisterWebhook() called with the correct
         webhookId before the row is deleted
Test 3 — registerWebhook() failure during connect → the ENTIRE connect
         operation fails, no partial TeamIntegration row persisted
         (tokens without a registered webhook)
Test 4 — deregisterWebhook() returning a 404 (already removed) → treated
         as success, disconnect proceeds normally
Test 5 — RECONNECT after a NEEDS_RECONNECT auto-disable (Day 58 state) →
         registerWebhook() is NOT called a second time when
         metadata.jiraWebhookId already has a value (§17's explicit guard)
```

### End-to-End (Manual, Real Jira Cloud Sandbox)

```
Test 1 — Full loop: sync an action item to Jira (Day 58's flow) → mark
         the resulting ticket "Done" directly in the Jira UI → within a
         few seconds, observe (via Vocaply's dashboard or direct DB
         inspection) the action item flip to completed=true AND, if a
         linked commitment exists, that commitment flip to FULFILLED
Test 2 — Mark a ticket to a NON-complete status (e.g. "In Review") →
         confirm NO change occurs in Vocaply
Test 3 — Disconnect Jira, then check Jira's own webhook management UI
         (if accessible in the sandbox) to confirm the webhook
         subscription is genuinely gone, not just locally forgotten
Test 4 — Reconnect → verify exactly ONE active webhook subscription
         exists afterward (not two), confirming §17's duplicate-
         registration guard held in a REAL reconnect, not just a mocked
         unit test
```

---

## 27. End-of-Day Checklist

```
SCHEMA
  [ ] Resolved §5's linkedCommitmentId ambiguity against the ACTUAL
      current schema before writing cascade logic — documented which
      path (A or B) was true and why

REUSABILITY PROOF (THE HEADLINE DELIVERABLE)
  [ ] webhooks.routes.ts diff contains ONLY the new POST /jira line —
      zero changes to rawBodyMiddleware or any shared function
  [ ] verifyJiraSignature() calls the SAME underlying constant-time
      comparison utility as verifyRecallSignature() — no duplicated
      crypto logic
  [ ] Idempotency key namespace (webhook:processed:jira:*) follows the
      EXACT SAME convention as Recall.ai/Stripe — confirmed via code
      review, not just described

WEBHOOK REGISTRATION LIFECYCLE
  [ ] registerWebhook() called exactly once per fresh connect
  [ ] registerWebhook() failure blocks the ENTIRE connect flow (no
      partial/broken integration persisted)
  [ ] deregisterWebhook() called before every disconnect's row deletion
  [ ] 404 from deregisterWebhook() treated as success
  [ ] Reconnect after auto-disable does NOT create a duplicate webhook
      (explicit guard verified against a real Jira sandbox, §26)

SECURITY
  [ ] teamId query param NEVER used to authorize a write before HMAC
      verification succeeds (§13, code-reviewed line by line)
  [ ] jiraWebhookSecret is AES-256-GCM encrypted (per §18's explicit
      decision), NOT plaintext in metadata — spot-checked in the database
  [ ] Signature failures logged as a DISTINCT security event, not a
      generic error
  [ ] Assignee data from the webhook payload is never read for any
      mutating purpose — grep to confirm

BUSINESS LOGIC
  [ ] Cross-tenant explicit check present even though structurally
      near-impossible (defense in depth, §9 Step 3)
  [ ] completedById is null (not the initiating admin, not a system user
      row) for Jira-originated completions
  [ ] No-op short-circuit correctly prevents redundant writes for
      already-matching states
  [ ] Commitment cascade correctly triggers ONLY when isNowComplete AND
      a linked commitment resolves
  [ ] Commitment cascade's race-condition rejection (already-fulfilled
      via another path) is caught and logged at INFO, never crashes the
      webhook processing

OBSERVABILITY
  [ ] All 8+ structured log events (§21) verified present in actual log
      output during the manual E2E test
  [ ] CRITICAL alert rule for signature-failure spikes registered

FRONTEND
  [ ] ActionItemCard renders the "Synced from Jira" badge correctly when
      source: 'jira' is present on the most recent update

SIGN-OFF
  [ ] Full manual E2E test pass completed against a REAL Jira Cloud
      sandbox: sync → mark Done in Jira → action item AND linked
      commitment both update automatically in Vocaply
  [ ] Security review pass completed: spoofed teamId, tampered
      signature, and replayed payload all correctly rejected/deduplicated
```

---

## 28. Risks & Edge Cases Register

```
RISK                                          MITIGATION / DISPOSITION
─────────────────────────────────────────────────────────────────────────────
Jira's exact webhook signing-secret            Flagged explicitly (§6,
registration API shape differs from            §10) as resolved AT
what was assumed during planning               IMPLEMENTATION TIME against
                                               Jira Cloud's current live
                                               documentation, with a
                                               documented fallback
                                               approach if a native
                                               signing parameter isn't
                                               available in the exact
                                               form expected

Team using a fully custom Jira workflow        Accepted, documented
scheme where none of "Done"/"Closed"/          limitation (§15) — benign
"Resolved" appear as literal status names      no-op, not a failure;
                                               explicit near-term
                                               follow-up design already
                                               sketched for when this
                                               becomes a real, observed
                                               need

Two commitment-fulfillment signals             Explicitly handled as an
racing (Jira webhook arrives moments           expected, benign race
after a human manually marks the same          (§14, §20) — the existing
commitment fulfilled in Vocaply's own UI)      transition-validation
                                               logic in Day 19's
                                               updateCommitmentStatus
                                               already rejects the
                                               redundant second attempt
                                               correctly; today's only
                                               job is to not let that
                                               expected rejection crash
                                               webhook processing

Reconnect-triggered duplicate webhook          Explicitly guarded (§17,
registration on Jira's side                    tested in §26) — checked
                                               against metadata.jiraWebhookId
                                               presence before any new
                                               registration attempt

jiraWebhookSecret encryption decision           Resolved explicitly today
representing a deviation from Day 58's         (§18) as "encrypt it" —
"config vs secret" framing for other Jira      documented as an
metadata fields                                intentional refinement of
                                               that framing for THIS
                                               specific field, not an
                                               inconsistency with Day 58's
                                               stated principle (a
                                               cryptographic signing key
                                               is categorically a secret,
                                               regardless of which JSONB
                                               column structure happens
                                               to house it)

Jira issue moved between projects after        Handled correctly by
being synced (changing its issue.key           design — the idempotency
but not its internal issue.id)                 key uses issue.id (§11,
                                               explicitly justified for
                                               exactly this reason); the
                                               ACTION ITEM LOOKUP,
                                               however, still uses
                                               issue.key (jira_issue_id
                                               column) — if a ticket's
                                               KEY changes due to a
                                               project move, Vocaply's
                                               stored jira_issue_id
                                               becomes STALE and
                                               subsequent webhooks
                                               referencing the NEW key
                                               would fail the "action
                                               item not found" check
                                               (§9 Step 2) and be silently
                                               (correctly, per today's
                                               design) ignored — a
                                               genuine, if rare, gap
                                               flagged here for future
                                               awareness rather than
                                               solved today, since
                                               resolving it would require
                                               tracking issue.id as the
                                               STORED linkage key instead
                                               of issue.key, a change to
                                               Day 58's already-shipped
                                               data model that is out of
                                               today's scope
```

---

*Document: DAY-59-PLAN-001 | Vocaply | Day 59: Jira Webhook (Inbound Reverse Sync)*
*Full Scalable Industry-Level Build Plan | Principal Backend Engineer Edition*
*Phase 5 — Integrations | Planning & Architecture Blueprint — No Code, Pure Design*
*Webhook infrastructure reuse · Advisory-not-authoritative tenancy · Idempotent inbound sync · Commitment cascade*
