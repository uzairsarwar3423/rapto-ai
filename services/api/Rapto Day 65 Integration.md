# Vocaply — Day 65: Integration Testing (End-to-End, All Providers)
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-65-PLAN-001 | Version 1.0 | Phase 5 — Integrations (Days 56–70)

> **Note on scope:** This document plans **Day 65 — Integration Testing**, the
> verification-and-hardening capstone that closes the Days 56–64 integration
> block. No new provider or feature ships today; the entire day is scoped to
> proving, via automated and manual testing, that everything built across
> Google Calendar (56), Dedup (57), Jira (58), Jira Webhook (59), Slack (60),
> Linear (61), Notion (62), Outlook Calendar (63), and Token Refresh &
> Alerting (64) composes correctly as one system.

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Why a Dedicated Testing Day, Not "Tests As You Go"](#2-why-a-dedicated-testing-day-not-tests-as-you-go)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Test Infrastructure & Mocking Strategy](#4-test-infrastructure--mocking-strategy)
5. [Fixture Design Philosophy](#5-fixture-design-philosophy)
6. [Layer 1 — Provider-Specific Test Suites](#6-layer-1--provider-specific-test-suites)
7. [Layer 2 — Token Refresh Test Suite](#7-layer-2--token-refresh-test-suite)
8. [Layer 3 — The Composite End-to-End Suite](#8-layer-3--the-composite-end-to-end-suite)
9. [Composite Scenario Deep Dive: Multi-Provider Action Item Sync](#9-composite-scenario-deep-dive-multi-provider-action-item-sync)
10. [Composite Scenario Deep Dive: Calendar Provider Switch](#10-composite-scenario-deep-dive-calendar-provider-switch)
11. [Composite Scenario Deep Dive: Token Refresh Mid-Sync Race](#11-composite-scenario-deep-dive-token-refresh-mid-sync-race)
12. [Composite Scenario Deep Dive: Cascading Failure Isolation](#12-composite-scenario-deep-dive-cascading-failure-isolation)
13. [Composite Scenario Deep Dive: Full Deactivation → Reconnect → Resume](#13-composite-scenario-deep-dive-full-deactivation--reconnect--resume)
14. [Load & Concurrency Sanity Checks](#14-load--concurrency-sanity-checks)
15. [Test Data Seeding & Database Isolation Strategy](#15-test-data-seeding--database-isolation-strategy)
16. [CI Pipeline Integration](#16-ci-pipeline-integration)
17. [Code Coverage Strategy](#17-code-coverage-strategy)
18. [Security Testing Considerations](#18-security-testing-considerations)
19. [Manual Smoke Testing Plan](#19-manual-smoke-testing-plan)
20. [Bug Triage & Fix Protocol for Today](#20-bug-triage--fix-protocol-for-today)
21. [Observability Verification](#21-observability-verification)
22. [Documentation Deliverables](#22-documentation-deliverables)
23. [Types & Test Utilities](#23-types--test-utilities)
24. [Exit Criteria — Full Specification](#24-exit-criteria--full-specification)
25. [End-of-Day Checklist](#25-end-of-day-checklist)
26. [Risks & Edge Cases](#26-risks--edge-cases)

---

## 1. Day Overview & Goals

### What Gets Built Today

Day 65 converts nine days of manually-verified, individually-tested
provider integration work (Days 56–64) into a **permanent, automated,
CI-enforced regression suite** — and, critically, adds a category of test
that no single provider day could have written on its own: tests that
exercise **interactions between** providers and shared infrastructure
under realistic, concurrent, and adversarial conditions. This is the day
Phase 5's foundational claim — "every provider is a drop-in
`IntegrationProvider`/`CalendarProvider` implementation with zero
orchestration-layer branching" — gets proven with executable evidence
rather than asserted in prose across nine separate planning documents.

```
TODAY BUILDS:
  ✅ Five automated integration test files (linear, notion, outlook-calendar,
     token-refresh, and the composite integrations-e2e suite)
  ✅ A shared mocked-HTTP-boundary test infrastructure (nock/MSW interceptors
     for api.linear.app, api.notion.com, graph.microsoft.com,
     login.microsoftonline.com, api.atlassian.com, slack.com,
     oauth2.googleapis.com — every third-party endpoint this platform calls)
  ✅ Reusable fixture files for Linear webhook-shaped payloads, Notion page
     responses, and Outlook Graph event responses
  ✅ Five composite, cross-provider E2E scenarios proving subsystem
     interactions specifically (not re-testing single-provider logic
     already covered by provider-specific suites)
  ✅ Two load/concurrency sanity checks validating the platform's queue and
     lock-isolation claims under simulated volume
  ✅ CI pipeline wiring so this entire suite runs on every PR touching the
     integrations module, gating merges the same way Day 25's backend
     testing milestone gates the rest of the platform
  ✅ A documented, hand-performed manual smoke test for the two genuinely
     new API shapes this sprint introduced (Linear's GraphQL, Outlook's
     Microsoft Graph), since automated mocks — however thorough — cannot
     fully validate a real provider's response quirks
  ✅ A formal exit-criteria sign-off, functioning as the release gate for
     the entire Days 56–65 integration block before Phase 5 continues into
     Days 66–70

DOWNSTREAM IMPACT:
  Day 66 (integrate.worker.ts hardening) — inherits a regression suite that
           will immediately flag any accidental behavioral change introduced
           while hardening the worker further
  Day 67 (Slack notifications)          — builds on a notify.worker.ts whose
           interaction with the health-alerting system (Day 64) is already
           verified not to conflict
  Phase 6/7 (Landing Page, Billing)      — begin building on top of an
           integration layer whose stability is now evidenced by an
           automated suite, not merely assumed because "it worked when we
           tested it manually that one time"

DO NOT SKIP OR RUSH:
  The five composite scenarios in Section 8 are explicitly the highest-value
  work product of this entire sprint block. Every provider-specific test
  file re-confirms logic already covered, in less rigorous form, by each
  provider's own Day 58/59/60/61/62/63 manual test plan. The composite
  suite is the ONLY place bugs arising from cross-subsystem interaction —
  the exact class of bug this sprint's architecture (shared registries,
  shared queues, shared health service) was specifically designed to make
  possible to introduce accidentally — can be caught before a real customer
  does.
```

### 8-Hour Time Allocation

```
9:00 AM – 9:45 AM    → Test infrastructure: HTTP-mock interceptor setup for
                        all seven third-party domains, shared test-database
                        seeding/teardown harness
9:45 AM – 10:15 AM   → Fixture files: Linear GraphQL responses, Notion page/
                        schema responses, Outlook Graph event/delta responses
10:15 AM – 11:15 AM  → linear-integration.test.ts + notion-integration.test.ts
                        (converting Day 61/62's manual test plans into
                        automated, mocked suites)
11:15 AM – 12:00 PM  → outlook-calendar.test.ts (with the timezone-combination
                        regression test carried over verbatim from Day 63)
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 1:45 PM    → token-refresh.test.ts (converting Day 64's unit-level
                        coverage into full integration-level coverage against
                        a seeded database and mocked notification dispatch)
1:45 PM – 3:15 PM    → integrations-e2e.test.ts — all 5 composite scenarios
                        (the day's centerpiece; allocated the largest single
                        block deliberately)
3:15 PM – 3:45 PM    → Load/concurrency sanity checks (calendar-sync fan-out,
                        integrate queue concurrency respect)
3:45 PM – 4:15 PM    → CI pipeline wiring, coverage threshold configuration
4:15 PM – 5:00 PM    → Bug-fix pass: triage and resolve any failures the new
                        suite surfaces in existing Day 56–64 code (see
                        Section 20 for the protocol governing this)
5:00 PM – 5:45 PM    → Manual smoke test: real sandbox Linear + Outlook
                        connect/sync/verify round trips
5:45 PM – 6:00 PM    → Exit-criteria sign-off, checklist review, block closure
```

---

## 2. Why a Dedicated Testing Day, Not "Tests As You Go"

### The Case Against Deferring All Testing to Individual Provider Days

Each provider day (56–63) already includes its own testing section and its
own end-of-day checklist requiring manual verification before that day's
work was considered complete — so it might seem redundant to dedicate an
entire additional day to testing afterward. The reason this is not
redundant is structural: **each individual provider day's tests could only
ever verify that provider in isolation.** Day 61's Linear test plan could
confirm Linear syncs correctly on its own; it could not — because Notion
and Outlook did not yet exist when Day 61 was written — verify that a
Linear sync and a simultaneous Notion sync for the same team don't
interfere with each other, or that the shared `integrate` queue's
concurrency setting genuinely isolates one provider's outage from another's,
or that the token-refresh cron built on Day 64 doesn't race against an
in-flight sync job's own reactive refresh attempt for the same integration.
These are **emergent** behaviors of the composed system, observable only
once every piece exists — which is precisely why they are scoped to today,
the first point in the sprint where all nine days' worth of subsystems are
simultaneously present and testable together.

### Why This Also Functions as a Regression Safety Net Going Forward

Beyond validating today's specific composed system, converting every prior
day's manual test plan into permanent, CI-enforced automated tests changes
the platform's posture from "this worked when manually verified on the day
it was built" to "this cannot silently break as unrelated future work
touches shared files." Given how much of this sprint's design deliberately
concentrates logic into a small number of shared files (`provider.registry.ts`,
`calendar-provider.registry.ts`, `integration-health.service.ts`,
`getValidAccessToken()`), a future change to any one of them has the
potential to silently affect every provider simultaneously — exactly the
scenario an automated regression suite exists to catch immediately, at PR
time, rather than being discovered by a customer weeks later.

### Why Composite Tests Specifically Require Real Concurrency, Not Just Sequential Assertions

Several of today's scenarios (Sections 11, 12, 14) are only meaningful if
they genuinely exercise concurrent execution — a test that merely calls two
functions sequentially and asserts on their individual outputs would not
catch a race condition, a shared-lock contention bug, or a queue-isolation
failure. Today's test design explicitly uses real (or realistically
simulated) concurrent job execution via BullMQ's own test-mode job
processing, rather than mocking away the concurrency itself, because the
entire point of these tests is to prove behavior that only manifests under
genuine simultaneous execution.

---

## 3. File Structure to Create

```
services/api/tests/
│
├── integration/
│   ├── linear-integration.test.ts               ← NEW
│   ├── notion-integration.test.ts                ← NEW
│   ├── outlook-calendar.test.ts                  ← NEW
│   ├── token-refresh.test.ts                     ← NEW
│   └── integrations-e2e.test.ts                  ← NEW — the composite suite
│
├── fixtures/
│   ├── linear-responses.fixture.ts               ← NEW — mocked GraphQL
│   │                                                 responses (viewer,
│   │                                                 issueCreate success/
│   │                                                 failure, teams+states,
│   │                                                 users search)
│   ├── notion-responses.fixture.ts               ← NEW — mocked REST
│   │                                                 responses (search,
│   │                                                 database schema, page
│   │                                                 creation, users list)
│   ├── outlook-events.fixture.ts                  ← NEW — mocked Graph
│   │                                                 calendarView/delta
│   │                                                 responses, including
│   │                                                 multi-timezone event
│   │                                                 fixtures
│   ├── jira-responses.fixture.ts                   ← REUSED/EXTENDED from
│   │                                                 Day 58's original test
│   │                                                 plan, now formalized as
│   │                                                 a shared fixture file
│   └── slack-responses.fixture.ts                  ← REUSED/EXTENDED from
│                                                      Day 60 similarly
│
├── support/
│   ├── http-mock-setup.ts                          ← NEW — registers all
│   │                                                   seven third-party
│   │                                                   domain interceptors,
│   │                                                   shared across every
│   │                                                   test file in this
│   │                                                   directory
│   ├── test-db.ts                                   ← MODIFY (or reuse
│   │                                                   existing from Day 25) —
│   │                                                   seeded test database
│   │                                                   lifecycle helpers
│   └── queue-test-harness.ts                         ← NEW — utilities for
│                                                          running BullMQ jobs
│                                                          synchronously/
│                                                          deterministically
│                                                          inside tests, and
│                                                          for simulating
│                                                          genuine concurrent
│                                                          job execution for
│                                                          the load-sanity
│                                                          checks
│
└── e2e/                                             ← (existing directory,
                                                          Playwright-based,
                                                          unaffected by today's
                                                          backend-focused work)

.github/workflows/
└── ci.yml                                            ← MODIFY — add the
                                                            integrations test
                                                            job, coverage
                                                            threshold gate
```

### Why Fixtures Are Centralized in `tests/fixtures/`, Not Inlined Per Test File

Every fixture file is written once and imported by both the relevant
provider-specific suite **and** the composite suite (Section 8) — a
deliberate choice avoiding the anti-pattern of five slightly-different,
independently-drifting copies of "what a Linear `issueCreate` success
response looks like" scattered across files. This mirrors the exact
fixture-centralization convention already established for the platform's
core test fixtures (`users.fixture.ts`, `teams.fixture.ts`,
`transcripts.fixture.ts`, from the Day 25 backend-testing milestone) —
today's integration fixtures simply extend that same directory with
provider-specific shapes rather than inventing a new fixture-organization
convention.

---

## 4. Test Infrastructure & Mocking Strategy

### The Non-Negotiable Rule: Zero Real Network Calls in CI

Every single test written today — provider-specific, composite, and
load/concurrency — must run to completion without issuing one real HTTP
request to any third-party domain. This is stated as the day's single most
important infrastructure constraint, both for CI reliability (a flaky
third-party sandbox environment must never be able to fail a Vocaply build)
and for security (CI environments should never hold or transmit real,
even sandboxed, third-party credentials as a baseline requirement for
running the test suite).

### File: `support/http-mock-setup.ts`

A single shared setup module, imported at the top of every integration test
file, responsible for registering HTTP interceptors against every
third-party domain this platform's providers call:

```
api.linear.app             (Linear GraphQL — Day 61)
api.notion.com             (Notion REST — Day 62)
graph.microsoft.com        (Outlook Calendar — Day 63)
login.microsoftonline.com  (MSAL token endpoint — Day 63)
api.atlassian.com          (Jira REST — Day 58/59)
auth.atlassian.com         (Jira OAuth — Day 58)
slack.com                  (Slack Web API — Day 60)
oauth2.googleapis.com      (Google Calendar OAuth — Day 56)
www.googleapis.com         (Google Calendar API — Day 56)
```

Each interceptor is configured to respond based on the fixture data
relevant to the specific test invoking it, with a strict default-deny
posture: **any outbound request to one of these domains that doesn't match
a registered interceptor for the current test fails loudly** (rather than
silently falling through to a real network call, or silently succeeding
with an empty response that could mask a bug) — this is the single control
that makes the "zero real network calls" rule enforceable rather than
aspirational.

### Choice of Mocking Library

The platform standardizes on the same HTTP-interception approach already
implicitly assumed by the Day 65 planning references throughout Days
56–64 (`nock` for Node.js-side outbound `fetch`/`axios` interception) —
consistent, single-library tooling across every provider's test file
rather than a mix of ad-hoc mocking approaches per file, which would
otherwise make the shared `http-mock-setup.ts` module significantly harder
to maintain as a single source of truth.

---

## 5. Fixture Design Philosophy

### Fixtures Represent *Realistic* Provider Responses, Not Minimal Stubs

Each fixture file's contents are deliberately modeled on the **actual**
shape of a real provider response (field names, nesting, extraneous fields
a real API includes that Vocaply doesn't use) rather than a minimal,
hand-trimmed stub containing only the fields the current implementation
happens to read. This is a deliberate defense against a specific category
of false-positive test: a minimal stub can pass a test today while hiding
a bug that only manifests against a real response's fuller shape (for
example, Notion's real page-creation response includes several fields
beyond `url` that a naive implementation might mishandle if it assumed the
response was exactly as narrow as a hand-trimmed fixture suggested).

### Fixture Variants Required Per Provider

Each provider's fixture file includes, at minimum, a **success** variant, a
**Category 2/transport-level failure** variant (where applicable — e.g.,
Linear's GraphQL `errors[]` shape with different `extensions.code` values),
and a **Category 3/semantic-rejection** variant (e.g., Linear's
`issueCreate.success: false`, Notion's schema-drift-triggering renamed
property scenario) — directly mirroring the three-category error taxonomy
established in Day 61's plan, now given concrete fixture data rather than
only being described in prose.

### Outlook's Fixture Set Receives Special Attention

Given Section 14 of the Day 63 plan's identification of the naive-datetime
+ timeZone combination as the single highest-risk correctness concern this
sprint introduced, `outlook-events.fixture.ts` includes **multiple
timezone-variant fixtures** deliberately spanning a range of UTC offsets
(including at least one fractional-hour offset, e.g., India Standard Time),
an all-day event fixture, and a fixture representing an event straddling a
daylight-saving-time transition boundary — directly supplying the exact
test data Day 63's plan specified needing but had not yet formalized into
reusable fixture form.

---

## 6. Layer 1 — Provider-Specific Test Suites

### `linear-integration.test.ts`

Converts Day 61's manual, checklist-driven verification plan into an
automated suite covering, at minimum: OAuth callback persistence
(encrypted token, `tokenExpiresAt: null`, workspace metadata correctly
stored); `createExternalItem()`'s GraphQL mutation variable construction
verified against the exact shape Linear's API expects; the full three-way
error-category handling (`issueCreate.success: false` treated as
non-retryable; `AUTHENTICATION_ERROR` GraphQL code treated as
non-retryable; `RATELIMITED` code treated as retryable); assignee-email
resolution with a call-count assertion proving the 24-hour cache is
genuinely consulted on a second call rather than re-querying; the full
priority-mapping table (all four Vocaply levels to their exact documented
Linear integers); and disconnect behavior confirming token revocation is
attempted before the local row is deleted.

### `notion-integration.test.ts`

Converts Day 62's manual plan identically, with particular emphasis on the
two behaviors most likely to regress silently if a future change is made
carelessly: the Basic-Auth (not body-parameter) token-exchange mechanism,
and the schema-drift-tolerant, omit-not-fail property assembly — both
verified with dedicated assertions rather than only being exercised
incidentally by a broader "does sync work" test. Also includes an explicit
test confirming `updateExternalItemStatus` is genuinely absent/undefined
on the Notion provider instance, and that no calling code path throws when
encountering that absence — the automated form of Day 62's "optional
interface method proof point."

### `outlook-calendar.test.ts`

Converts Day 63's manual plan, and — per Section 5 above — carries the
timezone-combination regression test forward as the suite's single most
heavily-weighted test case: multiple fixtures spanning different UTC
offsets (including fractional-hour), a DST-boundary case, and an all-day
event case, each asserting the resulting `Date` object's UTC value matches
an independently-computed expected value. Also covers delta-link
persistence (confirming the stored value is the full URL, never a
truncated/parsed token), `isCancelled` handling correctly invoking the
same `handleCancelledCalendarEvent` path already used for Google (proving
Day 63's `CalendarProvider` refactor achieved genuine code-path sharing,
not just interface-shape similarity), and the meeting-URL extraction
priority order (`onlineMeeting.joinUrl` before any regex-based fallback
scanning).

---

## 7. Layer 2 — Token Refresh Test Suite

### `token-refresh.test.ts`

Converts Day 64's unit-level test coverage (`integration-health.test.ts`,
`token-refresh-service.test.ts`) into full integration-level coverage,
running against a genuinely seeded test database rather than fully mocked
Prisma calls — verifying `findExpiringIntegrations()`'s 30-minute lookahead
filtering against real database rows representing every provider's typical
shape (including `null`-`tokenExpiresAt` rows for Linear/Notion/Slack,
explicitly confirmed to be excluded from the query result), the full
two-stage escalation sequence (3rd consecutive failure triggering exactly
one warning email with dedup correctly preventing re-sends within 24
hours; 5th consecutive failure triggering deactivation and exactly one
deactivation email), and the reconnect-reset behavior confirming a fresh
successful callback fully restores `consecutiveErrors`, `lastError`, and
`isActive` to their healthy-state values.

### Why This Suite Runs Against a Real Database, Unlike the Provider Suites

The provider-specific suites (Section 6) are primarily concerned with
correctly translating between Vocaply's domain model and each provider's
external API shape — a concern well-served by mocking Prisma at the unit
level and focusing test effort on the HTTP-boundary correctness. Token
refresh's core correctness claim, by contrast, is about **query filtering
logic against real column values** (`tokenExpiresAt`, `isActive`,
`consecutiveErrors`) and **state transitions across multiple sequential
database writes** — properties best verified against an actual seeded
database rather than a mocked ORM layer, since a mocked Prisma client could
too easily hide a subtly-wrong `WHERE` clause that would only surface
against real data.

---

## 8. Layer 3 — The Composite End-to-End Suite

### `integrations-e2e.test.ts` — Framing

This file is explicitly called out, in the source planning material this
document expands upon, as **"the sprint's most valuable file"** — and
today's plan treats that framing as load-bearing, not merely descriptive:
it receives the largest dedicated time block (Section 1), the most detailed
per-scenario design treatment (Sections 9–13), and is the single file whose
passing status is treated as the primary signal of whether the Days
56–64 integration block is genuinely ready to be built upon by later
phases.

### Structural Design of the File

Each of the five composite scenarios is written as an independent,
self-contained test case with its own seed data and its own cleanup,
deliberately avoiding shared mutable state between scenarios (even though
they exercise overlapping subsystems) — this ensures a failure in one
scenario never cascades into a false failure in another, and that any
individual scenario can be run in isolation during debugging without
needing the full file's execution context.

### Why These Five Scenarios, Specifically, and Not Others

The five scenarios (detailed in Sections 9–13) were chosen because each
targets a distinct category of cross-subsystem risk that no
single-provider test could expose:

```
SCENARIO                          RISK CATEGORY TARGETED
──────────────────────────────────────────────────────────────────────────
Multi-provider action item sync   Registry dispatch correctness under
                                   real multi-provider variety
Calendar provider switch          Cross-provider dedup-key correctness;
                                   single-active-provider transactional
                                   integrity
Token refresh mid-sync race       Concurrency safety between reactive and
                                   proactive refresh paths
Cascading failure isolation       Shared-queue failure-domain separation
Full deactivation → reconnect     End-to-end correctness of the entire
  → resume                        health-tracking lifecycle, including
                                   cache invalidation on reconnect
```

Every other conceivable interaction (e.g., "does Slack notification
dispatch interfere with Jira sync") was considered and deliberately
excluded from today's scope on the grounds that it does not represent a
genuinely *emergent* risk — Slack notifications and Jira sync share no
registry, no lock, and no queue, meaning there is no plausible mechanism by
which they could interfere, and a test asserting their non-interference
would not be verifying anything the architecture doesn't already trivially
guarantee by construction.

---

## 9. Composite Scenario Deep Dive: Multi-Provider Action Item Sync

### What This Test Proves

A single seeded action item is synced to Jira, then Linear, then Notion, in
sequence — modeling a realistic scenario (a team migrating between
providers, or simply wanting redundant tracking across two tools during a
transition period). The test asserts that all three providers' respective
ID/URL/timestamp columns (`jiraIssueId`/`jiraIssueUrl`/`jiraIssueSyncedAt`,
and their Linear and Notion equivalents) are populated **independently and
correctly**, with no cross-contamination (e.g., a bug that accidentally
wrote Linear's returned URL into the Jira column due to a copy-pasted
worker branch).

### Why Sequencing Matters, Not Just Final-State Assertion

The test deliberately syncs to all three providers **sequentially against
the same action item row**, rather than three separate action items each
synced to one provider — this specifically exercises the scenario where
the second and third sync calls must correctly build their update payload
without disturbing the columns already populated by the prior sync(s), a
subtlety a "one action item per provider" test design would not catch.

### What Specifically Would Fail If the Registry Abstraction Were Broken

If `integrate.worker.ts` contained any hidden Jira-specific assumption not
correctly generalized when Linear and Notion were added (for example, an
accidentally-hardcoded column name, or a conditional that only correctly
handles two of the three providers), this test — and specifically this
test, more directly than any single-provider suite — is where that defect
would surface, since it is the only test exercising genuine provider
diversity through the exact same worker code path within a single test
run.

---

## 10. Composite Scenario Deep Dive: Calendar Provider Switch

### What This Test Proves

Connect Google Calendar, run a sync (creating meetings from mocked Google
events), then connect Outlook Calendar — asserting the Google
`UserIntegration` row is disconnected as part of that connection (per Day
63's single-active-calendar-provider rule) — then run an Outlook sync and
assert it does **not** recreate meetings already created via the earlier
Google sync, even for events that might superficially appear related
across the two mocked data sets.

### The Specific, Non-Obvious Correctness Claim Being Tested

The test explicitly verifies that deduplication continues to be governed
by the **platform + platformMeetingId** composite key (Day 57's dedup
design), never by `calendarEventId` — because `calendarEventId` is a
provider-specific identifier (a Google calendar event ID has no
relationship to an Outlook calendar event ID, even for what a human might
consider "the same meeting" appearing on both calendars during a
transition period) and must never be mistaken for a cross-provider dedup
signal. This is called out as a genuinely subtle risk: a naive
implementation might be tempted to use `calendarEventId` for
deduplication convenience, which would work correctly for single-provider
scenarios (all of Days 56–57's original testing) but silently fail the
moment a second calendar provider entered the picture — exactly the kind
of latent defect only a genuine two-provider composite test can surface.

### Transactional Integrity Assertion

The test also confirms — per Day 63's Section 9 design — that the
disconnect-old/connect-new sequence during a provider switch is atomic:
a simulated failure injected between the two steps (via a mocked
transaction-abort) must leave the user with their **original** Google
integration still fully intact, never in an intermediate state with
neither provider connected.

---

## 11. Composite Scenario Deep Dive: Token Refresh Mid-Sync Race

### What This Test Proves

An integration is seeded with `tokenExpiresAt` five minutes in the future —
inside both the reactive refresh threshold (`getValidAccessToken()`'s
internal check) and the proactive cron's 30-minute lookahead window. The
test then triggers a **real sync job** (which will call
`getValidAccessToken()` internally) at approximately the same moment the
token-refresh cron's fan-out logic (Day 64) would also select this same
integration for a proactive refresh — simulated via the test harness
scheduling both operations to execute genuinely concurrently rather than
sequentially.

### The Explicit Assumption Being Validated

This scenario tests something the platform relies upon but had, until this
test, never explicitly stated or verified: that if both the reactive and
proactive refresh paths attempt to refresh the same integration's token at
nearly the same moment, the result is **"last write wins is an acceptable
outcome"** — meaning the system tolerates a scenario where one of the two
refresh attempts' resulting token is the one ultimately persisted, without
either code path throwing an unhandled error, without the integration
being left in a corrupted (e.g., partially-updated) state, and without a
job that was mid-flight using the *first* successfully-refreshed token
suddenly failing because a second, near-simultaneous refresh invalidated it
before the first job's request completed.

### Why This Wasn't (and Couldn't Have Been) Tested on Day 64 Alone

Day 64's own test coverage (Section 7 above) verifies the token-refresh
service and cron in isolation, seeded against a database with no
concurrently-running sync job. The specific race this scenario targets only
exists because **both** mechanisms exist simultaneously and can, in
principle, both act on the same row at close to the same time — a
condition that could not be constructed as a meaningful test until Day 64's
proactive refresh cron actually existed alongside the reactive refresh path
built back on Day 60.

---

## 12. Composite Scenario Deep Dive: Cascading Failure Isolation

### What This Test Proves

The mocked Jira HTTP interceptor is configured to return a 500 error for
every call within this test's scope. Simultaneously, Linear and Notion sync
jobs for the **same team**, queued at approximately the same time as the
failing Jira job, are asserted to complete successfully and entirely
unaffected — verifying that a full outage in one provider's API does not
degrade, delay, or corrupt sync operations for other providers sharing the
same `integrate` queue and worker concurrency pool.

### Why This Specifically Tests a Design Claim From Day 18, Revisited

Day 18's original async-engine planning document established "queues are
logically separated by failure domain" as a core principle — but by the
time Linear and Notion were added (Days 61–62), all three providers were
deliberately routed through the **same** `integrate` queue (a considered
decision, not an oversight, per Day 61's Section 15 reasoning: "no single
provider can monopolize worker capacity"). This creates a legitimate
question worth explicitly testing: does sharing one queue across three
providers actually preserve failure-domain isolation, or does it only
appear to because no one had tested a genuine simultaneous-failure
scenario? This test's explicit purpose is answering that question with
evidence, confirming that **per-job try/catch isolation within the
worker**, not queue-level separation, is what actually provides the
isolation guarantee — and that this is sufficient, since each job is an
independent unit of work regardless of which queue it shares residency
with.

### What a Failure Here Would Indicate

If this test failed — if a failing Jira job somehow delayed or corrupted a
concurrently-processed Linear/Notion job — it would indicate a defect at
the worker or queue-configuration level (for example, an accidentally
shared mutable variable across job invocations, or a misconfigured
concurrency setting allowing one slow/failing job to block the worker
pool) requiring investigation and correction before Phase 5 could safely
continue, since it would represent a real production risk: a single
provider's outage degrading service for teams using entirely unrelated
integrations.

---

## 13. Composite Scenario Deep Dive: Full Deactivation → Reconnect → Resume

### What This Test Proves

Five consecutive simulated Jira sync failures are forced (via the mocked
HTTP interceptor consistently returning a non-retryable error class),
driving the integration through the full Day 64 escalation sequence:
early-warning email at failure 3, deactivation and deactivation-email at
failure 5. The test then simulates an admin performing a fresh OAuth
reconnect (a new `handleOAuthCallback()` invocation) and asserts —
end-to-end, not merely at the health-service unit-test level already
covered on Day 64 — that `consecutiveErrors` resets to `0`, `isActive`
returns to `true`, and, critically, that the **next queued sync job**
against this now-reconnected integration succeeds, rather than failing
against a stale cached "integration is inactive" flag.

### Why the Final Assertion (Next Sync Succeeds) Is the Test's Real Point

Day 64's own unit tests already confirm the health service correctly
resets its own database columns on reconnect (Section 25 of the Day 64
plan). What those unit tests **cannot** confirm — because they don't
exercise the full worker pipeline — is whether some other part of the
system (a Redis-cached "integration inactive" flag, if one existed
anywhere in the stack; a stale in-memory reference retained by a
long-running worker process) might cause a subsequent real sync attempt to
still behave as though the integration were dead, despite the database
correctly reflecting `isActive: true`. This composite test's specific value
is verifying the **entire path** end-to-end — reconnect through to a
genuinely successful next sync — catching exactly the class of "the data
says fixed but the behavior says still broken" bug that only an end-to-end
test, not a unit test of any individual component, can rule out.

### Explicit Cache-Invalidation Verification

Because the platform does cache certain integration-adjacent data
elsewhere (for example, provider assignee-resolution caches, per Days
58/60/61/62), this test also confirms that none of those unrelated caches
were incorrectly keyed in a way that would cause them to hold onto a
"this integration doesn't work" assumption independent of the
authoritative `isActive` flag — a defensive check ensuring the reconnect
flow's correctness isn't accidentally undermined by an unrelated caching
layer nobody thought to check specifically for this scenario.

---

## 14. Load & Concurrency Sanity Checks

### Check 1: Calendar-Sync Fan-Out Under Volume

200 simulated calendar-sync jobs — a realistic mix of Google and Outlook
providers — are fanned out through the actual BullMQ queue configuration
(concurrency = 5, per Day 56/63's established setting) using the test
harness's genuine-concurrency execution mode (Section 3's
`queue-test-harness.ts`). The test asserts that total wall-clock completion
time scales roughly linearly with the configured worker count — not
degrading disproportionately, which would indicate unexpected lock
contention. Specifically, this test is designed to catch an **accidental
regression to a global lock** (as opposed to the intended per-user Redis
lock from Day 56) — a defect that would not be visible from any
single-user test but would manifest clearly as a large number of
concurrently-queued jobs across different users unexpectedly serializing
against each other rather than genuinely running in parallel.

### Check 2: Integrate Queue Concurrency Respect

50 simulated `integrate` jobs — mixed across Jira, Linear, and Notion — are
fanned out through the real queue configuration (concurrency = 3, per Day
58/61/62's shared setting). The test asserts, via a concurrent-request
counter wired into the mocked HTTP layer, that **at no point** are more
than three third-party HTTP calls genuinely in flight simultaneously —
directly verifying the concurrency ceiling is honored under real load,
rather than merely trusting the configuration value without confirming its
actual enforced effect.

### Why These Checks Are "Sanity," Not Exhaustive Load Testing

Today's load checks are explicitly scoped as *sanity* verification — confirming
the platform's stated concurrency/isolation claims hold under a
moderate, realistic simulated volume — not a full performance/load-testing
exercise (which belongs to Phase 8's dedicated load-testing milestone, per
the platform's 100-day build plan). The goal today is catching an obvious
regression (a global lock where a per-user lock was intended; a
concurrency setting silently not being respected), not establishing
production capacity limits or benchmarking absolute throughput numbers.

---

## 15. Test Data Seeding & Database Isolation Strategy

### Per-Test Isolation

Every test in every file (provider-specific and composite) creates its own
isolated team/user/integration fixture data at the start of the test and
tears it down at the end, reusing the platform's existing test-database
lifecycle helpers established during the Day 25 backend-testing milestone
— no test in today's suite relies on shared, pre-existing seed data that
could be mutated by a prior test, since such coupling would make test
failures non-deterministic and difficult to debug in isolation.

### Why Composite Tests Still Use Per-Scenario Isolated Data, Not a Shared "Sprint World"

Even though the composite suite's entire purpose is testing
cross-subsystem interaction, each of the five scenarios (Sections 9–13)
constructs its own team/user/integration data specific to that scenario's
needs, rather than all five scenarios operating against one large shared
seeded "world" representing a hypothetical fully-configured team. This
keeps each scenario's failure independently diagnosable — a failure in the
"cascading failure isolation" scenario should never be traceable to seed
data mutated by the "calendar provider switch" scenario running earlier in
the same test file.

---

## 16. CI Pipeline Integration

### File: `.github/workflows/ci.yml` (modified)

A dedicated CI job — `integrations-test` — is added, running
specifically the `services/api/tests/integration/*.test.ts` suite
(distinguished from the platform's broader unit-test job, which continues
to run independently and faster, per the existing Day 25/Turborepo
pipeline structure). This job is configured to run on every pull request
touching any file under `services/api/src/modules/integrations/**`,
`services/api/src/services/calendar-sync.service.ts`,
`services/api/src/services/token-refresh.service.ts`,
`services/api/src/services/integration-health.service.ts`, or
`services/api/src/queues/workers/{integrate,calendar-sync,token-refresh}.worker.ts`
— a deliberately broad trigger path ensuring any future change to the
integration layer's shared infrastructure automatically re-runs this
entire suite, not merely changes to a specific provider file.

### Merge-Blocking Status

Per the platform's existing quality-gate convention (established Day 25,
reaffirmed for every subsequent testing milestone), this new CI job is
configured as a **required** check — a pull request cannot merge into
`main` with this job failing, exactly matching the treatment already given
to the platform's lint, type-check, and existing unit-test CI jobs.

---

## 17. Code Coverage Strategy

### Coverage Targets

Today's work applies the platform's existing coverage bar (established
during the Day 25 backend-testing milestone) to the six provider files
(`jira.provider.ts`, `linear.provider.ts`, `notion.provider.ts`,
`slack.provider.ts`, `google-calendar.provider.ts`,
`outlook-calendar.provider.ts`) plus `token-refresh.service.ts` and
`integration-health.service.ts` specifically — no new, integration-specific
coverage threshold is invented; today's work is scoped to **meeting** the
platform's pre-existing standard for this newly-completed module, not to
establishing a separate bar.

### Why Coverage Percentage Alone Is Explicitly Not the Success Metric

While a coverage threshold is enforced as a baseline quality gate, today's
plan is explicit that **the five composite scenarios (Section 8) are
weighted as more valuable evidence of correctness than the raw coverage
percentage** — a file could reach high line coverage through purely
single-path, happy-case tests while still harboring the exact class of
cross-subsystem defect only the composite suite is designed to catch. The
coverage gate is a floor, not the goal; the composite suite's specific
scenario coverage is the goal.

---

## 18. Security Testing Considerations

### Confirming No Real Credentials Enter the Test Environment

As a specific verification task today (not merely an assumption), the test
suite's configuration is checked to confirm no real OAuth client
secrets, API keys, or webhook signing secrets for any provider are present
in the CI environment's variables — the entire suite must be runnable
using only placeholder/fixture values, since Section 4's mocking strategy
means no real provider communication ever occurs.

### Confirming the Sentry-Scrubbing and Never-Log-Tokens Discipline Holds Under Test

A forced-error test case is included (building on the pattern already
specified in Day 62's plan for confirming Notion's Basic-Auth header is
never logged) verifying, across **every** provider, that a deliberately
triggered failure never surfaces a raw token, client secret, or
Authorization header value in either the structured logger's output or a
simulated Sentry capture — today's work generalizes what Day 62 specified
for one provider into a parameterized test run across all six.

### Tenant Isolation Under Composite Conditions

The multi-provider and cascading-failure composite scenarios (Sections 9,
12) each involve multiple integrations belonging to the **same** team —
a deliberate choice partly motivated by wanting to also confirm, as a
secondary assertion within those same tests, that no cross-contamination
occurs between different providers' data for that one team (e.g., that a
Linear sync failure's `lastError` message is never accidentally written to
the Jira integration's row, or vice versa) — reinforcing the platform's
tenant/resource isolation discipline at the integration-record level, not
merely at the team-boundary level already covered by the platform's
broader multi-tenancy test suite.

---

## 19. Manual Smoke Testing Plan

### Why Automated Mocked Tests Are Necessary But Not Sufficient

Every mocked test in today's suite is only as accurate as its underlying
fixture data's fidelity to the real provider's actual behavior (Section
5's fixture-design philosophy exists specifically to minimize this risk,
but cannot eliminate it entirely). A real provider's API can have
undocumented quirks, subtly different field presence/absence patterns
depending on account configuration, or timing/rate-limit behaviors that no
hand-authored fixture can fully anticipate. For this reason, today's plan
requires a hand-performed manual round trip against **real** sandbox
environments for the two genuinely new API shapes introduced this sprint —
Linear (the platform's first GraphQL integration) and Outlook (the
platform's first MSAL/Graph-based integration, and the one carrying the
highest correctness risk via the timezone-combination logic).

### Linear Manual Smoke Test

Connect a real Linear sandbox workspace → configure a test team and default
workflow state → trigger a real action-item sync → confirm the resulting
issue appears correctly in the actual Linear workspace with the expected
title, priority, and (if configured) assignee → disconnect → confirm the
integration no longer appears connected in Vocaply's settings.

### Outlook Manual Smoke Test

Connect a real Microsoft 365 developer tenant calendar → create a test
event with a known, specific time in a non-UTC timezone → run a real sync
→ **explicitly compare the meeting's displayed time in Vocaply against the
same event's displayed time in Outlook itself**, confirming they match
exactly — this specific comparison is called out as the single most
important manual verification step in this entire sprint block, given the
correctness stakes established in Day 63's Section 14.

### Recording Results

Both manual smoke tests are documented (screenshots or a short written
log of steps performed and observed results) as part of today's sign-off
artifact, ensuring the verification is auditable after the fact, not merely
a private confidence check performed and then forgotten.

---

## 20. Bug Triage & Fix Protocol for Today

### The Expected Reality: Today's Suite Will Likely Surface Real Bugs

Because today is the first point at which every subsystem built across
Days 56–64 is exercised together, it would be unusual for the new
composite suite (Section 8 in particular) to pass on its first run without
surfacing at least one genuine defect in the existing code — this is
treated as an **expected, healthy outcome** of writing this suite, not a
sign anything about today's plan or the prior nine days' work was
executed poorly.

### Triage Protocol

Any failure surfaced by today's suite is classified into one of two
categories before a fix is attempted:

```
CATEGORY A — Test is wrong (a fixture doesn't accurately represent the
  real provider's behavior, or an assertion encodes an incorrect
  expectation): the test itself is corrected, with the correction
  justified in a code comment or commit message referencing the actual
  provider documentation/behavior that informed the fix.

CATEGORY B — Production code is wrong (the test correctly encodes real
  provider/architectural behavior, and the existing Day 56–64
  implementation has a genuine defect): the defect is fixed in the
  relevant provider/service file, following the exact same
  architecture-first, edge-case-considered engineering discipline applied
  throughout this sprint — not a quick patch, but a properly reasoned fix
  consistent with the surrounding code's existing design.
```

Every Category B fix discovered and resolved today is explicitly logged
(in the day's sign-off notes, Section 22) so the sprint's overall record
accurately reflects what was caught and corrected during this hardening
pass, rather than presenting Days 56–64 as having shipped defect-free on
first implementation.

---

## 21. Observability Verification

### Confirming Today's Tests Don't Silently Bypass Logging/Metrics Paths

Because mocked HTTP responses can sometimes cause code paths that would
normally log or emit metrics to be skipped inadvertently (for example, if
a test's mock short-circuits before reaching a logging statement that
would only execute against a real network round trip), a subset of today's
tests explicitly assert that the expected structured log lines and metric
increments (established across Days 58–64's respective observability
sections) actually fire during a mocked test run — confirming the
mocking strategy exercises the **full** code path, including its
observability instrumentation, not merely the narrow subset relevant to
the test's primary functional assertion.

---

## 22. Documentation Deliverables

### Sign-Off Artifact

Today's work concludes with a written sign-off record (appended to this
document's own repository location, or filed alongside it) capturing: the
final state of all CI runs for the new integrations test job, the coverage
percentages achieved against the target files, a list of any Category B
bugs discovered and fixed during today's work (Section 20), and the
recorded results of both manual smoke tests (Section 19) — functioning as
the auditable evidence that the Days 56–65 integration block met its exit
criteria (Section 24) before Phase 5 continues.

---

## 23. Types & Test Utilities

### File: `support/queue-test-harness.ts`

Provides two categories of helper: **deterministic** job execution (run a
single job through a worker's processor function directly, awaiting its
completion, for tests where sequencing matters and non-determinism would
make assertions flaky) and **genuine-concurrency** job execution (enqueue
many jobs against a real, running BullMQ worker instance configured with
its actual production concurrency setting, and await the full batch's
completion) — the load/concurrency sanity checks (Section 14) and the
token-refresh-mid-sync-race scenario (Section 11) specifically require the
latter mode, while most provider-specific and single-scenario composite
tests use the former for reliability and speed.

### File: `support/http-mock-setup.ts` (types)

Exposes a small, typed helper API (`mockLinearResponse()`,
`mockNotionResponse()`, `mockOutlookGraphResponse()`, etc.) wrapping the
underlying interception library's raw API with type-safe, fixture-aware
convenience functions — so individual test files read as declarations of
intent ("when this test calls Linear's `issueCreate`, respond with this
fixture") rather than needing to repeat the underlying HTTP-interception
library's more verbose raw configuration syntax in every test file.

---

## 24. Exit Criteria — Full Specification

Today's work is not considered complete, and the Days 56–65 integration
block is not considered closed, until every one of the following holds:

```
[ ] All five provider-specific/token-refresh integration test files
    (linear, notion, outlook-calendar, token-refresh) pass in CI
[ ] integrations-e2e.test.ts passes, including all 5 composite scenarios,
    each independently verified to actually exercise genuine concurrency
    where the scenario design requires it (not silently degraded into
    sequential execution during implementation)
[ ] Both load/concurrency sanity checks pass with no lock-contention or
    concurrency-ceiling-violation regressions detected
[ ] Zero test in the entire suite issues a real network call to any of the
    nine third-party domains listed in Section 4 — verified via the
    default-deny interceptor configuration actively failing any
    unregistered request, not merely assumed from code review
[ ] Code coverage on all six provider files plus token-refresh.service.ts
    and integration-health.service.ts meets the platform's existing
    Day-25-established coverage bar
[ ] Both manual smoke tests (Linear, Outlook) are performed against real
    sandbox/dev-tenant environments and their results documented
[ ] Every Category B bug discovered during today's work (Section 20) has
    been fixed and its fix is covered by an updated or new test asserting
    the corrected behavior
[ ] The new integrations-test CI job is wired as a required, merge-blocking
    check on the appropriate file-path triggers
[ ] The sign-off artifact (Section 22) is completed and filed
```

---

## 25. End-of-Day Checklist

### Test Infrastructure

- [ ] `http-mock-setup.ts` registers interceptors for all nine third-party
      domains with a strict default-deny posture for unregistered requests
- [ ] `queue-test-harness.ts` provides both deterministic and
      genuine-concurrency job-execution modes, each used appropriately per
      test's actual needs
- [ ] Fixture files model realistic, full-shape provider responses, not
      minimal hand-trimmed stubs

### Provider-Specific Suites

- [ ] `linear-integration.test.ts` covers all three GraphQL error
      categories plus assignee-cache and priority-mapping verification
- [ ] `notion-integration.test.ts` covers Basic-Auth token exchange,
      schema-drift omission, and the optional-interface-method proof
- [ ] `outlook-calendar.test.ts` includes multi-timezone (including
      fractional-offset and DST-boundary) datetime-combination tests as its
      most heavily-weighted coverage
- [ ] `token-refresh.test.ts` runs against a real seeded database, not
      fully-mocked Prisma calls

### Composite Suite

- [ ] All five composite scenarios (Sections 9–13) implemented and passing
- [ ] Each scenario uses its own isolated seed data, independently
      diagnosable on failure
- [ ] The token-refresh-mid-sync-race and load-sanity-check scenarios
      genuinely exercise concurrent execution, verified via the harness's
      concurrency mode, not merely sequential calls dressed up as a
      concurrency test

### CI & Coverage

- [ ] New `integrations-test` CI job wired as a required, merge-blocking
      check on the correct file-path triggers
- [ ] Coverage on all six provider files plus the two Day 64 services meets
      the existing platform bar
- [ ] No real third-party credentials present anywhere in the CI
      environment configuration for this job

### Security

- [ ] Parameterized forced-error test confirms no token/secret/Authorization
      header leakage into logs or simulated Sentry capture, across all six
      providers
- [ ] Composite scenarios confirm no cross-contamination between different
      providers' integration rows for the same team

### Manual Verification

- [ ] Linear manual smoke test performed against a real sandbox workspace,
      results documented
- [ ] Outlook manual smoke test performed against a real Microsoft 365 dev
      tenant, including explicit side-by-side meeting-time comparison,
      results documented

### Bug Resolution

- [ ] Every failure surfaced by today's suite triaged into Category A
      (test correction) or Category B (production fix) per Section 20's
      protocol
- [ ] Every Category B fix has a corresponding test update proving the
      corrected behavior, not merely a silent code change

### Sign-Off

- [ ] All items in Section 24's exit criteria confirmed complete
- [ ] Sign-off artifact completed and filed, including the list of any
      Category B bugs found and fixed today

---

## 26. Risks & Edge Cases

```
RISK                                              MITIGATION BUILT TODAY
──────────────────────────────────────────────────────────────────────────
A fixture inaccurately represents a real
  provider's response shape, producing a false-
  positive passing test that would fail against
  the real provider                                 Fixtures modeled on
                                                    realistic, full-shape
                                                    responses (Section 5);
                                                    manual smoke tests against
                                                    real sandboxes for the two
                                                    highest-risk providers as
                                                    a final backstop

A composite scenario is implemented in a way that
  silently degrades into sequential execution,
  never actually exercising the concurrency it was
  designed to test                                  queue-test-harness.ts's
                                                    genuine-concurrency mode
                                                    explicitly used and
                                                    verified for the specific
                                                    scenarios that require it

Today's testing work surfaces a genuine defect in
  already-shipped (per prior days' plans) provider
  code, requiring a same-day fix under time
  pressure                                          Explicit triage protocol
                                                    (Section 20) separating
                                                    test-correction from
                                                    production-fix cases,
                                                    with every fix required
                                                    to carry its own
                                                    regression-test coverage,
                                                    not a rushed patch

A default-deny HTTP interceptor configuration is
  accidentally too permissive, silently allowing an
  unmocked request through to a real endpoint         Interceptor default-deny
                                                    behavior itself explicitly
                                                    verified as part of the
                                                    infrastructure setup, not
                                                    merely assumed from the
                                                    mocking library's
                                                    documented defaults

Coverage percentage is met while the five composite
  scenarios' true intent (interaction correctness,
  not just line execution) goes unverified because
  a scenario's assertions are too shallow             Explicit statement
                                                    (Section 17) that
                                                    composite scenario
                                                    correctness, not raw
                                                    coverage percentage, is
                                                    the actual success
                                                    criterion; each
                                                    scenario's assertions
                                                    detailed individually in
                                                    Sections 9–13 rather than
                                                    left to implementation-time
                                                    judgment

CI flakiness introduced by improperly-isolated test
  data causes intermittent, hard-to-reproduce
  failures                                          Strict per-test data
                                                    isolation (Section 15),
                                                    including within the
                                                    composite suite, despite
                                                    its cross-subsystem focus
```

---

*Document: DAY-65-PLAN-001 | Vocaply | Day 65: Integration Testing (End-to-End, All Providers)*
*Full Scalable Industry-Level Build Plan | Principal Engineer Edition*
*Composite cross-provider verification · Zero real network calls · Manual smoke test backstop*
*Security-first · Performance-optimized · Production-grade · Planning Document — No Code*
