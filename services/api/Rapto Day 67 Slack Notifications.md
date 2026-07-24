# Vocaply — Day 67: Slack Notifications — Post-Meeting Summaries & Commitment Alerts
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-67-PLAN-001 | Version 1.0 | Phase 5 — Integrations (Days 56–70)

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Why This Is the Human-Facing Payoff of Day 60](#2-why-this-is-the-human-facing-payoff-of-day-60)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Layer 1 — Message Builder Design (Pure Functions)](#4-layer-1--message-builder-design-pure-functions)
5. [Layer 2 — slack-notify.service.ts Orchestration](#5-layer-2--slack-notifyservicets-orchestration)
6. [Layer 3 — notify.worker.ts Branch Completion](#6-layer-3--notifyworkerts-branch-completion)
7. [Layer 4 — Manager Alert Fan-Out Logic](#7-layer-4--manager-alert-fan-out-logic)
8. [Layer 5 — Recipient Resolution & Preference Checking](#8-layer-5--recipient-resolution--preference-checking)
9. [The New COMMITMENT_FULFILLED Notification Type](#9-the-new-commitment_fulfilled-notification-type)
10. [Rate Limiting & Sequential Dispatch Design](#10-rate-limiting--sequential-dispatch-design)
11. [Cross-Channel Failure Isolation](#11-cross-channel-failure-isolation)
12. [Idempotency & Deduplication](#12-idempotency--deduplication)
13. [Security Architecture](#13-security-architecture)
14. [Performance Architecture](#14-performance-architecture)
15. [Caching Strategy](#15-caching-strategy)
16. [Error Handling & Retry Strategy](#16-error-handling--retry-strategy)
17. [Observability & Logging](#17-observability--logging)
18. [Data Model Considerations](#18-data-model-considerations)
19. [Frontend Integration Plan](#19-frontend-integration-plan)
20. [Types & Interfaces](#20-types--interfaces)
21. [Testing Plan](#21-testing-plan)
22. [End-of-Day Checklist](#22-end-of-day-checklist)
23. [Risks & Edge Cases](#23-risks--edge-cases)

---

## 1. Day Overview & Goals

### What Gets Built Today

Day 60 built the entire Slack OAuth connection flow, the Block Kit
message-building infrastructure, and the raw `sendChannelMessage`/
`sendDirectMessage` primitives inside `slack.provider.ts` — but wired only
**one** notification type (`MEETING_PROCESSED`) into `notify.worker.ts`'s
Slack branch, deliberately scoped that way as a proof that the OAuth
plumbing worked end-to-end. Day 67 is where a team's Slack connection stops
being merely "connected" and starts being genuinely **useful**: every
remaining notification type the platform defines that has a Slack-relevant
channel — commitment-missed alerts (to both the owner and every manager),
deadline reminders, and a brand-new celebratory fulfilled-commitment
message — now dispatches a real, correctly-formatted, correctly-targeted
Slack message.

```
TODAY BUILDS:
  ✅ slack-notify.service.ts — the message-builder + orchestration layer,
     housing one pure Block Kit builder function per notification type
  ✅ notify.worker.ts's Slack branch extended to cover COMMITMENT_MISSED,
     DEADLINE_REMINDER, and the new COMMITMENT_FULFILLED type
  ✅ Manager fan-out logic — resolving every MANAGER+ role holder on a
     team and sending each an independently preference-checked DM
  ✅ Sequential, rate-limit-respecting dispatch for multi-recipient events
  ✅ A new COMMITMENT_FULFILLED notification type — the platform's first
     positive/celebratory (not alert-only) Slack message
  ✅ Full regression coverage proving cross-channel failure isolation holds
     for every new message type, not merely the one type proven Day 60

DOWNSTREAM IMPACT:
  Day 68 — Email notifications will complete the exact same notification
           roster on the email channel; today's recipient-resolution and
           preference-check logic in notifications.service.ts is
           confirmed to be the SAME shared logic Day 68 reuses for email,
           not a Slack-specific duplicate
  Day 70 — The Weekly Digest's optional Slack channel-post component
           reuses today's sendChannelMessage() dispatch path unchanged,
           rather than requiring a separate Slack-digest code path

DO NOT SKIP OR RUSH:
  The manager fan-out logic (Section 7) is the day's highest-risk area —
  it is tempting to treat "notify all managers" as a simple loop, but
  getting the per-recipient preference check, the sequential rate-limiting
  discipline, and the individual-failure isolation ALL correct
  simultaneously, for every manager independently, is exactly the kind of
  multi-recipient fan-out logic that silently breaks in production under
  real team sizes if not built and tested with real rigor today.
```

### 8-Hour Time Allocation

```
9:00 AM – 9:45 AM    → slack-notify.service.ts scaffolding + the four new
                        pure Block Kit builder functions (commitment missed,
                        manager alert, deadline reminder, commitment fulfilled)
9:45 AM – 10:30 AM   → Recipient resolution logic — team-membership query
                        for MANAGER+ role holders, integrated with existing
                        notification_preferences lookups
10:30 AM – 11:15 AM  → Manager fan-out orchestration — sequential dispatch
                        with inter-message delay, per-recipient preference
                        gating
11:15 AM – 12:00 PM  → notify.worker.ts — wiring COMMITMENT_MISSED and
                        DEADLINE_REMINDER cases into the Slack branch
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 1:45 PM    → COMMITMENT_FULFILLED — new NotificationType wiring,
                        celebratory message builder, dispatch integration
1:45 PM – 2:30 PM    → Cross-channel failure isolation verification pass —
                        confirm every new branch independently try/catches
                        without affecting the email branch (Day 68 will
                        build in parallel against this same guarantee)
2:30 PM – 3:15 PM    → Idempotency/dedup key wiring for each new
                        notification type, reusing the existing
                        notif:dedup:* Redis convention
3:15 PM – 4:00 PM    → Unit tests: all four Block Kit builder functions,
                        fully isolated from any HTTP mocking
4:00 PM – 5:00 PM    → Integration tests: manager fan-out with mixed
                        preferences, sequential-delay timing verification,
                        failure-isolation regression suite
5:00 PM – 5:45 PM    → Manual smoke test against a real sandbox Slack
                        workspace: force each notification type and confirm
                        correct delivery, formatting, and recipient targeting
5:45 PM – 6:00 PM    → Checklist review + sign-off
```

---

## 2. Why This Is the Human-Facing Payoff of Day 60

### The Gap Between "Connected" and "Useful"

Day 60 delivered a fully-functional OAuth connection — a team can
authorize Vocaply's Slack bot, select a default channel, and the platform
correctly persists an encrypted, non-expiring bot token. But a team that
connected Slack on Day 60 and has used the product since would have
observed **exactly one** kind of message: a meeting summary posted to
their channel. Every other moment where Slack could have been useful —
the instant a commitment is missed, the day before a deadline, the moment
someone fulfills a promise — has, until today, been silent on Slack even
though the underlying `sendDirectMessage()`/`sendChannelMessage()`
primitives have existed since Day 60. This is the gap today closes: not a
new integration, not new OAuth surface, but the actual notification
**content** that makes a connected Slack workspace feel like a genuinely
present accountability partner rather than a one-off announcement channel.

### Why Message-Type Completion, Not New Infrastructure, Is Today's Entire Scope

Every piece of infrastructure today's work depends on already exists:
Block Kit message construction conventions (Day 60), the bot-token
decryption and API-call wrapper (Day 60), the notification-preferences
data model (established in the original DB schema), and the dedup-key
Redis convention (established Day 18, reused for every notification type
since). Today's actual new work is entirely at the **content and
orchestration** layer — deciding what each message says, who receives it,
and in what order — never at the transport layer.

---

## 3. File Structure to Create

```
services/api/src/
│
├── modules/notifications/
│   ├── slack-notify.service.ts               ← NEW — Block Kit message
│   │                                              builders + manager
│   │                                              fan-out orchestration
│   ├── notifications.service.ts                ← MODIFY — recipient
│   │                                                resolution logic
│   │                                                confirmed shared
│   │                                                between Slack and
│   │                                                (Day 68) email branches
│   └── notifications.types.ts                   ← MODIFY —
│                                                     COMMITMENT_FULFILLED
│                                                     added to
│                                                     NotificationType
│
├── queues/workers/
│   └── notify.worker.ts                          ← MODIFY — Slack branch
│                                                        extended for
│                                                        COMMITMENT_MISSED,
│                                                        DEADLINE_REMINDER,
│                                                        COMMITMENT_FULFILLED
│
└── config/
    └── notification-dedup.config.ts               ← MODIFY — TTL constants
                                                          for the new
                                                          COMMITMENT_FULFILLED
                                                          dedup namespace

services/api/tests/
├── unit/
│   ├── slack-block-builders.test.ts               ← NEW — pure-function
│   │                                                    tests, zero HTTP
│   │                                                    mocking required
│   └── manager-fanout-resolution.test.ts            ← NEW
└── integration/
    ├── slack-notifications.test.ts                  ← NEW — full dispatch
    │                                                      flow, mocked
    │                                                      Slack Web API
    └── cross-channel-isolation.test.ts               ← NEW — confirms
                                                             Slack failures
                                                             never affect
                                                             email dispatch
                                                             (and vice versa)
```

### Dependency Flow (No Circular Deps)

```
notify.worker.ts
  └── notifications.service.ts
        ├── recipient resolution (team membership + notification_preferences)
        └── slack-notify.service.ts
              ├── buildCommitmentMissedBlocks()      (pure)
              ├── buildManagerAlertBlocks()           (pure)
              ├── buildDeadlineReminderBlocks()       (pure)
              ├── buildCommitmentFulfilledBlocks()    (pure)
              └── (calls, unchanged) slack.provider.ts
                    ├── sendChannelMessage()           (Day 60)
                    └── sendDirectMessage()             (Day 60)
```

---

## 4. Layer 1 — Message Builder Design (Pure Functions)

### File: `slack-notify.service.ts` (message-builder portion)

**Responsibility:** Four new functions, each taking plain domain data and
returning a Block Kit JSON array — no HTTP calls, no database access, no
side effects of any kind. This continues the exact discipline already
established Day 60 for `buildMeetingSummaryBlocks()`, and reaffirms the
platform's Day 18 coding-standards preference for pure, independently
unit-testable functions wherever business logic doesn't require I/O.

### `buildCommitmentMissedBlocks(input)`

Takes the commitment's text, the owner's display name, the original
due-date-raw text (e.g., "by Thursday" — the human-readable form already
stored on the `Commitment` row, per the Day 3 schema, rather than a raw
ISO timestamp), and a direct link to the commitment's detail page.
Produces a Block Kit layout distinct in tone from the manager-alert
variant (Section below) — this message is addressed to the **owner
themself**, framed as a factual, non-punitive reminder that the deadline
has passed, with a clear call-to-action button linking to the commitment
so the owner can immediately mark it fulfilled or defer it if it's
actually done but not yet updated in Vocaply.

### `buildManagerAlertBlocks(input)`

Takes the same underlying commitment data plus the owner's name and
current commitment score, but is framed for a **third-party observer**
(a manager) rather than the person who missed the commitment — informing,
not shaming, with a link to that member's profile page rather than the
commitment itself, since a manager's next action is more likely "check in
with this person" than "edit this specific commitment."

### `buildDeadlineReminderBlocks(input)`

The lowest-urgency of the four builders — a gentle, forward-looking
reminder that a commitment is due soon (today or tomorrow, per the
existing `reminder_hours_before` team setting), including the same
due-date-raw text and a direct link, deliberately worded to read as
helpful rather than nagging, consistent with the product's overall
accountability-partner tone rather than a surveillance tone.

### `buildCommitmentFulfilledBlocks(input)`

New today (Section 9) — the platform's first genuinely celebratory Block
Kit message, using a distinct visual treatment (an emoji/checkmark
header, positive framing: "Nice work — you kept your promise") rather than
reusing the neutral or cautionary tone of every other builder. This is a
deliberate product decision: accountability tooling that only ever
delivers bad news trains users to dread notifications; celebrating
follow-through is an equally important signal to reinforce the desired
behavior.

### Why Each Builder Is Independently Testable Without Any Mocked HTTP Layer

Because every function in this layer takes only plain data and returns
only a plain JSON structure, `slack-block-builders.test.ts` (Section 21)
can assert on exact Block Kit output shape with zero setup beyond
constructing input fixtures — no `nock`/MSW interception, no database
seeding, no queue harness. This is the same testing-cost benefit already
realized for Day 60's `buildMeetingSummaryBlocks()` and is treated today
as a non-negotiable design constraint for all four new builders, not an
incidental nice-to-have.

---

## 5. Layer 2 — `slack-notify.service.ts` Orchestration

### Responsibilities Beyond the Pure Builders

Alongside the four builder functions (Section 4), this file houses the
**manager fan-out orchestration** (Section 7) — the one piece of today's
Slack work that is not a pure function, since it genuinely needs to
resolve team membership, check preferences, and make sequential outbound
calls. This orchestration logic is kept in its own dedicated file
(`slack-notify.service.ts`), separate from `notify.worker.ts` itself,
consistent with the platform's established pattern of keeping workers thin
and delegating actual business logic to services (the same
controller-thin/service-heavy discipline applied throughout the backend
since the earliest modules).

### Why This File, and Not `slack.provider.ts`, Owns Message Content

`slack.provider.ts` (Day 60) is deliberately kept as a thin,
provider-shaped transport wrapper — OAuth, token management, and the raw
`sendChannelMessage`/`sendDirectMessage` primitives, with **zero
knowledge of Vocaply's notification types or domain content**. Message
content and orchestration belong in `slack-notify.service.ts` instead,
mirroring the exact separation already established between `notify.worker.ts`
(orchestration) and `email.service.ts` (transport) for the email channel —
a provider/transport file should never need to change when a new
notification *type* is added, only when the underlying third-party API
itself changes.

---

## 6. Layer 3 — `notify.worker.ts` Branch Completion

### The Three New Cases Added Today

`notify.worker.ts`'s existing `switch`/case structure (established Day 18,
partially filled in for `MEETING_PROCESSED` on Day 60) gains three new
cases: `COMMITMENT_MISSED`, `DEADLINE_REMINDER`, and `COMMITMENT_FULFILLED`.
Each case follows the identical structural pattern already used for
`MEETING_PROCESSED`:

1. Load the relevant domain data (commitment, owner, team's Slack
   integration) via existing repository calls — no new repository methods
   are required today, since every piece of data these messages need
   (commitment text, due date, owner name, team integration row) is
   already fetched by existing queries built across Days 14, 16, and 60.
2. Check whether the team's Slack integration is active and has a default
   channel/DM capability configured.
3. For single-recipient types (`COMMITMENT_MISSED`'s owner-facing
   message, `DEADLINE_REMINDER`, `COMMITMENT_FULFILLED`): check that
   specific recipient's preference, build the blocks, send the DM.
4. For the manager-facing portion of `COMMITMENT_MISSED`: delegate to the
   fan-out orchestration (Section 7) rather than looping inline inside
   the worker itself — keeping the worker's own code short and readable,
   with the actual fan-out complexity isolated in its own testable
   function.

### Why `COMMITMENT_MISSED` Produces Two Independent Dispatch Paths, Not One

A single `COMMITMENT_MISSED` event must reach **two structurally
different** audiences with **two different message framings** — the
owner (a reminder) and every manager (an alert about someone else). These
are treated as two separate, independently-guarded dispatch attempts
within the same `case` block, each with its own try/catch, so a failure
sending to the owner (e.g., their Slack account was deactivated) can never
prevent the manager alerts from going out, and vice versa.

---

## 7. Layer 4 — Manager Alert Fan-Out Logic

### The Core Fan-Out Function: `sendManagerAlerts(commitment, teamId)`

Lives in `slack-notify.service.ts`. Logic:

1. Query the team's membership for every user holding `MANAGER`, `ADMIN`,
   or `OWNER` role — reusing the exact team-membership query pattern
   already established for role-based access checks throughout the
   platform (Day 16's teams module), not a new bespoke query.
2. For each resolved manager, independently check their own
   `notification_preferences.slack.commitmentMissed` value — a manager
   who has explicitly disabled this specific preference is skipped
   entirely, with no message attempted and no error logged (a disabled
   preference is an expected, healthy state, not a failure condition).
3. For each manager who passes the preference check, build the
   manager-framed blocks (`buildManagerAlertBlocks()`) and dispatch a DM —
   sequentially, with the documented inter-message delay (Section 10),
   never in parallel.
4. Each individual send is wrapped in its own try/catch — a failure
   sending to manager A (e.g., their Slack user ID no longer resolves,
   because they left the Slack workspace without being removed from the
   Vocaply team) is logged and skipped, and the loop continues to manager
   B, C, and so on, rather than aborting the whole fan-out on the first
   failure.

### Why Independent, Per-Recipient Preference Checks — Not a Single Team-Level Toggle

A cruder design might check a single team-level "send manager alerts to
Slack" toggle once and then blast every manager identically. This was
rejected: individual notification preferences are a per-user concept
throughout this platform (established in the original DB schema's
`notification_preferences` JSONB, scoped to `userId`, not `teamId`), and a
manager who personally finds Slack DMs noisy but is happy to see the same
information in their weekly digest email should be able to opt out of
this specific channel without affecting any other manager's preferences
or requiring an admin-level settings change.

---

## 8. Layer 5 — Recipient Resolution & Preference Checking

### Why This Logic Is Shared Infrastructure, Not Slack-Specific

The team-membership-by-role query and the `notification_preferences`
lookup are **not** duplicated inside `slack-notify.service.ts` — they are
confirmed today to live in (or be added to, if not already present in a
suitably generic form) `notifications.service.ts`, the platform's central
notification-dispatch orchestration file, precisely because Day 68's email
notification work needs the **identical** recipient-resolution and
preference-check logic for the email channel. Building this once, today,
in a channel-agnostic shape (accepting a notification type and a
commitment/team context, returning a list of `{ userId, shouldSendSlack,
shouldSendEmail }` tuples, or an equivalent structure) prevents Day 68 from
either duplicating this logic or — worse — building a second,
subtly-different version of "who should be notified and how."

### Preference Precedence Rules (Confirmed, Not Newly Invented)

Reuses the exact precedence hierarchy already documented in the platform's
notification architecture: an explicit user opt-out always wins;
team-admin-level toggles (where they exist) can disable a notification
type team-wide; plan restrictions (e.g., FREE-tier teams receiving in-app
notifications only, no email/Slack) take precedence over any individual
preference. Today's work applies this existing hierarchy to the four new
notification types, rather than inventing a new precedence model specific
to Slack.

---

## 9. The New `COMMITMENT_FULFILLED` Notification Type

### Why This Type Is Introduced Today, Not Merely Wired

Every other notification type completed today already existed in the
platform's `NotificationType` Postgres enum (per the Day 3 schema) —
today's work for those three types is pure wiring. `COMMITMENT_FULFILLED`
is different: it is a **new** enum value and a genuinely new product
behavior, deliberately scoped into today's work because it belongs to the
identical class of "single-event, commitment-status-driven notification"
as the other three, and because introducing it as part of this same
notification-completion pass avoids a future day needing to re-open
`notify.worker.ts`'s Slack branch for what is, in the end, a very small
addition once the surrounding infrastructure already exists.

### Trigger Point

Fired from `commitments.service.ts`'s existing `updateStatus()` function
(Day 19/20's commitments module) at the exact moment a commitment
transitions to `FULFILLED` — whether by manual owner action or by the
AI-detected cross-meeting resolution path (Day 46–54's pipeline,
`commitment-resolver.service.ts`). This reuses the identical trigger point
already responsible for the existing `COMMITMENT_FULFILLED` **email**
template referenced in the platform's broader notification roster (Day
19's `notify.worker.ts` design already lists this as a planned type) —
today's work is what actually wires the Slack side of a notification type
whose trigger point and (partial) intent already existed in the platform's
design.

### Deduplication

A new dedup key, `notif:dedup:COMMITMENT_FULFILLED:{userId}:{commitmentId}`,
with a 1-hour TTL — shorter than the 24-hour window used for
`COMMITMENT_MISSED` (a commitment transitions to `FULFILLED` at most once
per its lifecycle under normal operation, so an hour is ample protection
against a duplicate-delivery retry without needing the same long window a
recurring daily check like deadline reminders requires).

### Enum & Migration

`COMMITMENT_FULFILLED` is added to the `notification_type` Postgres enum
via a standard `ALTER TYPE ... ADD VALUE` migration — a lightweight,
well-understood Postgres operation, distinct from the heavier table-schema
migrations elsewhere in this platform, requiring no data backfill since
the value is purely additive and no historical row needs to claim it
retroactively.

---

## 10. Rate Limiting & Sequential Dispatch Design

### Slack's Documented Constraint, Restated

Slack's Web API `chat.postMessage` method (Tier 2) permits roughly one
request per second per channel — a constraint the platform's HLD has
documented since the original Slack integration design (Day 60) but had
not, until today, needed to actually enforce in practice, since Day 60's
single-recipient `MEETING_PROCESSED` channel post never triggered a
multi-message burst.

### Today's Enforcement Mechanism

The manager fan-out loop (Section 7) issues each DM **sequentially**,
awaiting each `sendDirectMessage()` call's completion before proceeding to
the next, with a small explicit delay (approximately 1.1 seconds,
matching the exact margin already specified in the HLD) inserted between
sends. This is a simple, deliberately unsophisticated mechanism — no token
bucket, no adaptive backoff — because the actual volume involved (the
number of managers on a single team, realistically bounded by the
platform's own plan-tier member limits, e.g., 25 members on GROWTH) is
small enough that a fixed sequential delay comfortably stays under Slack's
documented limit without needing more complex rate-limiting machinery.

### Why Not Parallel Dispatch With a Semaphore

A parallel-with-concurrency-limit approach was considered and rejected as
unnecessary complexity for today's actual volume: even at the largest
plan tier's member cap, a sequential loop with a ~1.1s delay per message
completes in well under a minute for the realistic maximum number of
managers on any single team — a latency profile acceptable for an
asynchronous background notification job (which the `notify` queue
already is, per Day 18's async-engine design), where the recipient
experience is "I got the Slack DM within a minute or two of the event,"
not "I got it within milliseconds."

---

## 11. Cross-Channel Failure Isolation

### The Principle, Restated From Day 60/64

A failure sending any Slack message — whether the team's integration is
disconnected, a specific recipient's Slack user ID no longer resolves, or
Slack's API returns a transient error — must **never** block, delay, or
revert the corresponding email dispatch for the same event, and must never
fail the entire `notify` job. This principle was established Day 60 for
the single `MEETING_PROCESSED` case and reinforced architecturally Day 64
(where the equivalent principle was applied to health-check emails, not
Slack specifically) — today's work is the day this principle is verified
to hold across **every** message type in the notification roster, not just
the one type it was originally proven against.

### How Today's Implementation Guarantees This

Every dispatch attempt — the owner-facing `COMMITMENT_MISSED` DM, each
individual manager's alert DM, the `DEADLINE_REMINDER` DM, the
`COMMITMENT_FULFILLED` DM — is wrapped in its own independent try/catch at
the point of the actual `sendDirectMessage()`/`sendChannelMessage()` call,
logging and continuing rather than propagating the failure upward into
`notify.worker.ts`'s own job-level error handling. This granular,
per-message isolation (rather than a single try/catch wrapping an entire
notification type's Slack-branch logic) is what specifically prevents one
manager's unreachable Slack account from silently swallowing every
subsequent manager's alert in the same fan-out loop.

### Verification: `cross-channel-isolation.test.ts`

Explicitly asserts, for each of today's four notification types, that a
forced Slack-send failure results in the corresponding email dispatch
still succeeding (using Day 68's — or, where not yet built, a stubbed
equivalent of the — email branch), and that the overall `notify` job
completes successfully despite the partial Slack failure, rather than
being marked failed and retried by BullMQ (which would otherwise risk
re-sending the emails that already succeeded, a duplicate-notification risk
the platform's job-level idempotency keys, not job-level retries, are
meant to guard against).

---

## 12. Idempotency & Deduplication

### Reused, Not Reinvented

Every new notification type dispatched today uses the platform's existing
`notif:dedup:{TYPE}:{userId}:{resourceId}` Redis key convention
(established Day 18, already used for `COMMITMENT_MISSED` and
`DEADLINE_REMINDER`'s email-side dispatch since Day 19) — today's Slack
dispatch checks and sets the **same** dedup key an eventual email dispatch
for the same event would check, ensuring that if both channels are enabled
for a given recipient, each channel independently and correctly determines
whether it has already sent, without the two channels needing to
coordinate with each other beyond sharing the same underlying commitment/
event identifier in their respective key compositions.

### Manager Fan-Out Dedup Granularity

Because the manager alert is logically one event (a commitment was missed)
fanned out to N recipients, each manager's dedup key is scoped
individually — `notif:dedup:COMMITMENT_MISSED:{managerId}:{commitmentId}` —
ensuring a retry of the fan-out (e.g., if the overall `notify` job is
retried due to an unrelated failure in a different branch) does not
re-send to managers who already successfully received their alert on a
prior attempt, while still correctly attempting delivery to any manager
whose individual send had failed and not yet been recorded as sent.

---

## 13. Security Architecture

### No New OAuth or Credential Surface

Today's work introduces zero new token handling — the bot token decrypted
and used by `sendDirectMessage()`/`sendChannelMessage()` is the exact same
credential established and encrypted Day 60, with no new decryption call
sites beyond what those two existing primitives already perform.

### Recipient Resolution Must Never Leak Cross-Tenant Data

The manager-role query (Section 7) is strictly scoped to the specific
`teamId` of the commitment that triggered the notification — reusing the
platform's existing tenant-isolation query discipline (application-layer
`WHERE teamId = ?`, Prisma middleware, RLS) rather than any broader
"find managers" query that could theoretically span teams if written
carelessly, exactly the same tenant-isolation concern already called out
explicitly in Day 64's recipient-resolution design for its own alert
emails.

### Message Content Must Never Leak Sensitive Data

Block Kit messages built today include only commitment text, member
display names, and due-date information — never raw internal identifiers,
never another team's data, and never anything from the
`notification_preferences` or `TeamIntegration` rows themselves (the bot
token, in particular, is never referenced in any message content, only
used internally by the transport layer to authenticate the send call).

---

## 14. Performance Architecture

### Why Today's Work Adds Negligible Load to the `notify` Queue

Every new Slack dispatch is triggered by an event that already enqueues a
`notify` job today (commitment missed, deadline approaching, commitment
fulfilled) — today's work does not introduce any new job-enqueueing
trigger point, only extends what happens **inside** an already-existing
job's processing. The `notify` queue's existing concurrency setting (5,
per Day 18) is unchanged and untouched by today's work.

### Sequential Manager Fan-Out's Bounded Cost

As established in Section 10, the sequential-with-delay design for
manager fan-out has a bounded worst-case latency (proportional to the
plan tier's member cap, not to overall platform scale), meaning a single
team's large manager fan-out never meaningfully starves the `notify`
queue's capacity for other teams' concurrently-processing jobs — each
team's fan-out is fully contained within its own job's execution time, not
a shared bottleneck across the queue.

---

## 15. Caching Strategy

```
No new Redis caching is introduced today beyond the existing
notif:dedup:* key namespace extended to cover the new
COMMITMENT_FULFILLED type (Section 9) and the per-manager dedup
granularity already described (Section 12).

Recipient resolution (team membership by role) is NOT cached today —
team membership and role assignments change infrequently but are cheap,
indexed queries (reusing the existing idx_users_team_role composite index
from the Day 3 schema), and caching a list this small and this
infrequently re-queried (once per notify job, not once per request) would
add complexity without a meaningful performance benefit.
```

---

## 16. Error Handling & Retry Strategy

### Per-Message Failure Classification

```
CONDITION                                    HANDLING
──────────────────────────────────────────────────────────────────────────
Team's Slack integration inactive/disconnected  Entire Slack branch for this
                                                notification skipped,
                                                logged as info (not error) —
                                                an expected state, not a failure
Specific recipient's Slack user lookup fails    That individual send is
  (e.g., left the workspace)                    skipped, logged as a
                                                warning, fan-out continues
                                                to remaining recipients
Slack API returns 429 (rate limited)            Individual send retried
                                                once with the Retry-After
                                                delay honored (reusing the
                                                existing retry-wrapper
                                                pattern from Day 60's
                                                provider implementation);
                                                if still failing, logged and
                                                skipped rather than
                                                blocking the whole job
Slack API returns 5xx                            Same as above — bounded
                                                single retry, then
                                                graceful skip
```

### Why No Aggressive Job-Level Retry Is Configured for Notification Sends

Consistent with the platform's existing `notify` queue retry philosophy
(Day 18/19): notification delivery is best-effort and time-sensitive — a
missed-commitment alert delivered three hours late after several retries
is less valuable than one delivered promptly with a documented, logged
gap for the rare failure case. Today's per-message try/catch design,
combined with the existing dedup-key mechanism, ensures that even without
aggressive retries, a transient failure never produces either a
duplicate-message risk (on eventual success) or a silently-lost
notification (failures are always logged, feeding the same observability
practices as every other notification type).

---

## 17. Observability & Logging

### Structured Log Fields

Every dispatch attempt today logs, at minimum: the notification type, the
team ID, the specific recipient's user ID, and the outcome (sent, skipped
due to preference, skipped due to unresolvable recipient, or failed) —
consistent with the platform's Day 18 structured-logging standard applied
uniformly across every notification channel and type.

### New Metrics

`notify.slack.commitment_missed.sent` / `.skipped` / `.failed`,
`notify.slack.manager_alert.sent` / `.skipped` / `.failed` (the manager
fan-out's own counters, distinct from the owner-facing message's counters,
since these represent genuinely different audiences and dispatch paths),
`notify.slack.deadline_reminder.*`, `notify.slack.commitment_fulfilled.*` —
feeding the same Grafana dashboard already tracking
`notify.slack.meeting_processed.*` from Day 60, giving a complete,
per-type breakdown of Slack notification health.

---

## 18. Data Model Considerations

### Only One Genuine Schema Change: The `COMMITMENT_FULFILLED` Enum Value

As detailed in Section 9, the sole schema-level change today is the
addition of `COMMITMENT_FULFILLED` to the existing `notification_type`
Postgres enum — a lightweight, additive `ALTER TYPE` migration. No new
tables, no new columns on any existing table, and no changes to the
`notification_preferences` JSONB shape (the existing
`slack.commitmentMissed`, `slack.deadlineReminder` keys already cover the
preference-checking needs of today's completed types, and
`slack.commitmentFulfilled` — a new preference key within that same JSONB
structure, not a schema change — is added by convention alongside the new
notification type, defaulting to `true` since celebratory notifications
are a low-risk-of-annoyance default).

---

## 19. Frontend Integration Plan

### No New Frontend Components Required Today

Today's work is entirely backend-notification-delivery focused — the
existing `NotificationSection.tsx`/`NotificationToggle.tsx` components
(Day 24's Notifications API frontend structure) already generically render
whatever keys exist under a user's `notification_preferences.slack` object,
meaning the new `commitmentFulfilled` preference key (Section 18)
automatically appears as a togglable option in the existing settings UI
with zero new frontend code, confirming that component's original design
was correctly built to be extensible without modification — a genuine
payoff of that earlier day's generic design choice.

### Test Notification Button — Confirmed to Cover New Types

The existing `POST /notifications/test` endpoint and its corresponding
`TestNotificationButton.tsx` (Day 24) are confirmed today to correctly
exercise at least one of the newly-wired Slack message types (most
naturally `COMMITMENT_FULFILLED`, since it requires no real overdue
commitment to exist, unlike `COMMITMENT_MISSED`/`DEADLINE_REMINDER` which
are more naturally tied to real data) — allowing a user who has just
connected Slack to immediately verify their setup works correctly without
needing to wait for a real commitment event to occur.

---

## 20. Types & Interfaces

### File: `notifications.types.ts` (modified)

- **`NotificationType`** (extended) — `COMMITMENT_FULFILLED` added as a new enum member, matching the new Postgres enum value.
- **`CommitmentMissedBlockInput`**, **`ManagerAlertBlockInput`**, **`DeadlineReminderBlockInput`**, **`CommitmentFulfilledBlockInput`** — one plain input type per builder function, each containing only the domain fields that specific message needs (never the full `Commitment` or `User` Prisma model passed through wholesale, keeping each builder's contract explicit and minimal).

### File: `slack-notify.service.ts` (types)

- **`ManagerFanOutResult`** — `{ sent: number; skipped: number; failed: number }`, the summary returned by `sendManagerAlerts()`, used purely for the calling worker's own structured logging, not for any control-flow decision.

No changes are required to `IntegrationProvider`, `slack.provider.ts`'s
existing method signatures, or any other provider-layer type — today's
entire type-level contribution sits strictly above the transport layer,
confirming once more that message content and orchestration are correctly
separated from provider mechanics.

---

## 21. Testing Plan

### Unit Tests

#### `slack-block-builders.test.ts`

- Each of the four builder functions produces the exact expected Block
  Kit JSON structure for a representative input fixture — no HTTP mocking
  required, per Section 4's design constraint.
- `buildCommitmentFulfilledBlocks()` specifically asserts on the
  celebratory tone/emoji elements present, distinguishing it structurally
  from the neutral/cautionary builders.
- Each builder correctly handles a `null`/missing optional field (e.g., a
  commitment with no `dueDateRaw` set) without throwing, producing a
  sensible fallback message segment instead.

#### `manager-fanout-resolution.test.ts`

- Correctly resolves every `MANAGER`/`ADMIN`/`OWNER` role holder for a
  given team, excluding `MEMBER`-role users.
- Correctly excludes a manager who has disabled
  `slack.commitmentMissed` in their own preferences, while still including
  other managers who have not.
- Correctly scopes to the triggering commitment's specific team, verified
  via a fixture including a second, unrelated team's managers who must
  never appear in the resolved list.

### Integration Tests

#### `slack-notifications.test.ts`

- A seeded `COMMITMENT_MISSED` event, with three managers of mixed
  preference states (two enabled, one disabled), results in exactly two
  manager DMs sent plus one owner-facing DM, all correctly formatted,
  using a mocked Slack Web API.
- Sequential dispatch timing is verified — the mocked HTTP layer's
  call-timestamp log confirms each manager DM is sent with the documented
  inter-message delay, never simultaneously.
- `DEADLINE_REMINDER` and `COMMITMENT_FULFILLED` each correctly dispatch a
  single DM to the appropriate recipient with the correct message content.
- Idempotency: a simulated duplicate `notify` job for the same commitment
  and notification type results in zero additional messages sent on the
  second attempt, verified via the dedup-key check.

#### `cross-channel-isolation.test.ts`

- A forced Slack API failure (mocked 500 response) for the
  `COMMITMENT_MISSED` owner DM does not prevent a stubbed/real email
  dispatch for the same event from completing successfully.
- A forced failure for one manager's DM within the fan-out loop does not
  prevent the remaining managers' DMs from being attempted and succeeding.
- The overall `notify` job completes (is not marked failed by BullMQ)
  despite a partial Slack-channel failure, confirmed via the job's
  recorded outcome status.

### Manual Smoke Test (Required Before Sign-Off)

A hand-performed round trip against a real sandbox Slack workspace: force
each of the four notification types (via direct service-function calls or
the existing test-notification endpoint where applicable) and visually
confirm correct message formatting, correct recipient targeting (DM vs.
channel), and correct tone differentiation between the celebratory
`COMMITMENT_FULFILLED` message and the neutral/cautionary others.

---

## 22. End-of-Day Checklist

### Message Builders

- [ ] All four new Block Kit builder functions are pure, side-effect-free,
      and independently unit-tested with zero HTTP mocking
- [ ] `buildCommitmentFulfilledBlocks()` produces a visually distinct,
      celebratory-toned message compared to the other three builders

### Manager Fan-Out

- [ ] Correctly resolves `MANAGER`/`ADMIN`/`OWNER` role holders, excluding
      `MEMBER`s, strictly scoped to the triggering commitment's team
- [ ] Correctly applies per-manager, independent preference checks
- [ ] Dispatches sequentially with the documented ~1.1s inter-message
      delay, never in parallel
- [ ] A single manager's send failure never blocks or skips subsequent
      managers in the same fan-out

### Notification Type Completion

- [ ] `COMMITMENT_MISSED`, `DEADLINE_REMINDER`, and `COMMITMENT_FULFILLED`
      all correctly dispatch via Slack, matching the platform's existing
      per-type dedup-key convention
- [ ] `COMMITMENT_FULFILLED` Postgres enum value and corresponding
      `notification_preferences.slack.commitmentFulfilled` key are added
      and default to sensible, low-friction values

### Cross-Channel Isolation

- [ ] A Slack failure for any of the four types never blocks, delays, or
      reverts the corresponding email dispatch (verified against Day 68's
      email work or a stub, depending on sequencing)
- [ ] The overall `notify` job completes successfully despite any partial
      Slack-channel failure

### Recipient Resolution & Preferences

- [ ] Recipient-resolution and preference-check logic lives in
      `notifications.service.ts`, confirmed shared (not duplicated) for
      Day 68's upcoming email-channel work
- [ ] Preference precedence (opt-out > team toggle > plan restriction)
      applied identically to every new notification type

### Security

- [ ] No new OAuth/token-handling code introduced; existing Day 60
      encrypted bot token reused unchanged
- [ ] Manager-role resolution strictly tenant-scoped, verified via a
      cross-team leakage test
- [ ] No sensitive internal identifiers or credentials ever appear in
      message content

### Observability

- [ ] Per-type, per-outcome (sent/skipped/failed) metrics visible on the
      existing Grafana dashboard, extending Day 60's `meeting_processed`
      counters
- [ ] Structured logs present for every dispatch attempt across all four
      notification types

### Sign-Off

- [ ] All unit and integration tests pass in CI with zero real network
      calls to `slack.com`
- [ ] Manual E2E performed against a real sandbox Slack workspace: all
      four notification types verified for correct content, formatting,
      and recipient targeting

---

## 23. Risks & Edge Cases

```
RISK                                              MITIGATION BUILT TODAY
──────────────────────────────────────────────────────────────────────────
Manager fan-out sent in parallel, tripping
  Slack's per-channel/per-recipient rate limit       Deliberate sequential
                                                    dispatch with a fixed
                                                    inter-message delay,
                                                    verified via a timing
                                                    assertion in tests

A single manager's unreachable Slack account
  silently swallows every subsequent manager's
  alert in the same fan-out loop                     Per-recipient,
                                                    independent try/catch
                                                    inside the fan-out loop,
                                                    explicitly tested

Recipient-resolution logic duplicated between
  Slack (today) and email (Day 68), silently
  diverging over time                                Shared, channel-agnostic
                                                    resolution logic housed
                                                    in notifications.service.ts,
                                                    used by both channels

A celebratory COMMITMENT_FULFILLED message reads
  as tone-deaf or inconsistent with the rest of
  the notification roster                            Deliberate, explicit
                                                    tone differentiation
                                                    designed and reviewed as
                                                    its own concern (Section 4),
                                                    not an afterthought bolted
                                                    onto the neutral-alert
                                                    template

A forced Slack failure inadvertently marks the
  whole notify job as failed, risking a
  BullMQ-driven retry that re-sends already-
  successful email notifications for the same event  Per-message try/catch
                                                    ensures job-level success
                                                    despite partial channel
                                                    failure; dedup keys
                                                    additionally protect
                                                    against any retry that
                                                    does occur

New COMMITMENT_FULFILLED enum value migration
  applied inconsistently across environments          Standard, additive
                                                    ALTER TYPE ... ADD VALUE
                                                    migration, following the
                                                    platform's existing
                                                    zero-downtime migration
                                                    discipline
```

---

*Document: DAY-67-PLAN-001 | Vocaply | Day 67: Slack Notifications — Post-Meeting Summaries & Commitment Alerts*
*Full Scalable Industry-Level Build Plan | Principal Engineer Edition*
*Pure Block Kit builders · Sequential rate-limited fan-out · Cross-channel failure isolation*
*Security-first · Performance-optimized · Production-grade · Planning Document — No Code*
