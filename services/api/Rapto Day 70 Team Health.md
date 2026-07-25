# Vocaply — Day 70: Team Health Score — Calculation, Trend, and Weekly Digest
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-70-PLAN-001 | Version 1.0 | Phase 5 — Integrations (Days 56–70, Final Day)

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Why This Is Phase 5's Final Deliverable](#2-why-this-is-phase-5s-final-deliverable)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Layer 1 — team-health.service.ts Full Implementation](#4-layer-1--team-healthservicets-full-implementation)
5. [Layer 2 — Team-Level Trend Calculation](#5-layer-2--team-level-trend-calculation)
6. [Layer 3 — Caching Strategy (cache:team:health)](#6-layer-3--caching-strategy-cacheteamhealth)
7. [Layer 4 — buildWeeklyDigestData() Content Assembly](#7-layer-4--buildweeklydigestdata-content-assembly)
8. [Layer 5 — WeeklyDigest.tsx Template](#8-layer-5--weeklydigesttsx-template)
9. [Layer 6 — notify.worker.ts WEEKLY_DIGEST Case](#9-layer-6--notifyworkerts-weekly_digest-case)
10. [Layer 7 — Cron Design: Pre-Computation and Dispatch](#10-layer-7--cron-design-pre-computation-and-dispatch)
11. [Plan Gating — Why Digests Are a Paid-Tier Feature](#11-plan-gating--why-digests-are-a-paid-tier-feature)
12. [Deduplication Design](#12-deduplication-design)
13. [Dual-Channel Digest Delivery (Email + Optional Slack)](#13-dual-channel-digest-delivery-email--optional-slack)
14. [Security Architecture](#14-security-architecture)
15. [Performance Architecture](#15-performance-architecture)
16. [Error Handling & Retry Strategy](#16-error-handling--retry-strategy)
17. [Observability & Logging](#17-observability--logging)
18. [Frontend Integration Plan](#18-frontend-integration-plan)
19. [Types & Interfaces](#19-types--interfaces)
20. [Testing Plan](#20-testing-plan)
21. [End-of-Day Checklist](#21-end-of-day-checklist)
22. [Risks & Edge Cases](#22-risks--edge-cases)
23. [Phase 5 Closure — What This Day Completes](#23-phase-5-closure--what-this-day-completes)

---

## 1. Day Overview & Goals

### What Gets Built Today

Day 70 is the final day of Phase 5. `team-health.service.ts` has existed
since Day 16 as a deliberate scaffold — a function guaranteed to return a
sensible, non-`NaN`, non-error default rather than any real calculation,
per that day's explicit design constraint. The team health score's actual
formula (`fulfillmentRate × 0.6 + avgMemberScore × 0.3 + onTimeRate ×
0.1`, plus a 14-day trend comparison) has been fully specified in the
HLD's Analytics & Reporting Engine section since the platform's earliest
planning documents. Today replaces that scaffold with the real
calculation, wires it into every frontend surface that has been waiting
for it, and — as the day's and the block's final deliverable — builds and
ships the **Weekly Digest**: the tenth and last template in the platform's
notification roster, and the first notification type that summarizes an
entire week of team activity rather than reacting to a single event.

```
TODAY BUILDS:
  ✅ team-health.service.ts's full calculateTeamHealthScore() —
     replacing the Day 16 scaffold with the real weighted formula and a
     14-day trend comparison, reusing Day 69's individual-score trend
     convention for consistency of meaning
  ✅ cache:team:health:{teamId} wired for real — 5-minute TTL, invalidated
     on any commitment status change in the team
  ✅ buildWeeklyDigestData(teamId) — the content-assembly function
     drawing on Day 69's newly-populated commitment_score_snapshots table
  ✅ WeeklyDigest.tsx — the tenth and final email template, built on Day
     68's shared design system, including the digest-specific stat-callout
     patterns that system was explicitly designed to support
  ✅ notify.worker.ts's WEEKLY_DIGEST case — dual-channel dispatch (email
     always; Slack channel post where connected and preference-enabled)
  ✅ Two new cron entries: Sunday-midnight team-health pre-computation
     (paired efficiently with Day 69's own Sunday cron) and Monday-9AM
     digest dispatch, plan-gated to GROWTH and above
  ✅ TeamHealthDashboard.tsx and TrendIndicator.tsx wired to real,
     non-placeholder data for the first time
  ✅ The formal closing verification of the entire Days 56–70 Phase 5
     block — a full manual end-to-end trace from a real meeting through
     to a delivered weekly digest

DOWNSTREAM IMPACT:
  Phase 6 (Landing Page, Days 71–80) — begins building marketing content,
           demo screenshots, and feature claims against a product whose
           core accountability loop is, as of today, entirely real —
           nothing in the landing page's "team health dashboard" or
           "weekly digest" marketing screenshots will be aspirational
  Phase 7 (Billing, Days 81–88) — the GROWTH-plan gating logic built
           today (Section 11) becomes the first real, functioning example
           of plan-based feature restriction the billing phase's own
           plan-limit-enforcement middleware can be modeled after

DO NOT SKIP OR RUSH:
  Today is explicitly the closing verification point for FOURTEEN days of
  work (56–70), not merely its own five sections of new functionality.
  The end-of-day sign-off (Section 21) is written as a full-stack trace —
  meeting → extraction → sync → notify → individual score → team score →
  digest — precisely because this is the only point in the entire sprint
  where every subsystem built since Day 56 can be observed operating
  together, end to end, for the first time. Treating today as "just build
  the digest" and skipping this closing trace would leave Phase 5 formally
  unverified as a whole, even if every individual day's own tests pass.
```

### 8-Hour Time Allocation

```
9:00 AM – 9:45 AM    → team-health.service.ts — calculateTeamHealthScore():
                        aggregate fulfillmentRate, avgMemberScore,
                        onTimeRate, weighted composition
9:45 AM – 10:15 AM   → team-health.service.ts — 14-day trend calculation,
                        reusing Day 69's threshold convention
10:15 AM – 10:45 AM  → cache.service.ts — cache:team:health:{teamId}
                        cache-aside wiring + invalidation trigger points
10:45 AM – 12:00 PM  → buildWeeklyDigestData(teamId) — content assembly:
                        health score + delta, most-improved/most-declined
                        members, weekly fulfilled/missed totals, upcoming
                        deadlines
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 2:00 PM    → WeeklyDigest.tsx — built on Day 68's shared design
                        system, using EmailStatCallout for the digest's
                        multiple stat blocks
2:00 PM – 2:45 PM    → notify.worker.ts — WEEKLY_DIGEST case: email
                        dispatch + optional Slack channel-post branch
2:45 PM – 3:30 PM    → scheduler.ts — Sunday-midnight team-health
                        pre-computation cron (paired with Day 69's score
                        cron) + Monday-9AM digest dispatch cron, plan-gated
3:30 PM – 4:15 PM    → Frontend: TeamHealthDashboard.tsx +
                        TrendIndicator.tsx wired to real data
4:15 PM – 5:00 PM    → Unit tests: health-score formula, trend edge cases,
                        digest data assembly
5:00 PM – 5:30 PM    → Integration tests: full digest dispatch flow, plan
                        gating, dedup verification
5:30 PM – 6:00 PM    → THE PHASE 5 CLOSING TRACE (Section 23) — full
                        manual E2E verification + final sign-off
```

---

## 2. Why This Is Phase 5's Final Deliverable

### Team Health Score Is the Natural Capstone of the Scoring Work

Day 69 built the individual-member scoring algorithm and — critically —
audited and closed every gap in when it gets recalculated. Team health
score is a direct, natural consumer of that now-guaranteed-fresh data: its
`avgMemberScore` component is simply the mean of every active member's
already-correct `users.commitmentScore` column. This means today's work
has **zero scoring logic of its own to invent** — it is purely a
rollup/aggregation layer sitting on top of Day 69's completed foundation,
which is precisely why it is sequenced as the day immediately following
it, and precisely why today's plan explicitly states (Section 4) that its
correctness depends entirely on Day 69 having been done right.

### The Weekly Digest Is the Notification Roster's Natural Capstone

Every one of the nine notification types completed before today (across
Days 60, 64, 67, 68) has been **reactive** — triggered by a single event
(a meeting processed, a token failing, a commitment missed or fulfilled).
The Weekly Digest is the platform's first **proactive, aggregate**
notification — assembled on a schedule, summarizing a week's worth of
activity rather than responding to one moment. Building it last, once
every reactive notification type and both scoring subsystems already
exist and are proven correct, is deliberate: the digest's entire content
is *composed* from data these earlier pieces produce (individual score
snapshots from Day 69, team health score from earlier in today, raw
commitment counts from the core commitments module) — it has no
independent data source of its own, making it the correct final piece to
build once every ingredient is actually available and trustworthy.

---

## 3. File Structure to Create

```
services/api/src/
│
├── modules/teams/
│   └── team-health.service.ts                  ← MODIFY — full
│                                                    implementation
│                                                    replacing the Day 16
│                                                    scaffold; new
│                                                    buildWeeklyDigestData()
│
├── modules/notifications/
│   └── templates/
│       └── WeeklyDigest.tsx                      ← NEW — built on Day 68's
│                                                       shared design system
│
├── queues/
│   ├── workers/
│   │   └── notify.worker.ts                       ← MODIFY — WEEKLY_DIGEST
│   │                                                   case fully implemented
│   └── scheduler.ts                                 ← MODIFY — two new cron
│                                                          entries
│
└── services/
    └── cache.service.ts                            ← MODIFY (confirm) —
                                                            cache:team:health:{teamId}
                                                            cache-aside helper,
                                                            invalidation wiring

services/api/tests/
├── unit/
│   ├── team-health-calculation.test.ts             ← NEW
│   └── weekly-digest-data-assembly.test.ts          ← NEW
└── integration/
    ├── weekly-digest-dispatch.test.ts                ← NEW — full dispatch
    │                                                       flow, plan gating,
    │                                                       dedup
    └── phase5-closing-trace.test.ts                   ← NEW — the automated
                                                              counterpart to
                                                              Section 23's
                                                              manual trace,
                                                              exercising the
                                                              full meeting →
                                                              digest pipeline
                                                              with mocked
                                                              third-party
                                                              boundaries

apps/web/src/features/team/
└── components/
    ├── TeamHealthDashboard/
    │   └── TeamHealthDashboard.tsx                  ← MODIFY — wired to
    │                                                      real data
    └── TrendIndicator.tsx                             ← MODIFY (confirm) —
                                                              renders the
                                                              now-real
                                                              team-level trend
```

### Dependency Flow (No Circular Deps)

```
team-health.service.ts
  ├── calculateTeamHealthScore(teamId)
  │     └── reads: commitments (30-day aggregate), users.commitmentScore
  │         (Day 69's denormalized column, already fresh)
  └── buildWeeklyDigestData(teamId)
        ├── calculateTeamHealthScore(teamId)          (this week vs. cached
        │                                               prior-week snapshot)
        ├── commitment_score_snapshots                  (Day 69's table —
        │                                               most-improved/
        │                                               most-declined members)
        └── commitments (weekly fulfilled/missed totals, upcoming deadlines)

scheduler.ts (Monday 9AM cron)
  └── team-health.service.ts.buildWeeklyDigestData()
        └── (enqueues) notify queue → notify.worker.ts
              └── WEEKLY_DIGEST case
                    ├── templates/WeeklyDigest.tsx     (email, always)
                    └── slack-notify.service.ts         (Day 67 — channel
                                                          post, if connected +
                                                          enabled)
```

---

## 4. Layer 1 — `team-health.service.ts` Full Implementation

### File: `modules/teams/team-health.service.ts`

**Responsibility:** Replace the Day 16 scaffold with the real, documented
formula. This function has existed in name and contract (input: `teamId`;
output: a score/trend/breakdown shape guaranteed never to be `NaN` or
throw) since Day 16 — today's work is a **drop-in replacement of its
internals**, with the external contract unchanged, meaning no caller
anywhere in the codebase (the team dashboard endpoint, the analytics API,
today's own digest-assembly function) needs any modification beyond
simply receiving real numbers instead of placeholder ones.

### `calculateTeamHealthScore(teamId)` — The Three Components

1. **`fulfillmentRate`**: the team's aggregate `fulfilled / (fulfilled +
   missed)` across all members' commitments over the trailing 30 days,
   confidence-filtered `>= 0.5` — the identical filtering discipline
   Day 69 applied to the individual score calculation, reused rather
   than re-derived, ensuring the two related metrics (an individual's
   score and their team's score) are computed on a consistent basis and
   remain intuitively comparable to a user viewing both.
2. **`avgMemberScore`**: the arithmetic mean of every currently-active
   team member's `users.commitmentScore` — this is the one component that
   makes today's work entirely dependent on Day 69's completeness: if any
   member's denormalized score were stale (the exact class of bug Day 69
   closed), this average would silently inherit that staleness. Today's
   implementation trusts the column directly, with **no** independent
   recalculation of individual scores performed here — recomputing each
   member's score inline inside the team-health calculation would be both
   redundant (Day 69 already guarantees freshness) and a violation of the
   "one shared algorithm, one place it's computed" discipline this entire
   five-day block has enforced.
3. **`onTimeRate`**: fulfilled-on-time ÷ total-fulfilled, over the
   identical 30-day window, the team-level rollup of the same on-time
   concept already used in the individual formula.

### The Weighted Composition

`score = fulfillmentRate × 0.6 + avgMemberScore × 0.3 + onTimeRate × 0.1`,
clamped and rounded via the same `Math.min(100, Math.max(0, Math.round(...)))`
safety pattern Day 69 applied to the individual score — reused verbatim,
not reinvented, since the same boundary-safety concern applies identically
here.

### Why 60/30/10, Restated for This Day's Context

This weighting was not invented today — it has been documented in the
HLD since the platform's earliest planning. Today's plan restates the
rationale for completeness: `fulfillmentRate` (60%) is the primary signal
of team accountability health; `avgMemberScore` (30%) rewards individual
consistency across the team, distinct from the raw team-wide ratio (a
team could have a decent aggregate fulfillment rate while masking one
consistently-underperforming member whose low individual score pulls this
component down, surfacing a signal the raw team ratio alone would hide);
`onTimeRate` (10%) is a quality-of-fulfillment signal, weighted lightest
since *whether* a promise was kept matters more than *exactly how
promptly*, but still meaningfully rewarded.

### Zero-History Default

A team with no commitment history at all (a brand-new team, or one that
has genuinely had zero commitments extracted in the 30-day window)
returns a defined, sensible default — the exact same "don't throw, don't
return `NaN`" guarantee the Day 16 scaffold originally promised, now
delivered by the real calculation rather than a hardcoded placeholder.
This is verified today as an explicit test case (Section 20), not merely
assumed to fall out naturally from the underlying math.

---

## 5. Layer 2 — Team-Level Trend Calculation

### 14-Day Comparison Window — Different From the Individual's 7-Day Window, Deliberately

Day 69's individual member trend compares a 7-day window against the
prior 7 days. Team health's trend instead compares a **14-day** window
against the prior 14 days — a deliberate, documented difference, not an
inconsistency: an individual's weekly commitment volume is typically small
enough that a 7-day window already captures a meaningful sample, whereas
a team-wide aggregate benefits from a longer window to smooth out the
kind of day-to-day/week-to-week noise that would otherwise make a team's
trend indicator flicker between improving/declining more often than is
actually meaningful at the team level.

### The Threshold Convention — Reused Unchanged

Despite the different window length, the **same** ±5-point
improving/declining/stable threshold from Day 69 is reused here without
modification — this is the deliberate consistency point: a user who has
learned "a 5-point swing is what triggers a trend change" from viewing
their own individual score should encounter the identical mental model
when looking at their team's trend indicator, even though the underlying
comparison windows differ in length. Using two different thresholds for
what is visually the same ↑/↓/→ indicator component (Section 18) would be
a confusing, unjustified inconsistency.

### Same Edge-Case Discipline

Zero decided commitments in either the current or prior 14-day window
resolves to `'stable'`, via the identical defensive pattern Day 69
established — no new edge-case logic is invented; the same defensive
shape is simply applied at the team-aggregate level instead of the
individual level.

---

## 6. Layer 3 — Caching Strategy (`cache:team:health`)

### Wiring the Already-Specified Design for Real

The HLD has documented `cache:team:health:{teamId}` (5-minute TTL,
invalidated on any commitment status change within the team) since the
platform's earliest planning — today is the day this specification is
actually implemented, following the platform's standard cache-aside
pattern (check Redis → miss → compute → populate Redis → return) already
applied consistently to every other frequently-read, infrequently-changed
aggregate on this platform (team member lists, plan/usage data, and now
team health).

### Why Caching Is Retained Despite the Calculation Being Cheap

As explicitly noted in the source planning material: the calculation
itself (an aggregate query plus an average over already-denormalized
member scores) is cheap enough that correctness does not strictly require
caching. The cache is retained anyway for a concrete, stated reason: a
team's dashboard page can be simultaneously open in multiple team
members' browsers, each independently loading the same team's health
score — without caching, N simultaneous dashboard loads would each
trigger an independent recomputation of an identical result within the
same few seconds, a wasteful pattern the cache-aside layer cheaply
eliminates.

### Invalidation Trigger Points

Every commitment status transition (Section 7's five trigger points from
Day 69, all of which already call `persistScore()` for the individual
member) additionally invalidates `cache:team:health:{teamId}` for that
commitment's team — reusing the same trigger-point audit discipline Day
69 established, applied here to cache invalidation rather than score
recalculation, ensuring the team-health cache never serves a stale value
for longer than the deliberate 5-minute worst case even without an
explicit invalidation (the TTL itself is the safety net; explicit
invalidation is the responsiveness optimization on top of it).

---

## 7. Layer 4 — `buildWeeklyDigestData()` Content Assembly

### File: `team-health.service.ts` (new function, same file)

**Responsibility:** Assemble the complete data payload the
`WeeklyDigest.tsx` template needs — kept as a distinct function from the
template's own rendering logic, following the platform's established
"data assembly and presentation are separate layers" discipline (the same
separation already applied to every other notification type's
service/template split since Day 18).

### The Four Content Sections

1. **Team health score and week-over-week change**: calls
   `calculateTeamHealthScore(teamId)` for the current value, and compares
   it against the value from the **prior week's** pre-computed snapshot
   (see Section 10's pairing with Day 69's cron) — rather than
   recomputing a full second historical calculation on demand, reusing
   pre-computed data for the same reason Day 69's snapshot table exists
   at all: avoiding expensive live historical aggregation.
2. **Most-improved and most-declined members**: queries
   `commitment_score_snapshots` (Day 69's table, populated for the first
   time by that day's Sunday cron) comparing this week's snapshot against
   last week's, per member, and surfaces the top 2–3 in each direction —
   this section exists **only** because Day 69 built the historical
   snapshot data; without it, computing "who improved most this week"
   would require an expensive live comparison across the full
   `commitments` table for every member, exactly the cost the snapshot
   table was built to avoid.
3. **Total commitments fulfilled/missed for the week**: a simple,
   already-indexed aggregate query scoped to the trailing 7 days.
4. **Upcoming deadlines in the next 7 days**: a query against `PENDING`
   commitments with `dueDate` in the coming week — giving the digest a
   forward-looking element, not merely a retrospective one, consistent
   with the accountability-partner tone established across the platform's
   other notification content.

### Why This Function Lives in `team-health.service.ts`, Not a New Module

The digest's content is, in substance, almost entirely team-health and
scoring data with a thin commitments-query layer on top — placing this
assembly function alongside `calculateTeamHealthScore()` (rather than
inside `notifications.service.ts` or a new dedicated digest module) keeps
the team-health domain's logic cohesive in one file, consistent with the
platform's general preference for co-locating closely-related business
logic rather than fragmenting it purely along "which subsystem eventually
consumes this" lines.

---

## 8. Layer 5 — `WeeklyDigest.tsx` Template

### Built on Day 68's Shared Design System, From the Start

`WeeklyDigest.tsx` is the first template built entirely **after** Day
68's design system existed — it never has legacy, pre-system styling to
re-skin away, and is written from its first line using
`EmailLayout`/`EmailCard`/`EmailDivider`/`EmailButton`/`EmailFooter` and,
critically, `EmailStatCallout` — the number-plus-label primitive Day 68
built specifically anticipating this exact need (a digest displaying
several distinct figures — health score, fulfilled count, missed count —
side by side, in a consistent visual format).

### Content Layout, Informed by Section 2's Cross-Product Design Analysis (Day 68)

Directly applying the Slack-digest-pattern observation from Day 68's
design research ("digest-style emails use clear section dividers and
small stat callouts rather than dense paragraphs of prose"):
`WeeklyDigest.tsx` is structured as a sequence of clearly `EmailDivider`-
separated sections — health score callout, most-improved/declined member
list, fulfilled/missed stat row, upcoming-deadlines list — each visually
distinct and scannable in isolation, rather than one continuous block of
narrative text a recipient would need to read start-to-finish to extract
the information they actually want.

### Single Primary CTA, Per Day 68's Design Standard

Despite covering multiple content sections, the template includes exactly
**one** primary CTA button ("View full team dashboard"), consistent with
Day 68's established "exactly one primary CTA per email" rule — the
digest's various stat callouts and member-list items are informational,
not independently actionable, avoiding the competing-CTA problem that
rule was designed to prevent.

---

## 9. Layer 6 — `notify.worker.ts` `WEEKLY_DIGEST` Case

### Dual-Channel Dispatch, Reusing Both Prior Days' Infrastructure Unchanged

The `WEEKLY_DIGEST` case, completed today, dispatches to **two** channels
using infrastructure built on two separate earlier days, with zero new
transport code:

1. **Email (always attempted, subject to plan gating — Section 11)**: via
   `email.service.ts` (Day 68's completed wrapper), rendering
   `WeeklyDigest.tsx` for every `MANAGER+` role holder on the team.
2. **Slack (conditionally attempted)**: if the team's Slack integration
   is active and the team-level `weeklyDigestEnabled`/relevant preference
   is set, a channel-post summary is dispatched via
   `slack-notify.service.ts` (Day 67's completed orchestration) — reusing
   the exact `sendChannelMessage()` primitive already proven for the
   `MEETING_PROCESSED` type since Day 60, with a **new** Block Kit
   builder (`buildWeeklyDigestBlocks()`, added to `slack-notify.service.ts`
   today) producing a Slack-appropriate summary of the same underlying
   digest data `buildWeeklyDigestData()` assembled.

### Why This Requires No New Dispatch-Path Code, Only a New Content Builder

The actual **mechanics** of sending to email and sending to Slack were
both fully built and proven across Days 60–68 — today's `WEEKLY_DIGEST`
case is, structurally, simply a **new caller** of both existing dispatch
paths, differing from every other notification type only in that it
targets a role-based recipient list (every `MANAGER+`, per the existing
fan-out pattern already established for `COMMITMENT_MISSED` on Days 67/68)
rather than a single event-specific individual, and in that its content
comes from `buildWeeklyDigestData()` rather than a single commitment/
meeting row.

---

## 10. Layer 7 — Cron Design: Pre-Computation and Dispatch

### Cron 1: Sunday-Midnight Team-Health Pre-Computation

Paired **efficiently** with Day 69's own Sunday-midnight score-snapshot
cron — rather than running as a fully separate job performing its own
independent pass over every team, today's team-health pre-computation
piggybacks on the same cron execution, since both jobs need to iterate
substantially the same population (every team, every active member within
each team) and computing both the individual snapshots and the team-level
health score within one coordinated pass avoids two separate, redundant
full-database sweeps. The team-health portion, once each team's members'
scores have been freshly snapshotted (Day 69's half of this combined
cron), computes and caches that team's health score for the week, ready
for Monday's digest to read without needing its own live recalculation.

### Cron 2: Monday-9AM Weekly Digest Dispatch

A separate cron entry, deliberately **not** combined with the
Sunday-midnight job (running nine hours later, on a different day,
serving a genuinely different purpose — data pre-computation versus
notification dispatch — the platform's established pattern of separating
"compute and store" crons from "read and notify" crons, already applied
elsewhere, e.g., Day 64's proactive-refresh cron being distinct from any
notification-dispatch cron). This cron, for every team on a `GROWTH`-or-
above plan (Section 11), calls `buildWeeklyDigestData()` (reading the
now-fresh pre-computed data from the Sunday job) and enqueues one `notify`
job per team.

### Why Fan-Out Per Team, Not a Single Mega-Job

Consistent with every prior cron built this sprint (Day 56's
calendar-sync fan-out, Day 64's token-refresh fan-out): one `notify` job
per team, not one job looping over every team internally — ensuring a
single team's digest-assembly failure (e.g., a data-access error specific
to that team's records) never blocks or delays every other team's digest
from being generated and sent in the same cron run.

---

## 11. Plan Gating — Why Digests Are a Paid-Tier Feature

### The Rule, Restated

Only teams on `GROWTH` plan or above receive the Weekly Digest — `FREE`
and `STARTER` teams do not, per the HLD's already-documented plan-gating
policy for this specific notification type (distinct from, e.g.,
`MEETING_PROCESSED`, which is not plan-gated, since it delivers the
platform's core per-meeting value regardless of tier).

### Implementation

The Monday-9AM cron's team-iteration query filters on `teams.plan IN
('GROWTH', 'BUSINESS', 'ENTERPRISE')` **before** calling
`buildWeeklyDigestData()` for each team — a deliberate ordering choice:
the plan check happens first, cheaply, against an already-indexed column,
avoiding the wasted cost of assembling full digest content for a team
that will never receive it. This mirrors the platform's general principle
(seen in Day 17's meeting-creation plan-limit check) of checking cheap,
denormalized gating conditions before performing more expensive
downstream work.

### Why This Matters as Precedent for Phase 7

As explicitly noted in the day's framing (Section 1): this is the
platform's first real, functioning instance of a notification-level
plan-gating rule — Phase 7's billing work (`PlanLimit.tsx`'s eventual
trigger wiring, and any future plan-restricted feature) can reference this
exact pattern (a plan-tier filter applied before expensive work begins,
not after) as its own established precedent, rather than needing to
design plan-gating logic from scratch.

---

## 12. Deduplication Design

### Reusing the Existing, Previously-Unimplemented Key

`notif:dedup:WEEKLY_DIGEST:{teamId}` (7-day TTL) has been specified in
the original HLD since early planning but never actually implemented,
since no digest dispatch existed to need it until today. The
implementation follows the identical check-before-send,
set-after-send pattern already used for every other notification type
since Day 18 — checked once per team (not per individual `MANAGER+`
recipient, since a digest is conceptually one weekly event per team, not
a separately-deduplicated event per recipient the way `COMMITMENT_MISSED`'s
manager fan-out is), preventing a re-run of the Monday cron (e.g., due to
a deployment restart at an unlucky moment, mirroring the exact concern
Day 69's weekly snapshot cron idempotency was designed to address) from
producing a duplicate digest send within the same week.

---

## 13. Dual-Channel Digest Delivery (Email + Optional Slack)

### Why Email Is Unconditional and Slack Is Conditional

Every `GROWTH+` team receives the email digest — email is a channel every
paying customer is guaranteed to have (per Day 68's framing). The Slack
channel-post is additionally sent **only** if that team has both an
active Slack integration and the relevant preference enabled — reusing
the exact conditional-dispatch pattern already established for every
other dual-channel notification type since Day 67/68, where email is
never gated behind Slack's availability and Slack is always
additive/optional on top of the guaranteed email baseline.

### Cross-Channel Failure Isolation — Reaffirmed a Third Time

Following the identical principle verified bidirectionally on Days 67
and 68: a failure posting the digest to Slack (e.g., the team's default
channel was archived since it was configured) never prevents the email
digest from being sent, and vice versa — today's dispatch case wraps each
channel's attempt in its own independent try/catch, the same granular
isolation discipline applied consistently across every notification type
built this entire sprint block.

---

## 14. Security Architecture

### No New Credential or OAuth Surface

Today's entire scope — an aggregate calculation, a content-assembly
function, and a new email/Slack dispatch case — introduces zero new
third-party integration, zero new token handling, and reuses every
transport primitive built on earlier days unchanged.

### Tenant Isolation in Digest Content

`buildWeeklyDigestData()`'s every underlying query (health score,
member-snapshot comparison, weekly totals, upcoming deadlines) is scoped
strictly to the single `teamId` the digest is being assembled for — the
most-improved/most-declined member list, in particular, is verified today
to never include a member from any other team, even a team sharing the
same organization in a hypothetical future multi-team structure (the
platform's existing tenant-isolation discipline applied here with the
same rigor as everywhere else).

### Recipient Resolution — Reused, Not Reinvented

The `MANAGER+` role-holder resolution used to target the digest's email
recipients is the **same** shared function confirmed Day 67/68 to live in
`notifications.service.ts` — today's work explicitly verifies no
digest-specific duplicate of this resolution logic was introduced, per
this entire block's "one shared implementation" discipline.

---

## 15. Performance Architecture

### Why the Digest Never Performs Expensive Live Historical Aggregation

Every piece of "compare this week to last week" logic inside
`buildWeeklyDigestData()` reads from **pre-computed** data — Day 69's
`commitment_score_snapshots` table for individual member comparisons, and
today's own Sunday-cron-cached team-health value for the team-level
comparison — never issuing a live query across the full historical
`commitments` table at digest-assembly time. This is the direct payoff of
sequencing today's work after Day 69's snapshot infrastructure exists:
without it, assembling a single team's digest would require a
meaningfully more expensive historical query, multiplied across every
`GROWTH+` team in the same Monday-morning cron window.

### Cron Timing Considerations

The Sunday-midnight pre-computation and Monday-9AM dispatch are separated
by a full nine-hour window specifically to ensure the (potentially
longer-running, batch-processing) pre-computation job has ample time to
complete for every team before the dispatch job begins reading its
output — a deliberate timing margin, not an arbitrary schedule choice.

---

## 16. Error Handling & Retry Strategy

### Per-Team Digest-Assembly Failure Isolation

Consistent with the fan-out design (Section 10): if
`buildWeeklyDigestData()` throws for one specific team (e.g., a data
inconsistency specific to that team's records), that team's digest job
fails independently, is logged, and does not prevent any other team's
digest job — enqueued as a separate, independent job — from proceeding
normally.

### Per-Channel Dispatch Failure Isolation

As established in Section 13: an email-send failure and a Slack-post
failure are each independently caught and logged within the same
`WEEKLY_DIGEST` case, never causing the overall `notify` job to fail or
retry in a way that could risk a duplicate send to the channel that
already succeeded.

---

## 17. Observability & Logging

### Structured Log Fields

The Sunday pre-computation cron logs, at minimum: the number of teams and
users processed, total duration, and any per-team failures encountered.
The Monday dispatch cron logs, per team: the plan tier (confirming the
gating filter's effect is visible in logs, not merely inferred), whether
email/Slack/both were attempted, and each channel's outcome.

### New Metrics

`team_health.weekly_precompute.teams_processed` / `.duration_ms`,
`notify.weekly_digest.email.sent` / `.failed`,
`notify.weekly_digest.slack.sent` / `.skipped_not_connected` / `.failed` —
feeding the same Grafana dashboard tracking every other notification
type's per-channel outcomes since Days 60/67/68, giving the platform's
first complete, end-to-end view of its most complex notification type.

---

## 18. Frontend Integration Plan

### Component: `TeamHealthDashboard.tsx` (modified)

Previously rendering placeholder/mock values during earlier scaffolding
phases (per the Day 16 scaffold's original design intent), this component
is wired today to the real `calculateTeamHealthScore()` output — via
whichever existing endpoint the Day 20/21 Analytics API design already
routes team-health data through (either `GET /teams/me`'s extended
response shape or a dedicated `/analytics/overview` call) — with the
underlying data now genuinely fresh and cached per Section 6's design,
requiring only a data-source swap in this component, not new
data-fetching logic.

### Component: `TrendIndicator.tsx` — Confirmed, Not Rebuilt

Already built and already correctly rendering the ↑/↓/→
improving/declining/stable convention since Day 16/20/69 — today confirms
it correctly consumes the now-real team-level trend value (14-day window,
same ±5-point threshold, per Section 5) with zero component-level changes
required, the same "component built generically enough to need no
modification" payoff already observed for this exact component when Day
69 wired it for individual scores.

---

## 19. Types & Interfaces

### File: `team-health.service.ts` (types)

- **`TeamHealthScoreResult`** — `{ score: number; fulfillmentRate: number; avgMemberScore: number; onTimeRate: number; trend: 'improving' | 'stable' | 'declining' }`.
- **`WeeklyDigestData`** — `{ teamId: string; healthScore: number; healthScoreChange: number; mostImproved: MemberDelta[]; mostDeclined: MemberDelta[]; fulfilledCount: number; missedCount: number; upcomingDeadlines: UpcomingDeadline[] }`, the complete payload `WeeklyDigest.tsx` (and the Slack digest builder) consume.
- **`MemberDelta`** — `{ userId: string; name: string; previousScore: number; currentScore: number; change: number }`.
- **`UpcomingDeadline`** — `{ commitmentId: string; text: string; ownerName: string; dueDate: string }`.

No changes are required to any type introduced across Days 56–69 — every
one of today's new types is additive, scoped strictly to the team-health/
digest domain, confirming once more that today's work is a rollup layer
consuming existing, stable foundations rather than requiring any
retroactive change to them.

---

## 20. Testing Plan

### Unit Tests

#### `team-health-calculation.test.ts`

- A team with known, constructed member scores and commitment history
  produces the exact expected weighted score (60/30/10 verified via a
  hand-computed fixture).
- A team with zero commitment history returns the documented sensible
  default, never `NaN` or a thrown error.
- `avgMemberScore` correctly excludes inactive/removed members from the
  average.
- Trend calculation correctly uses the 14-day window (distinct from Day
  69's 7-day individual window) and the same ±5-point threshold,
  verified via constructed boundary-adjacent fixtures.

#### `weekly-digest-data-assembly.test.ts`

- `buildWeeklyDigestData()` correctly identifies the top most-improved
  and most-declined members from a constructed two-week snapshot fixture.
- Upcoming-deadlines section correctly bounds to the next 7 days,
  excluding both past-due and further-out commitments.
- A team with no week-over-week change in health score correctly reports
  a zero delta, not an omitted or `undefined` field.

### Integration Tests

#### `weekly-digest-dispatch.test.ts`

- A `GROWTH`-plan team correctly receives the digest via email to every
  `MANAGER+` role holder.
- A `FREE`-plan team is correctly excluded from the Monday cron's
  iteration entirely (plan-gating verified, not merely assumed).
- A team with an active, correctly-configured Slack integration
  additionally receives a channel-post digest summary; a team without one
  receives only the email.
- Re-running the Monday cron for the same week results in zero duplicate
  sends, verified via the `notif:dedup:WEEKLY_DIGEST:{teamId}` key check.
- A forced Slack-post failure for one team does not prevent that same
  team's email digest from sending, and does not affect any other team's
  digest dispatch in the same cron run.

#### `phase5-closing-trace.test.ts` (the day's — and the block's — capstone test)

- A fully mocked, end-to-end scenario: a meeting is processed → action
  items are extracted and (with auto-sync enabled, Day 66) synced to a
  mocked Jira → Slack and email notifications fire (Days 67/68) → the
  affected member's commitment score recalculates in real time (Day 69)
  → a subsequent simulated Sunday-midnight cron correctly snapshots that
  score and computes the team's health score (today) → a subsequent
  simulated Monday-9AM cron correctly assembles and dispatches a weekly
  digest reflecting all of the above. This single test asserts on the
  final digest's content, tracing correctness all the way back through
  every subsystem built across the entire Days 56–70 block.

### Manual Verification — The Phase 5 Closing Trace (Required Before Sign-Off)

The automated test above is paired with a genuine, hand-performed manual
trace against real (sandboxed) infrastructure, per Section 23 — the
formal, human-witnessed closing verification for the entire Phase 5
integration block, not merely today's own five sections of work.

---

## 21. End-of-Day Checklist

### Team Health Score

- [ ] `calculateTeamHealthScore()` produces the documented 60/30/10
      weighted result, verified against a hand-computed fixture
- [ ] Zero-history team returns a defined, sensible default — never
      `NaN`, never a thrown error
- [ ] 14-day trend window and the shared ±5-point threshold both
      correctly implemented and distinct-but-consistent with Day 69's
      individual-level trend

### Caching

- [ ] `cache:team:health:{teamId}` correctly cache-asides with a 5-minute
      TTL
- [ ] Invalidated on every commitment status change in the team, reusing
      Day 69's trigger-point audit as the invalidation-point checklist

### Weekly Digest Content & Template

- [ ] `buildWeeklyDigestData()` correctly assembles all four content
      sections from pre-computed (not live-aggregated) data sources
- [ ] `WeeklyDigest.tsx` built entirely on Day 68's shared design system,
      using `EmailStatCallout` for its multiple stat blocks
- [ ] Exactly one primary CTA button, per Day 68's design standard

### Dispatch

- [ ] Email digest sent to every `MANAGER+` role holder on `GROWTH+`
      teams; `FREE`/`STARTER` teams correctly excluded
- [ ] Slack channel-post correctly conditional on integration status +
      preference, never blocking or gating the email send
- [ ] Cross-channel failure isolation verified: a failure in one channel
      never affects the other

### Cron Design

- [ ] Sunday-midnight pre-computation correctly paired/coordinated with
      Day 69's own score-snapshot cron, avoiding a redundant second full
      pass over the user base
- [ ] Monday-9AM dispatch correctly fans out one job per team, never a
      single mega-job
- [ ] Plan-gating filter applied before expensive digest-assembly work
      begins, not after

### Deduplication

- [ ] `notif:dedup:WEEKLY_DIGEST:{teamId}` correctly prevents a duplicate
      send on a re-run within the same 7-day window

### Frontend

- [ ] `TeamHealthDashboard.tsx` wired to real data, all placeholder
      values removed
- [ ] `TrendIndicator.tsx` confirmed to require zero modification to
      correctly render the new real team-level trend value

### Sign-Off — Phase 5 Block Closure

- [ ] All unit and integration tests pass in CI, including the full
      `phase5-closing-trace.test.ts` automated end-to-end scenario
- [ ] The manual Phase 5 closing trace (Section 23) is performed and
      documented, witnessed as the formal verification that the entire
      Days 56–70 integration block functions correctly as one system

---

## 22. Risks & Edge Cases

```
RISK                                              MITIGATION BUILT TODAY
──────────────────────────────────────────────────────────────────────────
avgMemberScore silently inherits stale data if
  Day 69's trigger-point audit had missed a case      Today's
                                                    implementation
                                                    deliberately trusts
                                                    users.commitmentScore
                                                    directly rather than
                                                    recomputing — meaning
                                                    Day 69's own regression
                                                    suite (score-trigger-
                                                    audit.test.ts) is the
                                                    actual line of defense
                                                    here, explicitly
                                                    documented as a
                                                    cross-day dependency

Digest assembly performs expensive live
  historical aggregation at dispatch time,
  slowing the Monday-morning cron across many teams   Every historical
                                                    comparison reads
                                                    exclusively from
                                                    pre-computed snapshot/
                                                    cache data, never a
                                                    live full-table
                                                    aggregation

A team's digest-assembly failure blocks or delays
  every other team's digest in the same cron run       Per-team fan-out,
                                                    independent job
                                                    failure isolation,
                                                    consistent with every
                                                    prior cron built this
                                                    sprint

Monday cron re-runs due to a deployment restart,
  producing duplicate digest sends for the same week   notif:dedup:WEEKLY_DIGEST
                                                    key, 7-day TTL,
                                                    verified via a
                                                    dedicated re-run test

A FREE-plan team incorrectly receives a digest due
  to a plan-check ordering or filtering mistake         Explicit,
                                                    dedicated test
                                                    asserting FREE-plan
                                                    teams are excluded
                                                    from the cron's very
                                                    iteration, not merely
                                                    filtered after
                                                    assembly

Sunday pre-computation and Monday dispatch crons
  run out of order or too close together, with
  dispatch reading incomplete pre-computed data        Deliberate
                                                    nine-hour separation
                                                    between the two cron
                                                    schedules, providing
                                                    ample completion
                                                    margin for the
                                                    batch-processing
                                                    pre-computation job
```

---

## 23. Phase 5 Closure — What This Day Completes

### The Formal Manual Closing Trace

As the final act of Phase 5, today's sign-off requires a genuine,
hand-performed, real (sandboxed) walkthrough of the platform's complete
core loop, exactly as specified across the source planning material for
this block:

```
1. A real meeting is transcribed and processed by the AI pipeline.
2. Action items are extracted and — for a team with auto-sync enabled
   (Day 66) — automatically synced to a connected Jira/Linear/Notion
   integration, with zero manual sync action taken.
3. A Slack channel summary is posted (Day 67) and relevant emails are
   delivered to recipients (Day 68) for the processed meeting.
4. The affected members' commitment scores update in real time (Day 69),
   visibly animating on their dashboards via the member:score_updated
   Socket.io event.
5. On the following Sunday/Monday cycle, the team's health score
   recalculates (today) and a Weekly Digest — summarizing the entire
   week's activity, including the meeting and sync events from steps 1–4
   — is correctly assembled and delivered via email (and Slack, if
   connected) to every manager on the team.
```

### What Successfully Completing This Trace Proves

This is not merely today's own verification — it is the closing
verification for **every single day of Phase 5**, from Day 56's Google
Calendar sync through today. A successful trace demonstrates that six
third-party providers, two provider interfaces, a hardened deduplication
system, a centralized token-refresh-and-alerting service, two complete
notification channels, and two independent scoring algorithms all
compose correctly as one coherent product experience — the exact claim
every individual day's own planning document made in isolation, now
demonstrated together, for the first time, as a whole.

### Phase 5 — Final State

```
Phase 5 (Days 56–70) is now COMPLETE:
  Google Calendar · Bot Dedup · Jira (outbound + inbound webhook) · Slack ·
  Linear · Notion · Outlook Calendar · Token Refresh & Alerting ·
  Integration Testing · Extraction-Triggered Auto-Sync · Slack Notifications ·
  Email Notifications (10/10 templates) · Commitment Score Algorithm ·
  Team Health Score · Weekly Digest

Every scaffold left deliberately incomplete since earlier phases
(team-health.service.ts since Day 16; the integrate.worker.ts manual-only
trigger since Day 58; the notify.worker.ts partial Slack/email branches
since Day 18/19/60) is, as of today, fully replaced with real,
production-grade, tested implementation.

Phase 6 (Landing Page, Days 71–80) and Phase 7 (Billing & Analytics,
Days 81–88) both begin their work standing on a fully functional product,
not an aspirational one.
```

---

*Document: DAY-70-PLAN-001 | Vocaply | Day 70: Team Health Score — Calculation, Trend, and Weekly Digest*
*Full Scalable Industry-Level Build Plan | Principal Engineer Edition*
*Rollup scoring layer · Pre-computed digest assembly · Formal Phase 5 closing trace*
*Security-first · Performance-optimized · Production-grade · Planning Document — No Code*
