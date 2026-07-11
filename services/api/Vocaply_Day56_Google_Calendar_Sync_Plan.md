# Vocaply — Day 56: Google Calendar Sync
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-56-PLAN-001 | Version 1.0 | Phase 5 — Integrations | Planning Only — No Code

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Architecture Philosophy](#2-architecture-philosophy)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Dependency Flow & Layering](#4-dependency-flow--layering)
5. [Data Model — What Already Exists vs. What's Added](#5-data-model--what-already-exists-vs-whats-added)
6. [Layer 1 — Google OAuth & Calendar API Provider](#6-layer-1--google-oauth--calendar-api-provider)
7. [Layer 2 — Platform Detection & URL Extraction Utility](#7-layer-2--platform-detection--url-extraction-utility)
8. [Layer 3 — Calendar Sync Service (Core Business Logic)](#8-layer-3--calendar-sync-service-core-business-logic)
9. [Layer 4 — Calendar Sync Worker & Scheduler](#9-layer-4--calendar-sync-worker--scheduler)
10. [Layer 5 — HTTP Layer (Controller, Routes, Validators)](#10-layer-5--http-layer-controller-routes-validators)
11. [Layer 6 — Token Lifecycle Management](#11-layer-6--token-lifecycle-management)
12. [Frontend Deliverables](#12-frontend-deliverables)
13. [State & Lifecycle Design](#13-state--lifecycle-design)
14. [Deduplication Integration (Cross-Reference to Day 57)](#14-deduplication-integration-cross-reference-to-day-57)
15. [Cancellation & Deletion Edge Cases](#15-cancellation--deletion-edge-cases)
16. [Security Architecture](#16-security-architecture)
17. [Performance & Scalability Architecture](#17-performance--scalability-architecture)
18. [Reliability & Failure Handling](#18-reliability--failure-handling)
19. [Observability & Monitoring](#19-observability--monitoring)
20. [Redis Key Space Additions](#20-redis-key-space-additions)
21. [API Endpoint Specification](#21-api-endpoint-specification)
22. [Error Taxonomy](#22-error-taxonomy)
23. [Hour-by-Hour Execution Plan](#23-hour-by-hour-execution-plan)
24. [Testing & Verification Plan](#24-testing--verification-plan)
25. [End-of-Day Checklist](#25-end-of-day-checklist)
26. [Risks & Edge Cases Register](#26-risks--edge-cases-register)

---

## 1. Day Overview & Goals

### What Gets Built Today

Day 56 turns Vocaply from a system where meetings must be **manually added** into
a system where meetings **appear automatically** the moment a user connects their
Google Calendar. This is the first fully-automated ingestion pipeline in the
product and the first day the codebase talks to an external OAuth provider on a
recurring, unattended, cron-driven basis rather than a one-shot user-initiated
action.

```
TODAY BUILDS:
  ✅ Google OAuth 2.0 connect/callback/disconnect flow (offline access, refresh tokens)
  ✅ Google Calendar API client (list events, incremental sync, calendar list)
  ✅ Platform + meeting-URL detection utility (shared with manual bot-add)
  ✅ calendar-sync.service.ts — full sync orchestration logic
  ✅ calendar-sync.worker.ts + hourly fan-out cron scheduler
  ✅ Token encryption/decryption wiring for a NEW provider type (user-level)
  ✅ Proactive token refresh (30-min-before-expiry pattern)
  ✅ Calendar event cancellation → meeting/bot cancellation cascade
  ✅ 5 new REST endpoints (connect, callback, disconnect, sync-now, events-preview)
  ✅ Frontend: GoogleCalendarIntegration card + CalendarEventsPreview component

DOWNSTREAM IMPACT:
  Day 57 — Bot deduplication is hardened specifically BECAUSE this day's cron
           fan-out creates the first realistic concurrent-claim scenario
  Day 63 — Outlook Calendar reuses this day's calendar-sync.service.ts shape,
           swapping only the provider implementation
  Day 64 — Token refresh cron (proactive rotation across ALL providers) treats
           today's UserIntegration rows as one of its two managed tables
  Phase 6 onboarding (Day 44/20 scaffold) — "Connect Calendar" step goes from
           a scaffold redirect to a fully working OAuth flow

DO NOT SKIP OR RUSH:
  This is the first background job that runs unattended, at scale, against a
  third-party API with its own rate limits, quota, and failure modes — get the
  lock, retry, and incremental-sync logic wrong today and it either silently
  drops meetings (bad) or hammers Google's API and gets Vocaply's OAuth client
  throttled/suspended (worse, affects every customer at once).
```

### 8-Hour Time Allocation

```
9:00 AM  – 10:00 AM  → google-calendar.provider.ts (OAuth + Calendar API client)
10:00 AM – 10:45 AM  → platform-detect.ts (shared util, extracted + hardened)
10:45 AM – 12:00 PM  → calendar-sync.service.ts (core orchestration logic)
12:00 PM – 1:00 PM   → Lunch break
1:00 PM  – 1:45 PM   → calendar-sync.worker.ts + scheduler.ts cron fan-out
1:45 PM  – 2:30 PM   → Cancellation handling + token lifecycle integration
2:30 PM  – 3:15 PM   → calendar.controller.ts + routes + validators
3:15 PM  – 4:00 PM   → Frontend: GoogleCalendarIntegration + events preview
4:00 PM  – 4:45 PM   → Redis locking, dedup wiring, error handling pass
4:45 PM  – 5:30 PM   → Postman + manual OAuth flow testing (real Google account)
5:30 PM  – 6:00 PM   → Checklist review + sign-off
```

---

## 2. Architecture Philosophy

### Five Guiding Principles for Today's Build

```
PRINCIPLE 1 — Provider Isolation
  Nothing outside google-calendar.provider.ts knows Google's request/response
  shapes, field names, or error codes. If Google changes their API tomorrow,
  exactly one file changes.

PRINCIPLE 2 — Idempotent, Resumable Sync
  A sync run that crashes halfway through must be safe to simply run again.
  No sync run should ever assume it is the only one that has ever touched
  this calendar. This is why locking (§17) and per-event try/catch (§8) both
  exist — they solve different halves of the same idempotency requirement.

PRINCIPLE 3 — Delta-First, Full-Scan-as-Fallback
  Default to the cheapest possible operation (incremental sync token) and
  only fall back to an expensive operation (full 7-day fetch) when Google
  itself signals the incremental path is no longer valid (410 Gone). Never
  the other way around.

PRINCIPLE 4 — A Slow or Broken User Never Blocks Another User
  The fan-out cron pattern (one job per user, not one mega-job) is a direct
  application of the Day 18 "queues separated by failure domain" rule to a
  new context: user-level failure domains, not just queue-type failure
  domains.

PRINCIPLE 5 — Every External Side Effect Is Reversible
  Connecting is not a one-way door: disconnect must leave Google's systems
  exactly as if Vocaply had never been authorized (token revoked), not merely
  stop Vocaply from reading further.
```

---

## 3. File Structure to Create

```
services/api/src/
│
├── modules/integrations/
│   ├── integrations.controller.ts          ← MODIFY: add calendar-specific handlers
│   ├── integrations.service.ts             ← MODIFY: OAuth state issuance/consumption
│   ├── integrations.repository.ts          ← MODIFY: UserIntegration CRUD additions
│   ├── integrations.validator.ts           ← MODIFY: calendar query/body schemas
│   ├── integrations.types.ts               ← MODIFY: CalendarSyncResult, SyncOptions
│   ├── integrations.routes.ts              ← MODIFY: register 5 new routes
│   └── providers/
│       └── google-calendar.provider.ts     ← NEW: OAuth + Calendar API client
│
├── services/
│   ├── calendar-sync.service.ts            ← REPLACE SCAFFOLD (was stubbed Day 17)
│   ├── crypto.service.ts                   ← REUSED — no changes
│   └── token-refresh.service.ts            ← NEW (shared, seeded today, extended Day 64)
│
├── queues/
│   ├── workers/
│   │   └── calendar-sync.worker.ts         ← REPLACE SCAFFOLD (was stubbed Day 17/18)
│   ├── jobs/
│   │   └── calendar-sync.job.ts            ← NEW: job payload contract
│   └── scheduler.ts                        ← MODIFY: add hourly fan-out cron
│
├── utils/
│   └── platform-detect.ts                  ← NEW: extracted shared util
│
├── middleware/
│   └── (none new — reuses requireAuth, injectTenant, rate-limit)
│
└── config/
    └── oauth-providers.config.ts           ← NEW: centralizes Google OAuth constants

apps/web/src/features/integrations/
├── components/
│   ├── providers/
│   │   └── GoogleCalendarIntegration.tsx   ← NEW
│   ├── CalendarEventsPreview.tsx           ← NEW
│   └── IntegrationCard.tsx                 ← MODIFY: generic connect/disconnect shell
├── hooks/
│   ├── useCalendarEvents.ts                ← NEW
│   ├── useConnectGoogleCalendar.ts         ← NEW
│   └── useDisconnectIntegration.ts         ← MODIFY: generalize for any provider
└── api/
    └── integrations.api.ts                 ← MODIFY: 5 new endpoint calls
```

### Dependency Flow (No Circular Deps)

```
integrations.routes.ts
  └── integrations.controller.ts
        └── integrations.service.ts
              ├── google-calendar.provider.ts   (OAuth + Calendar REST calls)
              ├── integrations.repository.ts    (UserIntegration persistence)
              ├── crypto.service.ts             (token encrypt/decrypt)
              └── redis (OAuth state CSRF tokens)

calendar-sync.worker.ts
  └── calendar-sync.service.ts
        ├── integrations.repository.ts     (load/update UserIntegration)
        ├── google-calendar.provider.ts    (listEvents)
        ├── token-refresh.service.ts       (getValidAccessToken)
        ├── platform-detect.ts             (extractMeetingUrl, detectPlatform)
        ├── dedup.service.ts               (Day 57 — checkAndClaim)
        ├── meetings.service.ts            (createMeetingFromCalendar — reuses Day 17)
        ├── recall.service.ts              (removeBot — cancellation path)
        └── redis (per-user sync lock)

scheduler.ts
  └── calendar-sync queue (BullMQ) → calendar-sync.worker.ts (above)
```

---

## 4. Dependency Flow & Layering

Today's code strictly follows the Controller → Service → Repository pattern
already proven across Teams (Day 16), Meetings (Day 17), and Commitments
(Day 19), with one addition specific to integrations work: a **Provider layer**
sits beside the Repository layer, playing the same role `recall.service.ts`
played in Day 17 — an isolated adapter for one external system.

```
HTTP Request → Controller (req/res only)
                  → Service (business logic, orchestration)
                        → Provider (Google-specific HTTP calls)
                        → Repository (Prisma queries only)
                        → crypto.service (encrypt/decrypt)
                        → redis (CSRF state, locks, dedup)

Cron Trigger  → Scheduler (fan-out, one job per user)
                  → Worker (job lifecycle: pull, execute, log, ack)
                        → Service (same core logic as HTTP-triggered "sync now")
```

**Design rule enforced today:** the HTTP-triggered `POST /sync-now` endpoint and
the cron-triggered worker call the **exact same** `calendarSyncService.syncUserCalendar(userId)`
function — there is no parallel "manual sync" code path. This guarantees the
two trigger sources can never drift in behavior, and is precisely why the
per-user Redis lock (§17) is essential: it's the only thing preventing a user
who clicks "Sync Now" from racing the hourly cron for the exact same user.

---

## 5. Data Model — What Already Exists vs. What's Added

### Already Exists (Day 3 schema, DB-SCHEMA-001 doc) — No Migration Needed Today

```sql
-- user_integrations table (already defined, Day 3/DB schema doc)
CREATE TABLE user_integrations (
  id                  VARCHAR(36)     PRIMARY KEY,
  user_id             VARCHAR(36)     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            calendar_provider NOT NULL,   -- 'GOOGLE_CALENDAR' | 'OUTLOOK_CALENDAR'
  access_token_enc    TEXT            NOT NULL,
  refresh_token_enc   TEXT,
  token_expires_at    TIMESTAMPTZ,
  calendar_id         VARCHAR(500),                 -- "primary" or specific calendar ID
  sync_enabled        BOOLEAN         NOT NULL DEFAULT TRUE,
  last_synced_at      TIMESTAMPTZ,
  next_sync_token     TEXT,                         -- Google incremental sync token
  last_error          TEXT,
  consecutive_errors  SMALLINT        NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_user_int_user_provider ON user_integrations (user_id, provider);
CREATE INDEX idx_user_int_sync_due ON user_integrations (last_synced_at) WHERE sync_enabled = TRUE;
```

Every field this day's implementation needs (`nextSyncToken`, `calendarId`,
`consecutiveErrors`, `lastError`) was **deliberately pre-provisioned** in the Day 3
schema specifically for this day — confirming the schema before writing code
avoids an unplanned migration mid-sprint.

### Meetings Table Fields Already Provisioned for Calendar-Sourced Meetings

```sql
-- meetings table, relevant subset (already exists)
calendar_event_id       VARCHAR(500)   -- Google event.id, used for cancellation lookup
calendar_source_user_id VARCHAR(36)    -- REFERENCES users(id) — audit trail (§3.6, prior doc)
platform_meeting_id     VARCHAR(255)   -- dedup key component
```

`idx_meetings_calendar_event (team_id, calendar_event_id)` and
`idx_meetings_platform_dedup (team_id, platform_meeting_id) WHERE platform_meeting_id IS NOT NULL`
are both pre-existing indexes this day's queries rely on — no new index
migration required.

### Net Result

**Zero database migrations today.** This is a deliberate validation of the Day 3
schema design — if a migration *were* needed here, it would indicate the
original schema under-planned for this integration, which is itself worth
flagging. Confirming "no migration needed" is an explicit item in today's
checklist (§25), not an assumption.

---

## 6. Layer 1 — Google OAuth & Calendar API Provider

### File: `google-calendar.provider.ts`

**Responsibility:** the single point of contact with Google's OAuth 2.0 and
Calendar v3 REST APIs. Everything here is stateless — no caching, no DB
access, no business rules. Pure request/response translation plus typed error
mapping.

### Design Decisions

**Dedicated Axios instance**, separate from the main internal API client and
from the Day 17 Recall.ai client — different base URL
(`https://oauth2.googleapis.com` for token operations,
`https://www.googleapis.com/calendar/v3` for data operations), different auth
scheme (Bearer token obtained via OAuth, not a static API key), different
timeout profile. Timeout: 10 seconds (Google's API is generally fast; a long
timeout here would let one slow user's sync eat into the worker's per-job
budget). Retry: 3 attempts, exponential backoff, only on 429/5xx — identical
policy shape to `recall.service.ts` (Day 17), reusing the same retry-wrapper
utility rather than reimplementing backoff math a second time.

**Never expose Google's response shape** beyond this file. Internal types
(`GoogleEventsResponse`, `GoogleCalendarEvent`) are defined here and are the
only shape `calendar-sync.service.ts` is allowed to import — if Google
restructures their event object tomorrow, only this file's mapping logic
changes.

### Functions to Implement

#### `getAuthorizationUrl(state: string): string`
Builds `https://accounts.google.com/o/oauth2/v2/auth` with:
- `client_id`, `redirect_uri` from `oauth-providers.config.ts`
- `response_type=code`
- `scope=https://www.googleapis.com/auth/calendar.readonly`
- `access_type=offline` (required to receive a refresh token at all)
- `prompt=consent` (required to receive a refresh token on *every* connect,
  including re-connects by a user who granted access before — without this,
  Google silently omits `refresh_token` from the callback response)
- `state` (CSRF token, generated and stored by the calling service — this
  function only assembles the URL, never generates the token itself, keeping
  it a pure function)

#### `exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse>`
POST `https://oauth2.googleapis.com/token` with `grant_type=authorization_code`.
Response: `{ access_token, refresh_token?, expires_in, scope, token_type }`.

Failure handling: Google returns `400` with a JSON error body
(`{ error: 'invalid_grant', error_description: '...' }`) for an expired or
already-used authorization code. This is mapped to
`IntegrationError('GOOGLE_CALENDAR', 'AUTH_CODE_INVALID')` — a 502-class error
from Vocaply's perspective (upstream problem), never surfaced with Google's raw
error text to the end user.

#### `refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }>`
POST with `grant_type=refresh_token`. **Critical correctness note, called out
explicitly for code review:** the response from this call typically does
**not** include a new `refresh_token` — the original refresh token remains
valid and must be preserved unchanged by the caller (`token-refresh.service.ts`,
§11). This function's return type deliberately excludes `refreshToken` to make
it structurally impossible for a caller to accidentally overwrite the stored
refresh token with `undefined`.

Failure handling: a `400 invalid_grant` here means the refresh token itself
has been revoked (user revoked access directly in their Google Account
settings, outside of Vocaply) — this is **not retryable** and must propagate a
distinct error (`GOOGLE_REFRESH_TOKEN_REVOKED`) so the calling service can mark
the integration `syncEnabled = false` and notify the user to reconnect, rather
than retrying a call that will never succeed.

#### `listEvents(params): Promise<GoogleEventsResponse>`
GET `/calendars/{calendarId}/events`. Two mutually exclusive calling modes:

```
MODE A — Incremental (syncToken present):
  Query params: { syncToken }
  Do NOT include timeMin/timeMax — Google's API returns 400 if both are
  present alongside a syncToken. This is enforced by the function's own
  parameter validation, not left to the caller to remember.

MODE B — Full window (no syncToken, or syncToken invalidated):
  Query params: { timeMin, timeMax, singleEvents: true, orderBy: 'startTime' }
  singleEvents=true is required to expand recurring events into individual
  instances — without it, a recurring daily standup returns as ONE event
  object with a recurrence rule, not 7 separate joinable meetings.
```

Response includes `nextSyncToken` (present when the full result set for this
sync has been returned) — this is what gets persisted for the *next* run to
use in Mode A.

**410 Gone handling**: caught here at the provider layer and re-thrown as a
distinct, typed `GoogleSyncTokenExpiredError` (not a generic `IntegrationError`)
so `calendar-sync.service.ts` can pattern-match on it specifically and trigger
the full-resync fallback (§8) rather than treating it as a generic failure
worth alerting on.

#### `getUserCalendarList(accessToken: string): Promise<GoogleCalendarListEntry[]>`
GET `/users/me/calendarList`. Called once at connect-time (not on every sync)
to confirm the primary calendar's display name for the integration card UI,
and to power a future (v2, not today) "choose a different calendar" setting.

### Error Code Mapping Table

```
GOOGLE RESPONSE                  MAPPED INTERNAL ERROR             RETRYABLE?
400 invalid_grant (auth code)    GOOGLE_AUTH_CODE_INVALID          No
400 invalid_grant (refresh)      GOOGLE_REFRESH_TOKEN_REVOKED      No — requires reconnect
401 Unauthorized                 GOOGLE_TOKEN_INVALID              No — force refresh first
403 Forbidden (quota/scope)      GOOGLE_ACCESS_DENIED              No — needs investigation
410 Gone (sync token)            GoogleSyncTokenExpiredError        N/A — triggers fallback, not a failure
429 Too Many Requests            GOOGLE_RATE_LIMITED               Yes — honor Retry-After
5xx                              GOOGLE_SERVICE_ERROR              Yes — exponential backoff, max 3
```

---

## 7. Layer 2 — Platform Detection & URL Extraction Utility

### File: `platform-detect.ts` (shared, not integrations-specific)

This utility is deliberately placed in `utils/`, not inside `integrations/`,
because it has **two callers with equal standing**: today's calendar sync, and
the already-existing Day 17 manual "add meeting" flow. Extracting this logic
into a shared file today is itself a piece of technical debt repayment — Day
17 originally implemented platform detection inline in `meetings.service.ts`;
today it becomes a proper shared utility, and `meetings.service.ts` is
refactored to import from here rather than maintaining its own copy.

### Functions

#### `detectPlatform(url: string): { platform: PlatformType | null; platformMeetingId: string | null }`
Pattern-matches against Zoom, Google Meet, Teams, and Webex URL shapes.
Returns both pieces together (never just a boolean "is this a known
platform") because every caller needs the extracted ID immediately for
deduplication — returning them separately would force every call site to
re-parse the URL a second time.

Platform-specific extraction rules:
- **Zoom**: numeric meeting ID from `/j/{id}` path segment; query params
  (`?pwd=...`) explicitly stripped before matching — never trusted as part of
  the dedup identity.
- **Google Meet**: the `xxx-xxxx-xxx` room-code pattern, lowercased for
  case-insensitive dedup (Google Meet codes are case-sensitive in the URL but
  functionally case-insensitive as an identity).
- **Teams**: Teams join URLs are long, contain session-specific tokens, and
  vary per calendar invite even for the *same* recurring meeting series — a
  direct substring/regex extraction of a stable ID is not reliable. The
  chosen approach is a SHA-256 hash of the full URL, truncated to 16 hex
  characters, explicitly documented as a **known limitation**: two different
  invites to conceptually "the same" Teams meeting may hash differently and
  therefore not deduplicate against each other. This tradeoff is accepted
  today and revisited only if it becomes a real support complaint (Teams
  meetings are a smaller share of Vocaply's target market than Zoom/Meet).
- **Webex**: numeric ID or room-name segment, whichever the URL shape
  contains.

#### `extractMeetingUrl(event: GoogleCalendarEvent): string | null`
Three-tier priority search, in order:
1. `event.conferenceData.entryPoints` where `entryPointType === 'video'` —
   Google's own structured field, populated when the event was created with
   "Add Google Meet" or a properly-integrated Zoom/Teams add-on. Highest
   confidence, checked first.
2. Regex scan of `event.description` — catches manually pasted Zoom/Webex
   links in the event body, the most common case for teams that don't use a
   calendar add-on.
3. `event.location` field — some organizations paste the join link here
   instead of the description; checked last because it's the least common
   pattern and has the highest false-positive risk (physical addresses also
   live in this field).

Returns `null` (not throws) when no pattern matches — this is an expected,
frequent outcome (most calendar events are not video meetings at all) and
must never be logged as an error, only silently counted as `skipped` by the
calling service.

### Why This Layer Is Pure and Synchronous

Both functions are deliberately free of any I/O, database access, or async
behavior — this makes them trivially unit-testable with a table of
known-good/known-bad URL fixtures (see §24), and guarantees platform
detection logic can never itself be the source of a hung or slow sync job.

---

## 8. Layer 3 — Calendar Sync Service (Core Business Logic)

### File: `calendar-sync.service.ts`

This is the heart of the day — the orchestration function that ties together
every other layer. It is the **only** file that knows the full sequence of
steps; every other file (provider, dedup, meetings service) knows only its
own narrow responsibility.

### Function: `syncUserCalendar(userId: string): Promise<SyncResult>`

Full step sequence:

```
STEP 1 — Load Integration
  Fetch UserIntegration by (userId, 'GOOGLE_CALENDAR'). If missing or
  syncEnabled=false → return early with reason NOT_CONNECTED_OR_DISABLED.
  This is not an error — it's the expected state for the vast majority of
  users who haven't connected a calendar, and the cron fan-out (§9) already
  filters to only syncEnabled=true rows, so reaching this branch inside the
  service itself would only happen via the manual sync-now path racing a
  just-disconnected integration — handled gracefully, not exceptionally.

STEP 2 — Acquire Per-User Sync Lock
  Redis SET NX with 5-minute TTL, keyed by userId. If not acquired → another
  sync (cron or manual) is already in flight for this exact user → return
  early with reason SYNC_IN_PROGRESS. See §17 for full rationale.

STEP 3 — Obtain a Valid Access Token
  Delegates to token-refresh.service.ts's getValidAccessToken() (§11) — this
  service function does not itself decide whether to refresh; it defers that
  decision entirely to the shared token lifecycle helper, which is also used
  by Jira/Slack (Days 58/60) and later Outlook (Day 63). This is the second
  major abstraction win of the sprint (the first being IntegrationProvider),
  seeded today and formalized across the whole Phase 5 sprint plan.

STEP 4 — Fetch Events From Google
  If integration.nextSyncToken is present → call listEvents in incremental
  mode. If absent (first-ever sync, or a prior 410 cleared it) → full 7-day
  window mode.
  If the call throws GoogleSyncTokenExpiredError → clear nextSyncToken on the
  integration record, log a WARNING (not an error — see §6), and immediately
  retry ONCE in full-window mode within the same sync run (not a separate
  queued job) so the user experiences a single sync cycle, not two.

STEP 5 — Process Each Returned Event
  For each event in the response:
    a. If event.status === 'cancelled' → route to cancellation handling
       (§15), then continue to the next event.
    b. Extract meeting URL via extractMeetingUrl(). If null → increment
       skipped counter, continue (not an error — most events are not meetings).
    c. Detect platform via detectPlatform(). If platform or ID is null →
       increment skipped counter, continue.
    d. Call dedupService.checkAndClaim() (Day 57's shared utility — see §14
       for the exact contract this service relies on). If it reports a
       duplicate → increment skipped counter, continue.
    e. Call meetingsService.createMeetingFromCalendar() — a NEW thin wrapper
       around the EXISTING Day 17 createMeeting() bot-scheduling logic (see
       "Reuse, Not Reimplementation" note below). Wrapped in its own
       try/catch so one bad event's failure (e.g. Recall.ai transient error
       for this one event) does not abort processing of the remaining
       events in the batch.
    f. On success → confirm the dedup claim (upgrade the Redis placeholder
       value to the real meeting ID) and increment synced counter.
    g. On failure → call dedupService.releaseClaim() so the slot is
       immediately available for retry on the next sync run rather than
       blocked until the claim's TTL naturally expires, and record the
       event ID in an errors[] array returned to the caller for visibility.

STEP 6 — Persist Sync State
  Update the UserIntegration row: nextSyncToken (from the response, or null
  if a fallback occurred and no further token was issued),
  lastSyncedAt = now(), consecutiveErrors = 0, lastError = null. This update
  happens even when synced=0 and skipped=N (a "boring" sync with nothing new
  is still a successful sync and must reset error counters and TTL-refresh
  the "healthy" state).

STEP 7 — Release Lock & Return
  Redis DEL on the lock key happens in a finally block — guaranteed to run
  whether the sync succeeded, partially failed, or threw. Returns
  { synced, skipped, errors } to the caller (worker or HTTP controller).
```

### "Reuse, Not Reimplementation" — `createMeetingFromCalendar()`

Rather than duplicating Day 17's `createMeeting()` bot-scheduling sequence
(plan limit check → dedup → Recall.ai bot scheduling → Postgres write → Redis
flag), today adds a **thin, calendar-specific wrapper** inside
`meetings.service.ts` that:

1. Skips the dedup check internally (already performed by the caller in Step
   5d above, using the Day 57 shared utility directly — avoiding a redundant
   double-check of the same Redis key within a single logical operation).
2. Still performs the **plan limit check** — a calendar-triggered meeting
   consumes quota exactly like a manually-created one; there is no "free"
   path around billing limits via calendar sync. If the plan limit is
   exceeded mid-sync, the specific event is skipped (logged as an error entry
   for that event, not a fatal failure for the whole sync) rather than
   silently creating a meeting the team's plan doesn't allow.
3. Sets `calendarEventId` and `calendarSourceUserId` — the two fields that
   exist specifically for calendar-originated meetings (§5) and are `null`
   for manually-added ones.
4. Otherwise calls the exact same bot-scheduling and Postgres-write logic as
   the manual flow — meaning a Recall.ai outage affects calendar-sourced and
   manually-added meetings identically, with identical error handling.

This wrapper approach is the deliberate alternative to either (a) duplicating
the entire meeting-creation sequence a second time for calendar events, or
(b) calling the full public `createMeeting()` service function and eating a
redundant dedup round-trip. Both alternatives were considered and rejected in
favor of the thin wrapper for the reasons above.

### `handleCancelledCalendarEvent()` — see §15 for full detail.

### `handleSyncFailure()`

```
Called from the outer catch block when an UNRECOVERABLE error occurs (i.e.
something other than the expected, handled 410 case) — for example, the
Google API is entirely unreachable, or the refresh token itself has been
revoked.

Logic:
  1. Increment integration.consecutiveErrors
  2. Set integration.lastError = <sanitized error message, never raw
     stack trace or token values>
  3. If consecutiveErrors >= 5:
       → Set integration.syncEnabled = false
       → Queue a notify job: INTEGRATION_NEEDS_RECONNECT (reuses the notify
         queue infrastructure from Day 18, a new notification TYPE added
         to the existing enum, not a new delivery mechanism)
       → This mirrors the EXACT pattern already established for
         team_integrations token-refresh failures in the HLD (§10,
         "Integration Architecture") — today's work is the first time
         that documented pattern is actually implemented in code, for the
         user_integrations table specifically.
  4. Re-throw so the worker's own failure/retry accounting (BullMQ attempts)
     also sees the failure — this function augments the domain-level error
     record, it does not swallow the error.
```

---

## 9. Layer 4 — Calendar Sync Worker & Scheduler

### File: `calendar-sync.worker.ts`

Replaces the Day 17/18 scaffold with a fully functional BullMQ worker.

```
Queue name: 'calendar-sync'
Job name:   'sync-user-calendar'
Concurrency: 5

Concurrency justification: calendar sync is I/O-bound — each job spends
nearly all its wall-clock time waiting on Google's API response, not
consuming CPU. Google's default quota (500 requests/100sec/user,
1,000,000 requests/day per OAuth client) has enormous headroom relative to
5 concurrent Vocaply users syncing simultaneously. Concurrency is exposed as
an environment-driven setting (per the Day 18 coding standard: "concurrency
value is a tunable, environment-driven setting, not a hardcoded magic
number") so it can be raised without a code change as the user base grows.

Worker body:
  1. Destructure { userId } from job.data
  2. Call calendarSyncService.syncUserCalendar(userId)
  3. Log structured result: { userId, synced, skipped, errors, durationMs }
  4. Return the result object (visible in BullBoard for manual inspection)

Failure handling ('failed' event listener):
  Logs job.id, userId, and the error with full context. Does NOT attempt any
  custom retry logic here — retry count/backoff is configured at the QUEUE
  level (job options, set at enqueue time in the scheduler, §9 below), not
  reimplemented inside the worker body, keeping the worker itself a pure
  "do the work, report the outcome" function.
```

### File: `queues/jobs/calendar-sync.job.ts`

```typescript
// Type-only file — the explicit, compile-time-enforced contract between
// the scheduler (producer) and the worker (consumer). Per the Day 18
// standard: "no any-typed data crossing a queue boundary."

export interface CalendarSyncJobData {
  userId: string
}
```

### `scheduler.ts` Addition — Hourly Fan-Out Cron

```
Schedule: '0 * * * *' (top of every hour, UTC)

Logic:
  1. Query: SELECT userId FROM user_integrations
            WHERE provider = 'GOOGLE_CALENDAR' AND sync_enabled = TRUE
     (uses the pre-existing idx_user_int_sync_due partial index)
  2. For each row: enqueue ONE job onto the calendar-sync queue.
  3. Job options per enqueue:
       jobId: `calendar-sync:{userId}:{timestamp}` — unique per run, so
              BullMQ's own dedup-by-jobId never accidentally collapses two
              genuinely different hourly runs into one
       attempts: 2 (calendar sync failures are usually transient network
                 blips; 2 attempts with backoff is enough — this is
                 DELIBERATELY lower than Jira's 5-attempt policy from Day
                 58, because a missed calendar sync self-heals next hour
                 regardless, whereas a missed Jira ticket creation has no
                 such natural retry point)
       backoff: exponential, 30s base
       removeOnComplete: 50 (bounds Redis memory — see §17)
       removeOnFail: 20
  4. Log the total fan-out count for observability — a sudden drop in this
     number (e.g. from 2,000 to 50) is itself a signal worth alerting on
     (could indicate the query is broken, not that users disconnected).

Fan-out, not a single mega-job: this is the architectural centerpiece of
today's scalability story. A single job that loops over all users internally
would mean one hung Google API call blocks every other user's sync behind it
in that same job's execution, and a worker crash mid-loop loses ALL
remaining users' syncs for that hour, not just one. The fan-out pattern
means BullMQ's own per-job isolation, retry, and concurrency machinery does
all of this correctly for free.
```

### File: `config/oauth-providers.config.ts`

Centralizes OAuth constants for Google (today), and pre-shapes the same
structure for Jira (Day 58) and Slack (Day 60) so those days extend this file
rather than inventing a parallel pattern.

```
GOOGLE_CALENDAR: {
  authUrl:      'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl:     'https://oauth2.googleapis.com/token',
  revokeUrl:    'https://oauth2.googleapis.com/revoke',
  scopes:       ['https://www.googleapis.com/auth/calendar.readonly'],
  clientId:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri:  `${process.env.API_URL}/api/v1/integrations/google-calendar/callback`,
}
```

Read from environment at module load time (fail-fast at startup if
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are missing and the environment is
production — matching the Day 17 rule for `RECALL_API_KEY`), but per the Day
20 requirement, **staging/dev environments degrade gracefully** — the
"Connect Calendar" button is disabled with a tooltip rather than the whole
server refusing to boot, since calendar integration is not a hard
prerequisite for every environment to be useful.

---

## 10. Layer 5 — HTTP Layer (Controller, Routes, Validators)

### File: `integrations.controller.ts` — New Handlers Added Today

Every handler follows the established zero-business-logic rule: parse
request, call exactly one service function, format response.

#### `connectGoogleCalendarController`
Generates a CSRF state token (`crypto.randomBytes(32).toString('hex')`),
stores it in Redis (`oauth:state:calendar:{state}` → `{ userId }`, 10-min
TTL), builds the authorization URL via the provider, and issues a `302`
redirect. Reuses the identical pattern already scaffolded in Day 20's
`GET /auth/google-calendar` — today's work supersedes that scaffold with a
production-complete implementation living under the `integrations` module
rather than `auth` (a deliberate placement correction: this is an
integration concern, not an authentication concern, and Day 20's own text
flagged the original endpoint as scaffold-only pending this day).

#### `googleCalendarCallbackController`
1. Reads `code` and `state` from query params.
2. Looks up and **immediately deletes** (one-time use) the Redis state entry.
   Missing or mismatched state → `400 OAUTH_INVALID_STATE`, redirect to
   settings with an error query param — never a raw 400 JSON response for a
   browser-redirect-driven flow.
3. Calls `integrationsService.completeGoogleCalendarConnect(userId, code)`,
   which internally calls the provider's `exchangeCodeForTokens`, fetches the
   primary calendar via `getUserCalendarList`, encrypts both tokens via
   `crypto.service.ts`, and upserts the `UserIntegration` row.
4. Redirects to an **allow-listed** constant destination
   (`/onboarding/connect-calendar?connected=true` during onboarding, or
   `/settings/integrations?connected=google-calendar` post-onboarding — the
   specific target chosen based on whether the state payload flagged an
   onboarding-context connect) — never a client-supplied redirect target,
   closing the open-redirect vector flagged as a hard requirement in Day 20.

#### `disconnectGoogleCalendarController`
Calls `integrationsService.disconnectGoogleCalendar(userId)`, which:
1. Loads the integration, decrypts the access token.
2. Calls the provider's revoke endpoint
   (`POST https://oauth2.googleapis.com/revoke?token={accessToken}`) —
   **must succeed or be logged as a distinct warning**; a revoke-endpoint
   failure must not block the local row deletion (the user's intent to
   disconnect takes priority over Google's revoke endpoint being temporarily
   unreachable — but this exact scenario emits a `WARN`-level log so it's
   traceable if Google-side access remains live longer than expected).
3. Deletes the `UserIntegration` row.
4. Does **not** delete already-created meetings — a disconnect only stops
   *future* automatic sync; historical calendar-sourced meetings remain
   intact, consistent with the platform-wide "soft delete / preserve
   history" principle already applied to team member removal (Day 16 §7).

#### `syncNowController`
Rate-limited distinctly from the general user-tier limit: **1 request per 5
minutes per user**, enforced via the existing `createRateLimiter()` factory
(Day 14's rate-limiting middleware) with a new instance,
`calendarSyncNowRateLimiter`, keyed by `userId`. Calls
`calendarSyncService.syncUserCalendar(userId)` directly (bypassing the queue
entirely) and returns the result synchronously — deliberately **not**
queued, because the whole point of a manual "Sync Now" button is immediate
user-visible feedback ("3 new meetings found"), not a fire-and-forget job the
user has no way to observe the outcome of without extra polling
infrastructure that doesn't otherwise exist yet.

#### `eventsPreviewController`
Read-only. Calls a new, narrowly-scoped service function,
`previewUpcomingEvents(userId)`, which fetches the next 7 days of events
**without** performing any dedup claim or meeting creation — pure
read-and-map to a lightweight DTO (`{ title, platform, scheduledAt,
willBeSynced: boolean }`). Used for the **pre-connect confirmation UX**: a
user can see "here's what we'd create meetings for" before finalizing OAuth
consent, and post-connect as a simple upcoming-meetings glance. This function
deliberately reuses `google-calendar.provider.ts`'s `listEvents` and
`utils/platform-detect.ts`'s detection logic but touches **no** database
write path — a read-only twin of the sync logic, not a variant of it.

### File: `integrations.validator.ts` — New Schemas

```
googleCalendarCallbackQuerySchema:
  code:  string, required
  state: string, required (min 32 chars, hex format)
  error: string, optional (Google sends this on user-denied consent —
         handled distinctly: redirect to settings with a friendly
         "you declined calendar access" message, not a 400 error)

syncNowResponseSchema (response-shape documentation, not request validation):
  { synced: number, skipped: number, errors: string[] }
```

### File: `integrations.routes.ts` — New Route Registrations

```
GET    /integrations/google-calendar/connect
  chain: requireAuth → controller

GET    /integrations/google-calendar/callback
  chain: (NO requireAuth — this is a browser redirect from Google, the
          user's own session cookie/JWT may have expired during the OAuth
          round-trip; userId is recovered from the Redis state payload
          instead, exactly mirroring how Day 20's calendar scaffold and
          Day 6's email-verification flow both handle "the user isn't
          necessarily fully authenticated when this link is clicked" )
        → controller

DELETE /integrations/google-calendar
  chain: requireAuth → controller

POST   /integrations/google-calendar/sync-now
  chain: requireAuth → calendarSyncNowRateLimiter → controller

GET    /integrations/google-calendar/events-preview
  chain: requireAuth → controller
```

**Explicit design note on the callback route's auth exception:** every other
authenticated route in the system requires a valid JWT. The OAuth callback is
a deliberate, narrowly-scoped exception, matching precedent already set by
Day 6 (email verification) and Day 20 (calendar OAuth scaffold) — the
security boundary here is the **Redis state token**, not the JWT, and this
must be documented inline in the route file itself so a future engineer
doesn't "fix" this by adding `requireAuth` and silently break the flow for
any user whose access token expired during the few seconds spent on Google's
consent screen.

---

## 11. Layer 6 — Token Lifecycle Management

### File: `token-refresh.service.ts` (NEW today, extended Day 64)

Introduces the shared `getValidAccessToken()` helper referenced throughout
this document and reused verbatim by Jira (Day 58), Slack (Day 60), and
Outlook (Day 63).

```
getValidAccessToken(integration: UserIntegration | TeamIntegration): Promise<string>

Logic:
  1. Compute needsRefresh = integration.tokenExpiresAt exists AND is less
     than 30 minutes from now. (30-minute buffer, not "refresh only once
     already expired" — proactive refresh means a sync run is never mid-flight
     when a token expires out from under it.)
  2. If !needsRefresh → decrypt and return the existing access token
     immediately (common case — zero extra network round-trip).
  3. If needsRefresh:
       a. Decrypt the stored refresh token.
       b. Call the appropriate provider's refreshAccessToken() — resolved
          via the SAME provider registry pattern introduced on Day 58
          (today, Day 56, this registry has exactly one entry: Google
          Calendar; it's built now specifically so Day 58 extends it rather
          than introduces it).
       c. Encrypt the new access token, persist tokenExpiresAt, RESET
          consecutiveErrors to 0 (a successful refresh is proof the
          integration is healthy again, even if it had prior transient
          failures).
       d. Return the new plaintext access token to the caller.
  4. If the refresh call itself throws GOOGLE_REFRESH_TOKEN_REVOKED (§6) →
     propagate a distinct, typed error so the calling service (§8's
     handleSyncFailure) can immediately disable the integration rather than
     retrying a call that can never succeed.
```

This function is written today with **Google Calendar as its only real
implementation**, but its signature and internal branching (via the provider
registry, not an `if (provider === 'GOOGLE_CALENDAR')` chain) are designed so
that Day 58 adding Jira means adding a registry entry, not touching this
function's body — the same "provider abstraction proves itself" narrative
that governs the whole Phase 5 sprint plan.

---

## 12. Frontend Deliverables

### `GoogleCalendarIntegration.tsx`

Renders inside the existing `IntegrationCard` shell (already scaffolded
generically). States handled explicitly, each with its own UI treatment:

```
NOT_CONNECTED     → "Connect Google Calendar" button → useConnectGoogleCalendar()
                     (redirects the full page to the connect endpoint — this
                     is a true browser navigation, not an XHR, because OAuth
                     consent screens cannot be embedded in an iframe/fetch)

CONNECTED         → Shows: connected calendar name, "Last synced X ago"
                     (RelativeTime component, Day 1 shared component),
                     "Sync Now" button, "Disconnect" button (behind a
                     ConfirmModal — disconnecting is a meaningful action,
                     not a casual toggle)

SYNCING           → "Sync Now" button shows a loading spinner + disables
                     itself for the duration of the request (this is a rare
                     case where a synchronous, non-optimistic mutation is
                     correct — per the frontend architecture's own
                     "Optimistic by Default" principle, EXCEPT where the
                     mutation's entire value IS the confirmed server result,
                     which sync-now is)

ERROR             → consecutiveErrors > 0 or syncEnabled=false → shows a
                     distinct "Needs attention — reconnect your calendar"
                     alert state, not the generic connected-state UI

DISABLED (no env) → If the backend reports Google OAuth is not configured
                     for this environment (§9, oauth-providers.config.ts
                     degrade-gracefully rule), the connect button renders
                     disabled with a tooltip explaining why — never a broken
                     click that silently 500s
```

### `CalendarEventsPreview.tsx`

Consumes `useCalendarEvents()` (calls `GET /events-preview`). Renders a
simple list: event title, detected platform icon (reusing the existing
`MeetingPlatformIcon` component from the Meetings feature — cross-feature
reuse of a *shared*, not feature-owned, component, respecting the
feature-isolation rule since `MeetingPlatformIcon` lives in `shared/`, not
inside `features/meetings/`), and a badge indicating whether it "will be
synced" vs. "no meeting link detected, will be skipped." This view is shown
both mid-onboarding (Day 44's step 4) and in the standing Settings →
Integrations page.

### Hooks

- `useConnectGoogleCalendar()` — thin: `window.location.href = '/api/v1/integrations/google-calendar/connect'`.
  No TanStack Query involved; this is a navigation, not a data fetch.
- `useCalendarEvents()` — standard TanStack Query hook,
  `queryKeys.integrations.calendarPreview(teamId)`, `staleTime` short (60s)
  since this is explicitly a "what does it look like right now" preview.
- `useDisconnectIntegration()` — generalized (not calendar-specific) mutation
  hook, parameterized by provider name, so Day 58/60 reuse it rather than
  each writing their own disconnect hook.

---

## 13. State & Lifecycle Design

### UserIntegration Row Lifecycle

```
                    ┌───────────────────┐
                    │   NOT CONNECTED   │  ← no row exists
                    └─────────┬─────────┘
                              │ OAuth callback succeeds
                    ┌─────────▼─────────┐
                    │     CONNECTED     │  syncEnabled=true, consecutiveErrors=0
                    │   (healthy sync)  │
                    └─────────┬─────────┘
                              │ 5 consecutive sync failures
                    ┌─────────▼─────────┐
                    │  NEEDS RECONNECT  │  syncEnabled=false, lastError set
                    └─────────┬─────────┘
                              │ user re-initiates connect flow
                              │ (OAuth callback UPSERTs, resetting state)
                    ┌─────────▼─────────┐
                    │     CONNECTED     │  (back to healthy)
                    └───────────────────┘

                    From CONNECTED, user-initiated:
                    │ DELETE /google-calendar
                    ▼
                    row deleted → NOT CONNECTED
```

The OAuth callback handler's persistence call is an **upsert**
(`teamId_provider`/`userId_provider` unique constraint), not a blind insert —
a user reconnecting after a `NEEDS_RECONNECT` state must cleanly transition
back to healthy without a duplicate-key error or an orphaned old row.

---

## 14. Deduplication Integration (Cross-Reference to Day 57)

Today's service code is written **against the Day 57 `dedup.service.ts`
contract**, not against inline Redis calls, even though Day 57 is
sequenced immediately after this day in the sprint plan. This is a
deliberate ordering choice worth stating explicitly:

```
Today's syncUserCalendar() calls exactly two functions from dedup.service.ts:

  dedupService.checkAndClaim({ teamId, platform, platformMeetingId, scheduledAt })
    → returns true if duplicate (skip), false if claimed (proceed)

  dedupService.confirmClaim(platform, platformMeetingId, meetingId)
    → called after successful meeting creation

  dedupService.releaseClaim(platform, platformMeetingId)
    → called after a failed meeting creation, to free the slot immediately
```

If Day 57 has not yet landed when Day 56 is implemented in practice, today's
work may temporarily inline a minimal version of `checkAndClaim` directly
inside `calendar-sync.service.ts` **using the exact same function signature**
documented above, specifically so that when Day 57 extracts the shared
utility, `calendar-sync.service.ts` requires a pure import-path change and
nothing else. This is called out here so that whichever day is implemented
first, the seam between them stays clean.

---

## 15. Cancellation & Deletion Edge Cases

### `handleCancelledCalendarEvent(integration, event)`

```
STEP 1 — Look Up
  Find meeting WHERE teamId = integration.user.teamId AND
  calendarEventId = event.id. Uses the pre-existing
  idx_meetings_calendar_event index (§5) — no new index needed.

STEP 2 — Not Found
  No-op. Vocaply never created a meeting for this event (it had no
  detectable video link, or was skipped for another reason) — a
  cancellation of an event we never acted on is simply irrelevant.

STEP 3 — Found, Status IN (SCHEDULED, BOT_JOINING)
  a. Call recallService.removeBot(meeting.recallBotId) — reuses the exact
     Day 17 function, idempotent by design (a 404 from Recall.ai, meaning
     the bot was already removed some other way, is treated as success,
     not an error, per Day 17's documented removeBot() contract).
  b. Transition meeting.status → CANCELLED via the state machine's
     validateTransition() guard (Day 17/LLD §3) — both SCHEDULED→CANCELLED
     and BOT_JOINING→CANCELLED are pre-approved transitions in the existing
     matrix, so no state-machine change is needed today, only a new CALLER
     of the existing transition logic.
  c. Delete the Redis dedup key immediately (not waiting for its TTL) —
     frees the (platform, platformMeetingId) slot right away in case the
     organizer reschedules under a new event but reuses the same
     recurring Zoom link.
  d. Emit Socket.io 'meeting:bot_joining' with a cancelled flag (reusing
     the existing event NAME per the Day 17/HLD event catalog rather than
     inventing a new event type for what is fundamentally still "this
     meeting's bot status changed" information) to the team room.

STEP 4 — Found, Status IN (RECORDING, PROCESSING, DONE)
  Explicitly a no-op. A calendar cancellation arriving after the meeting
  has already started or finished is virtually always the organizer
  tidying up their calendar after the fact, not a real-time signal that
  should retroactively affect data already captured. This is a considered
  product decision, not an oversight — documented here so it's never
  "fixed" into a regression by a future engineer who assumes all
  cancellations should always cascade.

STEP 5 — Found, Status IN (FAILED, CANCELLED)
  Also a no-op (terminal states, per the existing state machine rule that
  terminal states never transition except via explicit admin action).
```

---

## 16. Security Architecture

### OAuth-Specific Threats and Mitigations

```
THREAT                                MITIGATION
─────────────────────────────────────────────────────────────────────────
CSRF on the OAuth callback            Redis-backed, single-use, 10-min TTL
                                       state token bound to userId at
                                       issuance — mirrors the identical
                                       pattern already proven for Jira
                                       (Day 20 scaffold) and general OAuth
                                       (HLD §4.2)

Open redirect via callback            Redirect target is an ALLOW-LISTED
                                       constant chosen server-side based on
                                       context, never a client-supplied
                                       query parameter (explicit Day 20
                                       carry-over requirement)

Authorization code interception       Code exchange happens server-to-
                                       server (Vocaply backend → Google),
                                       never passed through or exposed to
                                       the browser beyond the initial
                                       redirect URL Google itself controls

Refresh token theft                   AES-256-GCM encrypted at rest
                                       (crypto.service.ts, Day 14, reused
                                       unchanged); never logged; never
                                       included in any API response body

Scope creep                           ONLY calendar.readonly requested —
                                       explicitly justified and surfaced
                                       in consent-screen copy and settings
                                       UI so the least-privilege choice is
                                       visible, not just internally decided

Stale token after external revocation Refresh call's invalid_grant response
                                       is mapped to a distinct, non-retryable
                                       error that disables sync and prompts
                                       reconnect, rather than retrying
                                       forever against a dead credential

Zombie access after user disconnect   DELETE endpoint calls Google's
                                       /revoke endpoint BEFORE row deletion,
                                       not merely stops local polling
```

### Tenant Isolation Note

Calendar sync is unusual among today's data flows in that its **primary key
context is `userId`, not `teamId`** — Google Calendar integration is
explicitly a `user_integrations` (Day 3 schema), not `team_integrations`,
concern, because a calendar belongs to a person, not an organization.
However, the **meetings created as a result** are immediately and fully
`team_id`-scoped, subject to the exact same 3-layer tenant isolation
(application, Prisma middleware, RLS) as every other meeting in the system —
today's code must resolve `teamId` from `integration.user.teamId` at meeting
creation time and never accept or infer a `teamId` from any Google-provided
data.

---

## 17. Performance & Scalability Architecture

### Redis Lock Design Rationale

```
Key:    sync:calendar:lock:{userId}
Command: SET key '1' EX 300 NX
TTL:     300 seconds (5 minutes)

Why 5 minutes: generously longer than any realistic single sync duration
(even a full 7-day-window fetch against a busy calendar should complete in
low single-digit seconds), so the TTL is a safety net against a crashed
worker leaving a stale lock, NOT the primary mechanism ending the lock's
life — the `finally` block's explicit DEL is the primary mechanism. The TTL
existing at all is what prevents a permanently stuck sync if a worker
process is killed mid-job without running its finally block (e.g. an
out-of-memory kill).

Why per-USER, not per-team: a team can have multiple members each with
their own connected calendar; those are independent Google API credentials,
independent sync cycles, and independent failure domains — locking at the
team level would serialize N members' syncs unnecessarily and provide no
additional correctness benefit, since the actual race this lock prevents
(cron + manual sync-now for the SAME calendar) only ever involves one user's
one integration.
```

### Incremental Sync as the Primary Scalability Lever

```
Full-window sync cost (worst case, every hour, every user):
  10,000 users × 1 request/hour × ~50 events/response average = manageable
  in isolation, but wasteful — the VAST majority of a returning user's
  calendar is unchanged hour-to-hour.

Incremental sync cost (steady state, after first sync):
  10,000 users × 1 request/hour, response body containing ONLY the delta
  (frequently zero items) — this is the difference between Vocaply's Google
  API quota usage scaling with "total calendar size" versus scaling with
  "rate of actual calendar changes," which is a categorically smaller
  number at any realistic scale.

This is why Step 4 of syncUserCalendar() (§8) always PREFERS the
incremental path and only falls back to full-window on an explicit 410 —
never as a periodic "just in case" full refresh, which would defeat the
entire purpose of maintaining the sync token in the first place.
```

### Queue Memory Bounds

`removeOnComplete: 50` / `removeOnFail: 20` on every calendar-sync job
enqueue keeps Redis's BullMQ-managed job data bounded regardless of scale —
at 10,000 users running hourly (240,000 jobs/day), without these limits the
completed-job history would grow unbounded; with them, Redis only ever holds
the most recent 50 successful and 20 failed job records **per queue**,
matching the exact numeric convention already established for the
`transcribe`/`extract` queues in Day 18.

### Horizontal Scaling Path

The worker's concurrency (5, environment-tunable per §9) and the fan-out
cron's one-job-per-user design mean **additional throughput is achieved
purely by adding worker replicas** — zero code changes required, consistent
with the Day 18 "Worker deployment is designed so additional worker replicas
can be added purely by scaling the container/process count" principle
applied to a brand-new queue type for the first time this sprint.

---

## 18. Reliability & Failure Handling

```
FAILURE MODE                          BEHAVIOR
─────────────────────────────────────────────────────────────────────────
Google API entirely unreachable       Job fails, BullMQ retries per queue
                                       policy (2 attempts, 30s exponential
                                       backoff); consecutiveErrors increments;
                                       user's meetings from prior syncs are
                                       completely unaffected — this is a
                                       "next hour's sync will likely
                                       succeed" class of failure, not a
                                       data-loss risk

Single malformed calendar event       That event's error is caught and
                                       recorded in the errors[] array;
                                       every OTHER event in the same batch
                                       still processes normally (§8, Step 5e)

Recall.ai down during meeting          The specific event's meeting
creation attempt                       creation fails, dedup claim is
                                       released (so it's retried next
                                       sync), error recorded — the rest of
                                       the batch is unaffected (same
                                       isolation principle as above,
                                       applied at a different layer)

Redis unavailable                     The per-user lock acquisition
                                       itself fails/throws — the sync run
                                       aborts entirely for that user rather
                                       than proceeding without a lock
                                       (proceeding without the lock would
                                       reintroduce exactly the race Day 57
                                       exists to prevent) — this is an
                                       intentional fail-closed design,
                                       not a gap

Worker process crash mid-sync         Redis lock's 5-min TTL self-heals;
                                       BullMQ's own job-visibility-timeout
                                       mechanism returns the unacknowledged
                                       job to the queue for another worker
                                       to pick up; nextSyncToken was never
                                       persisted for the failed run, so the
                                       retry correctly re-fetches from the
                                       last KNOWN GOOD sync point — no data
                                       gap

Refresh token revoked externally      Distinct non-retryable error path
(user revoked in Google's own          (§6, §11) — integration disabled
 account settings)                     immediately rather than burning
                                       retry attempts against a call that
                                       will never succeed, and the user is
                                       notified to reconnect
```

---

## 19. Observability & Monitoring

### Structured Log Events (New Today)

```
calendar-sync.lock_acquired       { userId }
calendar-sync.lock_skip           { userId, reason: 'SYNC_IN_PROGRESS' }
calendar-sync.sync_token_expired  { userId }  — WARN level, not ERROR
calendar-sync.event_skipped       { userId, eventId, reason }
calendar-sync.meeting_created     { userId, teamId, meetingId, eventId }
calendar-sync.event_failed        { userId, eventId, err }
calendar-sync.completed           { userId, synced, skipped, errorCount, durationMs }
calendar-sync.integration_disabled { userId, consecutiveErrors }  — WARN level
```

### Metrics (Grafana Dashboard Additions)

```
calendar_sync.jobs_enqueued_total       (per hourly cron run)
calendar_sync.jobs_completed_total      (worker success)
calendar_sync.jobs_failed_total         (worker failure, post-retries)
calendar_sync.meetings_created_total
calendar_sync.events_skipped_total
calendar_sync.sync_duration_ms          (histogram, P50/P95/P99)
calendar_sync.integrations_disabled_total
```

A P95 sync duration climbing over time, independent of user count growth, is
the earliest signal that either Google's API is slowing down or a
pathological calendar (thousands of events) is degrading a specific job —
worth a dashboard panel from day one rather than added reactively after an
incident.

### Alerting Additions (Extends Day 19's Alerting Rules Table)

```
WARNING (Slack alert, no page):
  → calendar_sync.jobs_failed_total rate > 10% over 1 hour
  → calendar_sync.integrations_disabled_total > 5 in a single hour
    (could indicate a systemic Google-side issue, not isolated user
    problems, if many disable at once)
```

---

## 20. Redis Key Space Additions

```
NAMESPACE                        KEY FORMAT                            TTL      VALUE
──────────────────────────────────────────────────────────────────────────────────────
Sync lock                        sync:calendar:lock:{userId}           300s     "1"
OAuth CSRF (calendar-specific)   oauth:state:calendar:{state}          600s     JSON { userId, context }
Sync-now rate limit              ratelimit:calendar-sync-now:{userId}  300s     Integer (attempt count)
```

`bot:scheduled:{platform}:{platformMeetingId}` (the dedup key itself) is
**not** a new namespace introduced today — it's the Day 17-established key
that Day 57's `dedup.service.ts` formalizes and today's sync logic is the
first high-volume consumer of.

---

## 21. API Endpoint Specification

### `GET /api/v1/integrations/google-calendar/connect`

Auth required. No request body. Response: `302` redirect to Google's consent
screen. No JSON response body on the success path (it's a redirect).

### `GET /api/v1/integrations/google-calendar/callback`

No `requireAuth` (see §10 design note). Query: `code`, `state`, optional
`error`. Response: `302` redirect to an allow-listed frontend destination.
Error responses (invalid state, Google error) also redirect, carrying a
`?error=` query param the frontend reads to display a toast — never a raw
JSON error for this browser-navigation endpoint.

### `DELETE /api/v1/integrations/google-calendar`

Auth required. No request body. Response: `200` with
`{ success: true, data: { message: 'Google Calendar disconnected' } }`.

### `POST /api/v1/integrations/google-calendar/sync-now`

Auth required. Rate limit: 1/5min/user. No request body. Response: `200`
with `{ success: true, data: { synced: number, skipped: number, errors: string[] } }`.
`429` if rate-limited, with `Retry-After` header.

### `GET /api/v1/integrations/google-calendar/events-preview`

Auth required. No query params (always "next 7 days" today; date-range
customization deferred). Response: `200` with
`{ success: true, data: { events: PreviewEvent[] } }` where each
`PreviewEvent` is `{ title, platform, scheduledAt, willBeSynced }`.

### HTTP Status Code Reference (This Day's Additions)

```
200  OK               → disconnect, sync-now, events-preview success
302  Found            → connect (to Google), callback (to frontend)
401  Unauthorized     → missing/invalid JWT on any auth-required route
402  Payment Required → sync-now discovers a meeting creation blocked by
                         plan limit (surfaced inside the response body's
                         errors[] array for that specific event, NOT as
                         the overall HTTP status — a mixed-outcome sync
                         is still a 200 overall)
422  Unprocessable    → callback with missing/malformed code or state
429  Too Many Requests → sync-now rate limit exceeded
502  Bad Gateway      → Google API entirely unreachable during connect
                         (callback) — the ONE case in this endpoint set
                         where a JSON error response IS appropriate,
                         since this happens before any redirect target is
                         even known
```

---

## 22. Error Taxonomy

```
GOOGLE_AUTH_CODE_INVALID          400-class  → OAuth callback: bad/expired code
GOOGLE_REFRESH_TOKEN_REVOKED      —          → non-retryable, disables integration
GOOGLE_TOKEN_INVALID              401-class  → forces a refresh attempt first
GOOGLE_ACCESS_DENIED              403-class  → logged, integration flagged, no auto-retry
GOOGLE_SYNC_TOKEN_EXPIRED         —          → NOT an error state; triggers fallback
GOOGLE_RATE_LIMITED               429-class  → retry honoring Retry-After
GOOGLE_SERVICE_ERROR              5xx-class  → retry with backoff, max 3
OAUTH_INVALID_STATE               400        → CSRF check failed on callback
CALENDAR_NOT_CONNECTED            404        → sync-now / events-preview with no integration
CALENDAR_SYNC_IN_PROGRESS         409        → concurrent sync-now while cron holds the lock
CALENDAR_SYNC_RATE_LIMITED        429        → sync-now called more than once per 5 min
```

Every one of these extends the existing `AppError` hierarchy (Day 17/LLD
§23) — no ad-hoc `throw new Error(...)` anywhere in today's code, per the
sprint-wide standard.

---

## 23. Hour-by-Hour Execution Plan

```
9:00 – 10:00   google-calendar.provider.ts: OAuth URL builder, code exchange,
               refresh, listEvents (both modes), calendar list, full error
               mapping table implemented and unit-testable in isolation
               (mocked HTTP layer, no live Google calls needed yet)

10:00 – 10:45  platform-detect.ts: extracted from Day 17 inline logic,
               hardened with the Teams-hash approach, unit tests against a
               fixture table of real-shaped URLs for all 4 platforms

10:45 – 12:00  calendar-sync.service.ts: full syncUserCalendar() orchestration,
               handleCancelledCalendarEvent(), handleSyncFailure() — the
               core logic of the day, written against mocked
               provider/repository/dedup dependencies first

12:00 – 1:00   Lunch

1:00 – 1:45    calendar-sync.worker.ts + scheduler.ts hourly fan-out +
               calendar-sync.job.ts type contract

1:45 – 2:30    token-refresh.service.ts (getValidAccessToken, provider
               registry seeded with Google only) + oauth-providers.config.ts

2:30 – 3:15    integrations.controller.ts (5 new handlers) + routes +
               validators + Redis CSRF state wiring

3:15 – 4:00    Frontend: GoogleCalendarIntegration.tsx, CalendarEventsPreview.tsx,
               useCalendarEvents/useConnectGoogleCalendar hooks

4:00 – 4:45    Redis lock integration end-to-end, dedup service wiring
               (inline or Day-57-shaped per §14), error handling pass across
               all layers

4:45 – 5:30    Manual testing against a REAL Google account: full OAuth
               round-trip, first full sync, second incremental sync,
               simulated cancellation, disconnect + revoke verification

5:30 – 6:00    Checklist review (§25) + sign-off
```

---

## 24. Testing & Verification Plan

### Provider Layer (Unit, Mocked HTTP)

```
Test 1 — Authorization URL includes access_type=offline and prompt=consent
Test 2 — exchangeCodeForTokens maps a 400 invalid_grant to GOOGLE_AUTH_CODE_INVALID
Test 3 — refreshAccessToken return type structurally excludes refreshToken field
Test 4 — refreshAccessToken maps 400 invalid_grant to GOOGLE_REFRESH_TOKEN_REVOKED
Test 5 — listEvents in incremental mode never sends timeMin/timeMax alongside syncToken
Test 6 — listEvents maps a 410 response to GoogleSyncTokenExpiredError specifically
```

### Platform Detection (Unit, Pure Functions)

```
Test 1 — Zoom URL with query params → correct numeric ID, params stripped
Test 2 — Google Meet URL → lowercased room code
Test 3 — Two different Teams URLs for "the same" recurring meeting → produce
         DIFFERENT hashes (documented known limitation, asserted not "fixed")
Test 4 — Event with conferenceData AND a Zoom link in description →
         conferenceData wins (priority 1 over priority 2)
Test 5 — Event with no video link anywhere → returns null, not an exception
```

### Sync Service (Integration, Real Redis + Test DB, Mocked Google)

```
Test 1 — First sync (no nextSyncToken): full 7-day window requested
Test 2 — Second sync (nextSyncToken present): incremental mode requested
Test 3 — 410 response mid-sync: nextSyncToken cleared, full-window retry
         happens WITHIN the same sync run, exactly once
Test 4 — Cancelled event for an existing SCHEDULED meeting → bot removed,
         meeting CANCELLED, dedup key deleted
Test 5 — Cancelled event for a DONE meeting → no-op, verified via unchanged
         updatedAt timestamp
Test 6 — One malformed event among 10 valid ones → 9 meetings created, 1
         error recorded, sync reports success overall
Test 7 — Two concurrent syncUserCalendar() calls for the same userId →
         second one returns SYNC_IN_PROGRESS immediately, first proceeds
Test 8 — Plan limit exceeded mid-batch → that event recorded as an error,
         remaining events in the batch still processed
```

### End-to-End (Manual, Real Google Account)

```
Test 1 — Full OAuth connect flow: consent screen → callback → integration
         row created with encrypted tokens
Test 2 — First sync creates meetings for real calendar events with Meet/Zoom links
Test 3 — Manually edit/cancel one of those calendar events → next sync
         (or manual sync-now) correctly cancels the corresponding meeting
Test 4 — Disconnect → verify via Google's "Third-party apps & services"
         account page that Vocaply's access is fully revoked, not just
         locally forgotten
Test 5 — Reconnect after disconnect → clean upsert, no duplicate-key error,
         sync resumes correctly
```

---

## 25. End-of-Day Checklist

```
SCHEMA
  [ ] Confirmed ZERO migrations needed — all required user_integrations /
      meetings columns already exist from Day 3 schema

OAUTH FLOW
  [ ] Connect → Google consent screen → callback → integration row created
  [ ] access_type=offline + prompt=consent present in every authorization URL
  [ ] Refresh token never overwritten with null/undefined on subsequent connects
  [ ] CSRF state token: single-use, 10-min TTL, bound to userId, verified
  [ ] Callback redirect target is allow-listed, never client-supplied
  [ ] Disconnect calls Google's /revoke endpoint BEFORE deleting the local row

SYNC LOGIC
  [ ] First sync uses full 7-day window (no syncToken)
  [ ] Second sync uses incremental mode (syncToken present)
  [ ] 410 Gone triggers exactly one same-run full-window fallback, not a crash
  [ ] Per-user Redis lock prevents concurrent cron + manual sync-now races
  [ ] One malformed event never aborts the rest of the batch
  [ ] Cancelled calendar events correctly cancel SCHEDULED/BOT_JOINING meetings
  [ ] Cancelled calendar events are a no-op for RECORDING/PROCESSING/DONE meetings
  [ ] Dedup claim released immediately on meeting-creation failure (not TTL-bound)
  [ ] consecutiveErrors resets to 0 on any successful sync
  [ ] 5 consecutive failures → syncEnabled=false + notify job queued

PLATFORM DETECTION
  [ ] Zoom, Google Meet, Teams, Webex all correctly detected from real URLs
  [ ] conferenceData takes priority over description-scanned URLs
  [ ] Event with no video link → skipped silently, not logged as an error

WORKER & SCHEDULER
  [ ] Hourly cron fans out one job per syncEnabled=true user (not one mega-job)
  [ ] Job IDs are unique per run (timestamp-suffixed)
  [ ] removeOnComplete/removeOnFail bounds are set and verified in BullBoard
  [ ] Worker concurrency is environment-configurable, not hardcoded

SECURITY
  [ ] Only calendar.readonly scope requested — verified in the actual
      Google consent screen shown during manual testing
  [ ] Tokens encrypted at rest (spot-checked directly in the database —
      column must NOT be human-readable)
  [ ] No token values appear in any log line (grep the log output)
  [ ] Callback route confirmed to intentionally bypass requireAuth, with
      an inline comment explaining why

PERFORMANCE
  [ ] Incremental sync response body confirmed empty/minimal on a
      no-change second run (verified via logged event count)
  [ ] Sync duration logged and reasonable (<5s for a typical calendar)

FRONTEND
  [ ] GoogleCalendarIntegration renders all 5 states (not-connected,
      connected, syncing, error, disabled-no-env) correctly
  [ ] CalendarEventsPreview shows accurate willBeSynced flags
  [ ] Disconnect requires confirmation (ConfirmModal), not a single click

SIGN-OFF
  [ ] Full manual E2E test pass completed against a real Google account
      (connect → sync → cancel → sync → disconnect → verify revoked)
```

---

## 26. Risks & Edge Cases Register

```
RISK                                          MITIGATION BUILT TODAY
─────────────────────────────────────────────────────────────────────────────
5 team members share 1 calendar event         Redis lock is per-USER, so this
→ 5 sync jobs could race                      relies on Day 57's dedup layer,
                                               not this day's lock, to resolve
                                               correctly — explicitly cross-
                                               referenced in §14

Google sync token silently expires            Handled as expected behavior
after 7 days of inactivity                    (410 → fallback), not alerted
                                               on as an error

Recurring meeting series edited by            Each occurrence has its own
organizer (time changed for one instance)     event.id (singleEvents=true
                                               guarantees this) — treated as
                                               an independent event, no
                                               special-case logic needed

User revokes Vocaply access directly          Detected on next refresh
in their Google Account settings              attempt (invalid_grant),
(not via Vocaply's UI)                        integration correctly disabled
                                               rather than retried forever

Teams meeting URL dedup false-negative        Documented, accepted tradeoff
(different invites to "the same" series       (§7) — not silently present,
hash differently)                             explicitly called out for
                                               future revisit if it becomes
                                               a real complaint

Calendar with an unusually large number       Full-window fetch capped
of events (edge case: 500+ events in          implicitly by Google's own
next 7 days)                                  maxResults default/pagination;
                                               explicitly NOT paginated
                                               further today (documented
                                               scope limit — a calendar this
                                               busy is itself unusual enough
                                               to defer full pagination
                                               support to a later hardening
                                               pass if it's ever observed
                                               in production)

Onboarding step 4 (Day 44) depends on         Today's callback redirect
this day's callback existing and              target logic explicitly
working correctly                             branches on onboarding
                                               context (§10) — verified as
                                               part of today's manual E2E
                                               pass, not assumed
```

---

*Document: DAY-56-PLAN-001 | Vocaply | Day 56: Google Calendar Sync*
*Full Scalable Industry-Level Build Plan | Principal Backend Engineer Edition*
*Phase 5 — Integrations | Planning & Architecture Blueprint — No Code, Pure Design*
*Provider isolation · Incremental sync · Per-user locking · Token lifecycle · Cancellation cascade*
