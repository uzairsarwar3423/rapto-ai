
# Vocaply — Day 64: Token Refresh & Failure Alerting (Cross-Cutting Hardening)
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-64-PLAN-001 | Version 1.0 | Phase 5 — Integrations (Days 56–70)

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Why Reactive-Only Refresh Is Not Enough](#2-why-reactive-only-refresh-is-not-enough)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Layer 1 — Token Refresh Service](#4-layer-1--token-refresh-service)
5. [Layer 2 — Integration Health Service (Centralization)](#5-layer-2--integration-health-service-centralization)
6. [Layer 3 — Token Refresh Worker](#6-layer-3--token-refresh-worker)
7. [Layer 4 — Cron Scheduler Registration](#7-layer-4--cron-scheduler-registration)
8. [Layer 5 — Retrofit of Existing Call Sites](#8-layer-5--retrofit-of-existing-call-sites)
9. [Layer 6 — Email Notification Templates](#9-layer-6--email-notification-templates)
10. [Layer 7 — Notification Dispatch Integration](#10-layer-7--notification-dispatch-integration)
11. [The Two-Stage Escalation Model](#11-the-two-stage-escalation-model)
12. [Provider Expiry Matrix — Who Actually Needs This](#12-provider-expiry-matrix--who-actually-needs-this)
13. [Data Model & Schema Considerations](#13-data-model--schema-considerations)
14. [Concurrency, Fan-Out & Job Design](#14-concurrency-fan-out--job-design)
15. [Idempotency & Duplicate-Alert Prevention](#15-idempotency--duplicate-alert-prevention)
16. [Security Architecture](#16-security-architecture)
17. [Performance Architecture](#17-performance-architecture)
18. [Caching Strategy](#18-caching-strategy)
19. [Error Handling & Failure Classification](#19-error-handling--failure-classification)
20. [Observability & Logging](#20-observability--logging)
21. [Reconnect Recovery Flow](#21-reconnect-recovery-flow)
22. [API Endpoints — Full Specification](#22-api-endpoints--full-specification)
23. [Frontend Integration Plan](#23-frontend-integration-plan)
24. [Types & Interfaces](#24-types--interfaces)
25. [Testing Plan](#25-testing-plan)
26. [End-of-Day Checklist](#26-end-of-day-checklist)
27. [Risks & Edge Cases](#27-risks--edge-cases)

---

## 1. Day Overview & Goals

### What Gets Built Today

Day 64 is a **cross-cutting hardening day**, structurally similar in spirit
to Day 57's dedup hardening pass — no new customer-facing provider is
added; instead, the platform's existing OAuth token-refresh behavior
(reactive-only, exercised by `getValidAccessToken()` since Day 60) is
extended with a **proactive, scheduled** refresh cron running across every
provider that genuinely has an expiring token, and a **centralized,
two-stage failure-escalation service** that turns "silently dead
integration" into "admin gets an email within one cron cycle." This is also
the day the consecutive-error/alerting logic — previously described only
in prose scattered across the Day 58, 60, 61, 62, and 63 documents — becomes
a single, real, shared implementation that every provider's failure path
retrofits onto, closing a category of drift risk this entire sprint has
been explicitly designed to avoid.

```
TODAY BUILDS:
  ✅ token-refresh.service.ts — proactive expiry-scan + refresh orchestration
  ✅ integration-health.service.ts — the SINGLE centralized consecutive-error
     counter, two-stage alerting escalation, used by every provider's
     failure path from this day forward
  ✅ token-refresh.worker.ts — new BullMQ worker, high concurrency,
     lightweight refresh-only jobs
  ✅ A new `token-refresh` queue + 15-minute cron fan-out in scheduler.ts
  ✅ RETROFIT of integrate.worker.ts (Jira/Linear/Notion) and
     calendar-sync.service.ts (Google/Outlook) failure paths to call the
     new centralized health service instead of any inline counter logic
  ✅ Two new React Email templates: IntegrationWarning.tsx,
     IntegrationDeactivated.tsx — the first ADMIN-FACING integration-health
     emails this platform has ever sent (previously: log line + a status
     flag only)
  ✅ Dedup-key discipline for both new notification types, matching the
     platform's existing notif:dedup:* convention
  ✅ Frontend: an integration-health indicator on the settings page
     surfacing consecutiveErrors/lastError/isActive state, plus a
     reconnect-recovery flow verified to correctly reset health state

DOWNSTREAM IMPACT:
  Day 65 — The composite integration test suite's "full deactivation →
           reconnect → resume" scenario is entirely built on top of today's
           work: it doesn't just test one provider's retry logic, it tests
           the SHARED health service's reset-on-reconnect behavior, which
           only exists because today centralizes what used to be
           per-provider, undertested prose.
  Day 66 (integrate.worker.ts hardening) — inherits a battle-tested,
           centralized failure-tracking mechanism rather than three
           independent, potentially-inconsistent implementations.
  Day 70 (weekly digest) — can now truthfully report integration sync
           health as a team-health signal, since reliable failure data is,
           for the first time, actually being collected consistently.

DO NOT SKIP OR RUSH:
  This is the day a silently-broken integration stops being silent. Every
  provider shipped in this sprint (Days 56–63) already has SOME failure
  path, but none of them alert a human proactively — they either retry
  forever, or flip an isActive flag nobody is watching. If today's
  centralization is done sloppily — e.g., if the retrofit of
  integrate.worker.ts or calendar-sync.service.ts is skipped or done
  inconsistently — the platform ends up with THREE slightly different
  definitions of "the integration is broken," which is precisely the
  fragmentation this hardening day exists to eliminate.
```

### 8-Hour Time Allocation

```
9:00 AM – 9:45 AM    → integration-health.service.ts — recordSuccess,
                        recordFailure, deactivateIntegration, the two-stage
                        threshold logic, dedup-key discipline for alert emails
9:45 AM – 10:30 AM   → token-refresh.service.ts — findExpiringIntegrations,
                        refreshIntegration (thin wrapper around
                        getValidAccessToken + health service calls)
10:30 AM – 11:15 AM  → token-refresh.worker.ts + token-refresh.job.ts payload
                        contract + queue registration in queue.client.ts
11:15 AM – 12:00 PM  → scheduler.ts — 15-minute cron fan-out, jobId uniqueness,
                        retention settings
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 2:00 PM    → RETROFIT integrate.worker.ts's Jira/Linear/Notion
                        failure branches to call integration-health.service.ts
                        exclusively — remove any inline counter logic found
2:00 PM – 2:45 PM    → RETROFIT calendar-sync.service.ts's Google/Outlook
                        failure path identically
2:45 PM – 3:30 PM    → IntegrationWarning.tsx + IntegrationDeactivated.tsx
                        email templates + notify.worker.ts dispatch wiring
3:30 PM – 4:00 PM    → Reconnect-recovery flow: confirm health state resets
                        correctly on a fresh OAuth callback for any provider
4:00 PM – 4:45 PM    → Frontend: settings-page integration-health indicator
                        (consecutiveErrors/lastError/isActive display)
4:45 PM – 5:30 PM    → Unit tests: two-stage threshold logic, dedup-key
                        behavior, findExpiringIntegrations() filtering
5:30 PM – 6:00 PM    → Integration tests: full escalation → email → reconnect
                        → reset cycle, per-provider retrofit verification,
                        checklist review + sign-off
```

---

## 2. Why Reactive-Only Refresh Is Not Enough

### The Gap, Restated Precisely

`getValidAccessToken()` (built Day 60) is **correct but lazy** — it checks
token expiry only at the moment some other piece of work actually needs a
token: an action-item sync, a calendar sync. This is entirely adequate for
the *common* case (a token nearing expiry, refresh token still valid — the
refresh happens transparently, adding negligible latency to that one job).
It is **not** adequate for the *failure* case, where the refresh token
itself has also become invalid — because a user revoked access in the
provider's own UI, an admin rotated Vocaply's OAuth app credentials, or a
password change forced re-authentication upstream. In the reactive-only
world, this failure is discovered **only when real work happens to be
queued**, and for a low-activity team (say, a team that syncs one Jira
ticket every few days), that could mean the integration has been silently
dead for the better part of a week before anyone — Vocaply or the customer
— has any signal something is wrong.

### The Two Things Today Adds, Named Explicitly

```
ADDITION 1 — PROACTIVE DISCOVERY
  A scheduled sweep, independent of any real user-facing job, checks every
  integration's expiry on a fixed 15-minute cadence and attempts a refresh
  regardless of whether anything currently needs that token. This moves
  failure discovery from "whenever the next real job happens to run" to
  "within 15 minutes of the token actually going bad," a categorically
  faster and more predictable detection window.

ADDITION 2 — ESCALATING, ADMIN-FACING ALERTING
  Previously, a broken integration's only externally-visible signal was a
  database row (isActive: false) nobody was actively watching, reachable
  only by opening the settings page and specifically looking. Today
  introduces a genuine PUSH signal — two real emails, at two different
  severity stages — so an admin learns about the problem without having to
  go looking for it.
```

### Why This Is a Hardening Day, Not a New Feature Day

No new third-party provider is connected today, no new customer-visible
sync capability is added. The entire scope of today's work is making
**existing** functionality (five providers' worth of OAuth token
lifecycles, built across Days 56–63) more reliable and more observable —
exactly the same category of work Day 57 performed for deduplication after
Day 56 shipped calendar sync. This framing matters for scoping: today's
work is judged successful by *how much duplicated logic it eliminates and
how much faster failures surface*, not by how many new API endpoints it
introduces.

---

## 3. File Structure to Create

```
services/api/src/
│
├── services/
│   ├── token-refresh.service.ts               ← NEW — proactive scan + refresh
│   └── integration-health.service.ts            ← NEW — centralized escalation logic
│
├── queues/
│   ├── workers/
│   │   └── token-refresh.worker.ts              ← NEW
│   ├── jobs/
│   │   └── token-refresh.job.ts                 ← NEW — payload contract
│   ├── queue.client.ts                           ← MODIFY — register token-refresh queue
│   └── scheduler.ts                              ← MODIFY — 15-minute cron fan-out
│
├── modules/
│   ├── integrations/
│   │   ├── integrate.worker.ts                   ← RETROFIT — Jira/Linear/Notion
│   │   │                                             failure branches call the health
│   │   │                                             service exclusively
│   │   └── integrations.repository.ts              ← MODIFY — no schema change; confirm
│   │                                                   updateIntegrationRow() helper
│   │                                                   used generically for both
│   │                                                   TeamIntegration and UserIntegration
│   │
│   └── notifications/
│       ├── notifications.service.ts                ← MODIFY — dispatch the two new
│       │                                                notification types
│       └── templates/
│           ├── IntegrationWarning.tsx                ← NEW — React Email template
│           └── IntegrationDeactivated.tsx             ← NEW — React Email template
│
├── services/
│   └── calendar-sync.service.ts                    ← RETROFIT — Google/Outlook failure
│                                                        path calls the health service
│                                                        exclusively
│
└── config/
    └── notification-dedup.config.ts                  ← MODIFY — TTL constants for the
                                                            two new dedup key namespaces
                                                            (reused existing config file,
                                                             not a new one)

services/api/tests/
├── unit/
│   ├── integration-health.test.ts                    ← NEW
│   └── token-refresh-service.test.ts                  ← NEW
└── integration/
    ├── token-refresh-e2e.test.ts                       ← NEW (full cron → worker →
    │                                                         health service → email cycle)
    └── integration-retrofit.test.ts                     ← NEW — confirms integrate.worker.ts
                                                              and calendar-sync.service.ts
                                                              both route failures through the
                                                              SAME shared service, not
                                                              parallel implementations

apps/web/src/features/integrations/
├── components/
│   └── IntegrationHealthBadge.tsx                     ← NEW — shared status indicator,
│                                                            used by every provider card
│                                                            (Jira/Linear/Notion/Slack/
│                                                             Google/Outlook)
└── hooks/
    └── useIntegrationHealth.ts                         ← NEW — reads consecutiveErrors/
                                                              lastError/isActive per integration
```

### Dependency Flow (No Circular Deps)

```
queues/scheduler.ts (15-min cron)
  └── token-refresh.service.ts
        └── findExpiringIntegrations()   (Prisma queries — team + user integrations)
        └── (fans out jobs to) token-refresh queue

queues/workers/token-refresh.worker.ts
  └── token-refresh.service.ts
        └── refreshIntegration()
              ├── getValidAccessToken()            (Day 60 shared helper — UNCHANGED)
              └── integration-health.service.ts
                    ├── recordSuccess()
                    └── recordFailure()
                          ├── sendIntegrationWarningEmail()   → notifications.service.ts
                          └── deactivateIntegration() + sendIntegrationDeactivatedEmail()

integrate.worker.ts (Jira/Linear/Notion, RETROFITTED)
  └── integration-health.service.ts   (same instance, same functions — no
                                        provider-specific alerting code remains
                                        inside integrate.worker.ts itself)

calendar-sync.service.ts (Google/Outlook, RETROFITTED)
  └── integration-health.service.ts   (identical retrofit)
```

---

## 4. Layer 1 — Token Refresh Service

### File: `services/token-refresh.service.ts`

**Responsibility:** Two functions and nothing else — discover which
integrations are approaching token expiry, and attempt to refresh a single
given integration, reporting the outcome to the health service. This file
deliberately contains **no OAuth logic of its own** — it is a thin
orchestration layer sitting entirely on top of infrastructure that already
exists.

### Function: `findExpiringIntegrations()`

Runs two Prisma queries — one against `TeamIntegration`, one against
`UserIntegration` — each filtered to rows that are currently considered
"live" (`isActive: true` for team integrations, `syncEnabled: true` for
user/calendar integrations) **and** whose `tokenExpiresAt` falls within a
configurable lookahead window (30 minutes, chosen to comfortably precede
the shortest-lived token type in the provider matrix — see Section 12 —
while not being so wide that the same integration gets repeatedly
re-queued across many consecutive cron cycles before it actually needs
refreshing).

**Critical filtering detail, stated explicitly**: `tokenExpiresAt: { not:
null }` is part of both queries — a row with a `null` expiry (Linear,
Notion, Slack — see Section 12) is structurally excluded from ever being
selected by this scan, meaning the proactive refresh mechanism naturally
and correctly does nothing for providers that don't need it, with zero
provider-name-based conditional logic anywhere in this function. The
`null`-expiry convention established across Days 60–62 is what makes this
filtering trivially correct today.

### Function: `refreshIntegration(integration)`

Accepts either a `TeamIntegration` or `UserIntegration` row (a union type,
reflecting that refresh logic is identical regardless of which table the
row came from — the distinction only matters for persistence, which
`getValidAccessToken()` already handles internally). Wraps a single call to
the existing, unmodified `getValidAccessToken()` helper in a try/catch:

- On success, calls `integrationHealthService.recordSuccess(integration)`
  and returns a success result.
- On any thrown error, extracts a human-readable message, calls
  `integrationHealthService.recordFailure(integration, message)`, and
  returns a failure result (never re-throws past this point — the calling
  worker logs the outcome and moves to the next job; a single integration's
  refresh failure must never crash the worker process or block other
  integrations' refresh attempts in the same cron cycle).

### Why This File Contains No Retry Logic of Its Own

`getValidAccessToken()` internally dispatches to each provider's own
`refreshAccessToken()` implementation, which in turn goes through the
platform's standard HTTP-call conventions (timeout, and — depending on the
provider — its own transient-failure handling, e.g., MSAL's internal retry
behavior for Outlook). Layering a *second*, independent retry mechanism on
top of that inside `token-refresh.service.ts` would risk unpredictable
combined backoff behavior and duplicate the responsibility Section 6.6 of
the original design already correctly assigns elsewhere: **the cron job
itself does not retry** — a failed proactive check simply waits for the
next 15-minute cycle, which is an acceptable cadence for a background
health check, not a user-facing action requiring aggressive in-line retry.

---

## 5. Layer 2 — Integration Health Service (Centralization)

### File: `services/integration-health.service.ts`

**Responsibility:** The single, authoritative implementation of
"what does it mean for an integration to be healthy or unhealthy, and what
happens as it degrades." This is the day's most important architectural
deliverable — more important, in terms of long-term platform integrity,
than the cron itself — because it replaces what has been, since Day 58,
**prose describing a pattern each provider was expected to independently
implement** with **one real, shared, tested implementation every provider
retrofits onto.**

### Function: `recordSuccess(integration)`

A defensively-written no-op-fast-path function: if the integration's
current `consecutiveErrors` is already `0` and `lastError` is already
`null`, the function returns immediately without issuing a database write
— because the overwhelming majority of calls to this function represent
the normal, healthy case (a sync or refresh that simply worked), and
issuing an UPDATE query for a no-change case at that volume would be
wasteful. Only when there is an actual state change to make (recovering
from a prior failed state) does it perform the UPDATE, resetting
`consecutiveErrors` to `0` and clearing `lastError`.

### Function: `recordFailure(integration, errorMessage)`

Increments `consecutiveErrors` by one and persists the provided
`errorMessage` into `lastError`, then evaluates the two-stage threshold
(full design in Section 11):

- At exactly the early-warning threshold, dispatches the
  `IntegrationWarning` notification (integration remains active and
  continues to be retried normally).
- At or beyond the final-deactivation threshold, calls
  `deactivateIntegration()` (setting `isActive: false` for team
  integrations, or the calendar-equivalent `syncEnabled: false` for user
  integrations) and dispatches the `IntegrationDeactivated` notification.

### Function: `deactivateIntegration(integration)`

A small, focused helper performing exactly one persistence operation —
flipping the appropriate "this integration should no longer be actively
used" flag — kept separate from `recordFailure()` itself so it can be
independently unit-tested and so the reconnect-recovery flow (Section 21)
has a single, obvious counterpart function to reason about when restoring
an integration to active status.

### The Retrofit Requirement, Stated as a Non-Negotiable Design Rule

As of the end of today, **every** provider's failure path — Jira, Linear,
and Notion inside `integrate.worker.ts`; Google and Outlook Calendar inside
`calendar-sync.service.ts` — calls `recordSuccess()`/`recordFailure()` from
this one file, and **none of them** maintain their own inline
`consecutiveErrors` increment logic, their own deactivation threshold
constant, or their own alert-email dispatch call. This is verified during
today's retrofit work (Section 8) as an explicit code-review gate: any
remaining inline counter-manipulation code discovered in a provider file
after today is treated as a defect to be removed, not a harmless
redundancy to leave alone, because redundant implementations of the same
logic are exactly how the two-stage thresholds (Section 11) would silently
drift out of sync between providers over time.

---

## 6. Layer 3 — Token Refresh Worker

### File: `queues/workers/token-refresh.worker.ts`

**Responsibility:** The BullMQ worker consuming the new `token-refresh`
queue. Deliberately minimal — its entire job is to look up the integration
referenced by the job payload, hand it to
`tokenRefreshService.refreshIntegration()`, and log the structured outcome.

### Design Decisions Specific to This Worker

**Higher concurrency than every other worker on the platform (10, versus
`integrate`'s 3 and `notify`'s 5)** — justified because refresh calls are
lightweight, purely network-bound operations with no heavy downstream
processing chained after them (unlike, say, `extract.worker.ts`'s AI
pipeline call or `integrate.worker.ts`'s full ticket-creation flow).
Running refresh checks promptly across what could be thousands of
integrations within a single 15-minute cron window matters more here than
conserving worker capacity for heavier work — and because this queue's job
count scales with the platform's total integration count (not with meeting
or action-item volume), a wider concurrency ceiling on this specific queue
does not meaningfully compete with the resource budget reserved for
higher-value work on other queues.

**A missing integration is a safe no-op, not an error** — if the job's
referenced `integrationId` no longer exists by the time the worker picks up
the job (the integration was disconnected in the window between the cron
fan-out and the job's execution), the worker simply returns without error.
This mirrors the exact "deleted since job was queued" defensive pattern
already established for `integrate.worker.ts`'s action-item lookups since
Day 58.

**No BullMQ-level retry configured for this worker's job type** — as
established in Section 4, a failed refresh attempt already has its outcome
recorded by the health service (which has its own, separate multi-cycle
escalation logic); adding BullMQ retries on top would mean a single actual
failure could trigger `recordFailure()` multiple times within seconds,
distorting the consecutive-error count in a way the health service's
threshold logic was not designed to absorb. The next *real* opportunity to
retry is simply the next 15-minute cron cycle, which naturally reconstructs
a fresh job.

---

## 7. Layer 4 — Cron Scheduler Registration

### File: `queues/scheduler.ts` (modified)

A new cron entry, running every 15 minutes, that calls
`findExpiringIntegrations()` and fans out one `token-refresh` job per
returned integration — deliberately **not** one mega-job that loops
internally over every expiring integration, for the identical
failure-isolation reasoning already established for Day 56's
calendar-sync cron fan-out: one slow or failing integration's refresh
attempt must never delay or block another's, and BullMQ's own concurrency
control (Section 6) is what actually throttles throughput, not manual
batching logic inside the cron handler itself.

### Job Uniqueness & Retention

Each fanned-out job's `jobId` incorporates the integration type, its ID,
and a timestamp — ensuring uniqueness across cron cycles (so a stalled
15-minute-old job from a prior cycle can never collide with a freshly
fanned-out job for the same integration) while still allowing BullMQ's own
duplicate-jobId protection to function correctly within a single fan-out
pass. `removeOnComplete`/`removeOnFail` retention limits mirror the same
bounded-Redis-memory discipline already applied to every other queue on
this platform (Day 18's original queue design principle, reaffirmed for
every queue added since).

### Fifteen Minutes as the Chosen Interval — Justification

Thirty minutes of lookahead combined with a 15-minute cron interval means
every expiring integration is guaranteed to be caught by **at least two**
consecutive cron passes before its token actually expires, providing a
built-in safety margin against any single cron cycle's own transient
issues (a Redis blip, a brief worker-pool restart during a deploy) without
requiring the interval to be aggressively tight. This ratio (lookahead
window at least double the poll interval) is stated explicitly as the
governing principle so a future adjustment to either constant is made
deliberately, preserving the same safety margin, rather than accidentally
narrowing it.

---

## 8. Layer 5 — Retrofit of Existing Call Sites

### Why This Section Exists Separately From "New Code"

The centralization described in Section 5 only delivers its intended value
if the code written across Days 58 through 63 is actually **updated** to
use it — otherwise today's work adds a fourth, unused implementation of
the same idea alongside three still-inconsistent existing ones. This
retrofit is treated as first-class scope for today, not optional
housekeeping squeezed in if time allows (reflected in the time allocation
in Section 1, which reserves two full dedicated blocks for it).

### Retrofit Target 1: `integrate.worker.ts`

Every failure branch across the Jira, Linear, and Notion sync paths
(non-retryable GraphQL/REST errors, retry-exhaustion after the existing
5-attempt policy) is updated to call
`integrationHealthService.recordFailure(integration, message)` as its
**sole** mechanism for tracking and escalating the failure — any inline
`consecutiveErrors + 1` arithmetic, any provider-specific "at 5 failures,
deactivate" conditional, and any direct email-sending call found inside
this file is removed and replaced with the single shared call. Successful
syncs are updated to call `recordSuccess()` at the point where a sync
completes without error, ensuring a team that fixes a broken Jira
connection sees their health state correctly reset on the very next
successful sync, not just on an explicit reconnect (Section 21 covers the
reconnect path specifically, but a successful *sync* recovering health
state independently is an equally important, separately-verified case).

### Retrofit Target 2: `calendar-sync.service.ts`

The identical retrofit, applied to the Google and Outlook Calendar failure
path established across Days 56 and 63 — any inline error-counting logic
inside `syncUserCalendar()`'s catch handling is replaced with calls into
the same shared health service. Because this function already dispatches
through the `CalendarProvider` registry (per Day 63's generalization), the
retrofit here requires no per-provider branching either — a single call
site, at the point where a sync attempt fails for whatever underlying
reason, is sufficient to cover both Google and Outlook.

### Verification Method

The retrofit is confirmed complete via an explicit code-review/text-search
checklist item (mirrored in Section 26): after today's changes, searching
either `integrate.worker.ts` or `calendar-sync.service.ts` for the literal
string `consecutiveErrors` should return **zero** matches outside of a
read-only reference (e.g., logging the current value for context) — any
assignment or increment of that field outside `integration-health.service.ts`
itself is treated as evidence the retrofit was incomplete.

---

## 9. Layer 6 — Email Notification Templates

### File: `templates/IntegrationWarning.tsx` (NEW)

A React Email template following the exact structural pattern already
established for the platform's existing 10 catalogued templates
(`CommitmentMissed.tsx`, `DeadlineReminder.tsx`, etc.) — shared header/
footer components, the platform's existing brand tokens, no bespoke
styling introduced. Content is parameterized by the specific provider name
and (where applicable) workspace/team display name, producing a message
along the lines of: *"We're having trouble connecting to your {provider}
integration — we'll keep retrying, but you may want to check your
connection in Settings."* Crucially, this template's tone is
**informational, not alarming** — the integration is still active and
still being retried at this stage, and the copy must not imply the
integration has already failed permanently, which is reserved for the
second template.

### File: `templates/IntegrationDeactivated.tsx` (NEW)

The second, higher-severity template, sent only once an integration has
been fully deactivated: *"Your {provider} integration has been disconnected
after repeated failures. Reconnect it in Settings to resume syncing."*
Includes a direct settings-page deep link as the call-to-action, following
the same "always give the recipient a one-click path to resolve the
problem" convention already used by every other action-oriented template
on the platform (e.g., `PlanLimit.tsx`'s upgrade link).

### Why Two Templates, Not One Parameterized Template

A single template with a "severity" flag was considered and rejected: the
two messages have genuinely different calls-to-action (one is "no action
required yet, just be aware," the other is "action required — reconnect
now") and different emotional registers appropriate to their stage. Two
small, purpose-built templates are more maintainable and less error-prone
than one template with conditional branching baked into its JSX,
consistent with the platform's general preference (seen elsewhere in this
sprint, e.g., Day 62's decision to keep Notion's block builders as small,
single-purpose pure functions) for composing simple pieces rather than
building one flexible-but-complex one.

---

## 10. Layer 7 — Notification Dispatch Integration

### Where the Dispatch Call Lives

`integration-health.service.ts`'s `recordFailure()` function, at the
appropriate threshold, calls into the existing `notifications.service.ts`
— the same central dispatch point every other notification type on this
platform already goes through (meeting summaries, commitment alerts,
weekly digests) — rather than calling the email-sending SDK
(`email.service.ts`'s Resend wrapper) directly. This preserves the
platform's existing single-dispatch-point architecture, meaning these two
new notification types automatically inherit every cross-cutting behavior
already built into that dispatch layer: preference-awareness (respecting
`notification_preferences`, in this case scoped to whoever holds an
ADMIN+ role on the affected team, since integration health is inherently
an administrative concern, not a general team notification), rate-limit
discipline, and the existing Redis-backed dedup-key check performed
*before* any send is attempted.

### Recipient Resolution

Unlike most existing notification types (which target a specific,
already-known user — a commitment's owner, a meeting's manager), these two
new types must first **resolve** who should receive them: every user
holding `ADMIN` or `OWNER` role on the affected team (for team-level
integrations — Jira, Linear, Notion, Slack) or the single connected user
themself (for user-level calendar integrations — Google, Outlook). This
resolution logic lives inside `notifications.service.ts`'s handling of
these two new types, following the same "the dispatch layer resolves
recipients, the health service just declares intent to notify" separation
of concerns already used for the existing `COMMITMENT_MISSED` type's
manager-fan-out logic (established back in the Day 12 LLD).

---

## 11. The Two-Stage Escalation Model

### Why Two Stages, Not One

A single fixed threshold ("deactivate and alert after N failures") forces
an unpleasant trade-off: set N low, and admins get alerted — and lose
functioning sync — over what might be a brief, self-resolving transient
issue (a provider's few-minutes-long outage); set N high, and a genuinely
dead integration goes unreported for a meaningfully long, silent stretch.
The two-stage model resolves this by decoupling **awareness** from
**action**:

```
STAGE 1 — EARLY WARNING (at 3 consecutive failures)
  Integration remains ACTIVE. Sync/refresh attempts continue normally on
  their existing retry cadence. The ONLY effect of crossing this threshold
  is a single informational email to the admin — nothing about the
  integration's operational behavior changes. This exists purely to give a
  human a heads-up before things get worse, while there is still a real
  chance the underlying issue self-resolves (e.g., a provider's transient
  5xx spike) without ever reaching stage 2.

STAGE 2 — FINAL DEACTIVATION (at 5 consecutive failures)
  Integration is marked inactive. Further sync/refresh attempts against it
  STOP (no more wasted API calls or worker cycles against a token/connection
  that has now failed enough times to be treated as genuinely broken, not
  transient). A second, higher-urgency email is sent, this time with an
  explicit required action (reconnect).
```

### Why These Specific Numbers (3 and 5)

The final-deactivation threshold of 5 is not new today — it is the
pre-existing value already documented (in prose only) since Day 58's Jira
work and echoed in the platform's original HLD. Today's contribution is
formalizing it as a real, enforced constant inside the centralized service,
and introducing the *earlier* threshold of 3 specifically because it sits
meaningfully before the final threshold (giving stage 1 room to matter,
rather than being reached simultaneously with deactivation) while still
representing a genuine pattern of repeated failure rather than a single
blip (one or two consecutive failures is common and expected noise for any
network-dependent system; three in a row is a more credible signal
something is systemically wrong).

### Why the Counter Resets Fully on Success, Not Partially

`recordSuccess()` resets `consecutiveErrors` to exactly `0`, not merely
decremented — a single successful sync/refresh after a string of failures
is treated as full recovery for alerting purposes, because the underlying
condition being tracked ("is this credential currently usable right now")
is binary at any given moment; a decayed/partial-credit counter would add
complexity without a corresponding product benefit, and could produce
confusing behavior (an integration hovering permanently just below the
warning threshold despite being functionally healthy) that a simple
reset-on-success avoids entirely.

---

## 12. Provider Expiry Matrix — Who Actually Needs This

### The Full Picture, Stated Explicitly (Restated and Formalized Today)

```
PROVIDER            TOKEN EXPIRES?   PROACTIVE REFRESH APPLIES?   NOTES
──────────────────────────────────────────────────────────────────────────
Google Calendar      YES              YES                          Typical
                                                                    access
                                                                    token
                                                                    lifetime:
                                                                    ~1 hour
Outlook Calendar     YES              YES                          Similar
                                                                    lifetime
                                                                    range via
                                                                    MSAL/Graph
Jira                 YES              YES                          Atlassian
                                                                    OAuth 2.0
                                                                    (3LO)
                                                                    access
                                                                    tokens
                                                                    expire;
                                                                    refresh
                                                                    token flow
                                                                    already
                                                                    built
                                                                    Day 58
Linear                NO              NO — excluded by the
                                       null-tokenExpiresAt filter    Confirmed
                                                                    Day 61
Notion                NO              NO — excluded identically     Confirmed
                                                                    Day 62
Slack                 NO              NO — excluded identically     Bot
                                                                    tokens,
                                                                    confirmed
                                                                    Day 60
```

### Why This Matrix Matters for Today's Design

`findExpiringIntegrations()` (Section 4) requires **zero** provider-name
awareness to correctly include only Google, Outlook, and Jira, and exclude
Linear, Notion, and Slack — the filtering is entirely a function of whether
`tokenExpiresAt` is populated, a property each provider's own
`exchangeCodeForTokens()`/`refreshAccessToken()` implementation already
determines correctly and consistently (established across Days 58, 60, 61,
and 62). This is the third or fourth time this sprint that a
provider-count-scaling design decision (Days 58/61/62's registry pattern,
Day 63's `CalendarSyncResult` shared-signal pattern) has paid off by
letting a cross-cutting mechanism remain simple specifically because each
individual provider correctly reported its own properties from the start.

### Slack, Linear, and Notion Are Still Monitored — Just Not Refreshed

It's worth stating explicitly: excluding these three providers from the
*proactive refresh cron* does not mean their health is unmonitored — their
tokens can still be **revoked or invalidated at the provider's end** at any
time (a user disabling the Vocaply app in their Slack workspace, for
example), and any resulting failure during an actual sync attempt still
flows through the same `integration-health.service.ts` failure path
established in Section 5 and retrofitted in Section 8. Today's proactive
cron specifically addresses *expiry-driven* failure; provider-side
*revocation* failure for non-expiring-token providers is still caught
reactively, by the same centralized health service, just not pre-emptively
polled for.

---

## 13. Data Model & Schema Considerations

No new database migration is required today — every column this feature
needs (`consecutiveErrors`, `lastError`, `isActive`/`syncEnabled`,
`tokenExpiresAt`) already exists on both `TeamIntegration` and
`UserIntegration`, per the Day 3 schema, specifically because those columns
were originally provisioned in anticipation of exactly this kind of
health-tracking work.

### The `updateIntegrationRow()` Internal Helper

`integration-health.service.ts` uses a small internal helper capable of
persisting the relevant fields onto **either** table shape
(`TeamIntegration` or `UserIntegration`) via a discriminated update path —
avoiding the need for two near-duplicate versions of `recordSuccess()`/
`recordFailure()`, one per table. This mirrors the same "generic union-type
handling" pattern already used by `getValidAccessToken()` since Day 60.

### No New Redis-Backed State for Health Tracking Itself

Deliberately, `consecutiveErrors`/`lastError`/`isActive` remain
**database-backed**, not cached or tracked in Redis — this is a correctness
decision, not an oversight: health state must survive a Redis flush or
restart without losing an integration's accumulated failure history, and
must be readable directly by the settings-page frontend via a normal
authenticated API call without requiring any Redis-specific read path. Only
the *notification dedup keys* (Section 15) — which are appropriately
ephemeral, TTL-bound state — live in Redis, exactly matching the platform's
existing convention of using Postgres for durable state and Redis for
short-lived coordination/dedup state.

---

## 14. Concurrency, Fan-Out & Job Design

### Fan-Out Volume Estimate

At the scale figures already established elsewhere in the platform's
capacity-planning documents (10,000 teams), the number of integrations
subject to proactive refresh at any given 15-minute window is bounded by
how many teams/users have an active Google/Outlook/Jira connection with a
token expiring in the next 30 minutes — realistically a small fraction of
the total integration count at any single point in time, given that token
lifetimes (roughly 30–60 minutes) mean each integration only falls inside
the lookahead window for a portion of each hour. The fan-out-per-integration
design (Section 7) combined with 10x worker concurrency (Section 6)
comfortably absorbs this volume without requiring any additional batching
or sharding logic today — a scale threshold worth revisiting only if actual
production metrics show otherwise, not pre-optimized against speculatively.

### Why Fan-Out, Not a Single Looping Job (Restated for This Specific Queue)

Identical reasoning to Day 56's calendar-sync cron and Day 57's dedup
hardening: a single mega-job looping over thousands of integrations
sequentially would mean one slow provider's response time serializes and
delays every other integration's refresh check behind it, and a crash
partway through the loop would lose visibility into which integrations
were and weren't yet checked in that cycle. Individual jobs, tracked
independently by BullMQ with their own success/failure state, avoid both
problems entirely.

---

## 15. Idempotency & Duplicate-Alert Prevention

### The Problem Being Solved

An integration stuck at exactly 3 (or exactly 5+) consecutive failures
could, without protection, generate a fresh alert email on **every**
subsequent failed attempt for as long as it remains broken — an integration
failing every 15-minute cron cycle for a week would otherwise produce
dozens of near-identical warning emails, actively training admins to ignore
them (the opposite of the goal).

### The Mechanism

Two new Redis dedup-key namespaces, following the platform's existing
`notif:dedup:{type}:{recipientScope}:{resourceId}` convention exactly:

```
notif:dedup:INTEGRATION_WARNING:{teamOrUserId}:{integrationId}      TTL 86400s (24h)
notif:dedup:INTEGRATION_DEACTIVATED:{teamOrUserId}:{integrationId}  TTL 86400s (24h)
```

Because `recordFailure()` only *attempts* to send an alert at the exact
moment the counter **crosses** a threshold (checked via an equality/
inequality comparison against the specific threshold values, not "greater
than or equal to" evaluated on every single failure), a naturally-occurring
structural protection already exists: an integration stuck at, say, 7
consecutive failures does not re-trigger the deactivation email on every
subsequent failed cron cycle, because the deactivation branch only fires
once, at the point of crossing into `isActive: false` — after that, the
proactive refresh cron's `findExpiringIntegrations()` query naturally stops
selecting it at all (Section 4's `isActive: true` filter), meaning no
further failure recording happens against it until a reconnect occurs. The
24-hour dedup TTL is a **secondary** defense specifically covering the
narrower edge case of an integration recovering, failing again, and
crossing the *same* threshold a second time within a short window
(e.g., recovers briefly, then breaks again within the same day) — ensuring
even that scenario doesn't produce an unnecessary duplicate email within
one calendar day.

---

## 16. Security Architecture

### No New OAuth Surface Introduced

This is stated explicitly as a design constraint, not merely an
observation: today's work introduces zero new token-exchange code, zero
new client secrets, and zero new external API calls beyond what
`getValidAccessToken()` already performs. The token-refresh cron and its
worker are purely a *scheduling and orchestration* layer sitting on top of
already-hardened, already-security-reviewed OAuth infrastructure —
minimizing today's security review surface to the health-tracking and
alerting logic itself, not the OAuth mechanics.

### Recipient Resolution Cannot Leak Cross-Tenant Data

The recipient-resolution logic described in Section 10 (finding
`ADMIN`/`OWNER` role holders for a team-level integration) must query
strictly scoped to the *specific* team the failing integration belongs to
— reusing the exact same tenant-isolation query pattern (`WHERE team_id =
?`) already enforced everywhere else on the platform, never a broader
"find admins" query that could theoretically span teams if written
carelessly.

### Error Messages Persisted in `lastError` Must Not Leak Secrets

Because `lastError` (a plain, unencrypted text column, readable via the
settings-page API) stores the raw error message surfaced by a failed
refresh attempt, provider error responses must be sanitized before being
passed into `recordFailure()` — specifically, this reuses the exact
"never log/persist the raw Authorization header or token value" discipline
already established across every provider integration this sprint (first
formalized Day 17 for Recall.ai, reinforced for every provider since). A
provider's own error response occasionally including a fragment of request
context is a known risk category; each provider's own `refreshAccessToken()`
error-handling (already built in prior days) is responsible for producing a
clean, credential-free message before it ever reaches this shared service —
today's work does not re-sanitize at this layer, but explicitly documents
this as an upstream responsibility each provider file must already satisfy,
verified via a dedicated test case (Section 25).

### Email Content Security

Both new email templates interpolate only non-sensitive values (provider
name, workspace/team display name, a settings deep-link) — never the
`lastError` message's raw content is included in the outbound email body,
specifically to avoid ever transmitting a potentially-sensitive provider
error string to an inbox; the full error detail remains available only via
the authenticated settings-page API for an admin who chooses to
investigate further.

---

## 17. Performance Architecture

### Why the Cron's Query Cost Is Bounded

`findExpiringIntegrations()`'s two Prisma queries filter on indexed columns
(`isActive`/`syncEnabled` combined with `tokenExpiresAt`, both already
covered by existing indexes per the Day 3 schema and Day 57's index-review
discipline) — the query cost scales with the number of integrations
currently inside the lookahead window, not with the platform's total
integration count, keeping this cron cheap even as the platform's overall
customer base grows.

### No Added Latency to Any User-Facing Request Path

This entire feature operates exclusively inside background cron/worker
infrastructure — no synchronous HTTP request handler on this platform calls
into `token-refresh.service.ts` or `integration-health.service.ts`'s
alerting logic directly (the settings-page health-indicator endpoint,
Section 22, reads already-persisted state via a simple row lookup, never
triggering a live refresh or health recalculation inline). This preserves
the platform-wide principle (stated repeatedly since the HLD's original
architecture philosophy) that heavy or uncertain-latency work never blocks
a request-response cycle.

### Worker Concurrency Tuning Is Environment-Driven, Not Hardcoded

Consistent with the platform's existing convention (already applied to
every other worker's concurrency setting since Day 18), the
`token-refresh` worker's concurrency value is exposed as a configurable
setting rather than a hardcoded literal buried in the worker file, allowing
it to be tuned per deployment size without a code change.

---

## 18. Caching Strategy

```
CACHE KEY                                                    TTL      PURPOSE
──────────────────────────────────────────────────────────────────────────
notif:dedup:INTEGRATION_WARNING:{scopeId}:{integrationId}    86400s   Prevents duplicate
                                                                       early-warning emails
notif:dedup:INTEGRATION_DEACTIVATED:{scopeId}:{integrationId} 86400s   Prevents duplicate
                                                                       deactivation emails

No new caching is applied to:
  - Integration health state itself (consecutiveErrors/lastError/isActive) —
    deliberately database-backed only, per Section 13's correctness rationale
  - findExpiringIntegrations() query results — always run fresh each cron
    cycle; caching this would risk staleness in exactly the class of check
    (is a token about to expire RIGHT NOW) where staleness defeats the
    feature's purpose
```

---

## 19. Error Handling & Failure Classification

### This Feature's Own Failure Modes

Unlike every prior integration day, today's subject matter is itself an
*error-handling* system — meaning its own failure modes deserve explicit
treatment:

```
CONDITION                                    HANDLING
──────────────────────────────────────────────────────────────────────────
token-refresh.worker.ts throws an
  unexpected (non-provider) error              Logged with full context via the
  (e.g., a database connectivity blip           standard structured-logging
  during recordFailure's own UPDATE)            convention; the job fails and is
                                                NOT retried at the BullMQ level
                                                (per Section 6's reasoning) —
                                                surfaces again naturally on the
                                                next 15-minute cron cycle
Notification dispatch itself fails
  (e.g., Resend is down) while attempting       Per the platform's existing
  to send an IntegrationWarning/                Day 18 principle ("Socket.io
  IntegrationDeactivated email                  emission failures never block
                                                the underlying state update"),
                                                a failed alert-email dispatch
                                                must NOT prevent the
                                                consecutiveErrors/isActive
                                                state change itself from being
                                                persisted — the health state
                                                is the source of truth; the
                                                email is a best-effort
                                                notification layered on top
Cron fan-out itself fails partway through
  (e.g., Redis becomes briefly unavailable
  after some jobs were already queued)          The next cron cycle
                                                re-evaluates ALL currently-
                                                expiring integrations from
                                                scratch (a fresh query, not a
                                                resumed one) — since the
                                                lookahead window guarantees
                                                at least two cycles of
                                                coverage (Section 7), a single
                                                interrupted fan-out is
                                                self-healing on the next pass
```

---

## 20. Observability & Logging

### Structured Log Fields

Every refresh attempt (successful or not) logs, at minimum: the
integration type (team/user), the integration ID, the provider name, the
outcome, and — on failure — the sanitized error message. Every threshold
crossing (into stage 1 warning, into stage 2 deactivation) is logged as a
distinct, clearly-labeled structured event, separate from the routine
per-attempt log line, so a dashboard or alert rule can be built
specifically around threshold-crossing events without needing to infer them
from raw counter values.

### New Metrics

```
token_refresh.scan.integrations_found        Gauge/count per cron cycle —
                                              how many integrations were
                                              inside the lookahead window
token_refresh.attempt.success                Counter, tagged by provider
token_refresh.attempt.failure                Counter, tagged by provider
integration_health.warning_triggered         Counter, tagged by provider —
                                              a sudden spike here across
                                              MANY different teams/users
                                              simultaneously is a strong
                                              signal of a PROVIDER-SIDE
                                              outage, not isolated customer
                                              misconfigurations, and should
                                              be treated as an operational
                                              alert in its own right
integration_health.deactivated               Counter, tagged by provider
```

These feed the same Grafana dashboard already tracking every individual
provider's success/failure counters from Days 58–63 — today's metrics are
explicitly the **cross-provider rollup view** that becomes possible only
because the underlying tracking is now centralized.

### What Is Never Logged

The raw token value at any stage (already guaranteed by every provider's
own existing discipline), and the full unsanitized provider error body
beyond the already-sanitized message stored in `lastError` — consistent
with every prior day's PII/secret-handling standard.

---

## 21. Reconnect Recovery Flow

### The Problem This Section Closes

A deactivated integration (`isActive: false` /
`syncEnabled: false`) is, by design, no longer touched by either the
proactive refresh cron (Section 4's filter excludes it) or by any real
sync attempt (the existing per-provider service logic, since Day 58,
already checks `isActive` before attempting work). This means its health
state — `consecutiveErrors`, `lastError` — would otherwise remain frozen
at its failed values **forever**, even after an admin successfully
reconnects, unless something explicitly resets it.

### The Fix: Every OAuth Callback Resets Health State

Every provider's `handleOAuthCallback()` (Jira, Linear, Notion, Slack,
Google Calendar, Outlook Calendar — all six, established across Days
56–63) is confirmed today to call `integrationHealthService.recordSuccess()`
as part of a successful callback's persistence sequence — not merely
re-creating or updating the `TeamIntegration`/`UserIntegration` row with a
fresh token, but explicitly clearing `consecutiveErrors` to `0` and
`lastError` to `null`, and setting `isActive`/`syncEnabled` back to `true`.
This is verified today as a **cross-provider consistency check**: since
five of these six OAuth callback flows were built in prior days (56, 58,
60, 61, 62) before `integration-health.service.ts` existed, this is
effectively a sixth, final retrofit pass — every existing
`handleOAuthCallback()` implementation across the platform is updated
today to call this one new reset function, using the exact same "the
persistence/service layer, never the provider file itself, owns this
call" pattern established for the rest of today's centralization.

### Why This Matters for the Day 65 Composite Test

Day 65's planned "full deactivation → reconnect → resume flow" composite
test scenario is only meaningful if reconnect genuinely restores an
integration to a state indistinguishable from one that was never broken —
today's work is what makes that true, closing what would otherwise be a
silent gap where a reconnected integration technically syncs again but
carries stale, confusing failure history forward indefinitely.

---

## 22. API Endpoints — Full Specification

Today introduces **read-only** visibility into integration health, layered
onto the existing settings endpoints from prior days — no new mutation
endpoints are introduced, since health state is entirely
system-maintained, never client-writable.

### `GET /api/v1/integrations` (existing endpoint, response extended)

**Auth:** JWT required | **Role:** ADMIN+ (team integrations) or any
authenticated user (own calendar integration)

**Response addition:** each returned integration summary object now
includes `consecutiveErrors: number`, `lastError: string | null`, and
`isActive: boolean` (or the calendar-equivalent `syncEnabled`) — fields
that already existed in the database since Day 3 but were not previously
surfaced through this endpoint's response shape, since there was no
meaningful use for them on the frontend before today's centralized
tracking made the data trustworthy and consistent across every provider.

**No new error responses** — this is a pure additive response-shape
change to an existing, already-tested endpoint.

---

## 23. Frontend Integration Plan

### Component: `IntegrationHealthBadge.tsx`

A single, small, shared status-indicator component — deliberately built
**once** and used by every provider's settings card (Jira, Linear, Notion,
Slack, Google Calendar, Outlook Calendar), rather than each card
implementing its own status-display logic. Renders one of three visual
states derived from `consecutiveErrors`/`isActive`: a neutral "Connected"
state (0 consecutive errors), a cautionary "Having trouble connecting"
state (1 or 2 consecutive errors — below the stage-1 email threshold but
worth a visual signal even before an email fires), and an explicit
"Disconnected — reconnect required" state (`isActive: false`), each with
appropriate color treatment following the platform's existing design
token conventions (no new color tokens introduced — reuses the existing
success/warning/destructive semantic tokens already defined in the design
system).

### Hook: `useIntegrationHealth.ts`

A thin TanStack Query hook wrapping the extended `GET /integrations`
response (Section 22), exposing per-provider health state to any settings
card that needs it. Given the read frequency involved (a settings page
view, not a hot path), this hook uses the platform's standard moderate
`staleTime` for settings-adjacent data, consistent with the existing
`cacheConfig` entries for similar low-frequency, admin-facing reads.

### Integration Into Existing Provider Cards

Every existing provider settings card built across Days 58–63
(`JiraIntegration.tsx`, `LinearIntegration.tsx`, `NotionIntegration.tsx`,
`SlackIntegration.tsx`, `GoogleCalendarIntegration.tsx`,
`OutlookCalendarIntegration.tsx`) is updated today to render
`IntegrationHealthBadge` alongside its existing connect/disconnect
controls — a small, additive change per file, made possible only because
every one of those cards already consumes integration data through a
consistent shape, itself a byproduct of this sprint's insistence on shared
abstractions since Day 58.

---

## 24. Types & Interfaces

### File: `services/integration-health.service.ts` (types)

- **`IntegrationHealthResult`** — `{ success: boolean; error?: string }`, the shared return shape for `refreshIntegration()` and, by extension, every retrofitted failure path's outcome reporting.
- **`IntegrationRow`** — a union type (`TeamIntegration | UserIntegration`) accepted by every function in this service, reflecting that health tracking is table-agnostic by design.

### File: `queues/jobs/token-refresh.job.ts`

- **`TokenRefreshJobData`** — `{ integrationType: 'team' | 'user'; integrationId: string }`, the minimal payload contract consumed by `token-refresh.worker.ts`, deliberately carrying only an ID reference (never the token itself, never denormalized provider details) — consistent with the platform's existing "job payloads stay small; large/sensitive data referenced by ID, not inlined" principle, first stated explicitly in the Day 18 planning document and upheld unchanged here.

No changes are required to any provider's own `IntegrationProvider` or
`CalendarProvider` interface — today's types are entirely additive and
scoped to the new cross-cutting health/refresh layer, once again
confirming that the two provider interfaces established on Days 58 and 63
needed no modification to support this hardening work.

---

## 25. Testing Plan

### Unit Tests

#### `integration-health.test.ts`

- `recordSuccess()` on an already-healthy integration (0 errors, no
  `lastError`) performs no database write (verified via a call-count
  assertion on the underlying update function).
- `recordSuccess()` on a previously-failing integration correctly resets
  `consecutiveErrors` to `0` and `lastError` to `null`.
- `recordFailure()` increments `consecutiveErrors` by exactly one per call
  and persists the provided error message.
- Crossing exactly the stage-1 threshold (3) triggers exactly one
  `IntegrationWarning` dispatch call, not zero and not more than one.
- Crossing exactly the stage-2 threshold (5) triggers deactivation AND
  exactly one `IntegrationDeactivated` dispatch call.
- Continued failures beyond the stage-2 threshold (6, 7, 8...) do **not**
  trigger additional deactivation calls or additional emails — verified via
  a call-count assertion across multiple consecutive `recordFailure()`
  calls simulating a stuck-broken integration.
- The generic `IntegrationRow` union correctly persists to the right table
  for both a `TeamIntegration` and a `UserIntegration` input.

#### `token-refresh-service.test.ts`

- `findExpiringIntegrations()` correctly includes an integration with
  `tokenExpiresAt` 20 minutes in the future and excludes one 45 minutes in
  the future, given the 30-minute lookahead window.
- `findExpiringIntegrations()` correctly excludes any integration with a
  `null` `tokenExpiresAt` (Linear/Notion/Slack-shaped rows), verified with
  fixtures representing all six providers' typical row shapes.
- `findExpiringIntegrations()` correctly excludes an `isActive: false` /
  `syncEnabled: false` row even if its `tokenExpiresAt` falls inside the
  window.
- `refreshIntegration()` on a successful mocked `getValidAccessToken()`
  call invokes `recordSuccess()` and never `recordFailure()`.
- `refreshIntegration()` on a thrown error invokes `recordFailure()` with a
  correctly-extracted message and never throws past its own boundary.

### Integration Tests

#### `token-refresh-e2e.test.ts`

- A fully mocked end-to-end cycle: seed an integration expiring within the
  lookahead window → run the cron logic → assert a job was fanned out with
  the correct payload → run the worker against that job → assert the
  health service was invoked with the correct outcome.
- A seeded integration with 2 prior consecutive failures, subjected to one
  more failed refresh attempt, crosses into the stage-1 threshold and a
  mocked `IntegrationWarning` send is asserted.
- The same scenario continued to 5 total consecutive failures results in
  `isActive: false` and a mocked `IntegrationDeactivated` send.
- Dedup verification: two consecutive cron cycles both resulting in a
  failure that would otherwise re-cross the stage-1 threshold trigger only
  one email send within the 24-hour dedup window.

#### `integration-retrofit.test.ts`

- A simulated Jira sync failure inside `integrate.worker.ts` and a
  simulated Google Calendar sync failure inside `calendar-sync.service.ts`
  are both asserted to invoke the exact same
  `integrationHealthService.recordFailure()` function (via a shared spy),
  confirming no parallel/duplicate counter logic exists in either file
  post-retrofit.
- A reconnect (fresh OAuth callback) for a previously-deactivated
  integration of any provider is asserted to result in `consecutiveErrors:
  0`, `lastError: null`, and `isActive: true`/`syncEnabled: true` — run
  as a parameterized test across all six providers to confirm the
  reconnect-reset retrofit (Section 21) was applied consistently
  everywhere, not just for the provider it might have been first
  implemented against.

### Manual Smoke Test (Required Before Sign-Off)

A hand-performed scenario against a real sandbox integration (any one
expiring-token provider — Jira is the simplest to force): revoke the
connection's access from the provider's own admin UI (simulating a dead
refresh token), wait through at least two real 15-minute cron cycles,
confirm the early-warning email arrives after the expected number of
cycles, allow it to continue to full deactivation, confirm the
deactivation email arrives and the settings page correctly shows the
"Disconnected — reconnect required" badge state, then reconnect and
confirm the badge returns to "Connected" with health state fully reset.

---

## 26. End-of-Day Checklist

### Core Services

- [ ] `token-refresh.service.ts` contains no OAuth logic of its own —
      exclusively delegates to `getValidAccessToken()`
- [ ] `integration-health.service.ts` is the single place
      `consecutiveErrors`/`isActive` are ever mutated anywhere in the codebase
- [ ] `recordSuccess()` fast-paths correctly on an already-healthy
      integration with zero unnecessary database writes
- [ ] Two-stage thresholds (3, 5) are named constants, not magic numbers
      inlined at each call site

### Retrofit Verification

- [ ] `integrate.worker.ts` contains zero remaining inline
      `consecutiveErrors` mutation or alerting logic — verified via
      explicit text-search
- [ ] `calendar-sync.service.ts` contains zero remaining inline equivalent
      logic — verified identically
- [ ] All six providers' `handleOAuthCallback()` implementations call
      `recordSuccess()` as part of a successful connect/reconnect —
      verified as a parameterized test across all six, not spot-checked
      on just one

### Cron & Worker

- [ ] `token-refresh` queue registered with correct concurrency (10) and
      no BullMQ-level job retries configured
- [ ] 15-minute cron correctly fans out one job per expiring integration,
      never a single looping mega-job
- [ ] A missing integration (deleted between fan-out and job execution) is
      a safe no-op, not a thrown error

### Alerting

- [ ] `IntegrationWarning.tsx` and `IntegrationDeactivated.tsx` follow the
      platform's existing template structure/branding conventions
- [ ] Recipient resolution correctly targets ADMIN+/OWNER roles for
      team-level integrations and the connected user for calendar
      integrations, strictly scoped to the affected team/user — no
      cross-tenant leakage
- [ ] Dedup keys prevent duplicate warning/deactivation emails within a
      24-hour window, verified via a repeated-failure test
- [ ] A failed email dispatch never blocks or reverts the underlying
      health-state persistence

### Data & Security

- [ ] No new database migration required; all consumed columns confirmed
      already present per the Day 3 schema
- [ ] `lastError` values are confirmed free of raw tokens/Authorization
      header content across all six providers' error paths
- [ ] Email templates never include raw `lastError` content in the
      outbound message body

### Frontend

- [ ] `IntegrationHealthBadge.tsx` renders all three states
      (healthy/cautionary/disconnected) using existing semantic design tokens
- [ ] All six existing provider settings cards render the shared badge
      component — no card left without it

### Observability

- [ ] New metrics (`token_refresh.*`, `integration_health.*`) visible on
      the existing Grafana dashboard
- [ ] Threshold-crossing events are logged as distinct structured events,
      separately identifiable from routine per-attempt log lines

### Sign-Off

- [ ] All unit and integration tests pass in CI
- [ ] Manual E2E performed against a real sandbox provider: revoke →
      early-warning email received → deactivation email received →
      reconnect → health state fully reset, confirmed via the settings UI

---

## 27. Risks & Edge Cases

```
RISK                                              MITIGATION BUILT TODAY
──────────────────────────────────────────────────────────────────────────
A provider's own error path leaks a token
  fragment into lastError, later exposed via the
  settings API                                     Explicit test coverage
                                                    confirming each provider's
                                                    existing error-sanitization
                                                    discipline holds; documented
                                                    as an upstream responsibility
                                                    each provider file must satisfy

Retrofit is applied inconsistently — some
  providers still carry inline counter logic        Explicit text-search /
  alongside the new shared service                  code-review checklist item,
                                                    not left to informal review

An integration stuck permanently broken generates
  a fresh alert email every 15 minutes forever       Threshold-crossing-only
                                                    triggering (not
                                                    >=-on-every-failure) plus a
                                                    24h dedup key as a secondary
                                                    defense

Reconnecting a deactivated integration doesn't
  actually reset its health state, leaving stale
  failure history visible indefinitely              Every OAuth callback across
                                                    all six providers explicitly
                                                    retrofitted to call
                                                    recordSuccess(), verified via
                                                    a parameterized cross-provider
                                                    test

A brief, transient provider outage triggers full
  deactivation for many customers simultaneously,
  even though the underlying issue was never a
  real per-customer problem                          The two-stage model's early
                                                    warning stage surfaces this
                                                    kind of event via the
                                                    integration_health.warning_triggered
                                                    metric's cross-team spike
                                                    signal, allowing it to be
                                                    recognized and investigated as
                                                    a provider-side incident before
                                                    stage 2 broadly fires

Cron fan-out volume grows unexpectedly at scale,
  overwhelming the token-refresh queue              Fan-out-per-integration with
                                                    bounded worker concurrency
                                                    (10) plus removeOnComplete/
                                                    removeOnFail retention keeps
                                                    Redis memory and queue depth
                                                    bounded even at meaningful
                                                    integration-count scale
```

---

*Document: DAY-64-PLAN-001 | Vocaply | Day 64: Token Refresh & Failure Alerting*
*Full Scalable Industry-Level Build Plan | Principal Engineer Edition*
*Proactive refresh cron · Centralized health service · Two-stage escalation · Cross-provider retrofit*
*Security-first · Performance-optimized · Production-grade · Planning Document — No Code*
