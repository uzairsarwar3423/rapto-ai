# Vocaply — Day 63: Outlook Calendar Sync (Second Calendar Provider)
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-63-PLAN-001 | Version 1.0 | Phase 5 — Integrations (Days 56–70)

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Why Outlook Forces an Architectural Checkpoint](#2-why-outlook-forces-an-architectural-checkpoint)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Layer 1 — CalendarProvider Interface Extraction (Refactor)](#4-layer-1--calendarprovider-interface-extraction-refactor)
5. [Layer 2 — Google Calendar Provider Refactor](#5-layer-2--google-calendar-provider-refactor)
6. [Layer 3 — Outlook Calendar Provider Implementation](#6-layer-3--outlook-calendar-provider-implementation)
7. [Layer 4 — Calendar Provider Registry](#7-layer-4--calendar-provider-registry)
8. [Layer 5 — calendar-sync.service.ts Generalization](#8-layer-5--calendar-syncservicets-generalization)
9. [Layer 6 — Integrations Service Orchestration](#9-layer-6--integrations-service-orchestration)
10. [Layer 7 — HTTP Layer (Controller + Routes)](#10-layer-7--http-layer-controller--routes)
11. [Layer 8 — Validation Layer](#11-layer-8--validation-layer)
12. [Layer 9 — Worker Integration (calendar-sync.worker.ts)](#12-layer-9--worker-integration-calendar-syncworkerts)
13. [MSAL Authentication Architecture](#13-msal-authentication-architecture)
14. [Naive-Datetime + TimeZone Handling (Critical Correctness Section)](#14-naive-datetime--timezone-handling-critical-correctness-section)
15. [Delta Query & Incremental Sync Design](#15-delta-query--incremental-sync-design)
16. [Meeting URL Extraction Priority for Outlook](#16-meeting-url-extraction-priority-for-outlook)
17. [Single-Active-Calendar-Provider Business Rule](#17-single-active-calendar-provider-business-rule)
18. [Token Revocation Limitation & Honest-Disclosure Design](#18-token-revocation-limitation--honest-disclosure-design)
19. [Data Model & Metadata Design](#19-data-model--metadata-design)
20. [Security Architecture](#20-security-architecture)
21. [Performance Architecture](#21-performance-architecture)
22. [Caching Strategy](#22-caching-strategy)
23. [Error Handling & Retry Strategy](#23-error-handling--retry-strategy)
24. [Observability & Logging](#24-observability--logging)
25. [API Endpoints — Full Specification](#25-api-endpoints--full-specification)
26. [Middleware Chain Design](#26-middleware-chain-design)
27. [Frontend Integration Plan](#27-frontend-integration-plan)
28. [Types & Interfaces](#28-types--interfaces)
29. [Testing Plan](#29-testing-plan)
30. [End-of-Day Checklist](#30-end-of-day-checklist)
31. [Risks & Edge Cases](#31-risks--edge-cases)

---

## 1. Day Overview & Goals

### What Gets Built Today

Day 63 connects Vocaply to **Microsoft Outlook / Microsoft 365 calendars**,
giving users a second calendar-ingestion option alongside Google Calendar
(Day 56). This is deliberately **not** a simple "copy Google's provider file
and swap the API calls" exercise — it is the day
`calendar-sync.service.ts`'s entire orchestration engine gets proven to be
genuinely provider-agnostic, via a **mandatory refactor performed before any
Outlook-specific code is written**: extracting a dedicated
`CalendarProvider` interface, distinct from the `IntegrationProvider`
interface already validated against Jira (Day 58), Linear (Day 61), and
Notion (Day 62).

```
TODAY BUILDS:
  ✅ providers/calendar-provider.interface.ts — the NEW, second interface
     this platform now has, purpose-built for "list events with delta
     support," a fundamentally different shape of operation than "create an
     external ticket"
  ✅ google-calendar.provider.ts REFACTORED to implement CalendarProvider,
     with Google's raw JSON shape fully contained inside its own file
  ✅ outlook-calendar.provider.ts — full CalendarProvider implementation
     using Microsoft Graph API + MSAL
  ✅ calendar-provider.registry.ts — the second small provider registry,
     sibling to (not merged with) provider.registry.ts
  ✅ calendar-sync.service.ts GENERALIZED — zero Google-specific field
     access remains; the sync orchestration loop (lock, dedup, batch
     tolerance, cancellation handling) is now 100% provider-agnostic
  ✅ MSAL-based OAuth flow (connect/callback/disconnect) for Outlook
  ✅ Correct naive-datetime + timeZone combination logic (the sprint's
     single highest-risk correctness bug if mishandled)
  ✅ Microsoft Graph delta-query incremental sync (full-URL sync tokens)
  ✅ Single-active-calendar-provider business rule enforcement
  ✅ Honest, documented token-revocation limitation for Outlook
  ✅ Frontend: OutlookCalendarIntegration.tsx + provider-switch confirmation UX
  ✅ Full test coverage, with the timezone-combination test as the single
     most important regression test written this sprint

DOWNSTREAM IMPACT:
  Day 64 — Token refresh cron will treat Outlook as a THIRD provider needing
           real, scheduled refresh (after Google) — unlike Linear/Notion/
           Slack's non-expiring tokens, Outlook access tokens DO expire and
           genuinely exercise the proactive-refresh cron built that day
  Day 65 — Integration test suite's composite "calendar provider switch"
           scenario depends entirely on today's single-active-provider rule
           and the shared dedup layer correctly treating Google and Outlook
           events as interchangeable inputs to the same platform+meetingId
           dedup key — NOT as separate namespaces

DO NOT SKIP OR RUSH:
  The naive-datetime + timeZone bug is not hypothetical — it is THE most
  common real-world Microsoft Graph integration defect, and it fails
  silently: meetings sync, bots get scheduled, everything LOOKS like it
  worked, and every single Outlook user's meeting times are wrong by
  whatever their UTC offset happens to be. This class of bug typically
  isn't caught until a customer complains their bot joined at the wrong
  time. Section 14 of this plan exists specifically to make sure that
  mistake is structurally prevented today, not discovered in production.
```

### 8-Hour Time Allocation

```
9:00 AM – 9:30 AM    → providers/calendar-provider.interface.ts — define the
                        interface, CalendarProviderEvent, CalendarSyncResult shapes
9:30 AM – 10:30 AM   → REFACTOR google-calendar.provider.ts to implement
                        CalendarProvider — move all Google-shape mapping
                        (event.start?.dateTime, conferenceData) inside the file
10:30 AM – 11:00 AM  → calendar-provider.registry.ts — wire GOOGLE_CALENDAR,
                        stub OUTLOOK_CALENDAR
11:00 AM – 12:00 PM  → GENERALIZE calendar-sync.service.ts's syncUserCalendar()
                        to dispatch via the registry — remove all Google-specific
                        code from this file
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 1:45 PM    → oauth-providers.config.ts (MSAL app registration config)
                        + outlook-calendar.provider.ts: getAuthorizationUrl,
                        exchangeCodeForTokens, refreshAccessToken (MSAL wiring)
1:45 PM – 2:45 PM    → outlook-calendar.provider.ts: listEvents — Graph
                        calendarView + delta query modes, event mapping,
                        THE TIMEZONE-COMBINATION LOGIC (highest-priority task
                        of the day)
2:45 PM – 3:15 PM    → outlook-calendar.provider.ts: meeting URL extraction
                        priority (onlineMeeting.joinUrl → regex fallback reuse)
3:15 PM – 3:45 PM    → integrations.service.ts: single-active-calendar-provider
                        enforcement, connect/callback/disconnect orchestration
3:45 PM – 4:15 PM    → integrations.controller.ts + routes.ts + validator.ts
4:15 PM – 4:45 PM    → Frontend: OutlookCalendarIntegration.tsx + provider-switch
                        confirmation dialog
4:45 PM – 5:30 PM    → Unit tests: timezone-combination (exhaustive), delta-link
                        persistence, URL-extraction priority, event mapping
5:30 PM – 6:00 PM    → Integration tests + manual E2E against a real Microsoft
                        365 dev tenant + checklist review + sign-off
```

---

## 2. Why Outlook Forces an Architectural Checkpoint

### The Problem With Extending Day 56's Code As-Is

`calendar-sync.service.ts`, as built on Day 56, was written correctly for
its scope at the time — but its scope at the time was "sync Google
Calendar," and the implementation reflects that: Google's raw event JSON
shape (`event.start?.dateTime`, `event.conferenceData?.entryPoints`) is
referenced **directly inside the sync orchestration function**, not behind
any abstraction. This was a reasonable choice when only one calendar
provider existed. It stops being reasonable the moment a second provider is
introduced, because the alternative — writing a parallel
`syncUserCalendarOutlook()` function that duplicates the lock acquisition,
the two-layer dedup call, the per-event try/catch batch tolerance, and the
cancelled-event handling — would mean **two independently-maintained copies
of the same critical, security-relevant orchestration logic**, drifting
apart over time exactly the way the platform's design principles (stated
repeatedly since Day 18: "failure domains separated, no duplicated critical
logic") explicitly forbid.

### The Decision: Refactor First, Extend Second

Today's plan is sequenced deliberately: the `CalendarProvider` interface is
extracted and Google's provider is refactored to implement it **before**
a single line of Outlook-specific code is written. This is not "cleanup
that would be nice" — it is a hard prerequisite, because writing Outlook
support against the old Google-shaped code would either (a) require Outlook
to somehow pretend to be Google's JSON shape, which is absurd, or (b)
produce the duplicated-orchestration anti-pattern described above. The
refactor is Section 4 and 5 of this plan; Outlook's actual implementation
does not begin until Section 6.

### Why This Is a *Second* Interface, Not a Reuse of `IntegrationProvider`

A team might reasonably ask: "Jira, Linear, Notion, and Slack all share one
`IntegrationProvider` interface — why doesn't Google/Outlook Calendar just
implement that same interface?" The answer is that `IntegrationProvider`'s
core operation — `createExternalItem()` — has no meaningful analogue for
calendar sync. Calendar sync's core operation is "list events, understand
what changed since last time, and hand back a normalized event list" — a
**read/discovery** operation with delta-tracking semantics, structurally
unrelated to "push one item into an external system." Forcing both shapes
into one interface would produce a bloated contract where every provider
implements several methods that make no sense for its category — two small,
honest interfaces are the correct design, and today is where that decision
gets executed, not merely discussed.

---

## 3. File Structure to Create

```
services/api/src/
│
├── modules/integrations/
│   ├── providers/
│   │   ├── calendar-provider.interface.ts     ← NEW — the second interface
│   │   ├── calendar-provider.registry.ts       ← NEW — sibling registry to provider.registry.ts
│   │   ├── google-calendar.provider.ts          ← REFACTORED — now implements
│   │   │                                           CalendarProvider; all Google JSON
│   │   │                                           shape access moved inside this file
│   │   └── outlook-calendar.provider.ts         ← NEW — full CalendarProvider impl
│   ├── integrations.service.ts                  ← MODIFY — Outlook OAuth orchestration
│   │                                                + single-active-calendar-provider rule
│   ├── integrations.repository.ts                ← MODIFY — findActiveCalendarIntegration()
│   ├── integrations.controller.ts                 ← MODIFY — new Outlook routes
│   ├── integrations.validator.ts                  ← MODIFY — new Zod schemas
│   ├── integrations.types.ts                       ← MODIFY — CalendarProviderName type
│   └── integrations.routes.ts                       ← MODIFY — register Outlook route group
│
├── services/
│   └── calendar-sync.service.ts                  ← REFACTORED — syncUserCalendar()
│                                                      dispatches via calendar-provider.registry,
│                                                      zero Google-specific code remains
│
├── queues/workers/
│   └── calendar-sync.worker.ts                    ← MODIFY — confirm provider-agnostic
│                                                      (already fan-out-per-user from Day 56;
│                                                      today verifies no Google-only assumptions
│                                                      leaked into the worker itself)
│
├── utils/
│   └── platform-detect.ts                          ← REUSED — zero changes; Outlook's fallback
│                                                       URL scanning uses the exact same regex
│                                                       util already shared with Google
│
└── config/
    └── oauth-providers.config.ts                    ← MODIFY — OUTLOOK_CALENDAR MSAL config block
                                                          (tenant, client ID/secret, redirect URI)

services/api/tests/
├── unit/
│   ├── outlook-calendar-provider.test.ts           ← NEW
│   ├── outlook-datetime-timezone.test.ts            ← NEW (highest-priority test file today)
│   └── calendar-sync-generalized.test.ts            ← NEW — confirms syncUserCalendar()
│                                                        works identically for both providers
│                                                        through the same code path
└── integration/
    └── outlook-calendar.test.ts                      ← NEW (full connect→sync→disconnect,
                                                            provider-switch scenario)

apps/web/src/features/integrations/
├── components/providers/
│   └── OutlookCalendarIntegration.tsx               ← NEW — settings card +
│                                                          provider-switch confirmation dialog
├── hooks/
│   └── useCalendarProviderSwitch.ts                  ← NEW — shared confirm-then-switch logic
│                                                          for BOTH Google and Outlook cards
└── api/
    └── integrations.api.ts                            ← MODIFY — new Outlook endpoints
```

### Dependency Flow (No Circular Deps)

```
calendar-sync.service.ts
  └── calendar-provider.registry.ts
        ├── google-calendar.provider.ts   (refactored, implements CalendarProvider)
        └── outlook-calendar.provider.ts  (new, implements CalendarProvider)
              └── @azure/msal-node        (MSAL — token acquisition only)
              └── utils/platform-detect.ts (shared URL-detection regex, unchanged)

integrations.service.ts
  ├── calendar-provider.registry.ts   (resolves provider for connect/callback/disconnect)
  └── integrations.repository.ts       (findActiveCalendarIntegration, single-provider rule)

queues/workers/calendar-sync.worker.ts
  └── calendar-sync.service.ts (unchanged fan-out-per-user shape from Day 56)
```

---

## 4. Layer 1 — `CalendarProvider` Interface Extraction (Refactor)

### File: `providers/calendar-provider.interface.ts`

**Responsibility:** Define the second provider interface this platform now
has — one purpose-built for calendar discovery/sync rather than outbound
ticket creation. This file contains **only type/interface definitions**, no
implementation logic whatsoever, matching the pattern already established
by `provider.interface.ts` (Day 58).

### Design of `CalendarProviderEvent` — the Normalized Event Shape

This is the single most important type introduced today, because it is the
contract that lets `calendar-sync.service.ts` remain completely ignorant of
which provider produced the data it's processing. Every field is deliberately
**already normalized** by the time it reaches the sync service:

- `id` — the provider's own event identifier (used for building
  `calendarEventId` on the resulting `Meeting` row, exactly as Google's
  event ID was used since Day 56).
- `status` — collapsed to a simple `'confirmed' | 'cancelled'` union,
  hiding whatever richer status vocabulary either provider's raw API might
  expose.
- `summary`, `description`, `location` — plain nullable strings, with any
  provider-specific nesting (Google's `event.summary` vs. Outlook's
  `event.subject`) already resolved by the provider implementation before
  this object is constructed.
- `startTime` — a proper JavaScript `Date` object, **already correctly
  combined from whatever raw datetime + timezone representation the source
  provider used** (Section 14 covers exactly how Outlook's implementation
  guarantees this). The sync service never sees a raw datetime string or a
  separate timezone field — that combination step is provider-internal.
- `isAllDay` — a normalized boolean, since Google and Outlook represent
  all-day events differently at the raw API level (Google via a `date`-only
  field instead of `dateTime`; Outlook via an explicit `isAllDay` boolean)
  but the sync service only ever needs to know the one normalized fact.
- `meetingUrl` — **pre-extracted** by the provider implementation itself,
  not derived later by the sync service. This is a deliberate design choice
  restated from the interface definition: URL location differs
  structurally per provider (Google's `conferenceData.entryPoints`;
  Outlook's `onlineMeeting.joinUrl`), so each provider owns the
  responsibility of producing a single, ready-to-use `meetingUrl` (or
  `null`) using its own knowledge of where that data lives, with a shared
  fallback utility (`platform-detect.ts`) available to both for the
  regex-based description/location scanning case.

### Design of `CalendarSyncResult`

Wraps the returned event list alongside two sync-continuation signals:
`nextSyncToken` (an opaque string the sync service persists and passes back
on the next call — its internal format is entirely provider-defined and
never inspected by the sync service) and `fullResyncRequired` (a boolean
flag a provider sets when its sync token has become invalid — Google's
HTTP 410 case from Day 56, and Outlook's equivalent delta-link-expiry case,
both collapse to this one shared signal so `calendar-sync.service.ts`
handles "start over with a full fetch" identically regardless of why it
became necessary).

### Design of the `CalendarProvider` Interface Itself

Five methods, deliberately minimal: `getAuthorizationUrl`,
`exchangeCodeForTokens`, `refreshAccessToken`, `listEvents`, and
`revokeToken`. Every method signature is provider-agnostic — no Google or
Outlook-specific parameter ever appears at this level. `listEvents` accepts
an optional `syncToken` and returns whatever the provider needs for the
next call inside `CalendarSyncResult.nextSyncToken`, keeping the
"how do I resume where I left off" mechanism entirely opaque to callers.

---

## 5. Layer 2 — Google Calendar Provider Refactor

### File: `google-calendar.provider.ts` (refactored, not rewritten)

**Scope of change today:** Google's existing OAuth and event-listing logic
(built Day 56) is **not reimplemented** — its actual HTTP calls, scopes, and
token-exchange behavior are unchanged. What changes is the **boundary**:
every place `calendar-sync.service.ts` used to reach directly into Google's
raw JSON response now happens instead *inside* this provider file, which
maps the raw response into `CalendarProviderEvent[]` before returning.

### Specific Mapping Responsibilities Moved Into This File

- `event.start?.dateTime` (timed events) or `event.start?.date` (all-day
  events) → combined into a single `startTime: Date`, with `isAllDay` set
  accordingly — previously this branching lived inline in the sync service;
  today it is fully owned by the Google provider.
- `event.conferenceData?.entryPoints` → the existing `extractMeetingUrl()`
  priority logic (native conferenceData first, then description/location
  regex scanning) is called from *inside* `listEvents()` now, producing the
  already-extracted `meetingUrl` field on each `CalendarProviderEvent`,
  rather than being invoked separately by the sync service after receiving
  raw events.
- Google's `nextSyncToken` (a plain opaque string) and the 410-triggered
  full-resync case are mapped into `CalendarSyncResult.nextSyncToken` /
  `fullResyncRequired` respectively.
- `event.status === 'cancelled'` → mapped directly into the normalized
  `status: 'cancelled'` field.

### Why This Refactor Carries Real Risk (and How It's Mitigated)

This is a refactor of **already-working, production-relevant logic** (Day
56's calendar sync has presumably been running against real user calendars
since that day shipped). The risk of a regression here — silently breaking
Google Calendar sync while adding Outlook support — is real and explicitly
guarded against: the full existing Day 56 test suite for Google Calendar
sync must continue passing **unmodified** after this refactor (the tests
assert on `calendar-sync.service.ts`'s externally-observable behavior —
meetings created, dedup respected, cancellations handled — not on Google's
internal JSON shape, so a correct refactor should require zero test
changes). Any test that *does* need modification to keep passing is a signal
the refactor altered observable behavior, not just internal structure, and
must be treated as a red flag requiring investigation before proceeding.

---

## 6. Layer 3 — Outlook Calendar Provider Implementation

### File: `providers/outlook-calendar.provider.ts`

**Responsibility:** The complete `CalendarProvider` implementation for
Microsoft Outlook / Microsoft 365, using Microsoft Graph API for calendar
data and MSAL for authentication. Every Outlook-specific concern — MSAL
token acquisition, Graph's calendarView/delta dual-mode query pattern, the
naive-datetime-plus-timezone combination, and Teams-native meeting-link
extraction — lives here and nowhere else.

### Method-by-Method Design

#### `getAuthorizationUrl(state, userId)`

Builds the Microsoft identity platform v2.0 authorize URL. Requested scopes:
`Calendars.Read` (the minimum read-only calendar access needed — no write
scope is ever requested, mirroring Google Calendar's `calendar.readonly`
minimization principle from Day 56), `offline_access` (Microsoft's
equivalent of Google's `access_type=offline`, required to receive a refresh
token at all), and `openid profile email` (needed to resolve which
Microsoft account was connected, for display in settings). The CSRF `state`
parameter follows the identical generation/storage/one-time-consumption
pattern used by every other OAuth flow on the platform
(`oauth:state:outlook-calendar:{state}` in Redis, 10-minute TTL, bound to
the initiating user — note **user-scoped**, not team-scoped, since calendar
integrations are user-level per the existing `user_integrations` table
design, unlike Jira/Linear/Notion/Slack's team-level integrations).

#### `exchangeCodeForTokens(code)`

Uses `@azure/msal-node`'s `ConfidentialClientApplication.acquireTokenByCode()`
rather than a hand-rolled fetch against Microsoft's token endpoint. This is
a deliberate, justified dependency choice: Microsoft's OAuth token endpoint
behaves differently depending on tenant type (personal Microsoft accounts
vs. Azure AD work/school accounts), and MSAL — Microsoft's own
recommended, actively-maintained library — correctly handles that variance
internally, including token caching semantics and the specific claims
Microsoft expects in the token request. Hand-rolling this would mean
re-implementing tenant-type detection logic that Microsoft's own SDK
already solves correctly. The resulting access token, refresh token, and
expiry are extracted from MSAL's response and returned in the platform's
standard `OAuthTokenResult` shape, keeping every caller outside this file
unaware that MSAL was involved at all.

#### `refreshAccessToken(refreshToken)`

Uses MSAL's `acquireTokenByRefreshToken()`. Returns the same standard
`OAuthTokenResult` shape — this is what plugs directly into the existing
shared `getValidAccessToken()` helper (built Day 60, already proven against
Jira/Google/Linear) with zero changes required to that helper. Outlook is
the **second** provider (after Google) whose token genuinely expires and
needs real refresh — unlike Linear, Notion, and Slack's non-expiring
tokens — making today's work a meaningful second exercise of the refresh
path, not merely a repeat of the "null expiry, no-op" case.

#### `listEvents(params)`

The most involved method in this file, operating in one of two modes:

**Time-range mode** (used for the very first sync, or any full-resync
triggered by an expired delta link): calls Microsoft Graph's
`calendarView` endpoint with `startDateTime`/`endDateTime` query
parameters bounding the fetch window (mirroring Google's `timeMin`/
`timeMax` from Day 56).

**Delta mode** (used for every subsequent incremental sync once a delta
link exists): calls the stored delta URL directly — Microsoft Graph's
incremental-sync mechanism returns either an `@odata.nextLink` (more pages
of the current delta batch remain) or an `@odata.deltaLink` (this delta
batch is complete; the returned URL is what to call *next time* to get
only what's changed since now). This is structurally analogous to Google's
`syncToken` from a semantics standpoint, but exposed as a **complete,
directly-callable URL** rather than an opaque token value — a distinction
called out explicitly because it changes what gets persisted: Outlook's
`nextSyncToken` field in the database literally *is* the full delta URL,
not a short token string, and the implementation must not attempt to
"extract just the token part" the way one might instinctively do coming
from Google's simpler opaque-string model.

Each raw Graph event is mapped into a `CalendarProviderEvent`:

- `event.isCancelled` → `status: 'cancelled'` (Graph's delta responses
  represent deletions as cancelled/removed event entries, structurally
  parallel to Google's `status: 'cancelled'` — both collapse into the same
  normalized field, meaning `calendar-sync.service.ts`'s existing
  cancelled-event handling from Day 56 applies unchanged).
- `event.subject` → `summary`.
- `event.bodyPreview` → `description`.
- `event.location?.displayName` → `location`.
- `event.start` (combined with `event.start.timeZone`) → `startTime` — see
  Section 14 for the full correctness treatment this receives.
- `event.onlineMeeting?.joinUrl` → `meetingUrl`, Priority 1 — see Section
  16 for the full extraction-priority design.

#### `revokeToken(accessToken)`

See Section 18 for the full treatment of why this method's implementation
is fundamentally different — and more limited — than Google's equivalent.

---

## 7. Layer 4 — Calendar Provider Registry

### File: `providers/calendar-provider.registry.ts`

A small, dedicated registry — deliberately **not** merged into the existing
`provider.registry.ts` used for Jira/Linear/Notion/Slack, because it
resolves a different interface type (`CalendarProvider`, not
`IntegrationProvider`) and mixing the two into one lookup table would blur
the very distinction Section 2 argues for. The registry maps
`'GOOGLE_CALENDAR'` and `'OUTLOOK_CALENDAR'` (the existing
`CalendarProvider` enum values already defined in the Day 3 database schema)
to their respective provider instances. `calendar-sync.service.ts` and
`integrations.service.ts` are the only two callers of this registry.

---

## 8. Layer 5 — `calendar-sync.service.ts` Generalization

### The Core Refactor: `syncUserCalendar(userId)`

This function's **externally observable behavior is unchanged** from Day
56 — same lock acquisition (`sync:calendar:lock:{userId}`), same dedup
integration (Day 57's `checkAndClaim`/`confirmClaim`/`releaseClaim`), same
per-event try/catch batch tolerance (one bad event never aborts the whole
sync), same cancelled-event handling, same `nextSyncToken`/`lastSyncedAt`
persistence. What changes is the **first step**: rather than assuming
Google, the function now:

1. Looks up the user's **currently active** calendar integration (of
   either provider) via `findActiveCalendarIntegration(userId)` — a new
   repository method (Section 19) reflecting the single-active-provider
   business rule (Section 17).
2. Resolves the correct provider implementation from
   `calendar-provider.registry.ts` using that integration's `provider`
   field.
3. Calls `getValidAccessToken()` (unchanged — already provider-agnostic
   since Day 60) to obtain a fresh token, dispatching internally to
   whichever provider's `refreshAccessToken()` is appropriate.
4. Calls the resolved provider's `listEvents()` — receiving back an
   already-normalized `CalendarProviderEvent[]`, with no Google- or
   Outlook-specific field ever touched by this function again.
5. Runs the exact same dedup-and-create loop as Day 56, operating purely
   on the normalized shape.

### Why "Zero Google-Specific Code Remains" Is a Testable Claim, Not a Slogan

The plan requires that after today's refactor, a text search for
Google-specific field names (`conferenceData`, `dateTime` accessed as a raw
property, etc.) inside `calendar-sync.service.ts` returns **zero matches**
outside of code comments. This is verified as an explicit code-review
checklist item (Section 30), not left as an informal aspiration — the same
rigor applied to confirming `integrate.worker.ts` required no
provider-specific branching when Linear and Notion were added.

---

## 9. Layer 6 — Integrations Service Orchestration

### File: `integrations.service.ts` (modified)

### Function: `initiateOAuth('OUTLOOK_CALENDAR', userId)`

New today, but deliberately following the **same generic shape** already
used for team-level providers, adapted for the user-scoped calendar case:
generate CSRF state, store in Redis, call the resolved provider's
`getAuthorizationUrl()`, return the redirect URL. The only structural
difference from the Jira/Linear/Notion/Slack version is that this flow is
keyed by `userId`, not `teamId`, matching the existing `user_integrations`
table design already used for Google Calendar since Day 56.

### Function: `handleOAuthCallback('OUTLOOK_CALENDAR', code, state, userId)`

**Before** persisting the new integration, this function enforces the
single-active-calendar-provider rule (full design in Section 17): if the
user already has an active calendar integration for the *other* provider
(Google), that integration is disconnected first — calling its own
`revokeToken()` where applicable and deleting its `UserIntegration` row —
and only then is the new Outlook integration persisted. This ordering
matters: the disconnect-old-then-connect-new sequence must never leave a
window where a user briefly appears to have zero calendar integrations due
to a failure between the two steps, so both operations are wrapped in a
single database transaction.

### Function: `disconnectIntegration('OUTLOOK_CALENDAR', userId)`

Deletes the `UserIntegration` row and clears any related Redis sync-lock
key. Does **not** attempt a Microsoft-side token revocation call (see
Section 18) — this is a deliberate, documented divergence from the
Google/Jira/Linear disconnect pattern, not an oversight.

---

## 10. Layer 7 — HTTP Layer (Controller + Routes)

### File: `integrations.controller.ts` (modified)

- `connectOutlookCalendarController` — calls `initiateOAuth('OUTLOOK_CALENDAR', req.user.id)`, redirects (302).
- `outlookCalendarCallbackController` — extracts `code`/`state`, calls `handleOAuthCallback`, redirects to the frontend settings page with a success/failure indicator (and, if a provider switch occurred, a flag the frontend uses to show a confirmation toast rather than a surprise).
- `disconnectOutlookCalendarController` — calls `disconnectIntegration('OUTLOOK_CALENDAR', req.user.id)`, returns 200.
- `syncOutlookCalendarNowController` — rate-limited (1 per 5 minutes per user, identical policy to Google's manual sync-now endpoint from Day 56), enqueues a `calendar-sync` job for the current user, returns 202-style acknowledgment.

### File: `integrations.routes.ts` (modified)

```
GET    /integrations/outlook-calendar/connect      → requireAuth, controller
GET    /integrations/outlook-calendar/callback     → requireAuth, controller
DELETE /integrations/outlook-calendar              → requireAuth, controller
POST   /integrations/outlook-calendar/sync-now      → requireAuth, rateLimiter(1/5min), controller
```

**Note on authorization level:** unlike the team-level integrations
(Jira/Linear/Notion/Slack, all `ADMIN+`-gated), calendar integrations are
**user-level** — any authenticated user connects *their own* calendar, with
no elevated role required, exactly matching the existing Google Calendar
endpoint authorization from Day 56.

---

## 11. Layer 8 — Validation Layer

### File: `integrations.validator.ts` (modified)

No new request-body validation schema is required for the Outlook endpoints
themselves (the connect/callback/disconnect/sync-now flow carries no
client-supplied structured input beyond the OAuth `code`/`state` query
params, which are validated for presence and format at the controller
level, not via a Zod body schema). What *is* added today is a shared type
guard confirming `CalendarProviderName` values (`'GOOGLE_CALENDAR'` |
`'OUTLOOK_CALENDAR'`) are validated consistently anywhere a provider name
is accepted as a route parameter, reusing the platform's existing
enum-validation convention rather than introducing a new one.

---

## 12. Layer 9 — Worker Integration (`calendar-sync.worker.ts`)

### The Change This File Receives Today

`calendar-sync.worker.ts`'s shape from Day 56 — pull a `userId` off the
queue, call `calendar-sync.service.ts`'s `syncUserCalendar(userId)`, log
the result — requires **no structural change at all**, because the
provider-dispatch logic now lives entirely inside `syncUserCalendar()`
itself (Section 8). Today's work on this file is limited to a verification
pass: confirming no Google-specific assumption (e.g., a log message
hardcoding "Google Calendar" instead of reading the actual connected
provider's name) leaked into the worker during its original Day 56
implementation, and correcting any such cosmetic leak found.

### The Cron Fan-Out (`queues/scheduler.ts`) — Unchanged

The existing hourly cron (Day 56) that queries all users with an active
calendar integration and fans out one job per user requires **zero
modification** — its query already selects on "has an active calendar
integration," not "has a Google Calendar integration specifically," so
Outlook users are automatically included in the existing fan-out the moment
their `UserIntegration` row exists with `syncEnabled: true`, without any
code change to the scheduler itself.

---

## 13. MSAL Authentication Architecture

### Why MSAL Instead of a Hand-Rolled OAuth Client

Every other OAuth integration on this platform (Google, Jira, Linear,
Notion, Slack) uses direct HTTP calls against each provider's token
endpoint, wrapped in the platform's own thin conventions. Outlook is
deliberately the **exception**, using Microsoft's official
`@azure/msal-node` library instead. This is justified, not merely
convenient:

```
REASONS FOR THE MSAL DEPENDENCY:
  ✓ Microsoft's OAuth implementation has genuine tenant-type variance
    (personal Microsoft account vs. Azure AD work/school account) that
    affects token endpoint behavior in ways not fully captured by the
    OAuth 2.0 spec alone — MSAL encodes Microsoft's own guidance for
    handling this correctly.
  ✓ MSAL is Microsoft's actively-maintained, officially recommended
    client for exactly this use case (server-side confidential-client
    OAuth flows against Microsoft Graph) — using anything else invites
    having to independently track and re-implement Microsoft's own
    protocol-level changes over time.
  ✓ The confidential-client application pattern MSAL provides maps
    directly onto how Vocaply's backend already authenticates against
    every other provider (a server-side client with a client secret,
    never a public/native client flow) — no architectural mismatch is
    introduced.

REASONS THIS DOESN'T SET A PRECEDENT FOR EVERY FUTURE PROVIDER:
  Google, Jira, Linear, Notion, and Slack's OAuth flows are all
  well-documented, stable, single-shape flows adequately served by the
  platform's existing thin HTTP-call convention — introducing a dedicated
  SDK dependency for each of them would be unjustified complexity, exactly
  the reasoning already applied when rejecting a full GraphQL client
  library for Linear on Day 61. MSAL is adopted specifically because
  Microsoft's ecosystem genuinely warrants it, not as a default going
  forward.
```

### Where MSAL's `ConfidentialClientApplication` Instance Lives

A single, module-level MSAL client instance is constructed once (using the
platform's registered Azure AD application's client ID, client secret, and
tenant configuration from `oauth-providers.config.ts`) and reused across
every `outlook-calendar.provider.ts` method that needs it — consistent
with the platform-wide convention of avoiding per-request client
construction (the same discipline already applied to the Prisma client
singleton, the Redis connection, and every other shared infrastructure
client on this platform).

### Token Caching Consideration

MSAL ships with its own internal token cache designed primarily for
scenarios where the *same process* repeatedly needs a token for the *same*
identity. Vocaply's architecture deliberately does **not** rely on MSAL's
internal cache as the source of truth for token persistence — the
platform's own `TeamIntegration`/`UserIntegration` tables (AES-256-GCM
encrypted) remain the single source of truth for token storage, exactly as
for every other provider. MSAL is used purely as a **transport/protocol
helper** for the token acquisition and refresh calls themselves; the
resulting tokens are immediately extracted and handed to the platform's own
encryption and persistence layer, never left to live only inside MSAL's
in-memory cache (which would not survive a server restart or be shareable
across horizontally-scaled worker instances — a correctness requirement
already established for every other credential on this platform).

---

## 14. Naive-Datetime + TimeZone Handling (Critical Correctness Section)

### The Bug, Explained Precisely

Microsoft Graph represents an event's start time as **two separate
fields**: `start.dateTime`, a string that looks like an ISO 8601 datetime
but **carries no UTC offset or "Z" suffix** (e.g., `"2026-06-15T09:00:00"`),
and `start.timeZone`, a separate string naming the timezone that datetime
should be interpreted in (e.g., `"Pacific Standard Time"` — note: Windows
timezone naming, not IANA — a second subtlety addressed below). Naively
passing `start.dateTime` alone into a `Date` constructor or date-parsing
library will cause the runtime to interpret it as either UTC or the
server's local timezone, **neither of which is correct**, and the error is
silent: no exception is thrown, a valid-looking `Date` object is produced,
and every downstream consumer (bot scheduling, meeting display, deadline
calculations) proceeds confidently with a wrong value.

### The Two-Part Correct Solution

**Part 1 — Windows timezone name → IANA timezone name mapping.** Graph's
`timeZone` field uses Windows' own timezone naming convention by default
(`"Pacific Standard Time"`, `"India Standard Time"`, etc.), not the IANA
identifiers (`"America/Los_Angeles"`, `"Asia/Kolkata"`) that every other
part of Vocaply's stack uses (the `users.timezone` column, per the Day 3
schema, is explicitly documented as storing IANA strings). `outlook-
calendar.provider.ts` maintains a lookup table translating Graph's Windows
timezone names into their IANA equivalents before any combination step
occurs — this mapping is a bounded, well-documented, effectively-static
dataset (Microsoft publishes and rarely changes this list), making a static
lookup table the correct implementation choice over attempting any dynamic
resolution.

**Part 2 — Correct combination.** Once the IANA timezone name is known, the
naive `dateTime` string is interpreted **as wall-clock time in that
specific timezone**, then converted to a proper UTC-backed `Date` object,
using the platform's existing date-handling library conventions (the same
`date-fns`/timezone-aware utilities already used elsewhere in the codebase,
e.g., for the `date_parser.py`-equivalent relative-date logic in the AI
pipeline and the `addDays`/`subDays` helpers used throughout the backend) —
never a manual offset-arithmetic implementation, which is exactly the kind
of hand-rolled timezone math that reliably introduces daylight-saving-time
edge-case bugs.

### Why This Gets Its Own Section Rather Than a Bullet Point

Every other design decision in this document, if built wrong, produces a
visible failure — an error is thrown, a sync fails, a page doesn't create.
This one does not. A mishandled timezone combination produces a
**successfully synced meeting at the wrong time**, with a bot that either
joins hours early, hours late, or on the wrong day entirely — the single
worst possible failure mode for a product whose entire value proposition is
trustworthy automatic meeting capture. This is why the plan treats it as
the day's highest-priority correctness concern (reflected in the time
allocation in Section 1, where it receives its own dedicated block ahead of
lower-risk work) and why it receives dedicated, exhaustive unit-test
coverage (Section 29) rather than being verified only incidentally through
broader integration tests.

### All-Day Event Handling

All-day events (`isAllDay: true`) carry a `dateTime` value that should be
interpreted as a calendar date, not a precise wall-clock moment — the
combination logic branches explicitly on `isAllDay` to avoid applying
timezone-conversion math to a value that was never meant to represent a
specific instant, mirroring how Google's `event.start?.date` (date-only)
vs. `event.start?.dateTime` (precise) distinction was already handled in
the Day 56 implementation, now made explicit and provider-agnostic within
the normalized `CalendarProviderEvent.isAllDay` field.

---

## 15. Delta Query & Incremental Sync Design

### Why Outlook's Model Differs Structurally From Google's

Google Calendar's incremental sync (Day 56) exposes a compact, opaque
`nextSyncToken` string — the client sends it back as a query parameter
alongside a normal `events.list` call. Microsoft Graph's delta query model
instead returns a **complete, directly-callable URL**
(`@odata.deltaLink` or, mid-page, `@odata.nextLink`) — the client does not
construct a new request with a token parameter; it simply issues a GET
against the URL Graph handed back. This means Outlook's `nextSyncToken`
column value, for the purposes of this integration, **is** that full URL
string, stored and reused verbatim on the next sync call — not parsed,
not decomposed, not treated as an opaque token to be embedded into a
freshly-constructed request the way Google's token is.

### Full-Resync Triggering

Microsoft Graph signals an invalid/expired delta state via a distinct error
response (structurally different from Google's `410 Gone`, but semantically
equivalent — the delta link has become stale, typically after an extended
period without syncing or certain calendar-level changes). The Outlook
provider implementation detects this condition and sets
`CalendarSyncResult.fullResyncRequired = true`, which
`calendar-sync.service.ts` already knows how to handle from the Day 56
Google implementation (clear the stored sync token, fall back to a
time-range-bounded fetch) — this is the second concrete proof point of the
shared `CalendarSyncResult` abstraction paying off: two structurally
different provider-level error conditions (Google's HTTP 410, Outlook's
Graph-specific delta error) collapse into one shared signal the sync
service already handles correctly.

### Page-Following Within a Single Sync Call

Graph's delta responses may span multiple pages within a single logical
sync (`@odata.nextLink` present, meaning "more results exist for this same
delta batch, keep paging before you reach the final `@odata.deltaLink`").
The Outlook provider's `listEvents()` implementation follows all
`@odata.nextLink` pages internally before returning, so that from
`calendar-sync.service.ts`'s perspective, a single `listEvents()` call
always yields the complete result set for that sync attempt — the caller
never needs to know or care that Graph's pagination happened underneath.

---

## 16. Meeting URL Extraction Priority for Outlook

### The Priority Order (Explicit, Documented, Mirrors Google's Structure)

```
PRIORITY 1 — event.onlineMeeting?.joinUrl
  The Teams-native meeting link, populated when the event was created as
  (or includes) a Microsoft Teams meeting. Structurally the direct
  equivalent of Google's event.conferenceData?.entryPoints native-link
  priority from Day 56 — the most reliable, purpose-built signal available.

PRIORITY 2 — Regex scan of event.bodyPreview (description)
  Falls back to the SAME shared PLATFORM_PATTERNS regex utility
  (utils/platform-detect.ts) already built Day 56 and reused unchanged for
  Linear/Notion's unrelated needs — zero new URL-detection code is written
  today. This catches the common real-world case of a Zoom or Google Meet
  link pasted into an Outlook event's body by someone using a
  non-Microsoft conferencing tool.

PRIORITY 3 — Regex scan of event.location?.displayName
  Same shared regex utility, applied to the location field — mirrors
  Google's Priority 3 fallback (event.location) from Day 56 exactly.

NO MATCH — meetingUrl: null
  The event is skipped during the sync loop (same "skipped, not errored"
  behavior already established Day 56 for events with no detectable
  meeting link).
```

### Why Zero New URL-Detection Code Is a Deliberate Success Metric

`platform-detect.ts`'s `PLATFORM_PATTERNS` regex map and its
`detectPlatform()` function were explicitly built Day 56 as
provider-agnostic utilities, shared already between Google Calendar sync
and Day 17's manual "add meeting" flow. Today's Outlook implementation
reusing that exact same utility, unmodified, for its fallback-scanning
logic is further confirmation that the utility was correctly scoped from
the start — a third independent caller with zero required changes is
strong evidence the abstraction boundary was drawn in the right place.

---

## 17. Single-Active-Calendar-Provider Business Rule

### The Rule, Stated Precisely

A given user may have **at most one active calendar integration** at any
time — connecting Outlook while Google Calendar is already active (or vice
versa) **disconnects the previous one first**, rather than allowing both to
coexist. This is a deliberate **product** decision, not merely a technical
convenience: allowing two simultaneously-active calendar integrations would
mean a single meeting could theoretically be detected twice, from two
different calendars, requiring the dedup layer (Day 57) to reason about
cross-provider duplicate detection — solvable, but adding meaningful
complexity for a scenario (one person genuinely needing two different
calendar accounts synced simultaneously) that is not a validated common
need.

### Why This Is Enforced in the Service Layer, Not the Database

The underlying `user_integrations` table's existing unique constraint
(`idx_user_int_user_provider`, from the Day 3 schema) is scoped **per
provider** — a user could technically hold both a `GOOGLE_CALENDAR` row and
an `OUTLOOK_CALENDAR` row simultaneously without violating any database
constraint, if the application layer didn't actively prevent it (for
instance, if a user connects Google, later disconnects it via a path that
doesn't clean up correctly, then connects Outlook — an edge case worth
naming even though today's implementation is designed to prevent it
happening through the intended connect flow). Because enforcing
"exactly one calendar provider, of either type" at the database-constraint
level would require a database-level check spanning two different enum
values in a way standard unique indexes don't express cleanly, this rule is
enforced explicitly in `integrations.service.ts`'s
`handleOAuthCallback()` — the service actively looks up and disconnects any
existing calendar integration (regardless of provider) before persisting
the new one, inside a single transaction, rather than relying on a
constraint to reject the attempt after the fact.

### User-Facing Confirmation, Not a Silent Swap

The frontend surfaces this rule as an explicit confirmation dialog
("Connecting Outlook will disconnect your current Google Calendar
integration — continue?") **before** the OAuth redirect happens, not as a
silent background swap the user discovers later by noticing their Google
sync stopped working. This is a deliberate UX requirement, not an
afterthought: a user who didn't intend to disconnect Google would otherwise
have no warning their meetings would stop syncing from that source.

---

## 18. Token Revocation Limitation & Honest-Disclosure Design

### Why Outlook Cannot Match Google's Revocation Behavior

Google Calendar's disconnect flow (Day 56) calls Google's
`https://oauth2.googleapis.com/revoke` endpoint — a simple, documented,
server-side-callable API that immediately invalidates the specific token
Vocaply held. Microsoft Graph has **no equivalent single-token-revocation
REST endpoint** available to a standard registered application. The
documented alternatives — a browser-redirect-based logout endpoint (not
usable from a server-side disconnect action) or the
`/me/revokeSignInSessions` operation (an Azure AD administrative operation
requiring elevated permissions Vocaply's application does not, and should
not, request) — do not fit the "user clicks disconnect in settings, we
revoke their token server-side" flow every other provider supports.

### The Chosen Response: Honest Documentation, Not a False Success

`revokeToken()` for Outlook performs the operations that genuinely are
within Vocaply's control — deleting the locally-stored encrypted token from
the `UserIntegration` row and ceasing all future API calls using it — and
explicitly does **not** claim to have invalidated the token at Microsoft's
end, because it has not. This is surfaced directly in the settings UI copy
at the point of disconnection: *"Disconnecting stops Vocaply from accessing
your calendar. To fully revoke access, also remove Vocaply from your
Microsoft account's app permissions."* This is a deliberate continuation of
a principle established across this sprint (first named explicitly during
Day 60's Slack work, reaffirmed here): **when a provider's API genuinely
cannot support a capability every other provider offers, the correct
engineering response is transparent disclosure, never a false success
response that implies parity that doesn't exist.**

### Security Posture Implication

Because the underlying access token remains theoretically valid at
Microsoft's side until it naturally expires (Outlook tokens do expire,
unlike Linear/Notion/Slack's — see Section 6's `refreshAccessToken`
discussion), the practical security exposure window after a Vocaply-side
disconnect is bounded by the token's own natural expiry, not indefinite —
this is stated explicitly in internal documentation (though not
necessarily verbatim in user-facing copy) so a future security review of
this integration starts from an accurate understanding rather than having
to rediscover this constraint from Microsoft's own documentation.

---

## 19. Data Model & Metadata Design

No new database migration is required today — the `user_integrations` table
(Day 3 schema) already includes `'OUTLOOK_CALENDAR'` in its
`calendar_provider` enum, and every column Outlook's integration needs
(`accessTokenEnc`, `refreshTokenEnc`, `tokenExpiresAt`, `calendarId`,
`syncEnabled`, `lastSyncedAt`, `nextSyncToken`, `lastError`,
`consecutiveErrors`) already exists, unchanged, from the schema originally
designed to be provider-agnostic from the start.

### Semantic Note on `nextSyncToken` for Outlook Rows

As established in Section 15, this column stores Outlook's **full delta
URL** for rows where `provider = 'OUTLOOK_CALENDAR'`, versus Google's
compact opaque token string for `provider = 'GOOGLE_CALENDAR'` rows — the
column's type (`TEXT`, unbounded) already comfortably accommodates both
without a schema change, and no application code outside
`outlook-calendar.provider.ts` ever needs to know or care about this
difference in stored value shape, since the column is always treated as an
opaque provider-specific continuation token by every caller other than the
provider that wrote it.

### New Repository Method: `findActiveCalendarIntegration(userId)`

Added to `integrations.repository.ts` — a single query returning whichever
`UserIntegration` row (Google or Outlook) is currently active for a given
user, used both by `calendar-sync.service.ts` (Section 8) to resolve which
provider to sync, and by `integrations.service.ts` (Section 17) to enforce
the single-active-provider rule at connect time.

---

## 20. Security Architecture

### OAuth & Token Security

- The CSRF state-token pattern is identical to every other provider on this
  platform, scoped per-user (matching the existing user-level integration
  model) rather than per-team.
- Both the access token and refresh token are AES-256-GCM encrypted at rest
  via the existing `crypto.service.ts` — zero new encryption code is
  written today.
- MSAL's client secret (the platform's own registered Azure AD
  application's secret, not a per-user credential) lives in environment
  configuration exactly like every other provider's client secret, never
  hardcoded, never logged.

### Scope Minimization

Only `Calendars.Read` is requested — Vocaply never requests write access to
a user's Outlook calendar, mirroring Google Calendar's read-only scope
discipline from Day 56 exactly, and this restriction is called out in the
settings UI copy identically to the existing Google Calendar messaging
("Vocaply can see your events but never edits your calendar").

### Refresh Token Never Silently Nulled

Following the exact same defensive persistence discipline already
established for Google Calendar (Day 56): if a token-refresh response from
Microsoft happens to omit a refresh token (which can occur depending on
tenant configuration), the persistence layer merges rather than
blind-overwrites — an existing valid refresh token must never be
accidentally wiped by a response that simply didn't include a new one.

### Naive-Datetime Handling Is Also a Security-Adjacent Concern

While primarily a correctness issue (Section 14), a systematically
mis-timed meeting sync has a security dimension worth naming: a bot joining
a meeting at the wrong time, or failing to join a meeting the user believed
was being recorded, represents an availability/reliability failure with
real trust consequences for a product whose core promise is dependable
automatic capture — this is why the correctness section above is treated
with the same rigor as this document's explicit security sections, not
filed separately as "just a bug to avoid."

### Role-Based Access Control

No role restriction is applied to the Outlook Calendar endpoints beyond
standard authentication — connecting a personal calendar is a user-level
action, not a team-administrative one, exactly matching Google Calendar's
existing authorization model.

---

## 21. Performance Architecture

### Delta Sync as the Primary Cost-Control Mechanism

Exactly as documented for Google Calendar on Day 56, incremental delta
sync is the single biggest performance and API-cost lever for this
feature: a steady-state hourly sync against a calendar with 50 events and
one genuine change since the last sync returns exactly one changed event
via Graph's delta mechanism, not a full 50-event refetch. This matters
proportionally more at scale than it did for a single-provider system,
since Outlook and Google users are now sharing the same fan-out cron and
worker concurrency budget.

### Shared Worker Concurrency, Not a Separate Queue

Outlook sync jobs flow through the **same** `calendar-sync` queue and
worker concurrency setting already established Day 56 — no new queue is
introduced. This is a deliberate continuation of the "one queue per
*category* of work, not per provider" principle already applied
consistently across Jira/Linear/Notion sharing the `integrate` queue.

### MSAL Client Reuse

As detailed in Section 13, the MSAL `ConfidentialClientApplication`
instance is constructed once at module load and reused across every call,
avoiding the overhead (and, more importantly, the correctness risk of
inconsistent internal state) that per-request client construction would
introduce.

---

## 22. Caching Strategy

```
No new Redis cache keys are introduced by this integration.

The existing sync:calendar:lock:{userId} key (Day 56) is REUSED unchanged
— it is scoped by userId, not by provider, correctly reflecting the
single-active-provider rule: a user syncing their (single) active calendar
integration needs exactly one lock regardless of which provider that
integration happens to be.

No caching is applied to:
  - listEvents() results (always live — the entire point of a sync)
  - MSAL token acquisition calls (MSAL's own internal short-lived caching
    is not relied upon as a persistence layer, per Section 13 — every call
    that needs a token goes through the platform's own encrypted storage
    and the shared getValidAccessToken() helper, which has its own
    expiry-aware logic already)
```

---

## 23. Error Handling & Retry Strategy

### Error Classification Table

```
CONDITION                                          RETRYABLE?   HANDLING
──────────────────────────────────────────────────────────────────────────
HTTP transport failure (network, timeout)          YES          Exponential
                                                                 backoff, same
                                                                 policy shape as
                                                                 Google Calendar's
                                                                 sync failure
                                                                 handling from Day 56
Microsoft Graph 5xx                                 YES          Exponential backoff
Microsoft Graph 429 (throttled)                     YES          Backoff honoring
                                                                 Graph's documented
                                                                 Retry-After header
Microsoft Graph 401 (token rejected)                NO           Non-retryable;
                                                                 feeds the existing
                                                                 consecutive-error
                                                                 tracking path
                                                                 (Day 64 centralizes
                                                                 this further)
Delta link expired/invalid                          N/A          NOT an error — treated
                                                                 as fullResyncRequired,
                                                                 handled via the shared
                                                                 CalendarSyncResult
                                                                 signal, exactly as
                                                                 Google's 410 case
A single malformed/unparseable event within an
  otherwise-successful listEvents() response         N/A          The per-event
                                                                 try/catch in
                                                                 calendar-sync.service.ts
                                                                 (unchanged since Day 56)
                                                                 skips that one event
                                                                 and continues the batch
```

### Retry Policy Parameters

No new retry policy is introduced — Outlook sync failures are governed by
the identical calendar-sync retry/backoff configuration already established
for Google Calendar on Day 56, since both providers now flow through the
same generalized `syncUserCalendar()` orchestration and the same
`calendar-sync` queue's job-level retry configuration.

### Consecutive-Error Escalation

Feeds into the same `consecutiveErrors`/`lastError` tracking on the
`UserIntegration` row already used by Google Calendar, to be further
centralized by Day 64's cross-provider health-tracking service.

---

## 24. Observability & Logging

### Structured Log Fields (Every Outlook API Call)

Every outbound call through `outlook-calendar.provider.ts` logs, at
minimum: the Graph operation (`calendarView` vs. `delta`), the user ID
(never the calendar content itself), the HTTP status received, and the
response latency. On every timezone-combination step, if the Windows→IANA
lookup fails to find a mapping for an unrecognized timezone name (a
defensive case — Microsoft's list is stable but not guaranteed unchanging
forever), this is logged as a distinct structured warning with the raw,
unrecognized timezone string included, since this is exactly the kind of
signal that would otherwise surface only as a silently-wrong meeting time
reported by a confused customer.

### What Is Never Logged

The raw access/refresh tokens, MSAL's internal client-secret configuration,
and the full raw event body beyond what's needed for a specific
troubleshooting log line (meeting title/date context, never full body/
attendee content) — consistent with the platform-wide PII discipline.

### Metrics

New counters: `calendar.outlook.sync_success`, `calendar.outlook.sync_failure`
(tagged by category), `calendar.outlook.full_resync_triggered`,
`calendar.outlook.timezone_mapping_miss` (a metric that should, in a
correctly-operating system, remain at zero — any non-zero value here is
treated as a signal warranting investigation, not routine noise) — feeding
the same Grafana dashboard already tracking Google Calendar's equivalent
counters from Day 56.

---

## 25. API Endpoints — Full Specification

### `GET /api/v1/integrations/outlook-calendar/connect`

**Auth:** JWT required | **Role:** any authenticated user | **Response:**
302 redirect to Microsoft's OAuth consent screen.

### `GET /api/v1/integrations/outlook-calendar/callback`

**Auth:** JWT required

**Query parameters:** `code`, `state` (CSRF token, verified and consumed).

**Success response:** 302 redirect to the frontend integrations settings
page, including a flag indicating whether an existing Google Calendar
integration was disconnected as part of this connection (used to trigger a
confirmation toast rather than a silent change).

**Error responses:**
- `400` → missing or invalid `code`/`state`
- `409` → CSRF state token expired or already consumed

### `DELETE /api/v1/integrations/outlook-calendar`

**Auth:** JWT required

**Response:** 200 confirmation, including the documented revocation-
limitation messaging (Section 18) surfaced in the response body for the
frontend to display, not merely hidden in backend logs.

### `POST /api/v1/integrations/outlook-calendar/sync-now`

**Auth:** JWT required | **Rate limit:** 1 request per 5 minutes per user
(identical policy to Google Calendar's equivalent endpoint)

**Success response:** 202-style acknowledgment — sync is enqueued
asynchronously, not performed inline within the request.

**Error responses:**
- `429` → rate limit exceeded
- `422` → no active Outlook Calendar integration to sync

### HTTP Status Code Reference (This Module)

```
200  OK                → successful DELETE
202  Accepted           → sync-now enqueued
302  Found              → OAuth connect/callback redirects
400  Bad Request        → malformed OAuth callback params
401  Unauthorized        → missing/invalid JWT
409  Conflict             → CSRF state invalid/expired/reused
422  Unprocessable        → no active integration to act on
429  Too Many Requests     → sync-now rate limit exceeded
502  Bad Gateway            → Microsoft Graph unreachable or malformed response
```

---

## 26. Middleware Chain Design

```
GET    /integrations/outlook-calendar/connect
  chain: requireAuth → controller

GET    /integrations/outlook-calendar/callback
  chain: requireAuth → controller

DELETE /integrations/outlook-calendar
  chain: requireAuth → controller

POST   /integrations/outlook-calendar/sync-now
  chain: requireAuth → rateLimiter(1 per 5 minutes, keyed by userId) → controller
```

No `injectTenant` or `requireRole` middleware is applied to this route
group — consistent with the user-level (not team-level) authorization model
already established for Google Calendar since Day 56, and distinct from
the `ADMIN+`-gated team integrations (Jira/Linear/Notion/Slack).

---

## 27. Frontend Integration Plan

### Component: `OutlookCalendarIntegration.tsx`

A settings-page card structurally parallel to `GoogleCalendarIntegration.tsx`
(Day 56): connect/disconnect toggle, last-synced timestamp display, a
manual "Sync now" button (respecting the 5-minute rate limit with a
disabled/cooldown state), and — the one genuinely new piece of UI this
day introduces — a **provider-switch confirmation dialog** shown before
the OAuth redirect fires if the user already has the *other* calendar
provider connected.

### Hook: `useCalendarProviderSwitch.ts`

A small, shared hook (deliberately built to be used by **both** the Google
and Outlook integration cards, not duplicated per card) that checks whether
the *other* calendar provider is currently active before initiating a
connect flow, and if so, surfaces the confirmation dialog with the correct
provider names interpolated ("Connecting Outlook will disconnect your
current Google Calendar integration") before proceeding. This hook is
introduced today but is written to be provider-symmetric from the start —
`GoogleCalendarIntegration.tsx` is updated to use it as well, so the
confirmation behavior is consistent regardless of which direction the
switch happens.

### Settings Page Registration

`OutlookCalendarIntegration.tsx` is added alongside the existing
`GoogleCalendarIntegration.tsx` card on the integrations settings page —
both cards visually indicate which one (if either) is currently active,
since only one can be at a time per Section 17's rule.

---

## 28. Types & Interfaces

### File: `providers/calendar-provider.interface.ts` (new types, detailed in Section 4)

`CalendarProviderEvent`, `CalendarSyncResult`, `CalendarProvider` — the
three core new types this day introduces, fully specified in Section 4.

### File: `integrations.types.ts` (additions)

- **`CalendarProviderName`** — `'GOOGLE_CALENDAR' | 'OUTLOOK_CALENDAR'`, reused/confirmed as the existing enum from the Day 3 schema, now also used as the calendar-provider-registry's lookup key type.
- **`OAuthTokenResult`** — the shared shape (`accessToken`, `refreshToken`, `expiresAt`) already used across every provider's token-exchange/refresh methods since Day 58/60, confirmed here to be equally sufficient for MSAL-sourced tokens with zero modification — a third piece of evidence (after Linear's GraphQL tokens and Notion's Basic-Auth-exchanged tokens) that this shared type was correctly generalized from the start.

No changes are required to `IntegrationProvider`, `CreateExternalItemInput`,
or `ExternalItemResult` — this entire day's type-level work is scoped to
the new, separate `CalendarProvider` family, confirming the two-interface
design decision from Section 2 holds cleanly in practice.

---

## 29. Testing Plan

### Unit Tests

#### `outlook-datetime-timezone.test.ts` (highest priority — written first, reviewed most carefully)

- A known Windows timezone name (`"Pacific Standard Time"`) correctly maps
  to its IANA equivalent (`"America/Los_Angeles"`).
- A naive `dateTime` string combined with a known timezone produces a
  `Date` object whose UTC value matches an independently-computed expected
  value, for at least three distinct timezones spanning different UTC
  offsets, including at least one with a fractional-hour offset (e.g.,
  India Standard Time, UTC+5:30) to catch any implementation that
  incorrectly assumes whole-hour offsets only.
- A date near a daylight-saving-time transition boundary is correctly
  combined, verifying the timezone-aware conversion library (not manual
  offset arithmetic) is genuinely being used.
- An all-day event (`isAllDay: true`) is combined without applying
  precise-instant timezone conversion, producing a calendar-date-correct
  result.
- An unrecognized/unmapped Windows timezone name triggers the documented
  structured warning log and does not silently produce a wrong-but-valid
  `Date` — the test asserts on the logged warning, not merely the absence
  of a thrown exception.

#### `outlook-calendar-provider.test.ts`

- `getAuthorizationUrl()` includes the correct scopes (`Calendars.Read`,
  `offline_access`, `openid profile email`) and no write-capable scope.
- `exchangeCodeForTokens()` and `refreshAccessToken()` correctly extract
  and return the platform's standard `OAuthTokenResult` shape from a mocked
  MSAL response.
- `listEvents()` in time-range mode correctly maps a mocked
  `calendarView` response into `CalendarProviderEvent[]`.
- `listEvents()` in delta mode correctly follows a mocked multi-page
  `@odata.nextLink` sequence before returning, and correctly extracts the
  final `@odata.deltaLink` into `nextSyncToken`.
- A mocked delta-expiry error response results in
  `fullResyncRequired: true`.
- `event.onlineMeeting?.joinUrl` takes priority over a Zoom link
  incidentally present in `bodyPreview`, confirming the documented Priority
  1/2/3 order from Section 16.
- An event with no detectable meeting link anywhere results in
  `meetingUrl: null`, not a thrown error.

#### `calendar-sync-generalized.test.ts`

- `syncUserCalendar(userId)` produces functionally identical orchestration
  behavior (lock acquisition, dedup calls, batch tolerance, cancellation
  handling) regardless of whether the resolved integration is Google or
  Outlook — verified by running the same test scenario twice with mocked
  providers of each type and asserting on the sync service's externally
  observable calls (to the dedup service, to `meetingsService`, to the
  lock), not on any provider-specific detail.
- A code-level assertion (via a static text-search step in the test
  runner, or an equivalent lint rule) confirms no Google- or
  Outlook-specific field name appears anywhere inside
  `calendar-sync.service.ts` outside of comments.

### Integration Tests

#### `outlook-calendar.test.ts`

- Full OAuth callback flow: valid code + valid state → `UserIntegration`
  row created with `provider: 'OUTLOOK_CALENDAR'`, encrypted tokens, and a
  real (non-null) `tokenExpiresAt`.
- **Provider-switch scenario**: a user with an existing active Google
  Calendar integration connects Outlook → assert the Google
  `UserIntegration` row is deleted (and its revocation call was attempted)
  within the same transaction that creates the new Outlook row, with no
  window where the user has zero active integrations on a successful path.
- A first-time sync (no `nextSyncToken` present) uses time-range mode and
  successfully creates meetings for detected events, using a fully mocked
  Graph API (never a real network call in CI).
- A second sync (delta token present) uses delta mode and correctly
  processes a mocked incremental changeset, including a mocked cancelled
  event correctly triggering the existing `handleCancelledCalendarEvent`
  path unchanged from Day 56.
- Disconnect deletes the local row; the response body includes the
  documented revocation-limitation messaging.

### Manual Smoke Test (Required Before Sign-Off)

A hand-performed connect → sync → verify-meeting-times-are-correct →
disconnect round trip against a real Microsoft 365 developer tenant, with
particular attention paid to comparing the synced meeting's displayed time
in Vocaply against the same event's displayed time in Outlook itself — the
single most important manual verification step this sprint, given Section
14's correctness stakes.

---

## 30. End-of-Day Checklist

### Architectural Refactor

- [ ] `CalendarProvider` interface defined with zero Google/Outlook-specific
      types leaking into it
- [ ] `google-calendar.provider.ts` refactored to implement
      `CalendarProvider`; all Google JSON shape access moved inside this file
- [ ] `calendar-sync.service.ts` contains zero Google-specific field
      references outside comments — verified via explicit text-search check
- [ ] The full pre-existing Day 56 Google Calendar test suite passes
      unmodified after the refactor

### Outlook Provider Implementation

- [ ] MSAL `ConfidentialClientApplication` instantiated once at module
      load, reused across all calls
- [ ] `getAuthorizationUrl()` requests only `Calendars.Read`,
      `offline_access`, `openid profile email` — no write scope
- [ ] `listEvents()` correctly operates in both time-range and delta modes
- [ ] Delta link (full URL, not a bare token) persisted and reused correctly
- [ ] Multi-page `@odata.nextLink` sequences fully followed before returning

### Timezone Correctness (Highest Priority)

- [ ] Windows→IANA timezone mapping table implemented and covers all
      commonly-encountered Graph timezone names
- [ ] Naive datetime + timezone correctly combined into UTC-backed `Date`
      objects using timezone-aware library functions, never manual offset math
- [ ] Fractional-hour-offset timezone (e.g., India Standard Time) verified
      correct in a dedicated test
- [ ] DST-transition-boundary date verified correct in a dedicated test
- [ ] All-day events correctly bypass precise-instant conversion
- [ ] Unrecognized timezone names produce a structured warning log, never
      a silently-wrong result

### Business Rules

- [ ] Connecting Outlook while Google is active disconnects Google first,
      inside a single transaction, with no zero-integration window on success
- [ ] Frontend shows an explicit confirmation dialog before the provider
      switch, never a silent swap
- [ ] `findActiveCalendarIntegration()` correctly returns at most one row
      per user

### Reliability

- [ ] Transport failures and Graph 5xx/429 retry with the existing
      calendar-sync backoff policy
- [ ] Delta-expiry is treated as `fullResyncRequired`, never a hard failure
- [ ] A single malformed event within a batch doesn't abort the whole sync

### Security

- [ ] Access and refresh tokens AES-256-GCM encrypted at rest
- [ ] Refresh token never overwritten with null on a response that omits it
- [ ] `revokeToken()`'s documented limitation is accurately reflected in
      both backend behavior and frontend copy — no false claim of full
      Microsoft-side revocation

### Frontend

- [ ] `OutlookCalendarIntegration.tsx` renders connect/disconnect/sync-now
      states correctly
- [ ] `useCalendarProviderSwitch` is used symmetrically by both the Google
      and Outlook cards, not duplicated

### Observability

- [ ] `calendar.outlook.timezone_mapping_miss` metric wired and confirmed
      to increment correctly in a forced-unrecognized-timezone test
- [ ] Structured logs present for every Graph call, never including raw
      tokens or full event bodies

### Sign-Off

- [ ] All unit and integration tests pass in CI with zero real network
      calls to `graph.microsoft.com` or `login.microsoftonline.com`
- [ ] Manual E2E performed against a real Microsoft 365 dev tenant, with
      explicit side-by-side verification that synced meeting times match
      Outlook's own displayed times exactly

---

## 31. Risks & Edge Cases

```
RISK                                              MITIGATION BUILT TODAY
──────────────────────────────────────────────────────────────────────────
Naive datetime interpreted in the wrong timezone,
  silently shifting every synced meeting's time     Explicit Windows→IANA
                                                    mapping + timezone-aware
                                                    combination library,
                                                    exhaustively unit-tested
                                                    including DST and
                                                    fractional-offset cases

Outlook's nextSyncToken (a full URL) mistakenly
  parsed/truncated as if it were a short opaque
  token like Google's                                Explicitly documented as
                                                    a full-URL value; stored
                                                    and reused verbatim,
                                                    never decomposed

Refactoring calendar-sync.service.ts silently
  breaks existing Google Calendar sync behavior      Pre-existing Day 56 test
                                                    suite required to pass
                                                    unmodified; any test
                                                    needing a change is
                                                    treated as a regression
                                                    signal, not a pass

User ends up with zero active calendar
  integrations mid-provider-switch due to a
  failure between disconnect-old and connect-new      Both operations wrapped
                                                    in a single database
                                                    transaction

Outlook token revocation gives a false sense of
  full security parity with Google                    Explicit, honest
                                                    limitation documented in
                                                    both backend response
                                                    and frontend copy

Delta link expires after a long period of
  disabled sync, and the resulting error is
  mishandled as a hard failure instead of a
  full-resync trigger                                 Explicitly mapped to the
                                                    shared fullResyncRequired
                                                    signal, tested directly

Graph API returns an unrecognized/new Windows
  timezone name not present in the static mapping     Structured warning
  table                                              logged with the raw
                                                    value, feeding a
                                                    dedicated metric rather
                                                    than failing silently
```

---

*Document: DAY-63-PLAN-001 | Vocaply | Day 63: Outlook Calendar Sync (Second Calendar Provider)*
*Full Scalable Industry-Level Build Plan | Principal Engineer Edition*
*CalendarProvider interface extraction · MSAL authentication · Timezone correctness*
*Security-first · Performance-optimized · Production-grade · Planning Document — No Code*
