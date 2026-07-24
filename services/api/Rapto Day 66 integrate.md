# Vocaply — Day 66: integrate.worker.ts Hardening — Extraction-Triggered Auto-Sync
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-66-PLAN-001 | Version 1.0 | Phase 5 — Integrations (Days 56–70)

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Why This Is a Wiring Day, Not a New-Logic Day](#2-why-this-is-a-wiring-day-not-a-new-logic-day)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Layer 1 — Per-Team Auto-Sync Configuration](#4-layer-1--per-team-auto-sync-configuration)
5. [Layer 2 — Auto-Sync Eligibility Logic](#5-layer-2--auto-sync-eligibility-logic)
6. [Layer 3 — extract.worker.ts Trigger Integration](#6-layer-3--extractworkerts-trigger-integration)
7. [Layer 4 — integrate.worker.ts Non-Change Verification](#7-layer-4--integrateworkerts-non-change-verification)
8. [Layer 5 — Repository Layer Additions](#8-layer-5--repository-layer-additions)
9. [Layer 6 — Service Layer Orchestration](#9-layer-6--service-layer-orchestration)
10. [Layer 7 — Validation Layer](#10-layer-7--validation-layer)
11. [Layer 8 — HTTP Layer (Settings Endpoint Extension)](#11-layer-8--http-layer-settings-endpoint-extension)
12. [System-Generated Idempotency Key Design](#12-system-generated-idempotency-key-design)
13. [Confidence Threshold Design](#13-confidence-threshold-design)
14. [The `autoSynced` Flag — Data Model Design](#14-the-autosynced-flag--data-model-design)
15. [Retry, Failure & Health-Tracking Parity](#15-retry-failure--health-tracking-parity)
16. [Security Architecture](#16-security-architecture)
17. [Performance Architecture](#17-performance-architecture)
18. [Multi-Provider Fan-Out Design](#18-multi-provider-fan-out-design)
19. [Observability & Logging](#19-observability--logging)
20. [API Endpoints — Full Specification](#20-api-endpoints--full-specification)
21. [Frontend Integration Plan](#21-frontend-integration-plan)
22. [Types & Interfaces](#22-types--interfaces)
23. [Testing Plan](#23-testing-plan)
24. [End-of-Day Checklist](#24-end-of-day-checklist)
25. [Risks & Edge Cases](#25-risks--edge-cases)

---

## 1. Day Overview & Goals

### What Gets Built Today

Day 66 delivers the single missing piece standing between Vocaply's
integration layer and its actual product promise: *"action items
extracted from your meeting automatically become tickets."* Every piece of
machinery required to make this true already exists — the
`IntegrationProvider` interface and its three ticket-creating
implementations (Jira, Linear, Notion — Days 58, 61, 62), the shared
idempotency mechanism (Day 58), the provider-specific retry/backoff
policies (Day 58, extended Days 61–62), and the centralized
failure-tracking and alerting service (Day 64). Today's work is a
deliberately narrow, precise piece of **wiring**: a new per-team
auto-sync preference, a new post-extraction trigger point inside
`extract.worker.ts`, and rigorous verification that this new
automatic trigger source produces byte-for-byte identical behavior to the
existing manual `POST /action-items/:id/sync` trigger everywhere it
matters — retry policy, idempotency, and failure escalation.

```
TODAY BUILDS:
  ✅ A new autoSyncEnabled / autoSyncProviders key pair in teams.settings
  ✅ findAutoSyncEligibleItems() — confidence-filtered, tenant-scoped query
     identifying which newly-extracted action items qualify for auto-sync
  ✅ A new post-persistence step inside extract.worker.ts enqueuing one
     integrate job per eligible action item, per enabled provider
  ✅ A system-generated idempotency key design distinct from, but
     equivalent in purpose to, the user-supplied X-Idempotency-Key header
  ✅ A new autoSynced boolean column on ActionItem, distinguishing
     automatic from manual sync provenance for the UI
  ✅ Frontend: AutoSyncSettings.tsx (per-provider toggle) and
     AutoSyncIndicator.tsx (badge distinguishing sync provenance)
  ✅ A dedicated regression-test suite proving auto-sync and manual sync
     are indistinguishable at the integrate.worker.ts level in every way
     that matters (retry classification, idempotency, health-tracking
     escalation)

DOWNSTREAM IMPACT:
  Day 67 — Slack notifications for MEETING_PROCESSED will, for teams with
           auto-sync enabled, now be reporting on meetings whose action
           items are ALREADY synced by the time the notification goes out
           (or very shortly after) — today's ordering decisions (Section 6)
           directly affect whether that's true
  Day 69 — The commitment-score recalculation audit explicitly excludes
           action items from its scope (action items and commitments are
           tracked separately, per the Day 3 schema) — today's work is
           confirmed to have zero interaction with score calculation,
           a boundary worth stating explicitly rather than assuming

DO NOT SKIP OR RUSH:
  The single greatest risk today is temptation to take a shortcut BECAUSE
  the underlying sync machinery is already proven — e.g., skipping the
  opt-in default, or skipping the confidence threshold, on the reasoning
  that "sync already works, so auto-triggering it must be safe too." This
  is false: the machinery being reliable says nothing about whether it's
  being triggered on the RIGHT set of inputs. A team with auto-sync
  silently defaulting to on, or with no confidence gate, would have its
  Jira project flooded with tickets from a historical extraction backlog
  or from noisy, low-confidence extractions the moment they connect an
  integration — this is a product-trust failure, not merely a technical one.
```

### 8-Hour Time Allocation

```
9:00 AM – 9:30 AM    → team-settings.config.ts — Zod schema + defaults for
                        autoSyncEnabled / autoSyncProviders; teams.validator.ts
                        extension
9:30 AM – 10:15 AM   → action-items.repository.ts — findAutoSyncEligibleItems()
                        query design (confidence filter, tenant scope, provider
                        cross-reference against active TeamIntegration rows)
10:15 AM – 11:00 AM  → action-items.service.ts — orchestration layer wrapping
                        the repository query, building the per-provider job list
11:00 AM – 12:00 PM  → extract.worker.ts — the actual trigger integration:
                        post-persistence step reading team settings, calling
                        the new service function, enqueuing integrate jobs
                        with system-generated idempotency keys
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 1:30 PM    → Database migration: ActionItem.autoSynced boolean
                        column (nullable-then-defaulted, zero-downtime)
1:30 PM – 2:15 PM    → integrate.worker.ts verification pass — confirm zero
                        logic changes needed; wire autoSynced flag write on
                        successful sync completion
2:15 PM – 3:00 PM    → integrations.controller.ts / teams.controller.ts —
                        settings endpoint extension for reading/writing the
                        two new keys
3:00 PM – 3:45 PM    → Frontend: AutoSyncSettings.tsx (settings toggle UI)
3:45 PM – 4:15 PM    → Frontend: AutoSyncIndicator.tsx (action item badge)
4:15 PM – 5:00 PM    → Unit tests: eligibility filtering, idempotency key
                        generation, settings validation
5:00 PM – 5:45 PM    → Integration/regression tests: the auto-sync vs.
                        manual-sync parity suite (Section 15)
5:45 PM – 6:00 PM    → Checklist review + sign-off
```

---

## 2. Why This Is a Wiring Day, Not a New-Logic Day

### The Machinery That Already Exists

```
CAPABILITY                              BUILT ON DAY    STATUS TODAY
──────────────────────────────────────────────────────────────────────────
IntegrationProvider interface           58              Reused, unchanged
Jira/Linear/Notion createExternalItem() 58, 61, 62      Reused, unchanged
integrate queue + worker orchestration  58              Reused, unchanged
Idempotency mechanism (Redis dedup key) 58              Reused, unchanged
Per-provider retry/backoff policies     58, 61, 62      Reused, unchanged
integration-health.service.ts           64              Reused, unchanged
Provider registry dispatch              58, 61, 62      Reused, unchanged
```

Every row in this table is **load-bearing infrastructure that today's work
depends upon but does not modify.** This framing matters because it sets
the correct scope boundary: if today's implementation finds itself needing
to change `integrate.worker.ts`'s actual sync logic, retry classification,
or health-tracking calls, that is a signal the auto-sync trigger is being
built incorrectly — the entire design goal is that `integrate.worker.ts`
cannot tell the difference between a job that arrived because a human
clicked a button and a job that arrived because `extract.worker.ts`
enqueued it automatically.

### What Is Genuinely New Today

Precisely three things, and no more: (1) a new settings key controlling
whether and for which providers auto-sync is enabled per team; (2) a new
call site — inside `extract.worker.ts`, not inside `integrate.worker.ts` —
that decides *when* to enqueue a sync job; and (3) a new denormalized flag
(`autoSynced`) recording *how* a given sync happened, for display purposes
only, carrying zero effect on sync behavior itself.

---

## 3. File Structure to Create

```
services/api/src/
│
├── config/
│   └── team-settings.config.ts                ← NEW — Zod schema + defaults
│                                                    for autoSyncEnabled /
│                                                    autoSyncProviders
│
├── modules/
│   ├── action-items/
│   │   ├── action-items.service.ts             ← MODIFY — new
│   │   │                                           findAutoSyncEligibleItems()
│   │   │                                           orchestration wrapper
│   │   ├── action-items.repository.ts           ← MODIFY — new supporting
│   │   │                                            query, confidence-filtered,
│   │   │                                            tenant-scoped
│   │   └── action-items.types.ts                 ← MODIFY — AutoSyncJobCandidate
│   │                                                  type
│   │
│   └── teams/
│       └── teams.validator.ts                    ← MODIFY — extended
│                                                       updateTeamSettingsSchema
│
├── queues/
│   ├── workers/
│   │   ├── extract.worker.ts                     ← MODIFY — new
│   │   │                                             post-persistence
│   │   │                                             auto-sync trigger step
│   │   └── integrate.worker.ts                    ← MODIFY (minimal) — write
│   │                                                   the autoSynced flag on
│   │                                                   successful completion;
│   │                                                   no logic-path changes
│   └── jobs/
│       └── integrate.job.ts                       ← MODIFY — job payload
│                                                        gains an optional
│                                                        `source: 'manual' |
│                                                        'auto'` field for
│                                                        logging/observability
│                                                        only (never branched
│                                                        on for behavior)
│
└── db/
    └── (Prisma migration) add_action_item_auto_synced.sql  ← NEW —
                                                                  zero-downtime,
                                                                  nullable-then-
                                                                  defaulted
                                                                  boolean column

services/api/prisma/
└── schema.prisma                                    ← MODIFY — ActionItem.autoSynced

services/api/tests/
├── unit/
│   ├── auto-sync-eligibility.test.ts                ← NEW
│   └── team-settings-validation.test.ts              ← NEW
└── integration/
    └── auto-sync-parity.test.ts                       ← NEW — the
                                                              manual-vs-auto
                                                              regression suite

apps/web/src/features/
├── action-items/
│   └── components/
│       └── AutoSyncIndicator.tsx                     ← NEW
├── integrations/
│   ├── components/
│   │   └── AutoSyncSettings.tsx                       ← NEW
│   └── api/
│       └── integrations.api.ts                         ← MODIFY — settings
│                                                             read/write calls
└── team/
    └── api/
        └── team.api.ts                                  ← MODIFY (if settings
                                                                live under
                                                                teams rather
                                                                than
                                                                integrations —
                                                                see Section 11)
```

### Dependency Flow (No Circular Deps)

```
extract.worker.ts
  └── action-items.service.ts
        └── action-items.repository.ts   (eligibility query)
        └── teams.repository.ts           (read autoSyncEnabled/autoSyncProviders
                                            from teams.settings)
        └── (enqueues) integrate queue → integrate.worker.ts
                                              (UNCHANGED orchestration,
                                               only gains the autoSynced
                                               flag write on success)

teams.controller.ts / integrations.controller.ts
  └── teams.service.ts
        └── team-settings.config.ts        (validation schema)
        └── teams.repository.ts             (persist settings)
```

---

## 4. Layer 1 — Per-Team Auto-Sync Configuration

### File: `config/team-settings.config.ts`

**Responsibility:** The single source of truth for the shape, defaults, and
validation rules of the two new settings keys — mirroring the exact
pattern already established for `plans.config.ts` (Day 16) as "one file,
imported everywhere this configuration is needed, never duplicated inline."

### Schema Design

```
autoSyncEnabled:    boolean, default FALSE
autoSyncProviders:  array of TeamProvider enum values ('JIRA' | 'LINEAR' |
                    'NOTION' — deliberately excluding 'SLACK', since Slack
                    is a notification channel, not a ticket-creation
                    provider, and has no createExternalItem() capability
                    to auto-trigger), default empty array
```

### Why `autoSyncEnabled: false` Is the Only Acceptable Default

This is treated as a **product-safety requirement**, not a stylistic
preference. A team's very first action after connecting Jira (Day 58),
Linear (Day 61), or Notion (Day 62) is to configure project/team/database
mappings deliberately — `configureJira()`, `configureLinear()`,
`configureNotion()` all require this explicit admin setup before a single
sync can even succeed. Defaulting auto-sync to *on* the moment an
integration connects would mean the very first extraction event after
that connection — potentially from a meeting that happened before the
admin had time to review their mapping configuration — immediately creates
tickets in a possibly-misconfigured destination. Opting in to auto-sync is
therefore a **second, independent, deliberate consent step**, layered on
top of the already-deliberate connect-then-configure flow.

### Cross-Field Validation

`autoSyncProviders` values are validated at the service layer (not merely
by Zod's enum check) against which providers the team actually has an
**active** `TeamIntegration` row for — a team cannot enable auto-sync for
`'NOTION'` if Notion isn't connected, preventing a stale or
speculative configuration from silently sitting unused (or, worse, from
being misread by a future engineer as evidence Notion sync is expected to
be working when it never was configured).

---

## 5. Layer 2 — Auto-Sync Eligibility Logic

### Function: `findAutoSyncEligibleItems(meetingId, teamId)`

Lives in `action-items.repository.ts` (the query itself) and
`action-items.service.ts` (the orchestration wrapping it). Given a
just-processed meeting, returns the set of newly-created `ActionItem` rows
that qualify for auto-sync:

1. **Tenant scope**: `WHERE teamId = ?` — non-negotiable, first filter
   applied, consistent with every other query on this platform.
2. **Meeting scope**: `WHERE meetingId = ?` — only the action items just
   extracted from *this* meeting, never a broader backlog sweep (auto-sync
   is explicitly a forward-looking, per-extraction-event behavior, not a
   retroactive bulk-sync feature — a team enabling auto-sync today should
   not suddenly see hundreds of historical action items flood into Jira).
3. **Confidence filter**: `WHERE confidenceScore >= 0.5` — detailed in
   Section 13.
4. **Not-already-synced filter**: excludes any action item that
   (implausibly, given this only runs once per meeting immediately after
   extraction, but defensively) already carries a populated
   `jiraIssueId`/`linearIssueId`/`notionPageId` for the specific provider
   being considered — preventing a duplicate sync attempt even in a
   theoretical re-run scenario.

### Why Eligibility Is Computed Once, Then Fanned Out Per Provider

The query itself is **provider-agnostic** — it answers "which action items
from this meeting are eligible for auto-sync at all," a single tenant-
and-confidence-scoped query. The **fan-out** across which of the team's
several enabled providers each eligible item should be synced to (Section
18) happens as a separate, subsequent step in the service layer, keeping
the repository query simple and the provider-iteration logic where it
belongs — in orchestration code, not buried inside a query's WHERE clause.

---

## 6. Layer 3 — `extract.worker.ts` Trigger Integration

### The New Post-Persistence Step

Immediately following the existing, already-established transaction in
`extract.worker.ts` that persists newly-extracted `ActionItem` (and
`Commitment`, `Decision`, `Blocker`) rows (per the Day 46–54 AI pipeline
integration and Day 58's original worker design), a new step:

1. Loads the team's `autoSyncEnabled`/`autoSyncProviders` settings (a
   single, already-indexed lookup against the `teams` row already loaded
   earlier in this same worker's execution — no additional round trip is
   introduced if the team record is already in scope from prior steps in
   the function).
2. If `autoSyncEnabled` is false or `autoSyncProviders` is empty, the step
   is a fast no-op — the overwhelming majority of teams, given the
   opt-in default (Section 4), will short-circuit here with negligible
   overhead added to the extraction pipeline's critical path.
3. Otherwise, calls `actionItemsService.findAutoSyncEligibleItems()` for
   the just-processed meeting, and for each eligible item × each enabled
   provider, enqueues one `integrate` job — using the exact same job
   payload shape and queue as the manual sync path (Day 58), differing
   only in the `idempotencyKey`'s generation source (Section 12) and an
   optional `source: 'auto'` tag used purely for logging (Section 19).

### Why This Step Lives in `extract.worker.ts`, Not a Separate New Worker

A dedicated "auto-sync trigger worker" was considered and rejected: it
would introduce an unnecessary additional queue hop (extract completes →
new queue → auto-sync-trigger worker → integrate queue) for a decision
that is cheap, synchronous-in-spirit, and entirely dependent on data
`extract.worker.ts` already has in memory at the moment its own
transaction completes. Adding the step directly, as the final phase of
`extract.worker.ts`'s existing execution, avoids that redundant hop while
still enqueuing the actual sync work (the `integrate` jobs themselves)
asynchronously — preserving the platform's core principle that heavy or
externally-dependent work (an actual Jira API call) is never performed
synchronously inside another worker's job, while the comparatively
trivial decision of *whether* to enqueue that work is made inline.

### Ordering Relative to Other Post-Extraction Steps

`extract.worker.ts` already, per Days 18/19/58, performs several
post-persistence steps in a defined order (updating meeting status to
`DONE`, recalculating scores where applicable, emitting the
`meeting:processed` Socket.io event, enqueuing `notify` and existing
`integrate` — manual-trigger-adjacent — jobs). Today's new auto-sync step
is placed **after** the meeting status update and Socket.io emission (so
the frontend's "meeting processed" real-time signal is never delayed
waiting on auto-sync job enqueueing, which — while fast — is still
additional work) but **before** the function returns, ensuring auto-sync
jobs are reliably enqueued as part of the same overall extraction-pipeline
execution, not deferred to some separate, easier-to-accidentally-skip
follow-up step.

---

## 7. Layer 4 — `integrate.worker.ts` Non-Change Verification

### The Explicit Claim Being Verified Today

`integrate.worker.ts`'s actual sync execution — load the
`TeamIntegration`, resolve the provider via the registry, call
`createExternalItem()`, persist the result, set the idempotency key, emit
the Socket.io event, escalate failures via
`integration-health.service.ts` — requires **zero** modification to
support auto-sync as a trigger source. This is treated as a claim to be
actively verified (via the regression suite in Section 15 and the
code-review checklist in Section 24), not merely asserted.

### The One Legitimate Small Addition: The `autoSynced` Flag Write

The **only** change `integrate.worker.ts` receives today is: on
successful sync completion, in addition to the existing column writes
(`jiraIssueId`/`linearIssueId`/`notionPageId`, their URL and
`SyncedAt` siblings), also write the `autoSynced` boolean — set to `true`
if the job's payload carried the `source: 'auto'` tag, `false` (or left
as the column's existing value) otherwise. This is a pure **data
provenance recording** step, read only by the frontend's display logic
(Section 21) — it has no bearing on retry behavior, idempotency, or any
other functional aspect of the sync itself, and is explicitly documented
as such to prevent a future engineer from mistakenly treating `autoSynced`
as a meaningful input to any business-logic branch.

---

## 8. Layer 5 — Repository Layer Additions

### File: `action-items.repository.ts` (modified)

New function: `findAutoSyncEligibleItems(meetingId, teamId, minConfidence)`
— a straightforward, indexed Prisma query (leveraging the existing
`idx_ai_team_id` and `idx_ai_meeting_id` indexes from the Day 3 schema; no
new index is required today, since the query's filter columns are already
covered). Returns action items with just enough data
(`id`, `text`, `confidenceScore`, `assigneeId`, `dueDate`, `priority`) for
the service layer to build sync job payloads — never over-fetching
columns the auto-sync trigger doesn't need, consistent with the
platform's established "select only what's needed" discipline for list
queries (Day 17's Meetings API design principle, applied here too).

### File: `teams.repository.ts` (no new function needed)

The existing `findById()` (or equivalent, already used elsewhere to load
team settings for other purposes — plan-limit checks, notification
routing) is reused as-is to read `teams.settings`, requiring no new
repository method — today's work confirms this existing function already
returns the `settings` JSONB column in its selected fields, and if it
doesn't (because an earlier caller's `select` clause narrowed the query),
the fix is to broaden that specific call site's selection, not to
introduce a duplicate, near-identical repository function.

---

## 9. Layer 6 — Service Layer Orchestration

### File: `action-items.service.ts` (modified)

New function: `enqueueAutoSyncJobs(meetingId, teamId)` — called by
`extract.worker.ts` (Section 6). Internally:

1. Loads team settings (`autoSyncEnabled`, `autoSyncProviders`) via the
   existing teams repository call.
2. Short-circuits (returns immediately, zero further work) if disabled.
3. Calls `findAutoSyncEligibleItems()`.
4. For each eligible item, for each provider in `autoSyncProviders` that
   also has an active `TeamIntegration` row (a defensive re-check here,
   even though Section 4's settings validation already prevents enabling
   auto-sync for a disconnected provider at configuration time — an
   integration could theoretically be disconnected *after* auto-sync was
   configured, and this runtime check ensures a stale settings value never
   results in an attempted sync against a nonexistent integration),
   builds and enqueues one `integrate` job.
5. Returns a summary (count of jobs enqueued) purely for the calling
   worker's own structured logging — not used for any control-flow
   decision by the caller.

### Why the Active-Integration Check Happens Twice (Configuration-Time and Runtime)

This mirrors a defense-in-depth pattern already used elsewhere on this
platform (e.g., Day 63's `CalendarProvider` interface being checked at
both the settings-validation layer and inside `calendar-sync.service.ts`
itself) — a configuration-time check improves the settings UI's
correctness and user experience (rejecting an invalid selection
immediately), while a runtime check protects against the configuration
becoming stale relative to the integration's actual current state,
without relying on every possible disconnect code path remembering to also
clear the now-invalid `autoSyncProviders` entry.

---

## 10. Layer 7 — Validation Layer

### File: `teams.validator.ts` (modified)

`updateTeamSettingsSchema` (already established Day 16 for
`weeklyDigestEnabled`, `defaultTimezone`, etc.) is extended with two new
optional fields:

- `autoSyncEnabled`: boolean, optional.
- `autoSyncProviders`: array of the `TeamProvider` enum restricted to
  `'JIRA' | 'LINEAR' | 'NOTION'` (explicitly excluding `'SLACK'` at the
  type level, not merely by convention — see Section 4), optional, max 3
  items (there are only three possible values, so this cap is a defensive
  sanity bound rather than a meaningful business constraint).

Following the exact merge-not-replace JSONB update discipline already
established Day 16: providing `autoSyncEnabled` in a settings update
request does not disturb any other existing key in `teams.settings`, and
vice versa.

---

## 11. Layer 8 — HTTP Layer (Settings Endpoint Extension)

### Existing Endpoint Reused: `PATCH /api/v1/teams/me`

No new endpoint is introduced today — the two new settings keys are read
and written through the **existing** team-settings update endpoint (Day
16), following the platform's established convention that `teams.settings`
is a single, flexible JSONB configuration surface, not a collection of
per-feature bespoke endpoints. This is a deliberate continuity decision:
introducing a dedicated `/integrations/auto-sync` endpoint today would
fragment configuration across two different API surfaces for no
architectural benefit, since the existing settings endpoint's validation,
merge, and cache-invalidation behavior (Day 16) already correctly
generalizes to any new key added to the schema.

### Authorization

Reuses the existing `ADMIN+` role requirement already applied to
`PATCH /teams/me` — consistent with every other team-level configuration
change on this platform (Day 16's teams API, Day 58/61/62's integration
configuration endpoints).

---

## 12. System-Generated Idempotency Key Design

### Why a Distinct Key-Generation Source Is Needed

The manual sync endpoint (`POST /action-items/:id/sync`, Day 20) relies on
the client supplying an `X-Idempotency-Key` header — a reasonable
requirement when a human or a frontend client is initiating the request
and can generate a UUID. `extract.worker.ts`'s new auto-sync trigger has
no "client" in that sense — it is server-side code enqueuing jobs
programmatically, with no HTTP request or header to draw a key from.

### The Design

The system-generated idempotency key is deterministically derived from
data already uniquely identifying the operation:
`auto-sync:{actionItemId}:{provider}:{meetingId}` — deterministic (the
same inputs always produce the same key, meaning a genuinely re-processed
extraction job, per Day 18's documented idempotent-webhook-retry
scenario, naturally produces the identical key and is therefore
automatically deduplicated by the existing Redis-backed idempotency check,
with zero additional logic required) rather than randomly generated (a
random UUID would defeat the purpose, since a re-processed extraction
event would generate a *different* random key each time, failing to
dedupe against its own prior, already-completed attempt).

### Why This Still Satisfies the Same Guarantee as the Manual Path

The manual endpoint's `X-Idempotency-Key` exists to let a **client** retry
a network failure safely without double-syncing. The auto-sync path's
deterministic key exists to let the **extraction pipeline** retry (e.g.,
via BullMQ's own job-retry mechanism if `extract.worker.ts`'s job itself
fails and is retried) without double-syncing. Both are solving the
identical underlying problem — "this operation must have exactly-once
effect even if the thing that triggers it fires more than once" — via the
same shared Redis-backed mechanism (Day 58), differing only in *how* the
key is produced, which is precisely the kind of variation the idempotency
middleware was designed to be agnostic to.

---

## 13. Confidence Threshold Design

### Why 0.5, Not a New Auto-Sync-Specific Value

The platform already establishes `confidenceScore >= 0.5` as the
threshold below which an extracted item is filtered from default display
entirely (per the AI pipeline's extraction rules, referenced throughout
Days 12, 19, and the HLD's AI/ML Architecture section). Reusing this exact
value for auto-sync eligibility — rather than inventing a stricter or
looser auto-sync-specific threshold — is a deliberate consistency
decision: the platform already has one authoritative answer to "is this
extraction confident enough to be treated as real," and auto-sync
eligibility is simply one more consumer of that same answer, not a
separate product decision requiring its own independently-tuned constant.

### Why a Human Manually Syncing a Low-Confidence Item Is Still Allowed

The confidence gate applies **only** to the automatic trigger path — a
human who has reviewed a sub-0.5-confidence action item and decided it's
genuinely actionable can still manually trigger its sync via the existing
`POST /action-items/:id/sync` endpoint (Day 20), which carries no
confidence gate of its own. This asymmetry is intentional: automation
should be conservative by default (better to under-sync and let a human
catch the gap than to over-sync and erode trust with noise), while a
human's explicit, reviewed decision to sync a specific item is always
respected regardless of the AI's own confidence in having extracted it
correctly.

---

## 14. The `autoSynced` Flag — Data Model Design

### Migration Design

A single new nullable boolean column, `autoSynced`, added to `ActionItem`
via a standard, backward-compatible, zero-downtime migration — following
the exact "add nullable column, no lock, no immediate NOT NULL constraint"
pattern already documented in the DB-Schema document's Section 13 (Migration
Strategy). Existing rows are left with `autoSynced: null`
(interpreted by the application layer as "unknown/pre-dates this feature,"
never coerced to a misleading `false` via a backfill, since that would
falsely imply those historical syncs were confirmed manual when the
platform genuinely has no record either way).

### Why This Is Tracked as a Column, Not Inferred from Timing

An earlier design alternative — inferring "this was probably an auto-sync"
from whether `jiraIssueSyncedAt` falls within a few seconds of the
meeting's `processingCompletedAt` timestamp — was considered and
explicitly rejected: timing-based inference is inherently fuzzy (a human
could coincidentally click "sync now" moments after processing completes),
provides no reliable signal for the UI to build trust-worthy messaging on
("synced automatically" vs. "synced manually" needs to be a fact, not a
guess), and would require every future engineer touching sync-timing logic
to remember this fragile inference exists. An explicit, unambiguous
boolean column, set once at the moment of successful sync completion based
on the job's own known trigger source, is the correct design.

---

## 15. Retry, Failure & Health-Tracking Parity

### The Regression Test That Proves Today's Central Claim

`auto-sync-parity.test.ts` (Section 23) is today's single most important
test file — not because auto-sync introduces any new retry or
failure-handling logic (it introduces none), but because the entire value
of today's architecture rests on proving that claim rather than merely
asserting it. The test forces an identical failure condition (a mocked
Jira 500 response, reused directly from Day 58/61's existing fixture
data) through both the manual sync-trigger path and the new auto-sync
trigger path, and asserts byte-for-byte identical outcomes: the same
`consecutiveErrors` increment on the `TeamIntegration` row, the same
non-retryable-vs-retryable classification, and — at the appropriate
threshold — the same two-stage alerting dispatch via
`integration-health.service.ts` (Day 64), regardless of which trigger
source produced the failing job.

### Why This Matters Beyond Today

If a future engineer, months from now, adds a fourth ticket-creating
provider and inadvertently introduces trigger-source-aware branching
inside `integrate.worker.ts` (for example, "auto-synced jobs get fewer
retry attempts to conserve API quota" — a plausible-sounding but
architecturally regressive idea), today's parity test is what would catch
that regression immediately, since it explicitly encodes "these two
trigger sources must behave identically" as a permanent, enforced
invariant rather than a one-time design intention that could silently
erode.

---

## 16. Security Architecture

### No New OAuth or Credential Surface

Today's work introduces zero new token handling, zero new external API
calls beyond what `createExternalItem()` (Days 58/61/62) already performs,
and zero new encryption requirements — the entire security surface of
today's feature is the **decision** of whether/when to enqueue an
already-hardened sync job, not the sync mechanics themselves.

### Tenant Isolation

`findAutoSyncEligibleItems()` scopes strictly by `teamId` (Section 8), and
the settings read/write path reuses the existing `ADMIN+`-gated,
tenant-scoped `PATCH /teams/me` endpoint (Section 11) — no new
cross-tenant query surface is introduced.

### Preventing Auto-Sync as a Volume-Amplification Vector

Because auto-sync could, in principle, multiply the number of outbound
third-party API calls per meeting (one per eligible action item, per
enabled provider), today's design explicitly bounds this: the confidence
filter (Section 13) reduces volume to genuinely actionable items only, and
the existing `integrate` queue's shared concurrency ceiling (3, Days
58/61/62) — unchanged today — continues to throttle total outbound
third-party call volume regardless of how many jobs are enqueued at once,
preventing a single large meeting's extraction from producing a burst
that could trip a provider's own rate limits.

---

## 17. Performance Architecture

### Fast No-Op for the Overwhelming Common Case

Given the opt-in-only default (Section 4), the vast majority of
`extract.worker.ts` executions — for any team that has not explicitly
enabled auto-sync — pay the cost of exactly one already-in-memory
settings check and nothing more. This is a deliberate performance property
worth stating explicitly: today's feature adds effectively zero overhead
to the extraction pipeline's critical path for teams not using it, and only
incurs its real cost (the eligibility query, the job-enqueueing loop) for
teams that have deliberately opted in and therefore expect that cost as
part of the value they're receiving.

### No New Database Indexes Required

As established in Section 8, `findAutoSyncEligibleItems()`'s filter
columns (`teamId`, `meetingId`, `confidenceScore`) are already covered by
existing indexes from the Day 3 schema and Day 15's Action Items module —
today's query rides on infrastructure already proven correct and
performant, requiring no new index and therefore no risk of a slow,
unindexed scan being introduced on the extraction pipeline's hot path.

### Queue Concurrency — Unchanged, Deliberately

As noted in Section 16, the `integrate` queue's concurrency setting is not
touched today. Auto-sync-originated jobs and manually-triggered jobs
compete for the same worker capacity under the same concurrency ceiling —
this is intentional, not an oversight: introducing a separate queue or
concurrency allocation for auto-sync jobs would reintroduce exactly the
kind of provider-preferential-treatment complexity the shared-queue design
(Days 58/61/62) was built to avoid.

---

## 18. Multi-Provider Fan-Out Design

### The Fan-Out Loop

For a team with, say, both Jira and Linear enabled for auto-sync, a single
eligible action item produces **two** independent `integrate` jobs — one
per provider — each carrying its own deterministic idempotency key
(Section 12, which already includes the provider name as part of its
composition, ensuring the Jira job's key and the Linear job's key for the
same action item are naturally distinct, never colliding).

### Why Independent Jobs, Not One Combined "Sync to All" Job

Each provider's sync is independently retryable, independently subject to
its own failure/health-tracking state (a `TeamIntegration` row per
provider, per Day 3's schema), and independently observable in logs and
metrics. A single combined job attempting to sync to multiple providers at
once would conflate these concerns — a Jira failure would need some
awkward partial-success handling to avoid also failing the Linear sync
bundled into the same job, undermining the very failure-isolation
principle Day 65's composite testing explicitly verified holds at the
queue level. One job per (action item, provider) pair is the design that
keeps every existing guarantee intact.

---

## 19. Observability & Logging

### Structured Log Fields

`extract.worker.ts`'s new auto-sync step logs, at minimum: the meeting ID,
team ID, number of eligible action items found, and the number of jobs
enqueued per provider — giving immediate visibility into auto-sync
activity volume without needing to correlate against the `integrate`
queue's own per-job logs separately.

### The `source` Tag — Logging Only, Never a Behavioral Branch

The `integrate.job.ts` payload's new optional `source: 'manual' | 'auto'`
field (Section 3) exists **exclusively** for log/metric tagging — every
log line and metric emitted by `integrate.worker.ts` includes this tag
where present, enabling a dashboard to break down sync volume and failure
rate by trigger source, which is valuable operational insight (e.g.,
"are auto-synced items failing at a different rate than manually-synced
ones, perhaps because they're systematically lower-quality extractions
despite passing the confidence gate") — but, per Section 7's explicit
design constraint, this field is never read by any conditional statement
that would cause auto-synced and manually-synced jobs to be processed
differently.

### New Metrics

`auto_sync.jobs_enqueued` (counter, tagged by provider), 
`auto_sync.eligible_items_found` (counter, per extraction event) — feeding
the existing Grafana dashboard already tracking `integrate.{jira,linear,notion}.success/failure` (Days 58/61/62), allowing a
side-by-side view of auto-sync volume against total sync volume without
requiring a new dashboard.

---

## 20. API Endpoints — Full Specification

No new endpoints are introduced today (Section 11) — the following
documents the **extended behavior** of the existing, reused endpoint.

### `PATCH /api/v1/teams/me` (existing endpoint, extended)

**Auth:** JWT required | **Role:** ADMIN+

**Request body addition:**
```
{
  "settings": {
    "autoSyncEnabled": true,
    "autoSyncProviders": ["JIRA", "LINEAR"]
  }
}
```

**New validation error responses:**
- `422` → `autoSyncProviders` includes a provider value outside
  `JIRA`/`LINEAR`/`NOTION`
- `422` → `autoSyncProviders` includes a provider the team does not
  currently have an active `TeamIntegration` row for

**Success response:** 200, unchanged shape from Day 16 — the updated
`teams.settings` object, including the two new keys, is reflected in the
response.

### `GET /api/v1/teams/me` (existing endpoint, response extended)

Response's `settings` object now includes `autoSyncEnabled` and
`autoSyncProviders` (defaulting to `false`/`[]` for any team that has
never explicitly set them, per Section 4's default) — a pure additive
response-shape change, no new error responses.

---

## 21. Frontend Integration Plan

### Component: `AutoSyncSettings.tsx`

A new section within the existing integrations settings page
(`apps/web/src/app/(dashboard)/settings/integrations/page.tsx`),
positioned below the individual provider connection cards (Jira/Linear/
Notion/Slack, Days 58/60/61/62) — a per-provider toggle row, each toggle
disabled (with an explanatory tooltip) for any provider that is not
currently connected, reflecting the configuration-time validation rule
from Section 4 directly in the UI rather than only surfacing it as a
rejected-request error after the fact.

### Component: `AutoSyncIndicator.tsx`

A small badge rendered on `ActionItemCard.tsx` (existing component, Day 15
frontend structure) next to the existing sync-status display (which
already shows a Jira/Linear/Notion icon + link once
`jiraIssueId`/etc. is populated) — reading the new `autoSynced` field to
render either a small "Auto" label or nothing (manual syncs receive no
special badge, keeping the UI uncluttered for the default/common case of a
human-initiated sync, with the badge reserved for calling out the newer,
more surprising-if-unexplained automatic behavior).

### Hook Reuse: `useTeam.ts` / `useUpdateTeamSettings` (existing, Day 16)

No new hook is required — the existing team-settings mutation hook
already generically handles arbitrary `settings` object updates; today's
frontend work is limited to adding the two new fields to the relevant
form/toggle components and letting the existing hook's optimistic-update-
with-rollback pattern (Day 16) handle the rest unchanged.

---

## 22. Types & Interfaces

### File: `config/team-settings.config.ts`

- **`TeamSettings`** (extended) — adds `autoSyncEnabled: boolean` and `autoSyncProviders: AutoSyncProvider[]` to the existing settings shape.
- **`AutoSyncProvider`** — `'JIRA' | 'LINEAR' | 'NOTION'`, a restricted subset of the broader `TeamProvider` enum, defined specifically to make illegal states (e.g., `'SLACK'` appearing in this list) unrepresentable at the type level, not merely rejected at runtime.

### File: `action-items.types.ts`

- **`AutoSyncJobCandidate`** — `{ actionItemId: string; provider: AutoSyncProvider }`, the shape produced by the eligibility-and-fan-out logic (Sections 5, 18) and consumed when building each `integrate` job's payload.

### File: `queues/jobs/integrate.job.ts` (modified)

- **`IntegrateJobData`** (extended) — adds an optional `source?: 'manual' | 'auto'` field, explicitly documented in its own type-level comment as **observability-only, never to be branched upon**, per Section 19's design constraint — a deliberate piece of self-documentation preventing future misuse.

No changes are required to `IntegrationProvider`, `CreateExternalItemInput`,
or `ExternalItemResult` — today's entire type-level contribution sits
strictly above the provider abstraction layer, confirming once more that
the sync mechanics themselves needed no modification to support a new
trigger source.

---

## 23. Testing Plan

### Unit Tests

#### `auto-sync-eligibility.test.ts`

- `findAutoSyncEligibleItems()` correctly includes an action item with
  `confidenceScore: 0.6` and excludes one with `confidenceScore: 0.3`.
- Correctly scopes to the given `meetingId`, excluding action items from a
  different meeting even within the same team.
- Correctly excludes an action item that already carries a populated
  `jiraIssueId` when checking Jira eligibility specifically (the
  already-synced defensive check, Section 5).
- `enqueueAutoSyncJobs()` with `autoSyncEnabled: false` results in zero
  repository calls beyond the initial settings read (verified via a
  call-count assertion, confirming the fast no-op path, Section 17).
- `enqueueAutoSyncJobs()` with two enabled providers and three eligible
  action items enqueues exactly six jobs (the fan-out multiplication,
  Section 18), each with a distinct, correctly-composed idempotency key.
- A provider listed in `autoSyncProviders` but lacking an active
  `TeamIntegration` row is correctly skipped at the runtime check (Section
  9's defense-in-depth re-verification), even if it somehow passed
  configuration-time validation (simulated via a disconnect occurring
  between configuration and this test's execution).

#### `team-settings-validation.test.ts`

- `autoSyncProviders` containing `'SLACK'` is rejected at the type/schema
  level.
- `autoSyncProviders` containing a provider without an active integration
  is rejected with `422` at the service layer.
- A settings update containing only `autoSyncEnabled` (omitting
  `autoSyncProviders`) correctly merges without disturbing any other
  existing `teams.settings` key (the merge-not-replace regression check,
  reusing the exact pattern already tested for Day 16's original settings
  update logic).

### Integration Tests

#### `auto-sync-parity.test.ts` (the day's centerpiece — Section 15)

- A seeded meeting extraction event, with auto-sync enabled for Jira,
  results in an `integrate` job structurally identical (same payload
  shape, same idempotency-key mechanism, same queue) to a manually
  triggered sync job for an equivalent action item.
- A forced Jira failure via the auto-sync path increments
  `consecutiveErrors` on the `TeamIntegration` row identically to a forced
  failure via the manual endpoint — verified via a direct
  before/after-state comparison across both trigger paths within the same
  test file.
- The two-stage alerting escalation (Day 64) fires identically regardless
  of trigger source, confirmed by forcing five consecutive failures via
  each path independently and asserting the same deactivation + email
  outcome in both cases.
- A successful auto-sync correctly sets `autoSynced: true`; a successful
  manual sync correctly leaves it `false` (or unset, per the migration's
  nullable design) — the one deliberate, expected *difference* between
  the two paths, confirmed precisely, in contrast to every other aspect of
  their behavior which is confirmed identical.
- End-to-end: seeding a meeting with three action items (two above, one
  below the confidence threshold) and a team with Jira auto-sync enabled
  results in exactly two `jiraIssueId`-populated action items after the
  full extraction-to-sync pipeline runs, using a fully mocked Jira HTTP
  layer (reusing Day 65's established mocking infrastructure).

### Manual Smoke Test (Required Before Sign-Off)

A hand-performed scenario: enable auto-sync for a real sandbox Jira
connection, process a real (or realistically simulated) meeting extraction
event, and confirm the resulting action items appear as real tickets in
the sandbox Jira project without any manual sync click — the end-to-end
proof that today's wiring genuinely delivers the product experience this
day exists to close the gap on.

---

## 24. End-of-Day Checklist

### Configuration

- [ ] `autoSyncEnabled` defaults to `false` for every team with no
      explicit setting
- [ ] `autoSyncProviders` rejects `'SLACK'` at the type level, not merely
      at runtime
- [ ] Settings update correctly cross-validates `autoSyncProviders`
      against currently-active integrations, both at request-validation
      time and via a defensive runtime re-check inside the trigger path

### Eligibility & Trigger

- [ ] `findAutoSyncEligibleItems()` correctly applies the confidence
      threshold (reusing the platform's existing 0.5 constant, not a new one)
- [ ] Eligibility is scoped to the specific meeting just processed, never
      a historical backlog sweep
- [ ] `extract.worker.ts`'s new step is a genuine fast no-op for any team
      with auto-sync disabled — verified via a call-count assertion, not
      merely code review

### Idempotency

- [ ] System-generated idempotency keys are deterministic, composed from
      `actionItemId` + `provider` + `meetingId`
- [ ] A simulated re-processed extraction event produces the identical
      key on both attempts, correctly deduplicating via the existing Redis
      mechanism with zero new logic

### Parity With Manual Sync (Section 15's Central Claim)

- [ ] `integrate.worker.ts` requires zero logic-path changes beyond the
      `autoSynced` flag write — confirmed via code review, not just
      passing tests
- [ ] Forced failures via both trigger paths produce identical
      `consecutiveErrors` increments and identical two-stage alerting
      escalation timing
- [ ] The `source` job-payload tag is confirmed, via code search, to never
      appear inside any conditional statement in `integrate.worker.ts`

### Data Model

- [ ] `ActionItem.autoSynced` migration is nullable-then-defaulted,
      zero-downtime, with no backfill coercing historical rows to a
      misleading `false`
- [ ] `autoSynced` is written only at the point of successful sync
      completion, never speculatively set earlier

### Multi-Provider Fan-Out

- [ ] A team with N enabled providers and M eligible action items
      produces exactly N×M independent `integrate` jobs, each with a
      distinct idempotency key
- [ ] Each provider's job is independently retryable and independently
      subject to its own `TeamIntegration` row's health tracking

### Frontend

- [ ] `AutoSyncSettings.tsx` disables the toggle for any provider without
      an active connection, with an explanatory tooltip
- [ ] `AutoSyncIndicator.tsx` renders correctly for auto-synced items and
      renders nothing (no badge clutter) for manually-synced ones
- [ ] The existing settings-update hook requires no modification to
      support the two new fields

### Observability

- [ ] `auto_sync.jobs_enqueued` and `auto_sync.eligible_items_found`
      metrics visible on the existing Grafana dashboard
- [ ] Structured logs correctly report meeting ID, team ID, and per-provider
      job counts for every auto-sync trigger event

### Sign-Off

- [ ] All unit and integration tests pass in CI, including the full
      `auto-sync-parity.test.ts` suite
- [ ] Manual E2E performed: real sandbox Jira connection, auto-sync
      enabled, a real extraction event results in real tickets with zero
      manual sync action taken

---

## 25. Risks & Edge Cases

```
RISK                                              MITIGATION BUILT TODAY
──────────────────────────────────────────────────────────────────────────
A team enables auto-sync expecting historical
  action items to also sync retroactively            Eligibility explicitly
                                                    scoped to the
                                                    just-processed meeting
                                                    only; documented as a
                                                    forward-looking feature,
                                                    not a bulk-sync tool —
                                                    surfaced in settings UI
                                                    copy, not merely backend
                                                    behavior

Auto-sync silently defaults to on for existing
  connected integrations, flooding a project with
  unexpected tickets                                 Explicit opt-in default,
                                                    enforced at the schema
                                                    level (Section 4)

A future engineer introduces trigger-source-aware
  branching inside integrate.worker.ts, eroding
  the "auto and manual are indistinguishable"
  guarantee over time                                Dedicated, permanent
                                                    regression suite
                                                    (auto-sync-parity.test.ts)
                                                    encoding this invariant,
                                                    plus explicit type-level
                                                    documentation on the
                                                    source field discouraging
                                                    its misuse

A large meeting with many low-confidence action
  items still produces a meaningful sync burst
  even after the confidence filter                   Shared integrate queue
                                                    concurrency ceiling
                                                    (unchanged, 3) throttles
                                                    total outbound call
                                                    volume regardless of how
                                                    many jobs are enqueued

Auto-sync is enabled for a provider that gets
  disconnected shortly afterward, leaving a stale
  configuration                                      Runtime re-check inside
                                                    enqueueAutoSyncJobs(),
                                                    independent of the
                                                    configuration-time
                                                    validation, ensures no
                                                    sync is attempted against
                                                    a no-longer-active
                                                    integration

Migration backfill logic mistakenly sets
  autoSynced=false for historical rows, implying a
  false claim about how they were synced             Explicit nullable,
                                                    no-backfill migration
                                                    design (Section 14)
```

---

*Document: DAY-66-PLAN-001 | Vocaply | Day 66: integrate.worker.ts Hardening — Extraction-Triggered Auto-Sync*
*Full Scalable Industry-Level Build Plan | Principal Engineer Edition*
*Opt-in auto-sync · Deterministic idempotency · Manual/auto behavioral parity*
*Security-first · Performance-optimized · Production-grade · Planning Document — No Code*
