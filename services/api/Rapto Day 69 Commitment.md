# Vocaply — Day 69: Commitment Score Algorithm — Full Implementation & Denormalized Write Path
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-69-PLAN-001 | Version 1.0 | Phase 5 — Integrations (Days 56–70)

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Why This Is a Close-the-Loop Day, Not Purely New Logic](#2-why-this-is-a-close-the-loop-day-not-purely-new-logic)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Layer 1 — score.service.ts Full Implementation](#4-layer-1--scoreservicets-full-implementation)
5. [Layer 2 — The Trend Calculation Sub-Algorithm](#5-layer-2--the-trend-calculation-sub-algorithm)
6. [Layer 3 — The Denormalized Write Path](#6-layer-3--the-denormalized-write-path)
7. [Layer 4 — Recalculation Trigger-Point Audit](#7-layer-4--recalculation-trigger-point-audit)
8. [Layer 5 — commitments.service.ts Integration](#8-layer-5--commitmentsservicets-integration)
9. [Layer 6 — commitment-resolver.service.ts / extract.worker.ts Integration (The New Wiring)](#9-layer-6--commitment-resolverservicets--extractworkerts-integration-the-new-wiring)
10. [Layer 7 — dea
dline.worker.ts Integration](#10-layer-7--deadlineworkerts-integration)
11. [Layer 8 — Weekly Snapshot Cron](#11-layer-8--weekly-snapshot-cron)
12. [Layer 9 — Socket.io Real-Time Event Design](#12-layer-9--socketio-real-time-event-design)
13. [The CANCELLED Exclusion Rule — Explicit Design](#13-the-cancelled-exclusion-rule--explicit-design)
14. [Edge Case Handling in Trend & Score Calculation](#14-edge-case-handling-in-trend--score-calculation)
15. [Data Model & Schema Considerations](#15-data-model--schema-considerations)
16. [Security Architecture](#16-security-architecture)
17. [Performance Architecture](#17-performance-architecture)
18. [Caching Strategy](#18-caching-strategy)
19. [Concurrency & Race-Condition Considerations](#19-concurrency--race-condition-considerations)
20. [Observability & Logging](#20-observability--logging)
21. [Frontend Integration Plan](#21-frontend-integration-plan)
22. [Types & Interfaces](#22-types--interfaces)
23. [Testing Plan](#23-testing-plan)
24. [End-of-Day Checklist](#24-end-of-day-checklist)
25. [Risks & Edge Cases](#25-risks--edge-cases)

---

## 1. Day Overview & Goals

### What Gets Built Today

The commitment scoring algorithm — recency-weighted fulfillment rate,
an on-time bonus, and a week-over-week trend indicator — has been
**fully specified** in prose since the LLD (§8) and the Day 19 build plan.
What has never existed until today is a single, complete, finalized
`score.service.ts` implementation that every place the platform's own
design says should trigger a recalculation actually calls, with zero
call site computing an approximate or partial score inline instead. Day
69 delivers that implementation and, more importantly, **audits and
closes every recalculation trigger point across the entire codebase** —
discovering and fixing the one genuine gap that has existed silently
since the AI pipeline shipped: an AI-detected cross-meeting commitment
resolution updates a commitment's status but had never, until today, also
triggered the owning member's score recalculation as a direct
consequence.

```
TODAY BUILDS:
  ✅ score.service.ts — the finalized calculateCommitmentScore() and
     calculateScoreTrend() implementations, matching the LLD's specified
     math exactly, with explicit edge-case handling
  ✅ A complete audit of every commitment-status-change trigger point in
     the codebase, confirming each one correctly calls the shared service
     and persists the denormalized write path
  ✅ The ONE genuinely new wiring: AI-detected cross-meeting FULFILLED
     resolutions now trigger score recalculation, closing a silent gap
     that has existed since the AI pipeline shipped
  ✅ Explicit confirmation that CANCELLED transitions do NOT recalculate
     score — a deliberate exclusion rule, verified rather than assumed
  ✅ A new Sunday-midnight full-recalculation + snapshot-write cron,
     populating the previously-unused commitment_score_snapshots table
  ✅ member:score_updated Socket.io event wiring for animated,
     real-time frontend score updates
  ✅ Full edge-case coverage for the trend calculation (zero-decided-
     commitments, all-pending-commitments) preventing NaN/undefined from
     ever reaching the frontend

DOWNSTREAM IMPACT:
  Day 70 — Team health score's avgMemberScore component reads directly
           from the now-guaranteed-fresh users.commitmentScore column,
           and its trend charts + weekly digest read from the
           commitment_score_snapshots table this day populates for the
           first time — Day 70 has NO scoring logic of its own to build;
           it is purely a consumer of today's completed work
  Phase 6/7 — Any future analytics or billing feature that references a
           member's commitment score can trust it is always current,
           since today's audit closes every gap where staleness could
           previously have crept in

DO NOT SKIP OR RUSH:
  The AI-detected-resolution gap (Section 9) is the single most
  consequential finding of today's work — precisely because it is
  SILENT. A commitment resolved automatically via the AI pipeline still
  correctly shows as FULFILLED in the UI; nothing appears broken. The
  only symptom is a member's commitmentScore slowly drifting out of sync
  with their actual, true commitment history until some UNRELATED event
  happens to trigger a recalculation that incidentally corrects it. This
  is exactly the kind of bug that erodes trust in a scoring feature over
  months without ever producing a single obvious error — which is why
  today treats trigger-point completeness as seriously as the algorithm's
  own math.
```

### 8-Hour Time Allocation

```
9:00 AM – 9:45 AM    → score.service.ts — finalize calculateCommitmentScore():
                        base fulfillment rate, recency weighting, on-time
                        bonus, final score composition
9:45 AM – 10:30 AM   → score.service.ts — finalize calculateScoreTrend():
                        current-vs-prior 7-day comparison, edge-case handling
10:30 AM – 11:15 AM  → The denormalized write-path helper (persistScore())
                        + Socket.io event emission, used by every trigger site
11:15 AM – 12:00 PM  → Trigger-point audit: commitments.service.ts (manual
                        FULFILLED/DEFERRED/CANCELLED transitions) + explicit
                        CANCELLED-exclusion verification
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 1:45 PM    → THE NEW WIRING: commitment-resolver.service.ts /
                        extract.worker.ts's post-resolution step — add the
                        missing score recalculation call
1:45 PM – 2:15 PM    → deadline.worker.ts — confirm/finalize the batch-MISSED
                        recalculation call against the finalized service
2:15 PM – 3:00 PM    → scheduler.ts — new Sunday-midnight full-recalculation
                        + commitment_score_snapshots write cron
3:00 PM – 3:45 PM    → Frontend: CommitmentScore.tsx wired to
                        member:score_updated for animated real-time updates
3:45 PM – 4:30 PM    → Unit tests: score math (known input/output pairs),
                        trend edge cases (zero-decided, all-pending)
4:30 PM – 5:15 PM    → Integration tests: full trigger-point audit suite —
                        one test per recalculation trigger event, asserting
                        the shared service was called and the write path
                        completed
5:15 PM – 5:45 PM    → Weekly cron test + manual verification against seeded
                        historical data
5:45 PM – 6:00 PM    → Checklist review + sign-off
```

---

## 2. Why This Is a Close-the-Loop Day, Not Purely New Logic

### The Algorithm Is Not New Today — Its Completeness Is

Every mathematical component of today's work — base fulfillment rate,
recency weighting (recent 7 days at full weight, older 7–30 days at 70%
weight), the on-time bonus (up to +10 points), and the ±5-point
improving/declining/stable trend threshold — has been documented in
detail since the LLD's §8 and echoed in the Day 19 commitments-API build
plan. A reader of those earlier documents could reasonably assume this
work was "already done." What today's plan makes explicit is the
distinction between **an algorithm being specified** and **an algorithm
being reliably invoked everywhere it needs to be** — the latter is what
was genuinely incomplete, and it is precisely the kind of gap that is
easy to overlook because the math itself was never in question.

### The Audit Methodology

Today's work is structured as a literal audit: every code path in the
platform that changes a `Commitment` row's `status` is enumerated
(Section 7), and each one is checked against a single question — "does
this call site, immediately following its status change, call
`score.service.ts` and persist the result?" Three of the five identified
trigger points were already correctly wired (manual `FULFILLED`,
`DEFERRED`, and the cron-driven `MISSED` batch). One (`CANCELLED`) is
confirmed to be **correctly and deliberately excluded** — not a gap, but
a verified design decision (Section 13). The fifth — AI-detected
cross-meeting resolution — is the one genuine defect this audit uncovers
and fixes.

---

## 3. File Structure to Create

```
services/api/src/
│
├── services/
│   └── score.service.ts                        ← MODIFY — finalized
│                                                    calculateCommitmentScore(),
│                                                    calculateScoreTrend(),
│                                                    persistScore() write helper
│
├── modules/
│   ├── commitments/
│   │   ├── commitments.service.ts                ← MODIFY (verify/confirm) —
│   │   │                                              manual status-transition
│   │   │                                              call sites
│   │   └── commitment-resolver.service.ts          ← MODIFY — THE NEW CALL:
│   │                                                     score recalculation
│   │                                                     after AI-detected
│   │                                                     FULFILLED resolution
│   │
│   └── (no new module — score.service.ts remains a shared, cross-cutting
│        service, consistent with its existing placement since Day 19)
│
├── queues/
│   ├── workers/
│   │   ├── extract.worker.ts                      ← MODIFY (verify) —
│   │   │                                               confirms the resolver's
│   │   │                                               new call is correctly
│   │   │                                               invoked within this
│   │   │                                               worker's existing
│   │   │                                               transaction/call chain
│   │   └── deadline.worker.ts                      ← MODIFY (verify/finalize) —
│   │                                                    batch-MISSED
│   │                                                    recalculation call
│   │                                                    confirmed against the
│   │                                                    finalized service
│   └── scheduler.ts                                 ← MODIFY — new
│                                                          Sunday-midnight
│                                                          full-recalculation +
│                                                          snapshot cron
│
└── realtime/
    └── socket.events.ts                             ← MODIFY (verify) —
                                                            confirms
                                                            member:score_updated
                                                            is already defined
                                                            (per the LLD's
                                                            realtime catalog);
                                                            no new event name
                                                            introduced today

services/api/tests/
├── unit/
│   ├── score-calculation.test.ts                   ← NEW — pure math,
│   │                                                     known input/output
│   │                                                     pairs
│   └── score-trend-edge-cases.test.ts                ← NEW
└── integration/
    ├── score-trigger-audit.test.ts                    ← NEW — one test per
    │                                                        trigger point,
    │                                                        the day's
    │                                                        centerpiece suite
    └── weekly-snapshot-cron.test.ts                     ← NEW

apps/web/src/features/commitments/
└── components/CommitmentScore/
    └── CommitmentScore.tsx                            ← MODIFY — wired to
                                                              member:score_updated
                                                              for animated
                                                              real-time updates
```

### Dependency Flow (No Circular Deps)

```
commitments.service.ts ──┐
commitment-resolver.service.ts ──┤
deadline.worker.ts ──┤             ├──► score.service.ts
scheduler.ts (weekly cron) ──┘         ├── calculateCommitmentScore()
                                        ├── calculateScoreTrend()
                                        └── persistScore()
                                              ├── prisma.user.update()  (denormalized write)
                                              └── io.to(`user:${userId}`)
                                                    .emit('member:score_updated', ...)
```

---

## 4. Layer 1 — `score.service.ts` Full Implementation

### File: `services/score.service.ts`

**Responsibility:** The single, authoritative implementation of the
commitment score calculation — pure with respect to persistence (it reads
from the database but writes nothing itself; see Section 6 for why
calculation and persistence are deliberately separated), callable
identically from every trigger point audited in Section 7.

### `calculateCommitmentScore(userId, teamId, periodDays = 30)`

Implements the exact four-step formula specified in the LLD:

1. **Base fulfillment rate**: `fulfilled / (fulfilled + missed)` over the
   trailing `periodDays` window, restricted to commitments with
   `confidenceScore >= 0.5` (the same confidence-filtering discipline
   already applied consistently across the platform's other commitment-
   related calculations, e.g., Day 66's auto-sync eligibility). If there
   are zero decided (fulfilled + missed) commitments in the window, the
   base rate defaults to 100 — a deliberate "benefit of the doubt" default
   for a member with no track record yet, rather than penalizing someone
   who simply hasn't had enough commitments to judge.
2. **Recency weighting**: commitments created within the last 7 days
   count at full weight (1.0); those from 7–30 days prior count at 70%
   weight (0.7) — a weighted average, not a simple blend, computed as
   `(recentWeighted + olderWeighted) / totalWeight`, ensuring a member's
   most recent behavior has proportionally greater influence on their
   current score than older history, without discarding older history
   entirely.
3. **On-time bonus**: `(onTimeRate / 100) * 10`, where `onTimeRate` is the
   percentage of fulfilled commitments whose `resolvedAt` fell at or
   before their `dueDate` — up to a maximum +10-point bonus, added on top
   of the weighted base rate.
4. **Final score**: the weighted rate plus the on-time bonus, clamped to
   the `[0, 100]` range via `Math.min(100, Math.max(0, Math.round(raw)))`
   — the clamping and rounding are non-negotiable safety steps, since the
   weighted-average and bonus arithmetic could theoretically produce a
   value marginally outside `[0, 100]` under certain edge-case input
   distributions, and a displayed score outside that range would be a
   visibly broken UI state.

### Return Shape

Returns `{ score, fulfillmentRate, onTimeRate, trend, total, fulfilled,
missed, pending }` — the full breakdown, not merely the final number,
because every consumer of this function (the commitments API's `/stats`
endpoint, the team-health rollup on Day 70, the frontend's
`CommitmentScore` gauge) needs access to the underlying components, not
just the composite score, to render a meaningful breakdown rather than an
opaque single figure.

---

## 5. Layer 2 — The Trend Calculation Sub-Algorithm

### `calculateScoreTrend(userId, teamId)`

A separate, focused function — deliberately not folded into
`calculateCommitmentScore()`'s own return computation, because trend
requires **two** independent rate calculations (current 7-day window,
prior 7-day window) rather than the single 30-day window the score itself
uses, and keeping it as its own function makes both pieces of logic
independently testable and independently reasoned-about.

### The Comparison Logic

1. Compute `currentWeekRate` — the fulfillment rate for commitments
   decided in the last 7 days.
2. Compute `priorWeekRate` — the fulfillment rate for commitments decided
   in the 7–14 day-ago window.
3. `diff = currentWeekRate - priorWeekRate`.
4. `diff > 5` → `'improving'`; `diff < -5` → `'declining'`; otherwise
   `'stable'` — the exact ±5-point threshold specified in the LLD,
   reused unchanged rather than independently re-derived.

### Why a Fixed ±5-Point Threshold, Not a Statistical Significance Test

A more statistically rigorous approach (e.g., a confidence interval based
on sample size) was considered and explicitly rejected for this feature:
the audience for a trend indicator is a manager or the member themselves
glancing at a dashboard, not a data analyst — a simple, fixed,
easily-explainable threshold ("more than 5 points better/worse than last
week") is more useful and more transparent than a statistically
sophisticated but harder-to-explain measure, especially given that most
individual members' weekly commitment volume is small enough that a
formal significance test would frequently be inconclusive anyway.

---

## 6. Layer 3 — The Denormalized Write Path

### Why Calculation and Persistence Are Kept as Separate Concerns

`calculateCommitmentScore()` and `calculateScoreTrend()` are pure
**readers** — they compute a result from the database's current state but
write nothing. Persistence is handled by a separate, small
`persistScore(userId, teamId, scoreResult)` helper, called explicitly by
every trigger site **after** it has decided a recalculation is warranted.
This separation exists for a concrete reason: several call sites (the
weekly cron, in particular) want the calculation and the persistence to
happen as part of a larger batch operation with its own transaction
boundaries, and forcing calculation to always immediately self-persist
would make that batching awkward or force those call sites to work around
an assumption that doesn't fit their needs.

### `persistScore()`'s Two Responsibilities

1. **The denormalized column write**: `UPDATE users SET commitment_score
   = ? WHERE id = ?` — updating the `users.commitmentScore` column
   specifically provisioned (per the Day 3 schema) to avoid an expensive
   live aggregation across the full `commitments` table on every
   dashboard page load. This is the platform's standard
   denormalization-for-read-performance pattern, applied here exactly as
   it is applied to `teams.meetingsUsed` and other similarly
   frequently-read, infrequently-changed aggregate values elsewhere in
   the schema.
2. **The Socket.io emission**: `io.to('user:{userId}').emit(
   'member:score_updated', { newScore, previousScore, change })` — firing
   immediately after the database write succeeds, carrying both the new
   score and its delta from the prior value, so the frontend's
   `CommitmentScore`/`TrendIndicator` components (Section 21) can animate
   the transition rather than silently refetching and re-rendering a
   static number.

### Why the Socket.io Emission Must Never Block or Fail the Database Write

Per the platform's Day 18 principle ("Socket.io emission failures never
block the underlying state update"), `persistScore()`'s emission step is
wrapped so that any failure to emit (e.g., the Socket.io server being
briefly unreachable) is logged but never causes the function itself to
throw or roll back the already-committed database write — the score value
is the source of truth; the real-time notification is a best-effort
enhancement layered on top of it, never a dependency of it.

---

## 7. Layer 4 — Recalculation Trigger-Point Audit

### The Complete, Enumerated List

```
TRIGGER EVENT                    LOCATION                        AUDIT RESULT
──────────────────────────────────────────────────────────────────────────────
Manual FULFILLED                 commitments.service.ts           Already correct;
                                                                  confirmed calls
                                                                  score.service.ts
                                                                  + persistScore()
Manual DEFERRED                  commitments.service.ts           Already correct;
                                                                  confirmed
Manual CANCELLED                 commitments.service.ts           Confirmed
                                                                  DELIBERATELY
                                                                  excluded — see
                                                                  Section 13
Cron-driven MISSED (6PM daily)   deadline.worker.ts               Already correct;
                                                                  confirmed against
                                                                  the now-finalized
                                                                  shared service
AI-detected FULFILLED            commitment-resolver.service.ts   GAP FOUND AND
  (cross-meeting resolution)      / extract.worker.ts               FIXED TODAY —
                                                                  see Section 9
Weekly full recalculation         scheduler.ts (new)               Built today —
  (Sunday midnight)                                                see Section 11
```

### Why This Table Is the Day's Actual Deliverable, Not Merely Documentation

Today's engineering discipline treats this table as a literal checklist
performed against the real codebase — every "Already correct; confirmed"
entry represents a call site that was actually opened, read, and verified
(not assumed correct because an earlier planning document said it should
be), and every verification is backed by a corresponding assertion in
`score-trigger-audit.test.ts` (Section 23), which exercises each trigger
event end-to-end and asserts the shared service was invoked and the
denormalized column changed — turning what could otherwise be a purely
documentary audit into an enforced, regression-proof one.

---

## 8. Layer 5 — `commitments.service.ts` Integration

### The Three Manual Transitions

`commitments.service.ts`'s `updateStatus()` function (Day 19/20) already,
per its original design, calls `score.service.ts` after a `FULFILLED` or
`DEFERRED` transition and explicitly skips the call after a `CANCELLED`
transition. Today's work on this file is **verification, not
construction** — confirming the existing implementation matches the
now-finalized `score.service.ts` signature and return shape exactly (any
drift between an earlier, provisional version of the score service and
today's finalized one is corrected here), and confirming the
`persistScore()` helper (Section 6), not an inline duplicate persistence
step, is what this file actually calls.

### Why No New Logic Is Added Here

This file's trigger-point behavior was correctly designed from the start
(per Day 19's original plan) — today's audit confirms that design holds
against the finalized service, rather than needing to introduce new
behavior, which is the expected, healthy outcome for the majority of
today's trigger-point audit (only one of the five points required a
genuine fix).

---

## 9. Layer 6 — `commitment-resolver.service.ts` / `extract.worker.ts` Integration (The New Wiring)

### The Gap, Precisely Described

`commitment-resolver.service.ts` (Day 46–54's AI pipeline integration)
correctly implements the cross-meeting resolution logic: when the AI
pipeline detects that a new meeting's transcript contains a statement
confirming an older, historically-open commitment is now complete, it
updates that commitment's `status` to `FULFILLED` and sets
`resolvedInMeetingId`. This status update is correct and has worked
since the AI pipeline shipped. What this code path had **never** done —
unlike the manual-transition path in `commitments.service.ts` — is call
`score.service.ts` afterward. The consequence: a member whose commitments
are resolved primarily via AI-detected cross-meeting matching (rather
than ever being manually marked fulfilled by a human) could have a
`commitmentScore` that silently drifts stale, only correcting itself
whenever some unrelated event (a different commitment's manual status
change, or the new weekly cron) happens to also touch that same user.

### The Fix

Inside `extract.worker.ts`'s existing post-resolution step (the same
transaction that already persists the resolver's `FULFILLED` status
update, per the Day 46–54/58 worker design), a new call is added:
immediately after committing the resolution, call
`scoreService.calculateCommitmentScore()` for the resolved commitment's
owner and `persistScore()` the result — using the **exact same** shared
function and write-path helper every other trigger point uses, per
today's explicit "one shared algorithm, no parallel implementations"
discipline.

### Why This Fix Belongs Inside `extract.worker.ts`, Not `commitment-resolver.service.ts` Itself

`commitment-resolver.service.ts` is deliberately kept as a focused,
resolution-decision-making service (Day 52/53's design) — it decides
*whether* a resolution occurred, but the actual database persistence and
its downstream consequences (score recalculation, Socket.io emission)
belong in the worker that owns the surrounding transaction, mirroring the
exact separation-of-concerns principle already applied elsewhere in this
codebase (e.g., `linear.provider.ts` deciding *how* to build a GraphQL
mutation, versus `integrate.worker.ts` owning the surrounding job
orchestration).

---

## 10. Layer 7 — `deadline.worker.ts` Integration

### Batch Recalculation After the 6PM MISSED Sweep

`deadline.worker.ts`'s existing daily cron (Day 19) already batches
overdue `PENDING` commitments into `MISSED` and, per its original design,
recalculates the affected owners' scores afterward. Today's work confirms
this recalculation loop calls the **finalized** `score.service.ts`
implementation (rather than any earlier, provisional version that may
have existed when Day 19's worker was first written) and correctly
batches the recalculation per **unique** affected owner (a single cron
run marking five different commitments as `MISSED`, three of which belong
to the same user, should recalculate that user's score exactly once per
run, not three times) — an efficiency detail worth explicitly verifying
today rather than assuming the original implementation got right.

---

## 11. Layer 8 — Weekly Snapshot Cron

### New Cron Entry: Sunday Midnight UTC

Registered in `scheduler.ts`, this new job iterates every active user
across every team and, for each, performs a **full, from-first-principles**
recalculation (not an incremental update) via
`calculateCommitmentScore()`, writes one row into the previously-unused
`commitment_score_snapshots` table (`{ userId, teamId, weekStart, isoWeek,
commitmentScore, fulfillmentRate, onTimeRate, totalCommitments,
fulfilledCount, missedCount, deferredCount }`, per the Day 3 schema's
already-defined columns), and updates `users.commitmentScore` to match.

### The Two Purposes This Cron Serves

1. **Drift correction**: a belt-and-suspenders safeguard against any
   incremental-recalculation gap that might exist despite today's audit —
   even with every known trigger point closed, a full weekly
   recalculation from first principles is a resilient correction
   mechanism against any future regression or as-yet-undiscovered gap,
   consistent with the platform's general preference (seen elsewhere,
   e.g., Day 64's token-refresh cron serving a similar "catch what
   incremental logic might have missed" role) for pairing event-driven
   recalculation with a periodic full-recompute safety net.
2. **Historical data for trend charts and the digest**: this is the
   **first** time `commitment_score_snapshots` is ever written to —
   without it, Day 70's team-health trend charts and weekly digest would
   have no historical time-series to read from short of an expensive live
   aggregation across the full `commitments` table on every chart render.
   Today's cron populates the data source Day 70 depends on entirely.

### Why "From First Principles," Not Incremental

The weekly cron deliberately does not attempt to reuse or adjust any
previously-cached intermediate value — it re-derives each user's score
from the raw `commitments` table state, exactly as if being computed for
the first time. This is the correct design for a drift-correction
mechanism: an incremental "adjust the existing score by X" approach could
itself accumulate its own errors over time, whereas a full recomputation
is self-correcting by construction, immune to any accumulated drift from
whatever caused the need for correction in the first place.

---

## 12. Layer 9 — Socket.io Real-Time Event Design

### `member:score_updated` — Confirmed, Not Newly Designed

This event name and payload shape (`{ userId, newScore, previousScore,
change }`) already exists in the LLD's realtime event catalog — today's
work is confirming every trigger point's `persistScore()` call correctly
emits it to the `user:{userId}` room (never a broader team-wide broadcast,
since a member's own score change is personally relevant to them but
should also be visible to their team — see the next paragraph for the
dual-emission design).

### Dual Emission: Personal and Team-Wide

Because a member's score change is relevant both to that member
personally (their own dashboard) and to their team (the team-health
dashboard's member table, showing everyone's current score), `persistScore()`
emits **twice**: once to `user:{userId}` (`member:score_updated`, for the
owning member's own personal UI) and once to `team:{teamId}`
(the existing `member:score_updated` event already broadcast team-wide
per the LLD's team-health real-time design, powering the `MemberTable`'s
live score updates for managers watching the team dashboard) — both
reusing the identical event name and payload shape, differing only in
target room, avoiding the need for two separate event types representing
the same underlying fact.

---

## 13. The `CANCELLED` Exclusion Rule — Explicit Design

### The Rule

A commitment transitioning to `CANCELLED` **never** triggers a score
recalculation, and is explicitly excluded from the `calculateCommitmentScore()`
query's own input set entirely (the function's underlying query filters to
`status IN ('FULFILLED', 'MISSED', 'PENDING')`, deliberately never
including `CANCELLED`).

### Why This Is a Deliberate Design Decision, Verified Not Assumed

A cancelled commitment represents something that was extracted but later
determined to be genuinely irrelevant — a manager removing it from
tracking, per the platform's existing `CANCELLED` transition rules (Day
19/20), which explicitly requires a note explaining why. Because a
cancellation is, by design, a correction of the extraction process itself
(not a reflection of the member's actual follow-through behavior), it
would be incorrect for it to affect that member's score in either
direction — a cancelled commitment should neither count as a broken
promise (it was never a real promise the member needs to be judged on)
nor as evidence of good behavior (nothing was actually fulfilled). Today's
work includes an explicit test (`score-trigger-audit.test.ts`, Section
23) asserting a `CANCELLED` transition produces **zero** calls to
`score.service.ts` — turning what could be an easily-overlooked implicit
assumption into an enforced, regression-proof guarantee.

---

## 14. Edge Case Handling in Trend & Score Calculation

### Zero Decided Commitments in Either Trend Window

If a user has zero fulfilled-or-missed commitments in either the current
or the prior 7-day comparison window, `calculateScoreTrend()` returns
`'stable'` — never attempting a division that could produce `NaN`, and
never defaulting to `'improving'` or `'declining'` based on an arbitrary
tie-breaking rule that could mislead a user with insufficient data into
believing a real trend exists where none can yet be measured.

### All-Pending Commitments in the Lookback Period

A user whose only commitments in the scoring period are still `PENDING`
(not yet decided one way or the other) similarly cannot have a
meaningful trend computed — today's implementation explicitly tests this
exact scenario and confirms it, too, resolves to `'stable'` via the same
zero-decided-commitments code path, rather than requiring a separate,
redundant special case.

### Why These Are Treated as First-Class Test Cases, Not Incidental Ones

A new team, or a new hire on an existing team, will predictably pass
through exactly these edge-case states during their first days on
Vocaply — a scoring feature that produces a broken or misleading value
for every brand-new user would undermine trust in the feature at the
exact moment (onboarding) when first impressions matter most, which is
why these cases are treated with the same rigor as the algorithm's core
math rather than as an afterthought.

---

## 15. Data Model & Schema Considerations

### No New Migration Required

Every column and table today's work needs — `users.commitmentScore` and
the entire `commitment_score_snapshots` table — was already defined in
the Day 3 schema, specifically provisioned in anticipation of exactly
this work. Today is the first day `commitment_score_snapshots` receives
any writes at all; no schema change is required to make that happen.

### `commitment_score_snapshots` Row Shape (Confirmed, Not Newly Designed)

`{ id, userId, teamId, weekStart (the ISO Monday of the snapshot week),
isoWeek (a human-readable "2026-W20"-style label), commitmentScore,
fulfillmentRate, onTimeRate, totalCommitments, fulfilledCount,
missedCount, deferredCount, createdAt }` — a unique constraint on
`(userId, weekStart)` (already defined per the Day 3 schema) ensures the
weekly cron's write is naturally idempotent: a re-run of the cron for a
week that already has a snapshot updates that existing row rather than
creating a duplicate, protecting against the cron accidentally running
twice in one week (e.g., due to a deployment restart at an unlucky
moment).

---

## 16. Security Architecture

### No New OAuth, Credential, or External API Surface

Today's entire scope is internal calculation and internal
denormalized-write logic — zero new third-party integration, zero new
token handling, zero new external network calls of any kind.

### Tenant Isolation

Every query inside `calculateCommitmentScore()` and the weekly cron's
iteration logic is scoped by both `userId` **and** `teamId` — never
computing or exposing a score using commitment data from a different team
a user might theoretically share an ID collision risk with (a
belt-and-suspenders application-layer check, on top of the platform's
existing three-layer tenant-isolation defense already enforced at the
database level via RLS).

### Socket.io Emission Scoping

The `user:{userId}` room emission (Section 12) ensures a member's own
score-update event is delivered only to their own authenticated Socket.io
connection, never broadcast to other team members individually — only the
separate, deliberately team-wide `team:{teamId}` emission is visible to
the rest of the team, and that emission's payload contains only the
already-non-sensitive aggregate score figure, not any underlying
commitment detail.

---

## 17. Performance Architecture

### Why the Denormalized Column Exists at All

Every dashboard load, every member table render, every analytics
overview that displays a commitment score reads the already-computed
`users.commitmentScore` column — a simple, indexed primary-key lookup —
rather than re-aggregating the full `commitments` table on every page
view. This is the platform's standard performance pattern for
frequently-read, infrequently-changed aggregate data, and today's work is
what makes that column reliably trustworthy by ensuring it is recalculated
at every point it should be (Section 7), rather than merely existing as a
column that's sometimes stale.

### Weekly Cron's Batch Processing Design

The Sunday-midnight cron processes users in **batches**, not one giant
in-memory pass over the entire user base — reusing the platform's
established fan-out-not-mega-job pattern already applied to Day 56's
calendar-sync cron and Day 64's token-refresh cron: rather than looping
over every user sequentially inside a single long-running job, the cron
enqueues a bounded number of recalculation jobs (or processes users in
fixed-size batches within a single job, depending on the platform's
existing job-sizing conventions) — ensuring the operation scales linearly
with total user count without risking a single oversized job blocking
other queue activity or exceeding a reasonable execution-time budget.

### Recalculation Query Efficiency

`calculateCommitmentScore()`'s underlying query is scoped to a bounded
30-day window and filtered on already-indexed columns
(`team_id`, `owner_id`, `status`, `created_at`, per the existing
`idx_commit_team_owner_status` and `idx_commit_team_created_at` indexes
from the Day 3 schema) — no new index is required today, since this
query pattern was already anticipated when those indexes were originally
designed.

---

## 18. Caching Strategy

```
No new Redis caching is introduced today. The denormalized
users.commitmentScore column itself IS the platform's caching layer for
this data — a database column serving the same "avoid recomputation on
every read" purpose a Redis cache would, but with the advantage of being
transactionally consistent with the rest of a user's row and requiring
no separate cache-invalidation logic, since every write path (Section 7)
updates it directly as part of the same operation that necessitated the
recalculation.
```

---

## 19. Concurrency & Race-Condition Considerations

### Could Two Trigger Points Recalculate the Same User Simultaneously?

In principle, yes — for example, a manual `FULFILLED` transition and an
AI-detected resolution for a *different* commitment belonging to the same
user could theoretically be processed by two different workers at nearly
the same moment. Today's design explicitly accepts a **last-write-wins**
outcome for this scenario, consistent with the platform's existing
precedent for a structurally similar situation (Day 65's composite
"token refresh mid-sync race" scenario explicitly documented "last write
wins is an acceptable outcome" for concurrent token refreshes) — because
`calculateCommitmentScore()` always recomputes the **complete, current**
score from the database's actual current state (not an incremental
delta), the "losing" write in a race is simply a very-slightly-stale
computation that will be immediately superseded, on the very next
recalculation, by a fresh one reflecting the true, fully up-to-date state
— there is no risk of the two writes combining into an incorrect,
corrupted value, only a momentary display of a score that is technically
one event behind, self-correcting extremely quickly given how frequently
recalculation triggers fire.

### Why No Explicit Locking Is Introduced

Given the self-correcting nature described above, introducing a
distributed lock (e.g., a per-user Redis lock around score recalculation,
mirroring Day 56's per-user calendar-sync lock) was considered and
explicitly rejected as unneeded complexity — that calendar-sync lock
exists to prevent genuinely conflicting, non-idempotent side effects
(duplicate bot scheduling); commitment score recalculation has no
equivalent conflicting side effect to protect against, since every
recalculation is idempotent with respect to the database's true current
state at the moment it runs.

---

## 20. Observability & Logging

### Structured Log Fields

Every `persistScore()` call logs, at minimum: the user ID, team ID, the
trigger source (which of Section 7's five trigger points initiated this
recalculation — logged purely for observability, mirroring Day 66's
`source` job-tag design principle of "logging only, never a behavioral
branch"), the previous and new score values, and the computed trend.

### New Metrics

`score.recalculation.count` (counter, tagged by trigger source — giving
visibility into which trigger points fire most frequently in production),
`score.recalculation.duration_ms` (histogram, confirming the calculation
itself remains fast across real production data volumes), and
`score.weekly_cron.users_processed` / `.duration_ms` (for the Sunday
cron specifically) — feeding the platform's existing Grafana dashboard.

### Why Trigger-Source Tagging Matters for This Feature Specifically

Given that today's central finding (Section 9) was a silently-missing
trigger point, having per-trigger-source metrics in place going forward
means any *future* new trigger point that might be introduced (e.g., a
hypothetical future bulk-import feature that creates historical
commitments) and forgotten to be wired against `score.service.ts` would
be far more visible — a sudden discrepancy between a team's genuinely
observed commitment activity and the `score.recalculation.count` metric's
trigger-source breakdown becomes a debuggable signal, rather than another
silent gap discovered only by a future audit day like today's.

---

## 21. Frontend Integration Plan

### Component: `CommitmentScore.tsx` (modified)

Previously rendering a static or placeholder score value (per earlier
scaffolding phases), this component is wired today to subscribe to the
`member:score_updated` Socket.io event (via the platform's existing
`WebSocketProvider`/event-registration pattern, Day 39) for the currently
viewed member, and to animate the SVG donut gauge's transition from the
previous value to the new one whenever the event fires — rather than
silently refetching and re-rendering a static number, which would miss
the opportunity for the kind of responsive, alive-feeling real-time
update this platform's realtime architecture (Day 8/39) was specifically
built to support.

### `TrendIndicator.tsx` — Confirmed, Not Modified

The existing trend-arrow component (Day 16/20's frontend structure)
already correctly renders the ↑/↓/→ arrow-and-color convention for
`'improving'`/`'declining'`/`'stable'` values — today's work confirms it
correctly consumes the now-reliable `trend` value from
`calculateCommitmentScore()`'s return shape, requiring no component
changes of its own, only benefiting from the underlying data now being
trustworthy.

---

## 22. Types & Interfaces

### File: `services/score.service.ts` (types)

- **`CommitmentScoreResult`** — `{ score: number; fulfillmentRate: number; onTimeRate: number; trend: 'improving' | 'stable' | 'declining'; total: number; fulfilled: number; missed: number; pending: number }`, the complete return shape every trigger point consumes.
- **`ScoreRecalculationSource`** — a string-literal union (`'manual_status_change' | 'ai_resolution' | 'deadline_cron' | 'weekly_snapshot'`) used exclusively for observability tagging (Section 20), never for any behavioral branch inside the calculation itself.

### File: `queues/jobs/` (no new job type)

No new BullMQ job type is introduced today — the weekly snapshot cron
(Section 11) either runs as a single scheduled function performing its own
internal batching, or fans out via the platform's existing job-enqueueing
conventions reused from Day 56/64's cron designs, depending on the
platform's established sizing threshold for when a cron's work should be
split into discrete queued jobs versus processed inline.

No changes are required to `Commitment`, `ActionItem`, or any
provider-related type — today's entire type-level contribution is
scoped strictly to the scoring subsystem itself.

---

## 23. Testing Plan

### Unit Tests

#### `score-calculation.test.ts`

- A user with a perfect fulfillment record (all commitments fulfilled,
  all on time) produces a score at or near 100.
- A user with every commitment missed produces a score at or near 0.
- A user with zero decided commitments (all pending) produces the
  documented 100 "benefit of the doubt" default, not an error or `NaN`.
- Recency weighting is verified with a constructed fixture: a user with a
  poor fulfillment rate 8–30 days ago but a strong rate in the last 7
  days produces a noticeably higher score than an equivalent user whose
  poor/strong periods are reversed — confirming recent behavior is
  weighted more heavily, not merely averaged flatly.
- The on-time bonus is verified independently: two users with identical
  fulfillment rates but different on-time rates produce different final
  scores, with the on-time-heavier user scoring higher by up to the
  documented +10-point maximum.
- Final score is confirmed clamped to `[0, 100]` even under a
  constructed extreme-input fixture designed to probe the boundary.

#### `score-trend-edge-cases.test.ts`

- Zero decided commitments in either comparison window → `'stable'`,
  never `NaN`/`undefined`.
- All-pending commitments in the lookback period → `'stable'`, via the
  same code path as the above.
- A constructed >5-point improvement → `'improving'`; a constructed
  >5-point decline → `'declining'`; a constructed 3-point change (within
  the threshold) → `'stable'`.

### Integration Tests

#### `score-trigger-audit.test.ts` (the day's centerpiece)

- Manual `FULFILLED` transition → `score.service.ts` called exactly once,
  `users.commitmentScore` updated, `member:score_updated` emitted to both
  the user and team rooms.
- Manual `DEFERRED` transition → identical assertion.
- Manual `CANCELLED` transition → `score.service.ts` is asserted **NOT**
  called (zero invocations), and `users.commitmentScore` is confirmed
  unchanged — the explicit, enforced version of Section 13's exclusion
  rule.
- AI-detected cross-meeting resolution (simulated via a seeded
  `commitment-resolver.service.ts` invocation) → `score.service.ts` is
  now asserted called exactly once — this is the regression test that
  would have failed before today's fix and must pass after it, serving as
  the permanent guard against this specific gap ever silently
  reappearing.
- Batch `MISSED` transition affecting three commitments belonging to two
  distinct users → `score.service.ts` called exactly twice (once per
  unique affected user), not three times — verifying the deduplication-
  per-owner efficiency detail from Section 10.

#### `weekly-snapshot-cron.test.ts`

- A seeded population of users, each with varied commitment histories,
  results in exactly one `commitment_score_snapshots` row per user after
  the cron runs, with `commitmentScore` values matching an independently
  computed expected value for each.
- Re-running the cron for the same week (simulating an accidental
  double-trigger) updates the existing snapshot rows rather than creating
  duplicates, verifying the unique-constraint-based idempotency (Section
  15).
- `users.commitmentScore` is confirmed updated to match the freshly
  computed snapshot value for every processed user.

### Manual Verification (Required Before Sign-Off)

A hand-performed review against a small set of real (or realistically
seeded) historical commitment records, manually computing the expected
score by hand for at least two representative members with meaningfully
different histories, and confirming the system's computed score matches —
a final sanity check that the implementation's interpretation of the
LLD's formula matches a human's independent reading of that same
specification.

---

## 24. End-of-Day Checklist

### Algorithm Correctness

- [ ] Base fulfillment rate defaults to 100 for zero decided commitments,
      never `NaN`
- [ ] Recency weighting verified to weight recent behavior more heavily
      than older behavior via a constructed asymmetric fixture
- [ ] On-time bonus correctly capped at +10 points
- [ ] Final score always clamped to `[0, 100]`, verified under an
      extreme-input probe

### Trend Correctness

- [ ] Zero-decided-commitments and all-pending edge cases both correctly
      resolve to `'stable'`, never `NaN`/`undefined`
- [ ] ±5-point threshold correctly classifies improving/declining/stable
      across constructed boundary-adjacent fixtures

### Trigger-Point Audit (The Day's Core Deliverable)

- [ ] All five trigger points (manual FULFILLED/DEFERRED/CANCELLED,
      cron-driven MISSED, AI-detected FULFILLED) individually verified via
      a dedicated integration test, not merely reviewed by eye
- [ ] The AI-detected-resolution gap is fixed, with a permanent regression
      test in place guarding against it recurring
- [ ] CANCELLED's exclusion is explicitly asserted (zero score-service
      calls), not merely assumed from the absence of a call site
- [ ] Batch MISSED recalculation deduplicates per unique affected owner

### Denormalized Write Path

- [ ] `persistScore()` correctly writes `users.commitmentScore` and emits
      `member:score_updated` to both the user and team Socket.io rooms
- [ ] A failed Socket.io emission never blocks or reverts the underlying
      database write

### Weekly Cron

- [ ] Every active user receives exactly one `commitment_score_snapshots`
      row per week, idempotent against accidental double-runs
- [ ] Cron processes users in bounded batches, not one oversized
      sequential pass
- [ ] `users.commitmentScore` correctly synced to match the fresh weekly
      snapshot for every processed user

### Security & Performance

- [ ] Every query scoped by both `userId` and `teamId`, no cross-tenant
      leakage possible
- [ ] No new database index required; existing indexes confirmed to
      cover the query pattern
- [ ] No new Redis caching introduced; the denormalized column itself
      serves that role

### Frontend

- [ ] `CommitmentScore.tsx` correctly animates on `member:score_updated`
      rather than silently refetching
- [ ] `TrendIndicator.tsx` correctly renders the now-reliable trend value
      with no component changes required

### Sign-Off

- [ ] All unit and integration tests pass in CI, including the full
      trigger-point audit suite
- [ ] Manual hand-computed verification against seeded historical data
      confirms the implementation matches the LLD's specified formula

---

## 25. Risks & Edge Cases

```
RISK                                              MITIGATION BUILT TODAY
──────────────────────────────────────────────────────────────────────────
A future new commitment-status-change code path
  is added without wiring score recalculation,
  silently reintroducing today's exact class of bug   Per-trigger-source
                                                    metrics tagging
                                                    (Section 20) makes any
                                                    future gap visible as a
                                                    discrepancy, rather than
                                                    remaining silent
                                                    indefinitely

Concurrent recalculation of the same user's score
  from two different trigger points produces a
  corrupted or nonsensical value                     Explicitly accepted
                                                    last-write-wins design;
                                                    every recalculation is a
                                                    full, idempotent
                                                    recomputation from
                                                    current state, never an
                                                    incremental delta,
                                                    making a race
                                                    self-correcting rather
                                                    than corrupting

Weekly cron runs twice in the same week due to a
  deployment restart at an unlucky moment              Unique constraint on
                                                    (userId, weekStart)
                                                    ensures idempotent
                                                    upsert behavior, verified
                                                    via a dedicated
                                                    double-run test

A brand-new team/user with no commitment history
  produces a broken or misleading score/trend
  display during onboarding                           Explicit,
                                                    first-class edge-case
                                                    handling (100 default
                                                    score, 'stable' default
                                                    trend) rather than an
                                                    incidental afterthought

Score value briefly exceeds [0, 100] under an
  unusual input distribution                          Explicit clamping via
                                                    Math.min/Math.max,
                                                    verified under a
                                                    constructed extreme-
                                                    input test

Socket.io emission failure silently prevents the
  database write itself from completing               Explicit design
                                                    ensuring the emission is
                                                    wrapped independently of
                                                    the write; a failed
                                                    emission is logged, never
                                                    propagated as a failure
                                                    of the underlying
                                                    persistence operation
```

---

*Document: DAY-69-PLAN-001 | Vocaply | Day 69: Commitment Score Algorithm — Full Implementation & Denormalized Write Path*
*Full Scalable Industry-Level Build Plan | Principal Engineer Edition*
*Trigger-point completeness audit · Denormalized write-path discipline · Self-correcting weekly recomputation*
*Security-first · Performance-optimized · Production-grade · Planning Document — No Code*
