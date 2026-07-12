# Vocaply — Day 57: Bot Deduplication (Hardening Pass)
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-57-PLAN-001 | Version 1.0 | Phase 5 — Integrations | Planning Only — No Code

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Architecture Philosophy](#2-architecture-philosophy)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Dependency Flow & Layering](#4-dependency-flow--layering)
5. [Why a Dedicated Hardening Day Is Justified](#5-why-a-dedicated-hardening-day-is-justified)
6. [The Race Condition Catalogue](#6-the-race-condition-catalogue)
7. [Layer 1 — dedup.service.ts (Core Utility)](#7-layer-1--dedupservicets-core-utility)
8. [Layer 2 — Repository Addition](#8-layer-2--repository-addition)
9. [Layer 3 — Refactoring Existing Call Sites](#9-layer-3--refactoring-existing-call-sites)
10. [TTL Design & Time Math](#10-ttl-design--time-math)
11. [Two-Phase Claim Protocol — Full State Machine](#11-two-phase-claim-protocol--full-state-machine)
12. [Concurrency Model & Atomicity Guarantees](#12-concurrency-model--atomicity-guarantees)
13. [Security Architecture](#13-security-architecture)
14. [Performance & Scalability Architecture](#14-performance--scalability-architecture)
15. [Reliability & Failure Handling](#15-reliability--failure-handling)
16. [Observability & Monitoring](#16-observability--monitoring)
17. [Redis Key Space — Complete Specification](#17-redis-key-space--complete-specification)
18. [Error Taxonomy](#18-error-taxonomy)
19. [Hour-by-Hour Execution Plan](#19-hour-by-hour-execution-plan)
20. [Testing & Verification Plan](#20-testing--verification-plan)
21. [End-of-Day Checklist](#21-end-of-day-checklist)
22. [Risks & Edge Cases Register](#22-risks--edge-cases-register)

---

## 1. Day Overview & Goals

### What Gets Built Today

Day 17 shipped a working 2-layer deduplication design (Redis fast-path +
PostgreSQL unique-index authoritative fallback) inline inside
`meetings.service.ts`, scoped to the manual "add a meeting" flow — one user,
one click, low frequency. Day 56 then introduced the **first high-volume,
concurrent, multi-actor producer** of dedup checks: an hourly cron fanning out
N sync jobs, any of which may discover the *same* calendar event via *different*
team members' calendars, landing in the same BullMQ processing window.

Day 57 does not invent a new dedup strategy. It takes the Day 17 design,
**proves it under real concurrency**, closes every gap that only becomes
visible at that concurrency, extracts it into a **shared, independently
tested utility**, and instruments it so a dedup failure is observable rather
than a silent, expensive surprise (double Recall.ai billing, duplicate bots
joining the same call in front of a customer).

```
TODAY BUILDS:
  ✅ dedup.service.ts — extracted, shared, two-phase claim utility
  ✅ Atomic Redis SET...NX claim protocol (closes the check-then-write race)
  ✅ Two-phase claim/confirm/release lifecycle (closes the slow-DB-write race)
  ✅ PostgreSQL fallback layer for Redis staleness/eviction
  ✅ meetings.repository.ts: findActiveByPlatformId() extraction
  ✅ Refactor of Day 17's meetings.service.ts to call the shared utility
  ✅ Refactor of Day 56's calendar-sync.service.ts to call the SAME utility
  ✅ Three new Grafana-visible metrics + structured skip logging
  ✅ A concurrency-focused CI test suite (100-iteration race-condition proof)

DOWNSTREAM IMPACT:
  Day 58 — Jira ticket sync reuses the exact "atomic claim, two-phase
           confirm/release" PATTERN (not this file directly, but the design
           principle) for its own idempotency requirement around external
           ticket creation
  Day 62 — Notion database sync inherits the same dedup discipline
  Day 63 — Outlook Calendar becomes the SECOND producer of dedup checks
           alongside Google Calendar — proving today's extraction was
           correctly generalized, not Google-specific
  Every future integration that can produce the "same real-world event,
  multiple times, from multiple sources" pattern depends on this day's
  utility being bulletproof, not just "good enough for one user clicking a
  button"

DO NOT SKIP OR RUSH:
  A dedup bug here is not a cosmetic bug. It is a direct line item on a
  Recall.ai invoice (bots are billed per-minute-per-bot) and a visible,
  embarrassing product defect (two "Vocaply" bots joining the same Zoom
  call in front of a customer's leadership team). This is the single
  highest financial-and-reputational-risk utility in the entire Phase 5
  sprint, and it is being hardened, not built from scratch — meaning
  today's job is rigor, not speed.
```

### 8-Hour Time Allocation

```
9:00 AM  – 9:30 AM   → Audit Day 17's inline dedup logic; enumerate every
                        race condition and edge case it did NOT handle
9:30 AM  – 10:30 AM  → dedup.service.ts: checkAndClaim() — atomic claim +
                        two-phase protocol + Postgres fallback
10:30 AM – 11:00 AM  → dedup.service.ts: confirmClaim(), releaseClaim(),
                        computeDedupTtl(), buildDedupKey()
11:00 AM – 12:00 PM  → meetings.repository.ts: findActiveByPlatformId()
                        extraction + index verification
12:00 PM – 1:00 PM   → Lunch break
1:00 PM  – 2:00 PM   → Refactor meetings.service.ts (Day 17) to call the
                        shared utility — remove all inline dedup code
2:00 PM  – 2:45 PM   → Refactor calendar-sync.service.ts (Day 56) to call
                        the shared utility — remove any temporary inline
                        version if one was scaffolded ahead of this day
2:45 PM  – 3:30 PM   → Metrics counters + structured logging + Grafana
                        panel wiring
3:30 PM  – 4:30 PM   → Concurrency test suite: 100-iteration Promise.all()
                        race test, TTL test, stale-Redis test,
                        release-on-failure test
4:30 PM  – 5:15 PM   → Manual load test: simulate the "5 calendars, 1
                        shared event" scenario end-to-end against staging
5:15 PM  – 5:45 PM   → Load test against BullMQ concurrency=5 fan-out
                        (Day 56's actual worker), not just isolated unit calls
5:45 PM  – 6:00 PM   → Checklist review + sign-off
```

---

## 2. Architecture Philosophy

### Four Guiding Principles for Today's Build

```
PRINCIPLE 1 — One Correctness-Critical Utility, One Owner
  Deduplication logic must exist in exactly one file, called by every
  producer (manual add, calendar sync, and every future integration that
  can create meetings). Two implementations of "the same" dedup logic is
  worse than either implementation alone — it guarantees eventual drift,
  where one caller gets a bug fix and the other doesn't.

PRINCIPLE 2 — Atomicity Is Not Optional, It's the Entire Point
  A dedup mechanism built from two separate Redis calls (GET, then SET) is
  not a dedup mechanism — it's a race condition with extra steps. Every
  claim operation in this design is a SINGLE atomic Redis command. This is
  restated multiple times in this document deliberately, because it is the
  one invariant that must survive any future refactor.

PRINCIPLE 3 — Redis Is a Fast Path, Postgres Is the Truth
  Redis can be evicted, can restart, can lose data under memory pressure —
  none of that is acceptable to lose a dedup guarantee over. Every claim
  that passes the Redis fast path is still validated against PostgreSQL's
  unique index, the actual source of truth, before being trusted. Redis
  makes the common case fast; Postgres makes the rare case correct.

PRINCIPLE 4 — Silent Correctness Is Insufficient — It Must Be Observable
  A dedup system that works correctly but produces zero visibility into
  HOW OFTEN it's catching duplicates, or which layer caught them, is
  undebuggable in production. Today's build treats metrics and structured
  logging as first-class deliverables, not an afterthought — this is what
  turns "it works" into "we can prove it works and diagnose it if it ever
  doesn't."
```

---

## 3. File Structure to Create

```
services/api/src/
│
├── services/
│   └── dedup.service.ts                    ← NEW: extracted shared utility
│
├── modules/meetings/
│   ├── meetings.repository.ts              ← MODIFY: add findActiveByPlatformId()
│   └── meetings.service.ts                 ← MODIFY: remove inline dedup,
│                                               call dedupService instead
│
├── services/
│   └── calendar-sync.service.ts            ← MODIFY (Day 56 follow-up):
│                                               call dedupService instead of
│                                               any temporary inline version
│
├── config/
│   └── metrics.config.ts                   ← MODIFY: register 3 new counters
│
└── tests/
    └── unit/
        └── dedup.service.test.ts           ← NEW: concurrency + TTL + fallback tests
```

Notably: **zero new API endpoints, zero new database tables, zero new queues**
are introduced today. This is a pure internal-quality/hardening day — the
smallest file footprint of any day in Phase 5, and deliberately so: the
scope is narrow specifically so it can be rigorous.

---

## 4. Dependency Flow & Layering

```
meetings.service.ts (Day 17, refactored today)
  createMeeting() / addBotManually()
        │
        ▼
dedup.service.ts (NEW today)
  checkAndClaim() ──┬──► redis (atomic SET...NX)
                     └──► meetings.repository.ts.findActiveByPlatformId()
                                └──► Prisma → PostgreSQL (unique partial index)
  confirmClaim()  ──► redis (SET...KEEPTTL, upgrade placeholder → real ID)
  releaseClaim()  ──► redis (DEL)

calendar-sync.service.ts (Day 56, refactored today)
  syncUserCalendar()
        │
        ▼
dedup.service.ts  (SAME functions, SAME file, SAME guarantees — no
                    parallel implementation)
```

**Design rule enforced today:** `dedup.service.ts` has exactly two
dependencies — the Redis client and `meetings.repository.ts`. It does not
import `meetings.service.ts`, Recall.ai's client, or anything integration-
specific. This keeps it a pure, low-level primitive that any future
meeting-creating code path can depend on without pulling in unrelated
business logic — the same "provider isolation" discipline applied to a
non-provider utility.

---

## 5. Why a Dedicated Hardening Day Is Justified

### The Concurrency Delta, Precisely Stated

```
BEFORE DAY 56 (Day 17's original context):
  Producer count:        1 (a human clicking "Add meeting")
  Concurrency:            effectively 1 — a human cannot click twice within
                          the same millisecond in a way that matters
  Frequency:              low — bounded by how many meetings a person adds
                          manually per day
  Blast radius of a bug:  one duplicate bot, caught quickly by the user
                          noticing two bots in their own meeting

AFTER DAY 56 (today's actual operating context):
  Producer count:        N (every team member with a connected calendar
                          who has the SAME event on their calendar)
  Concurrency:            up to 5 simultaneous BullMQ workers (Day 56's
                          configured concurrency), each independently
                          discovering what may be the SAME external event
  Frequency:              HIGH — every single hour, for every connected
                          calendar, automatically, with no human in the
                          loop to notice or prevent a mistake before it
                          happens
  Blast radius of a bug:  N duplicate bots (as many as team members with
                          the shared event), N× Recall.ai billing for a
                          single meeting, and a visibly broken product
                          experience (multiple "Vocaply" bots in one call)
```

This delta — from "effectively un-raceable" to "structurally guaranteed to
be raced, every hour, at N-way concurrency" — is precisely why Day 17's
original implementation, correct as it was for its original context, cannot
simply be trusted as-is once Day 56 goes live. Day 57 exists to close that
gap **before** it reaches production traffic, not after an incident.

---

## 6. The Race Condition Catalogue

### Race 1 — The Naive Check-Then-Write Race (Closed by Atomic SET NX)

```
WITHOUT atomic claim:
  T0: Job A: GET bot:scheduled:zoom:123 → null → "not claimed, proceed"
  T0: Job B: GET bot:scheduled:zoom:123 → null → "not claimed, proceed"
      (both reads happen before either write — classic TOCTOU)
  T1: Job A: SET bot:scheduled:zoom:123 = "mtg_abc"
  T1: Job B: SET bot:scheduled:zoom:123 = "mtg_xyz"  (silently overwrites A)
  RESULT: both jobs believe they successfully claimed the slot. Two
          meetings created, two bots scheduled, two Recall.ai bots join
          the same call.

WITH SET key value EX ttl NX (single atomic command):
  T0: Job A: SET ... NX → Redis returns OK (key didn't exist, now does)
  T0: Job B: SET ... NX → Redis returns null (key already existed) —
      this is GUARANTEED by Redis's single-threaded command execution
      model; there is no interleaving possible between two NX attempts on
      the same key, full stop.
  RESULT: exactly one job proceeds.
```

### Race 2 — The Slow-DB-Write Race (Closed by the Two-Phase Protocol)

```
Even with atomic SET NX, a NAIVE single-phase design (claim = final value)
has a subtler problem:

  T0: Job A: SET bot:scheduled:zoom:123 = "mtg_abc" NX → succeeds
  T0: Job A: begins the (slow) sequence of: plan-limit check → Recall.ai
      bot scheduling (network call, 200-500ms) → Postgres write
  T1 (before Job A's Postgres write completes): Job A's process CRASHES
      (worker OOM-killed, deploy restart, etc.)
  RESULT: the Redis key now holds "mtg_abc", a meeting ID that was NEVER
          actually persisted. Every subsequent sync for the next TTL
          period (up to 28 hours per §10) will see this key as "claimed"
          and skip creating the meeting — a permanently lost meeting that
          nobody will retry, discovered only when a human notices a
          meeting never showed up.

WITH the two-phase protocol (claim → confirm OR release):
  T0: Job A: SET key = "claiming" NX → succeeds (placeholder value, not
      a real meeting ID yet)
  T0: Job A: begins the slow sequence...
  T1: Job A CRASHES before completing
  RESULT: Redis key holds "claiming" — a value that is DISTINGUISHABLE
          from a confirmed claim. (Today's design does not yet auto-detect
          and reap stale "claiming" placeholders — see §22 Risk Register
          for the accepted mitigation: the TTL itself is the backstop,
          and this is an explicit, documented tradeoff, not an oversight.)
  If Job A's crash is instead a caught, handled FAILURE (e.g. Recall.ai
  returned a 502, not a process crash) → Job A calls releaseClaim()
  in its own catch block → key is deleted immediately → next sync attempt
  is NOT blocked, retries cleanly within the same hour cycle rather than
  waiting out the TTL.
```

### Race 3 — The Stale/Evicted Redis Race (Closed by the Postgres Fallback)

```
SCENARIO: Redis restarts (deploy, OOM eviction under `maxmemory` pressure,
infra maintenance) between the time Meeting X was created (Postgres row
exists, dedup key was set) and the next hourly sync attempts to process
the same calendar event again.

WITHOUT the Postgres fallback:
  T0: Redis restarts, all dedup keys lost (Redis is NOT configured as the
      durable source of truth for this data — by design, see §14)
  T1: Next sync: SET bot:scheduled:zoom:123 NX → succeeds (key doesn't
      exist anymore) → job believes it has genuinely claimed a new slot
  RESULT: a SECOND meeting + bot created for an event that already has
          an active, non-terminal meeting in Postgres.

WITH the Postgres fallback (Layer 2, inside checkAndClaim itself):
  T1: SET ... NX → succeeds (Redis is empty, as above)
  T1: dedup.service.ts does NOT stop here — it immediately queries
      meetingRepo.findActiveByPlatformId(teamId, platform, id)
  T1: Query finds the EXISTING, still-active meeting from before the
      Redis restart → the just-claimed Redis key is immediately deleted
      (releasing the false claim) → checkAndClaim() returns true
      (duplicate)
  RESULT: correctly detected as a duplicate DESPITE Redis having lost all
          memory of the original claim. This is the entire reason Layer 2
          exists — it is not redundant with Layer 1, it is Layer 1's
          correctness backstop.
```

---

## 7. Layer 1 — dedup.service.ts (Core Utility)

### Function: `checkAndClaim(input: ClaimDedupSlotInput): Promise<boolean>`

**Contract** (restated precisely, as the load-bearing API every caller
depends on):

```
Input:  { teamId, platform, platformMeetingId, scheduledAt }
Output: boolean
  true  → this IS a duplicate. Caller MUST skip meeting creation and
          perform no further action — no confirmClaim(), no releaseClaim().
  false → this call SUCCESSFULLY claimed the slot. Caller MUST eventually
          call EXACTLY ONE of confirmClaim() or releaseClaim() — never
          both, never neither. This is a hard contractual obligation on
          every call site, not a suggestion.
```

**Internal sequence:**

1. Build the deterministic Redis key from `(platform, platformMeetingId)` —
   deliberately **not** including `teamId` in the key (see §13, "Why the
   Dedup Key Is Not Team-Scoped" for the security/correctness reasoning
   behind this specific design choice).
2. Compute the TTL via `computeDedupTtl(scheduledAt)` (§10).
3. Issue a single atomic `SET key 'claiming' EX ttl NX` command.
4. If the command reports the key already existed (claim failed) → increment
   the `dedup.redis_hit` metric, log a structured skip event, return `true`.
5. If the command succeeded (claim acquired) → proceed to the Postgres
   fallback check: query `findActiveByPlatformId(teamId, platform,
   platformMeetingId)`.
6. If Postgres finds an existing active (non-terminal-status) meeting →
   this is the stale-Redis scenario (Race 3, §6) → **delete the
   just-acquired Redis key** (releasing the false claim back), increment
   `dedup.postgres_hit_after_redis_miss`, log a structured skip event,
   return `true`.
7. If Postgres finds nothing → increment `dedup.claimed_new`, return
   `false` — the caller is now the sole, confirmed owner of this slot and
   is obligated to call `confirmClaim()` or `releaseClaim()`.

### Function: `confirmClaim(platform, platformMeetingId, meetingId): Promise<void>`

Upgrades the placeholder `'claiming'` value to the real meeting ID using
`SET key value KEEPTTL` — `KEEPTTL` is used deliberately rather than
re-specifying `EX ttl`, because re-specifying the TTL here would reset the
countdown from the moment of confirmation rather than from the moment of
original claim, subtly extending the slot's lifetime on every successful
meeting creation for no correctness benefit and a small, needless increase
in Redis memory retention.

### Function: `releaseClaim(platform, platformMeetingId): Promise<void>`

A direct `DEL` on the key. Called from the **caller's own catch block** when
meeting creation fails after a successful claim — this function itself
contains no error-handling branching logic (it doesn't need to know *why*
the caller is releasing, only that it should). Deliberately idempotent: calling
`DEL` on a key that no longer exists (e.g., if it already expired) is a
harmless no-op, not an error — so a caller never needs to guard this call
with an existence check first.

### Function: `computeDedupTtl(scheduledAt: Date): number`

See §10 for full design rationale. Summary: `max(3600,
secondsUntil(scheduledAt + 4 hours))` — never less than one hour, and long
enough to cover the entire realistic duration of the meeting plus a buffer
for late processing.

### Function: `buildDedupKey(platform: PlatformType, platformMeetingId: string): string`

Pure string formatting: `` `bot:scheduled:${platform.toLowerCase()}:${platformMeetingId}` ``.
Kept as its own function (rather than inlined at each call site within this
file) specifically so the key format is defined in exactly one place — if
the naming convention ever needs to change, every read and write path
updates from a single edit.

---

## 8. Layer 2 — Repository Addition

### `meetings.repository.ts` — `findActiveByPlatformId()`

```
Signature: findActiveByPlatformId(
  teamId: string, platform: PlatformType, platformMeetingId: string
): Promise<Meeting | null>

Query shape:
  SELECT * FROM meetings
  WHERE team_id = $1
    AND platform_meeting_id = $2
    AND status NOT IN ('DONE', 'FAILED', 'CANCELLED')
  LIMIT 1

Index used: idx_meetings_platform_dedup — the UNIQUE PARTIAL index already
defined in the Day 3 schema:
  CREATE UNIQUE INDEX idx_meetings_platform_dedup
    ON meetings(team_id, platform_meeting_id)
    WHERE platform_meeting_id IS NOT NULL;

Note the query filters status NOT IN (...) in application code/Prisma,
while the UNIQUE INDEX itself has no status predicate — meaning the
DATABASE-LEVEL uniqueness guarantee is actually STRICTER than this
query's business definition of "active" (the DB will reject a second row
with the same team_id+platform_meeting_id combination EVEN IF the first
one is already DONE). This is intentional and is the true final backstop:
even if every application-layer and Redis-layer check somehow failed
simultaneously, Prisma's own P2002 unique-constraint-violation error is
the last line of defense, caught by meetings.service.ts and mapped to a
409 DUPLICATE response, per the Day 17 error handling design.
```

Today's work is purely the **extraction** of this query into a standalone,
independently callable, independently testable repository function — the
query itself and the index it relies on are both unchanged carryovers from
Day 3/Day 17, confirmed rather than reinvented.

### Why This Belongs in the Repository Layer, Not the Service Layer

Per the sprint-wide Controller → Service → Repository discipline: `dedup.service.ts`
is itself a *service*, and services never issue raw Prisma queries directly —
they call repository functions. `findActiveByPlatformId` living in
`meetings.repository.ts` (not inside `dedup.service.ts` itself) preserves
this layering even though `dedup.service.ts` is a cross-cutting utility
rather than a typical feature-module service.

---

## 9. Layer 3 — Refactoring Existing Call Sites

### `meetings.service.ts` (Day 17) — Before and After

```
BEFORE (Day 17's original inline implementation):
  createMeeting() and addBotManually() each contained their own inline
  sequence: Redis EXISTS check → Postgres findByPlatformId query →
  Redis SETEX after successful creation. Two call sites, two copies of
  effectively the same logic, already a maintenance smell even before
  Day 56 added a third caller.

AFTER (today's refactor):
  Both functions now call:
    const isDuplicate = await dedupService.checkAndClaim({
      teamId, platform, platformMeetingId, scheduledAt
    })
    if (isDuplicate) throw new DuplicateError('MEETING_DUPLICATE', ...)

    try {
      const meeting = await createMeetingRecord(...)  // bot scheduling + DB write
      await dedupService.confirmClaim(platform, platformMeetingId, meeting.id)
      return meeting
    } catch (err) {
      await dedupService.releaseClaim(platform, platformMeetingId)
      throw err
    }

  Net line count: DECREASES. Net correctness: INCREASES (both call sites
  now share the exact same, single, tested claim/confirm/release
  discipline — including the two-phase protocol that Day 17's original
  single-phase design did not have).
```

### `calendar-sync.service.ts` (Day 56) — Confirming the Seam

As documented in Day 56's own plan (§14, "Deduplication Integration"),
`calendar-sync.service.ts` was **already written against this exact
function signature** in anticipation of today's extraction. Today's
refactor here is either:

- A **no-op import path change** (if Day 56 called a temporary inline
  version using the identical signature) — confirming the seam was clean,
  exactly as designed, or
- The **first real wiring** (if Day 56 left a `// TODO: Day 57` placeholder
  call) — today fills it in.

Either way, this is the moment both producers (manual add, calendar sync)
are proven to share **one** implementation, which is the entire strategic
point of today's work — not "dedup exists," but "dedup exists exactly
once, and every caller of it behaves identically."

---

## 10. TTL Design & Time Math

### Why `max(3600, secondsUntil(scheduledAt + 4 hours))`

```
LOWER BOUND (3600s / 1 hour):
  Protects meetings scheduled to start very soon (or already slightly in
  the past — e.g. a manual "add bot now" for a meeting already in
  progress). Without a floor, a meeting scheduled 2 minutes from now
  would compute a near-zero TTL, and the dedup key would expire before
  the bot even finishes joining — reopening the exact race window this
  system exists to close, for the highest-urgency case (an imminent
  meeting) no less.

UPPER BOUND BEHAVIOR (scheduledAt + 4 hours):
  The "+4 hours" buffer exists because:
    a. Meeting duration is unknown at scheduling time — a "30-minute
       standup" on the calendar can run long
    b. Processing time after the meeting ends (transcript storage →
       extraction → DONE transition, per Day 17/18's pipeline) is not
       instantaneous — the dedup key must outlive the ENTIRE pipeline,
       not just the meeting's calendar-declared duration, or a
       still-PROCESSING meeting could be seen as "available" and
       double-scheduled
    c. 4 hours is a deliberately generous ceiling chosen to comfortably
       exceed the 99th-percentile case of "long meeting + slow
       processing" without being unboundedly long (an infinite TTL would
       mean a permanently CANCELLED or FAILED meeting's dedup key never
       frees up, blocking legitimate re-scheduling of a corrected event
       forever)

FOR A MEETING SCHEDULED 24 HOURS FROM NOW:
  secondsUntil(scheduledAt + 4h) = ~28 hours in seconds → this becomes
  the TTL (far exceeding the 3600s floor). The key survives comfortably
  past the meeting's actual occurrence and processing window even for
  meetings scheduled a full day in advance.

WHAT HAPPENS AFTER TTL EXPIRY WHILE A MEETING IS STILL PENDING (edge case):
  If a meeting is somehow still PENDING processing past its own TTL
  window (a genuinely pathological, very-late-processing scenario), the
  Redis key expiring is NOT a correctness failure — Layer 2 (Postgres)
  still catches the duplicate via findActiveByPlatformId(), exactly as
  designed for the stale-Redis case (Race 3, §6). TTL expiry degrades
  Layer 1's speed advantage back to Layer 2's authoritative check; it
  never degrades correctness.
```

---

## 11. Two-Phase Claim Protocol — Full State Machine

```
                    ┌─────────────────────┐
                    │   NO KEY EXISTS      │  ← initial state, or after
                    │   (slot available)   │    TTL expiry / releaseClaim()
                    └──────────┬───────────┘
                               │ checkAndClaim() — SET...NX succeeds
                    ┌──────────▼───────────┐
                    │  "claiming" (Layer 1  │  ← placeholder value;
                    │   claimed, Layer 2    │    caller is mid-flight
                    │   check in progress)  │    creating the meeting
                    └──────────┬───────────┘
                 ┌─────────────┼─────────────┐
   Layer 2 finds │             │             │ Caller's meeting
   existing row  │             │             │ creation SUCCEEDS
   (Race 3)      │             │             │
        ┌────────▼──────┐      │      ┌──────▼─────────┐
        │  DEL (release) │      │      │  confirmClaim() │
        │  → NO KEY      │      │      │  → real meetingId│
        │  EXISTS again  │      │      │  (SET KEEPTTL)   │
        └────────────────┘      │      └─────────────────┘
                                 │ Caller's meeting
                                 │ creation FAILS
                        ┌────────▼────────┐
                        │  releaseClaim()  │
                        │  → NO KEY EXISTS │
                        │     again        │
                        └─────────────────┘

TERMINAL STATE (until TTL expiry or explicit release):
  Key holds the real meetingId — any subsequent checkAndClaim() for the
  same (platform, platformMeetingId) hits Layer 1 (Redis) and returns
  true (duplicate) without ever reaching Layer 2, which is the fast,
  common-case path this whole two-layer design optimizes for.
```

Every arrow in this diagram corresponds to exactly one function call in
`dedup.service.ts` — there is no code path that transitions the key's state
outside of `checkAndClaim`, `confirmClaim`, or `releaseClaim`. This
closed-set property is what makes the protocol's correctness arguable at
all; a stray `redis.set()` call anywhere else in the codebase touching a
`bot:scheduled:*` key would silently break every guarantee documented here,
which is why **all direct Redis access to this key namespace is confined to
`dedup.service.ts`** as a hard architectural rule, enforced by code review
(and optionally an ESLint boundary rule restricting `bot:scheduled:` string
literals to this one file, mirroring the `eslint-plugin-boundaries` pattern
already used for frontend feature isolation).

---

## 12. Concurrency Model & Atomicity Guarantees

### What Makes `SET key value EX ttl NX` Actually Atomic

Redis is single-threaded for command execution (even with I/O threading
enabled in modern Redis versions, command *execution* against the keyspace
remains serialized). `SET ... NX` is a single command, not a
client-orchestrated sequence of `EXISTS` + `SET` — this means Redis itself
guarantees that of any N concurrent `SET ... NX` calls for the same key,
**exactly one** can ever succeed, with zero possibility of interleaving,
regardless of how many application processes or worker threads issue the
command simultaneously. This is the single sentence that justifies the
entire design, and it's worth every engineer on the team internalizing it
precisely: the atomicity guarantee comes from Redis's execution model, not
from anything Vocaply's application code does.

### What Concurrency Level This Must Actually Survive

```
Day 56's calendar-sync.worker.ts: BullMQ concurrency = 5
  → up to 5 syncUserCalendar() calls executing truly concurrently
  → each may independently call checkAndClaim() for events that turn out
    to reference the SAME (platform, platformMeetingId) if 5 different
    users share a calendar invite

Manual "Sync Now" (Day 56 §10): can be triggered by any one of those same
  5 users at any moment, independent of the cron — a 6th concurrent caller
  is fully possible

Manual "Add meeting" (Day 17): a human clicking a button — low frequency,
  but NOT mutually exclusive with the above; a user could manually add a
  meeting URL that ALSO happens to be on their calendar, moments before
  the hourly sync would have caught it automatically

WORST-CASE REALISTIC CONCURRENCY TODAY'S DESIGN MUST HANDLE: 6+ simultaneous
checkAndClaim() calls for the identical (platform, platformMeetingId) pair.
This is exactly why the CI test (§20) fires 10 concurrent calls, not just 2
— proving correctness at a concurrency level comfortably above the current
realistic ceiling.
```

---

## 13. Security Architecture

### Why the Dedup Key Is Not Team-Scoped (Deliberate Design Choice)

```
The Redis key format is:
  bot:scheduled:{platform}:{platformMeetingId}

NOT:
  bot:scheduled:{teamId}:{platform}:{platformMeetingId}

RATIONALE:
  A platform meeting ID (a Zoom numeric ID, a Google Meet room code) is
  GLOBALLY unique at the platform level, not per-Vocaply-team. If Team A
  and Team B both somehow reference the exact same underlying Zoom
  meeting (a realistic scenario: an external vendor call where both a
  client team and a vendor team, each on separate Vocaply accounts, add
  the same Zoom link), a team-scoped key would allow TWO Recall.ai bots
  into the SAME real-world call — one per team — which is both a wasted
  cost and a confusing "why are there two Vocaply bots" experience for
  the actual meeting participants.

  The Postgres fallback layer (Layer 2) DOES include teamId in its query
  (findActiveByPlatformId(teamId, platform, platformMeetingId)) —
  meaning Postgres enforces per-team meeting records as expected (Team
  A's meeting row and Team B's meeting row are two separate rows, each
  correctly tenant-isolated), while Redis enforces a stricter, PLATFORM-
  LEVEL exclusivity specifically for the finite, expensive, real-world
  resource this whole system protects: Recall.ai bot minutes joining one
  actual video call.

  This is a considered asymmetry, not an inconsistency — documented here
  explicitly so a future engineer doesn't "fix" it into a team-scoped key
  and reintroduce the cross-team double-bot scenario.
```

### Tenant Isolation Is Still Fully Preserved

The **meeting records themselves** created after a successful claim remain
fully `team_id`-scoped through every layer already established (application
WHERE clauses, Prisma middleware, PostgreSQL RLS) — today's design changes
nothing about tenant data isolation for what gets *stored*; it only changes
the scope of the *external-resource contention lock*, which is a
deliberately different, narrower concern.

### No New Attack Surface

`dedup.service.ts` accepts no user-controlled input beyond what has already
been validated upstream (`platform` is a validated enum, `platformMeetingId`
is derived by `platform-detect.ts` from a URL, never accepted raw from a
client). No new endpoints are exposed today — this is purely an internal
utility with no direct external attack surface, and the security review for
today's day is correspondingly narrower than a day introducing new routes.

---

## 14. Performance & Scalability Architecture

### Why Redis-First, Postgres-Fallback (Not the Reverse)

```
Redis SET...NX latency: sub-millisecond, single round-trip
PostgreSQL indexed SELECT latency: low single-digit milliseconds

At the concurrency and frequency described in §12, the OVERWHELMING
majority of checkAndClaim() calls will be either:
  (a) the FIRST claim for a genuinely new meeting → Layer 1 succeeds,
      Layer 2 runs once as a confirmation (unavoidable, but only once
      per genuinely new meeting, not once per duplicate attempt), or
  (b) a DUPLICATE attempt for an already-claimed slot → Layer 1 REJECTS
      immediately, Layer 2 is NEVER QUERIED AT ALL (per the checkAndClaim
      algorithm in §7, step 4 returns immediately on a Redis miss)

This means the expensive path (a Postgres round-trip) is paid AT MOST
once per genuinely new meeting, and ZERO times for the 4 (or 5, or N-1)
duplicate calls that the two-phase Redis claim already rejected outright.
This is the core performance argument for the two-layer design: it is not
"Redis OR Postgres," it is "Redis eliminates N-1 of N Postgres queries in
the common case."
```

### Why Redis Is Explicitly NOT the Durable Source of Truth

Per Principle 3 (§2): Redis's `bot:scheduled:*` keys are a **performance
optimization and fast-path lock**, never the authoritative record of "does
this meeting exist." This is why Race 3 (§6) is treated as an expected,
handled scenario rather than a catastrophic failure mode — the design
already assumes Redis can lose this data at any time, and is architected so
that losing it degrades performance (falls back to Postgres on every
subsequent check) rather than correctness (a duplicate is still always
caught).

### Memory Footprint at Scale

```
At 10,000 teams × ~120 meetings/month (per the platform's own capacity
estimates, HLD §22): roughly 1.2M meetings/month, each holding a dedup key
for up to ~28 hours (§10) before natural expiry.

Peak concurrent key count ≈ (meetings/month ÷ 30 days) × (28 hours ÷ 24
hours) ≈ 40,000 × 1.17 ≈ ~47,000 keys at any given moment, each a short
string key + short string value (a meeting ID, ~25 bytes). This is a
trivially small Redis memory footprint (well under 10MB even accounting
for Redis's per-key overhead) — dedup key volume is NOT a capacity
planning concern at any realistic scale increase for this product, and
this is worth stating explicitly so it's never mistaken for a scaling risk
that needs future work.
```

---

## 15. Reliability & Failure Handling

```
FAILURE MODE                          BEHAVIOR
─────────────────────────────────────────────────────────────────────────
Redis entirely unavailable            checkAndClaim()'s SET...NX call
                                       throws. Per the same fail-closed
                                       principle established in Day 56
                                       §18 for the sync lock, this
                                       propagates as a genuine failure —
                                       the caller (meetings.service.ts or
                                       calendar-sync.service.ts) does NOT
                                       proceed to create a meeting without
                                       a successful claim. A Redis outage
                                       means meeting creation pauses
                                       entirely rather than risking
                                       unbounded duplicate bot creation.

Worker crash between claim and        The Redis key remains in the
confirm/release (Race 2, §6)          "claiming" placeholder state until
                                       its TTL naturally expires (up to
                                       ~28 hours per §10). During that
                                       window, legitimate re-attempts for
                                       the same meeting are incorrectly
                                       treated as duplicates and skipped.
                                       ACCEPTED TRADEOFF for today (see
                                       §22) — the alternative (a
                                       heartbeat/reaper mechanism for
                                       stale claims) is explicitly
                                       deferred as unnecessary complexity
                                       at current failure rates, and
                                       flagged for revisit only if
                                       production data shows this
                                       actually occurring with meaningful
                                       frequency.

Postgres unavailable during the       checkAndClaim()'s Layer 2 query
Layer 2 fallback check                throws. The already-acquired Redis
                                       claim is left in place (not
                                       released) — the error propagates
                                       to the caller, who does not
                                       proceed to create a meeting. This
                                       means a Postgres outage also
                                       fail-closed, consistent with the
                                       Redis-outage behavior above: no
                                       new meetings are created if either
                                       layer of the dedup check cannot
                                       complete, which is always the
                                       safer failure direction for a
                                       system whose failure mode is
                                       "costs real money per duplicate."

confirmClaim() itself fails           This is a genuinely rare edge case
(e.g., a Redis write failure          (Redis just succeeded on the claim
immediately after a successful         moments ago) but is not ignored:
meeting creation)                     if confirmClaim() throws, the
                                       caller's try/catch (§9) still runs
                                       — but the meeting WAS already
                                       successfully created in Postgres
                                       at this point, so releaseClaim()
                                       must NOT be called here (that would
                                       incorrectly free a slot for a
                                       meeting that genuinely exists).
                                       This asymmetry — confirmClaim
                                       failures do not trigger
                                       releaseClaim — is called out
                                       explicitly in code comments at the
                                       call site to prevent a
                                       well-intentioned but incorrect
                                       "catch everything, always release"
                                       refactor later.
```

---

## 16. Observability & Monitoring

### Metrics (New Today)

```
dedup.redis_hit                    Incremented when Layer 1 alone catches
                                    a duplicate (the fast, common case for
                                    genuine dedup events)

dedup.postgres_hit_after_redis_miss Incremented when Layer 1 reports "new"
                                    but Layer 2 finds an existing row (the
                                    stale-Redis / Race 3 scenario). A
                                    sustained non-zero rate here is a
                                    signal Redis is losing data more often
                                    than expected (eviction pressure,
                                    unplanned restarts) and worth
                                    investigating even though the system
                                    is self-healing.

dedup.claimed_new                  Incremented when a claim genuinely
                                    succeeds end-to-end (no duplicate at
                                    either layer) — the expected outcome
                                    for the first sync of any real new
                                    meeting. Useful as a denominator: the
                                    ratio of redis_hit+postgres_hit to
                                    claimed_new over time roughly measures
                                    "how many redundant discovery attempts
                                    does the average meeting generate,"
                                    which is a proxy for how many team
                                    members typically share a calendar
                                    invite.
```

### Structured Logging (New Today)

```
Every skip (duplicate) emits:
  { event: 'dedup.skip', teamId, platform, platformMeetingId,
    layer: 'redis' | 'postgres' }

Every successful claim emits (debug level, high volume, not alerting-relevant):
  { event: 'dedup.claimed', teamId, platform, platformMeetingId }

Every release emits:
  { event: 'dedup.released', platform, platformMeetingId, reason: 'creation_failed' }
```

The `layer` field on every skip log is the single most valuable diagnostic
addition today makes — it turns "why didn't 5 calendars create 5 meetings"
(a support question that previously required a database query to answer)
into a log-search-only question, consistent with the Day 18 principle that
"a single meeting's processing journey [should be] traceable end-to-end in
logs."

### Grafana Dashboard Panel (New Today)

A new panel, "Dedup Effectiveness," plotting `dedup.redis_hit`,
`dedup.postgres_hit_after_redis_miss`, and `dedup.claimed_new` as
stacked-rate time series, added to the existing Prometheus + Grafana stack
(Day 19's monitoring infrastructure) — no new monitoring INFRASTRUCTURE is
introduced today, only new metrics registered against the existing stack.

---

## 17. Redis Key Space — Complete Specification

```
NAMESPACE       KEY FORMAT                                    TTL           VALUE
──────────────────────────────────────────────────────────────────────────────────────
Dedup claim     bot:scheduled:{platform}:{platformMeetingId}  max(3600,     "claiming"
                                                                secondsUntil  (transient)
                                                                (scheduledAt  → real
                                                                +4h))         meetingId
                                                                              (confirmed)

ACCESS RULE (new today, enforced by code review / lint boundary):
  This key namespace is read AND written EXCLUSIVELY by dedup.service.ts.
  No other file in the codebase issues a direct Redis command against a
  `bot:scheduled:*` key. This is the mechanism by which the two-phase
  state machine (§11) can be trusted to be exhaustive — if writes could
  happen from anywhere, the state diagram would not be a complete
  description of the key's possible states.
```

This table is a **refinement**, not an addition, of the Redis key already
listed in the platform's master key registry (HLD §21, DB-SCHEMA §7) — today
formalizes its access pattern rather than introducing a new namespace.

---

## 18. Error Taxonomy

```
No NEW AppError subclasses are introduced today. dedup.service.ts itself
throws NOTHING on the "duplicate detected" path — that is a normal,
successful return value (true), not an error. It only throws when an
underlying infrastructure call (Redis or Postgres) itself fails, and in
that case the ORIGINAL error (a Redis connection error, a Prisma error) is
allowed to propagate unmodified to the caller, which already has
established error handling (meetings.service.ts already maps unexpected
errors to 500-class responses per Day 17's error taxonomy;
calendar-sync.service.ts already has handleSyncFailure() per Day 56 §8).

This is a deliberate minimalism: dedup.service.ts's job is to answer one
question (is this a duplicate?) correctly and fast — it is explicitly NOT
responsible for deciding what an infrastructure failure means to the
caller's business logic, which varies by caller (a failed dedup check
during calendar sync should skip just that one event; the same failure
during a manual "add meeting" click should surface a clear error to the
user). Keeping this decision out of dedup.service.ts keeps it reusable
across callers with different failure-handling needs.
```

---

## 19. Hour-by-Hour Execution Plan

```
9:00 – 9:30    Audit pass: read Day 17's actual inline dedup code
               end-to-end, write down every race condition and gap it has
               (this document's §6 catalogue is the expected OUTPUT of
               this hour, not a pre-existing input)

9:30 – 10:30   dedup.service.ts: checkAndClaim() — atomic SET...NX,
               Layer 2 Postgres fallback, stale-claim release-on-mismatch

10:30 – 11:00  dedup.service.ts: confirmClaim(), releaseClaim(),
               computeDedupTtl(), buildDedupKey() — the remaining four
               small, focused functions

11:00 – 12:00  meetings.repository.ts: extract findActiveByPlatformId(),
               verify against the existing idx_meetings_platform_dedup
               index via EXPLAIN ANALYZE on a seeded test dataset

12:00 – 1:00   Lunch

1:00 – 2:00    Refactor meetings.service.ts: remove all inline dedup code
               from createMeeting() and addBotManually(), replace with
               calls to dedup.service.ts, verify existing Day 17 Postman
               tests still pass unmodified

2:00 – 2:45    Refactor/confirm calendar-sync.service.ts's dedup call
               site matches the final function signatures exactly

2:45 – 3:30    Metrics counters (dedup.redis_hit, .postgres_hit_after_redis_miss,
               .claimed_new) + structured log lines + Grafana panel

3:30 – 4:30    CI test suite: 100-iteration concurrency test, TTL clamp
               test, stale-Redis fallback test, release-on-failure test —
               all in dedup.service.test.ts

4:30 – 5:15    Manual load test: seed 5 fake UserIntegration rows all
               pointing at calendar events with the SAME Zoom URL, trigger
               the calendar-sync queue manually, verify exactly 1 meeting
               is created and 4 skip events are logged with the correct
               `layer` field

5:15 – 5:45    Repeat the load test but kill Redis mid-run (docker stop)
               to force the Layer 2 fallback path, verify it still
               produces exactly 1 meeting

5:45 – 6:00    Checklist review + sign-off
```

---

## 20. Testing & Verification Plan

### Unit Tests (`dedup.service.test.ts`)

```
CONCURRENCY TEST (the one that matters most):
  Fire 10 concurrent checkAndClaim() calls for the SAME
  (platform, platformMeetingId) pair via Promise.all().
  Assert: exactly 1 call returns false (claimed), 9 return true
  (duplicate). Run this loop 100 times in CI (not once) — a race
  condition that only manifests 1-in-50 runs is still a real bug, and a
  single-run CI pass would give false confidence.

TTL CLAMP TEST:
  Claim a slot for a meeting scheduledAt 30 minutes from now.
  Assert: the resulting Redis key's TTL is clamped to 3600s (the floor),
  not the shorter computed (scheduledAt + 4h - now) value.

TTL UPPER-RANGE TEST:
  Claim a slot for a meeting scheduledAt 24 hours from now.
  Assert: TTL is approximately 28 hours in seconds (within a small
  tolerance for test execution time), confirming the +4h buffer math.

STALE REDIS TEST (Race 3 proof):
  Manually insert a Meeting row directly into the test database
  (bypassing dedup entirely, simulating "Redis lost the key but the
  meeting is real"). Do NOT set the corresponding Redis key.
  Call checkAndClaim() for that same (platform, platformMeetingId).
  Assert: it returns true (duplicate) via the Postgres fallback layer,
  AND assert the Redis key it had transiently claimed during the check
  is cleaned up (not left dangling as a false "claiming" placeholder).

RELEASE-ON-FAILURE TEST:
  Call checkAndClaim() → assert false (claimed) → call releaseClaim()
  immediately (simulating a caller whose meeting creation failed).
  Call checkAndClaim() again for the SAME id → assert it returns false
  (claimed) again, immediately — NOT blocked until TTL expiry, proving
  the release is truly immediate and not just a logical no-op.

CONFIRM-THEN-DUPLICATE TEST:
  Call checkAndClaim() → false → confirmClaim(..., 'mtg_real_id').
  Call checkAndClaim() again for the same id → assert true (duplicate),
  AND assert this second call resolves via Layer 1 alone (mock/spy on
  the repository's findActiveByPlatformId to assert it was NOT called —
  proving the performance claim in §14 that Layer 2 is skipped entirely
  once Layer 1 already holds a confirmed value).
```

### Integration Tests (Real Redis + Test Database)

```
Test 1 — End-to-end via meetings.service.ts: create a meeting, attempt to
         create a second meeting with the identical platform+URL for the
         same team → 409 DUPLICATE, verified against the REAL HTTP
         response shape (Day 17's error contract), not just the internal
         boolean.

Test 2 — End-to-end via calendar-sync.service.ts: seed two UserIntegration
         rows (simulating 2 team members), both configured to return
         calendar events pointing at the identical Zoom URL from a mocked
         Google API response. Run syncUserCalendar() for both users
         sequentially → assert exactly 1 meeting created total.

Test 3 — Same as Test 2, but run both syncUserCalendar() calls via
         Promise.all() (true concurrency, not sequential) → assert the
         same outcome (exactly 1 meeting), proving the guarantee holds
         under the ACTUAL concurrent-caller shape Day 56 introduces, not
         just the isolated dedup.service.ts unit test's simulated
         concurrency.
```

### Manual Load Test (Staging, Real BullMQ Worker)

```
Test 1 — 5-Calendar Shared Event Simulation:
  Seed 5 real UserIntegration rows (or realistic mocks of Google's API
  response) all containing an event with the same Zoom join URL.
  Manually trigger the calendar-sync queue's fan-out (or wait for the
  next hourly cron in staging).
  Verify via BullBoard: 5 jobs processed, 4 log skip events (mix of
  'redis' layer, since these will mostly land within the SAME Redis TTL
  window given they fire close together), 1 meeting created, exactly 1
  Recall.ai bot scheduled (verified in Recall.ai's own dashboard, not
  just Vocaply's database — the actual financial risk this whole day
  protects against).

Test 2 — Redis Failure Mid-Load-Test:
  Repeat Test 1, but `docker stop` the staging Redis instance immediately
  after the first job claims the slot (before the 2nd–5th jobs run).
  Verify: with Redis down, checkAndClaim() throws for jobs 2–5 (fail-
  closed per §15), NO meetings are created for those attempts, and no
  duplicate bots are scheduled — confirming the system fails safe rather
  than failing open under real infrastructure loss, not just in a mocked
  unit test.
```

---

## 21. End-of-Day Checklist

```
EXTRACTION & REFACTOR
  [ ] dedup.service.ts exists with exactly 4 exported functions:
      checkAndClaim, confirmClaim, releaseClaim, (computeDedupTtl and
      buildDedupKey may be internal-only, not exported, if no external
      caller needs them directly)
  [ ] meetings.service.ts contains ZERO direct Redis calls to
      bot:scheduled:* keys — grep to confirm
  [ ] calendar-sync.service.ts contains ZERO direct Redis calls to
      bot:scheduled:* keys — grep to confirm
  [ ] meetings.repository.ts exposes findActiveByPlatformId() as a
      standalone, exported function

ATOMICITY
  [ ] checkAndClaim() uses a SINGLE Redis command for the claim
      (SET ... NX) — confirmed via code review, not just a comment
      claiming it does
  [ ] No GET-then-SET pattern exists anywhere in the dedup code path

TWO-PHASE PROTOCOL
  [ ] Every call site that calls checkAndClaim() and receives false
      (claimed) has a code path that calls EITHER confirmClaim() OR
      releaseClaim() — no code path silently does neither
  [ ] confirmClaim() uses KEEPTTL, not a re-specified EX duration

CONCURRENCY PROOF
  [ ] 100-iteration concurrency unit test passes reliably in CI (run it
      3 times in a row locally before considering it "done" — flaky
      concurrency tests are worse than no test)
  [ ] Integration test proves the guarantee holds via true Promise.all()
      concurrency through the real calendar-sync.service.ts path, not
      just the isolated dedup.service.ts unit

STALENESS / FALLBACK
  [ ] Stale-Redis test passes: a Postgres-only duplicate is correctly
      detected and the false Redis claim is cleaned up
  [ ] Manual staging test with Redis killed mid-load-test confirms
      fail-closed behavior under real infrastructure loss

TTL CORRECTNESS
  [ ] TTL floor (3600s) verified for near-term meetings
  [ ] TTL upper-range math (+4h buffer) verified for a 24h-out meeting

OBSERVABILITY
  [ ] dedup.redis_hit, dedup.postgres_hit_after_redis_miss,
      dedup.claimed_new all visible and incrementing correctly on the
      Grafana dashboard during the manual load test
  [ ] Every skip log line includes the correct `layer` field
      ('redis' vs 'postgres')

REAL-WORLD FINANCIAL VERIFICATION
  [ ] Manual staging load test (5-calendar shared event) confirms
      EXACTLY ONE Recall.ai bot appears in Recall.ai's own dashboard —
      not inferred from Vocaply's database alone

SIGN-OFF
  [ ] Existing Day 17 Postman collection re-run against the refactored
      meetings.service.ts — all previously-passing tests still pass
      unmodified (proving the refactor is behavior-preserving for the
      already-shipped manual-add flow)
```

---

## 22. Risks & Edge Cases Register

```
RISK                                          MITIGATION / DISPOSITION
─────────────────────────────────────────────────────────────────────────────
Worker crash leaves a "claiming"              ACCEPTED for today: the TTL
placeholder stuck for up to ~28 hours         (§10) is the backstop — the
(Race 2 partial gap, §6/§15)                  slot self-heals within one TTL
                                               window. A dedicated reaper/
                                               heartbeat mechanism is
                                               explicitly deferred pending
                                               real production evidence this
                                               occurs with meaningful
                                               frequency — building it
                                               speculatively today would be
                                               premature complexity against
                                               an currently-unobserved
                                               failure rate.

Cross-team same-platform-meeting-ID           By design (§13) — Redis layer
collision (two different Vocaply teams        is intentionally platform-
referencing the same real-world Zoom call)    scoped, not team-scoped, to
                                               prevent two teams' bots both
                                               joining the same real call.
                                               PostgreSQL layer remains
                                               correctly team-scoped for
                                               actual data storage. This is
                                               a documented, deliberate
                                               design property, not a bug.

Dedup key namespace pollution from a          Prevented by the "exclusive
future engineer adding a DIRECT Redis         access via dedup.service.ts
write to a bot:scheduled:* key outside        only" rule (§11, §17) —
dedup.service.ts (e.g. inside a new,          enforced via code review today,
future integration's own service file)        with an optional future ESLint
                                               boundary rule as a stronger,
                                               automated guardrail if this
                                               pattern is ever violated in
                                               practice.

Redis maxmemory eviction under unrelated      Handled — this is precisely
memory pressure (e.g. a large cache spike     Race 3 (§6), and the Postgres
from an unrelated feature evicting dedup      fallback layer exists
keys early)                                   specifically to make this a
                                               performance-only degradation,
                                               never a correctness failure

Test flakiness in the 100-iteration           Explicitly run 3x locally
concurrency test due to CI environment        before merging (§21) — if
resource contention affecting timing          flaky under CI resource
                                               constraints specifically (not
                                               a real race), the test's
                                               iteration count or Promise
                                               batching may need tuning, but
                                               the underlying atomicity
                                               guarantee itself (Redis
                                               SET NX) is not dependent on
                                               timing and should never be
                                               "fixed" by adding artificial
                                               delays to the test — any such
                                               instinct is a signal the test
                                               is testing the wrong thing.
```

---

*Document: DAY-57-PLAN-001 | Vocaply | Day 57: Bot Deduplication (Hardening Pass)*
*Full Scalable Industry-Level Build Plan | Principal Backend Engineer Edition*
*Phase 5 — Integrations | Planning & Architecture Blueprint — No Code, Pure Design*
*Atomic claims · Two-phase protocol · Postgres fallback · Concurrency-proven · Zero new attack surface*
