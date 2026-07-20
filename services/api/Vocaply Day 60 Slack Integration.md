# Vocaply — Day 60: Slack Integration
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-60-PLAN-001 | Version 1.0 | Phase 5 — Integrations | Planning Only — No Code

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Architecture Philosophy](#2-architecture-philosophy)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Dependency Flow & Layering](#4-dependency-flow--layering)
5. [Data Model — What Already Exists vs. What's Added](#5-data-model--what-already-exists-vs-whats-added)
6. [Layer 1 — Slack OAuth: Why Bot Tokens, Never User Tokens](#6-layer-1--slack-oauth-why-bot-tokens-never-user-tokens)
7. [Layer 2 — slack.provider.ts (Full Method Design)](#7-layer-2--slackproviderts-full-method-design)
8. [Layer 3 — User & Channel Resolution Caching](#8-layer-3--user--channel-resolution-caching)
9. [Layer 4 — Block Kit Message Builders](#9-layer-4--block-kit-message-builders)
10. [Layer 5 — integrations.service.ts (Slack-Specific Orchestration)](#10-layer-5--integrationsservicets-slack-specific-orchestration)
11. [Layer 6 — notify.worker.ts (Wiring the Slack Branch)](#11-layer-6--notifyworkerts-wiring-the-slack-branch)
12. [Layer 7 — HTTP Layer (Controller, Routes, Validators)](#12-layer-7--http-layer-controller-routes-validators)
13. [The IntegrationProvider Interface — Slack as the Partial-Implementation Stress Test](#13-the-integrationprovider-interface--slack-as-the-partial-implementation-stress-test)
14. [Token Lifecycle — the Third Data-Point Proving getValidAccessToken() Generalizes](#14-token-lifecycle--the-third-data-point-proving-getvalidaccesstoken-generalizes)
15. [Frontend Deliverables](#15-frontend-deliverables)
16. [State & Lifecycle Design](#16-state--lifecycle-design)
17. [Security Architecture](#17-security-architecture)
18. [Performance & Scalability Architecture](#18-performance--scalability-architecture)
19. [Reliability & Failure Handling](#19-reliability--failure-handling)
20. [Observability & Monitoring](#20-observability--monitoring)
21. [Redis Key Space Additions](#21-redis-key-space-additions)
22. [API Endpoint Specification](#22-api-endpoint-specification)
23. [Error Taxonomy](#23-error-taxonomy)
24. [Hour-by-Hour Execution Plan](#24-hour-by-hour-execution-plan)
25. [Testing & Verification Plan](#25-testing--verification-plan)
26. [End-of-Day Checklist](#26-end-of-day-checklist)
27. [Phase 5 Sprint Retrospective — What Days 56–60 Collectively Prove](#27-phase-5-sprint-retrospective--what-days-56-60-collectively-prove)
28. [Risks & Edge Cases Register](#28-risks--edge-cases-register)

---

## 1. Day Overview & Goals

### What Gets Built Today

Days 56–59 built two full round-trip integrations — Google Calendar
(ingestion only) and Jira (outbound creation + inbound reverse sync). Day 60
closes Phase 5's first five-day arc with a **third, structurally distinct**
integration: Slack is neither a data source (like Calendar) nor a system of
record with its own workflow state (like Jira) — it is a **notification
delivery channel**. Its entire purpose in Vocaply's architecture is to take
already-decided facts (a meeting was processed, a commitment was missed, a
deadline is approaching) and put them in front of a human, in the tool they
already have open, faster and more visibly than an email inbox.

This distinction matters architecturally, not just conceptually: today is
the first day the `IntegrationProvider` interface built on Day 58 is
exercised by a provider that **doesn't implement `createExternalItem`** at
all — proving the interface's `?` (optional method) design decision was
correct, not merely convenient, and giving the sprint's abstraction its
final, most important stress test before Phase 5 moves on to Linear (Day 61)
and Notion (Day 62).

```
TODAY BUILDS:
  ✅ Slack OAuth v2 connect/callback/disconnect flow — BOT token only,
     never a user token, with the data-model consequence (team_integrations,
     not user_integrations) made explicit and verified
  ✅ slack.provider.ts — channel listing, user-by-email resolution, channel
     message posting, direct message posting (via conversations.open)
  ✅ notifications/slack-blocks.ts — three pure, unit-testable Block Kit
     builders (meeting summary, commitment missed, deadline reminder)
  ✅ notify.worker.ts wired for real Slack delivery across all three
     existing notification types, replacing the Day 18/19 "log and
     continue" placeholder
  ✅ Two Redis caches: email→Slack user ID (24h TTL, mirroring Jira's
     assignee cache) and team+user→DM channel ID (no TTL — Slack DM
     channel IDs are permanently stable once established)
  ✅ 6 new REST endpoints (connect, callback, channels, configure,
     disconnect, and the finally-real POST /notifications/test)
  ✅ Frontend: SlackIntegration settings card + default-channel picker
  ✅ The FINAL proof point for the sprint-wide IntegrationProvider
     abstraction — Slack correctly implements a NARROWER slice of the
     interface than Jira did, without requiring any interface change

DOWNSTREAM IMPACT:
  Day 61/62 — Linear and Notion inherit not just the registry pattern
           (Day 58) but now a PROVEN precedent for "a provider that
           legitimately doesn't need every interface method" — reducing
           the risk that either of those days feels forced into
           implementing capabilities they don't actually have
  Day 67 — "Slack notifications — post-meeting summaries, commitment
           alerts" is explicitly a LATER day in the master 100-day plan
           that assumed Slack delivery would already be real by then —
           today is what makes that day possible rather than a repeat
           of this same wiring work
  Day 100 (master file structure) — slack.webhook.ts is named as a file
           that WILL exist eventually (for interactive Block Kit
           components) — today explicitly does NOT build it, and states
           precisely why, so a future engineer doesn't assume today's
           work was incomplete

DO NOT SKIP OR RUSH:
  Getting the bot-vs-user-token distinction wrong here is not a minor
  detail — it determines whether the WHOLE INTEGRATION dies the moment
  the connecting employee leaves the company (a user-token mistake would
  make Slack notifications quietly stop working for reasons no admin
  would immediately understand). Getting the "never fail the whole notify
  job over a Slack failure" rule wrong means a Slack outage could silently
  suppress EMAIL notifications too, defeating the entire purpose of having
  multiple, independent delivery channels in the first place.
```

### 8-Hour Time Allocation

```
9:00 AM  – 9:30 AM   → Slack app configuration audit: confirm bot scopes,
                        OAuth v2 flow shape, verify against Slack's current
                        API documentation before writing any code
9:30 AM  – 10:15 AM  → slack.provider.ts: getAuthorizationUrl,
                        exchangeCodeForTokens, listChannels
10:15 AM – 11:00 AM  → slack.provider.ts: resolveUserByEmail + Redis
                        positive/negative caching (mirrors Jira's pattern)
11:00 AM – 12:00 PM  → slack.provider.ts: sendChannelMessage,
                        sendDirectMessage (with conversations.open caching)
12:00 PM – 1:00 PM   → Lunch break
1:00 PM  – 1:45 PM   → notifications/slack-blocks.ts: all 3 Block Kit
                        builders, written as pure functions first, wired
                        into worker second
1:45 PM  – 2:45 PM   → notify.worker.ts: wire the Slack branch into all 3
                        existing notification-type cases, each independently
                        try/caught, preference-aware
2:45 PM  – 3:30 PM   → integrations.service.ts + provider.registry.ts:
                        register the (partial) Slack implementation,
                        connect/callback/configure/disconnect orchestration
3:30 PM  – 4:15 PM   → integrations.controller.ts + routes + validators
                        (6 endpoints, including the real POST /notifications/test)
4:15 PM  – 5:00 PM   → Frontend: SlackIntegration.tsx + channel picker
5:00 PM  – 5:30 PM   → Manual E2E test against a real Slack workspace:
                        connect, configure, trigger all 3 notification types
5:30 PM  – 6:00 PM   → Checklist review + Phase 5 sprint retrospective + sign-off
```

---

## 2. Architecture Philosophy

### Four Guiding Principles for Today's Build

```
PRINCIPLE 1 — A Channel Is Not a System of Record
  Slack has no concept of "sync status," no equivalent of a Jira ticket
  that can be marked done and read back. Every method built today is
  either read-only lookup (channels, users) or fire-and-forget delivery
  (post a message). No method on slack.provider.ts attempts to model
  Slack as a place Vocaply stores or tracks state — that would be a
  category error, forcing a ticketing-shaped abstraction onto a
  messaging-shaped tool.

PRINCIPLE 2 — Additive, Never Load-Bearing
  Every existing notification delivery path (email, in-app) MUST continue
  working identically whether Slack is connected, disconnected, healthy,
  or actively failing. Today's entire design is organized around this
  single non-negotiable: Slack is a bonus channel layered on top of an
  already-complete notification system, never a dependency of it.

PRINCIPLE 3 — Bot Identity Outlives Human Identity
  The single most consequential OAuth decision of the day: request bot
  scopes, receive a bot token, never touch a user token. This is what
  makes the integration organizationally durable rather than
  person-dependent — restated multiple times in this document because
  it is the one design choice that, if inverted, would silently and
  slowly break the entire feature months after launch with no immediate
  symptom at connect time.

PRINCIPLE 4 — Prove the Abstraction by Under-Using It
  Day 58 built IntegrationProvider generically. The truest test of a good
  abstraction is not "can every provider implement all of it" but "can a
  provider legitimately implement LESS of it and still fit." Today's Slack
  implementation is written to intentionally NOT force-implement
  createExternalItem with a meaningless stub — it either omits the method
  entirely (relying on the interface's optional-method design) or
  implements it as an explicit, typed "not applicable" rejection, and
  today's code review treats "did we avoid inventing fake behavior just to
  satisfy the interface" as a real correctness criterion.
```

---

## 3. File Structure to Create

```
services/api/src/
│
├── modules/integrations/
│   ├── integrations.controller.ts          ← MODIFY: 6 new Slack handlers
│   ├── integrations.service.ts             ← MODIFY: Slack connect/callback/
│   │                                          configure/disconnect (reuses
│   │                                          the GENERIC orchestration
│   │                                          functions already built
│   │                                          generically on Day 58, Slack
│   │                                          as their SECOND real caller
│   │                                          after Jira — no new generic
│   │                                          orchestration code needed)
│   ├── integrations.repository.ts          ← MODIFY: confirm existing
│   │                                          TeamIntegration CRUD covers
│   │                                          Slack with zero changes
│   ├── integrations.validator.ts           ← MODIFY: Slack-specific Zod
│   │                                          schemas (configure body)
│   ├── integrations.types.ts               ← MODIFY: SlackMetadata shape
│   ├── integrations.routes.ts              ← MODIFY: register 6 new routes
│   └── providers/
│       ├── provider.interface.ts           ← REUSED, UNCHANGED (§13 —
│       │                                      this file NOT changing today
│       │                                      is itself a deliverable)
│       ├── provider.registry.ts            ← MODIFY: fill the SLACK slot
│       └── slack.provider.ts               ← NEW: Slack Web API client
│
├── modules/notifications/
│   ├── slack-blocks.ts                     ← NEW: pure Block Kit builders
│   └── notifications.controller.ts         ← MODIFY: wire the REAL
│                                              POST /notifications/test
│                                              (was scaffolded per HLD §11,
│                                              made functional today)
│
├── queues/
│   └── workers/
│       └── notify.worker.ts                ← MODIFY: replace the "log and
│                                              continue" Slack placeholder
│                                              (Day 18/19) with real delivery
│                                              across MEETING_PROCESSED,
│                                              COMMITMENT_MISSED,
│                                              DEADLINE_REMINDER
│
├── services/
│   └── token-refresh.service.ts            ← MODIFY (Day 56/58 origin):
│                                              confirm Slack's null-TTL
│                                              token correctly short-circuits
│                                              getValidAccessToken() with
│                                              ZERO new branching logic
│
└── config/
    └── oauth-providers.config.ts           ← MODIFY (Day 56/58 origin):
                                                add SLACK constants alongside
                                                GOOGLE_CALENDAR and JIRA

apps/web/src/features/integrations/
├── components/
│   ├── providers/
│   │   └── SlackIntegration.tsx            ← NEW
│   ├── SlackChannelPicker.tsx              ← NEW: default-channel dropdown
│   └── IntegrationCard.tsx                 ← REUSED (Day 56/58 generic shell)
├── hooks/
│   ├── useConnectSlack.ts                  ← NEW
│   ├── useSlackChannels.ts                 ← NEW
│   └── useConfigureSlack.ts                ← NEW
└── api/
    └── integrations.api.ts                 ← MODIFY: 6 new endpoint calls

apps/web/src/features/notifications/
└── components/
    └── TestNotificationButton.tsx          ← MODIFY: wire to the now-real
                                                POST /notifications/test
```

### What Is Explicitly NOT Built Today

`slack.webhook.ts` — deliberately not created, per §2 Principle 1 and the
explicit scope note in §17. No custom Slack-specific rate limiter (§18). No
`createExternalItem` implementation for Slack (§13). No changes whatsoever
to `provider.interface.ts` itself — its unmodified state at the end of
today is a tracked checklist item (§26), not an oversight.

---

## 4. Dependency Flow & Layering

```
HTTP-triggered path (connect/configure/disconnect/channels/test):
integrations.routes.ts
  └── integrations.controller.ts (req/res only)
        └── integrations.service.ts
              ├── provider.registry.ts → slack.provider.ts
              ├── integrations.repository.ts (TeamIntegration CRUD — SAME
              │     functions Jira already uses, zero new repository code)
              ├── crypto.service.ts (bot token encryption — still applied
              │     even though the token doesn't expire; a long-lived
              │     secret is, if anything, MORE valuable to protect, not
              │     less, per §17)
              └── redis (OAuth CSRF state, provider-namespaced per Day 58 §12)

notifications.controller.ts (POST /notifications/test)
  └── calls notify.worker.ts's core dispatch logic DIRECTLY and
      synchronously (not queued — a "test" action's entire value is
      immediate feedback, mirroring Day 56 §10's identical reasoning for
      why "Sync Now" bypasses the queue)

notify.worker.ts (job-triggered path — the PRIMARY path this day's work
                    actually serves in production)
  └── for each of the 3 existing notification-type cases:
        ├── (existing) email dispatch — UNCHANGED, UNTOUCHED today
        └── (NEW today) Slack branch:
              ├── slack-blocks.ts (pure block builders — no I/O)
              ├── token-refresh.service.ts.getValidAccessToken()
              ├── slack.provider.ts.resolveUserByEmail() (DM path only)
              └── slack.provider.ts.sendChannelMessage() /
                    .sendDirectMessage()
```

**Design rule enforced today:** the Slack branch inside each of
`notify.worker.ts`'s three case blocks is a **self-contained, independently
try/caught block appended after the existing email logic**, never
interleaved with it and never sharing a single try/catch with it. This is
the mechanical enforcement of Principle 2 (§2) — a code reviewer can point
at the diff and confirm the email-dispatch code paths are byte-for-byte
unchanged, with Slack purely additive beneath them.

---

## 5. Data Model — What Already Exists vs. What's Added

### Already Exists (Day 3 schema, proven again today) — Confirmed, No Migration Needed

```sql
-- team_integrations — the SAME table Jira uses (Day 58), now serving its
-- second provider. This is the concrete confirmation of §7.8's context
-- note: "Slack and Jira are team-level integrations; Calendar is
-- user-level" — a distinction now exercised by TWO providers, not
-- theoretical.

CREATE TABLE team_integrations (
  id                  VARCHAR(36)     PRIMARY KEY,
  team_id             VARCHAR(36)     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  provider            team_provider   NOT NULL,   -- adds 'SLACK' to the
                                                    -- already-live enum
                                                    -- values 'JIRA', etc.
  access_token_enc    TEXT            NOT NULL,   -- the bot token, encrypted
  refresh_token_enc   TEXT,                       -- NULL for Slack — bot
                                                    -- tokens have no
                                                    -- refresh cycle; this
                                                    -- NULLABLE column
                                                    -- already correctly
                                                    -- accommodates that
  token_expires_at    TIMESTAMPTZ,                -- NULL for Slack — the
                                                    -- exact signal
                                                    -- getValidAccessToken()
                                                    -- reads to skip refresh
                                                    -- logic entirely (§14)
  workspace_id        VARCHAR(255),               -- Slack's team.id
  workspace_name      VARCHAR(255),               -- Slack's team.name
  metadata            JSONB           NOT NULL DEFAULT '{}',
  is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
  ...
);

CREATE UNIQUE INDEX idx_team_int_team_provider ON team_integrations (team_id, provider);
```

Nothing about this table's shape needed to change to accommodate Slack —
every column that mattered (`refreshTokenEnc` and `tokenExpiresAt` being
nullable, `metadata` being a schemaless JSONB bucket) was already correctly
generic when Jira exercised it two days ago. This is the second consecutive
integration day (after Day 59) confirming zero required migrations, and it
is itself evidence the Day 3 schema's genericity across provider types was
well-designed, not merely lucky.

### `team_provider` Enum — One New Value

```sql
-- Already defined (Day 3):
CREATE TYPE team_provider AS ENUM ('JIRA', 'LINEAR', 'SLACK', 'NOTION');
```

`'SLACK'` was **already present** in the enum definition from Day 3 —
today is simply the first day a row with `provider = 'SLACK'` is ever
actually inserted. Confirmed, not migrated.

### `metadata` Shape for Slack (JSONB, No Schema Change)

```
{
  "botUserId": "U123ABC",              — Slack's bot_user_id from the
                                          OAuth response, used to identify/
                                          exclude the bot's own messages in
                                          any future features that read
                                          channel history
  "defaultChannelId": "C123ABC",       — set via PATCH /configure
  "defaultChannelName": "#engineering" — denormalized for display, avoids
                                          a channel-list lookup just to
                                          show the current setting in the UI
}
```

---

## 6. Layer 1 — Slack OAuth: Why Bot Tokens, Never User Tokens

This decision earns its own dedicated section, restated from several angles,
because it is the single highest-leverage architectural choice of the day —
one line item in an OAuth scope request that determines whether the entire
integration survives normal organizational turnover.

### The Two Possible Designs, Contrasted

```
DESIGN A (REJECTED) — User Token Flow:
  The connecting admin authorizes Vocaply to post messages "as them" — a
  Slack user token (xoxp-...) tied to that specific person's Slack
  identity.

  FAILURE MODE: the connecting admin leaves the company. Slack (per
  standard enterprise deprovisioning) deactivates their account. The
  OAuth grant tied to that now-deactivated user silently stops working.
  Every subsequent Slack notification attempt fails, with an error
  message that says something about an invalid/revoked token — giving NO
  indication to whoever discovers the problem that the root cause is
  "the person who set this up left the company," a genuinely confusing
  debugging experience for a team, potentially weeks or months after the
  actual departure event, with zero connection drawn between the two.

DESIGN B (CHOSEN) — Bot Token Flow:
  The Slack app itself (Vocaply's own registered Slack application) is
  installed into the workspace, and a bot token (xoxb-...) is issued —
  an identity belonging to the INSTALLATION, not to whichever human
  clicked "Install." The bot appears in Slack as "Vocaply," with its own
  avatar and its own presence, exactly like any other Slack app (GitHub,
  Google Calendar, Jira's own Slack integration, etc.).

  BEHAVIOR ON ADMIN DEPARTURE: nothing changes. The bot token remains
  valid indefinitely (Slack bot tokens do not expire under normal
  operation — a documented Slack platform behavior distinct from user
  tokens and distinct from Google's/Jira's access-token expiry model)
  because it was never tied to the departing individual's identity in
  the first place.
```

### The Concrete, Data-Model-Level Consequence

Because the resulting credential belongs to the **team's Slack workspace as
an installed application**, not to an individual **person**, it is stored in
`team_integrations` — the exact same table Jira occupies — rather than
`user_integrations`, where Google Calendar's genuinely per-person credential
correctly lives. This is not a stylistic choice; it is the data model
faithfully reflecting who/what actually owns the credential. Getting this
backwards (storing a bot-scoped credential in a user-scoped table, or vice
versa) would be a real modeling bug, not merely an inconsistency, and today's
implementation treats confirming this placement as an explicit review item
(§26).

### Requested Scopes, Justified Individually

```
chat:write          — required to post messages, both to channels
                       (sendChannelMessage) and DMs (sendDirectMessage,
                       via conversations.open first)
channels:read        — required for listChannels(), powering the settings
                       page's default-channel picker; deliberately the
                       READ-ONLY channel scope, not channels:manage or
                       any scope that would let Vocaply create/archive/
                       modify channels — least privilege, exactly the
                       precedent already set for Google Calendar's
                       calendar.readonly (Day 56) and Jira's narrowly-
                       scoped read/write:jira-work (Day 58)
users:read.email     — required for resolveUserByEmail(), the mechanism
                       that maps a Vocaply user's email to their Slack
                       user ID for personal DM delivery
im:write             — required for conversations.open() (opening/
                       retrieving a DM channel with a specific user)
```

No `admin.*` scope, no `channels:manage`, no scope granting message
deletion, workspace administration, or any capability beyond "read basic
directory info, read the channel list, send messages" — the complete,
minimal scope set the feature actually needs and nothing more.

---

## 7. Layer 2 — slack.provider.ts (Full Method Design)

**Dedicated Axios instance** (or Slack's own official Node SDK, `@slack/web-api`
— a build-time decision made today weighing "reuse the platform's own
established dedicated-HTTP-client-per-provider pattern, consistent with
Google/Jira" against "Slack's official SDK handles some Slack-specific
response-shape and rate-limit-header nuances automatically"; either choice
preserves today's architectural boundary — `slack.provider.ts` remains the
ONLY file that imports whichever client is chosen). Timeout: 10 seconds
(Slack's API is generally fast, matching Google Calendar's timeout budget
rather than Jira's more generous 15-second allowance, since Slack message
posting involves no complex server-side field validation comparable to
Jira's issue-creation path). Retry: 3 attempts, exponential backoff, 429/5xx
only — the same shared backoff utility used by every prior provider.

### `getAuthorizationUrl(state, teamId)`

Builds `https://slack.com/oauth/v2/authorize` with `client_id`, `scope`
(the bot-scope list from §6, passed as the `scope` parameter — Slack OAuth
v2's API distinguishes bot scopes, via `scope`, from any user-level scopes,
via a separate `user_scope` parameter that today's implementation
**deliberately never populates**, since no user-token capability is ever
requested), `redirect_uri`, `state`.

### `exchangeCodeForTokens(code)`

POST `https://slack.com/api/oauth.v2.access`. Response (normalized to the
shared `OAuthTokenResult` interface, §13) surfaces `access_token` (the bot
token), and — critically, fields NOT part of the generic interface's
`OAuthTokenResult` shape and therefore returned via a Slack-specific
secondary return value, exactly mirroring how Jira's cloudId resolution
(Day 58 §9) required its own dedicated post-processing step rather than
forcing extra fields onto the generic interface — `team.id`, `team.name`,
`bot_user_id`. No `expires_in` field is present in Slack's response at all
(bot tokens don't expire), which is precisely the data-driven signal
`token-refresh.service.ts` relies on (§14) rather than any Slack-specific
conditional.

**Error handling note, Slack-specific:** unlike Google/Jira's HTTP-status-
code-driven error signaling, Slack's Web API returns `HTTP 200` for nearly
every response, with success/failure indicated by an `ok: boolean` field
INSIDE the JSON body and an `error: string` slug (e.g. `"invalid_auth"`,
`"channel_not_found"`) on failure. Today's provider implementation must
therefore inspect `response.data.ok` on every call, not just the HTTP
status code — a genuinely different error-detection pattern from every
prior provider this sprint, called out explicitly here since it's an easy
detail to miss if a developer pattern-matches too literally against
Google's or Jira's status-code-driven error mapping.

### `listChannels(accessToken)`

GET `conversations.list` with `types=public_channel` (today's scope
explicitly excludes private channels — a private channel the bot hasn't
been invited to wouldn't be postable to anyway, and requesting private-
channel visibility broadly would require a broader, less-justifiable OAuth
scope than the minimal set in §6). Returns a simplified `{ id, name }[]`
for the settings dropdown, filtering out archived channels.

### `resolveUserByEmail(accessToken, email)`

GET `users.lookupByEmail?email={email}` — a single, exact-match lookup (no
fuzzy-search ambiguity to guard against here, unlike Jira's `user/search`
endpoint, Day 58 §10 — Slack's email lookup is inherently precise, which
simplifies today's implementation relative to its Jira counterpart).
Returns the resolved Slack `user.id`, or `null` on a `users_not_found`
error response (Slack's specific error slug for this case, mapped to a
clean `null` return rather than propagated as an exception — a "this
person isn't in this Slack workspace" outcome is an expected, benign
result, not a failure).

### `sendChannelMessage(accessToken, channelId, blocks)`

POST `chat.postMessage` with `channel: channelId`, `blocks`. Returns void
on success; throws a typed, retry-classified error on failure (§17's
error-mapping table applies the SAME `ok: false` + `error` slug inspection
described above).

### `sendDirectMessage(accessToken, slackUserId, blocks)`

Two-step sequence: `conversations.open({ users: slackUserId })` to
obtain/create the DM channel ID, THEN `chat.postMessage` against that
channel ID — functionally identical to `sendChannelMessage` once the
channel ID is known, which is why today's implementation has
`sendDirectMessage` internally delegate to the SAME underlying
`postMessage` helper after resolving the DM channel ID via the cache-first
lookup described in §8, rather than duplicating the message-posting logic
between the two public methods.

---

## 8. Layer 3 — User & Channel Resolution Caching

### Email → Slack User ID Cache (Mirrors Jira's Pattern, Day 58 §10)

```
Key:   cache:slack:user:{teamId}:{email}
TTL:   86400s (24 hours) — the SAME duration convention as Jira's
       assignee cache, continuing the platform-wide "24 hours is our
       standard external-identity-mapping cache window" precedent (Day
       58 §20) rather than inventing a new duration

Positive AND negative caching, identical rationale to Jira's design:
  a successful resolution caches the real Slack user ID; a
  users_not_found result caches a "NONE" sentinel with the SAME TTL,
  preventing every subsequent personal-alert attempt for an unmapped
  team member from re-querying Slack's API on every single notification
  send, indefinitely, for a mapping that will not resolve until that
  person is actually added to the Slack workspace.
```

### DM Channel ID Cache — A Deliberately Different TTL Policy Than the User Cache

```
Key:   cache:slack:dm-channel:{teamId}:{slackUserId}
TTL:   NONE (no expiry)

WHY NO TTL, IN CONTRAST TO EVERY OTHER CACHE THIS SPRINT: a Slack DM
channel ID, once established between the bot and a specific user, is
PERMANENTLY STABLE for the life of that user's membership in the
workspace — Slack does not rotate or invalidate DM channel IDs the way
OAuth tokens expire or search results can go stale. Caching this
value with a TTL would only introduce UNNECESSARY re-fetch traffic
against conversations.open (itself a real API call with its own rate-
limit budget) for a value that, once known, is correct forever. This is
a DELIBERATE, JUSTIFIED DEVIATION from the "24 hours is our standard"
convention (§8 immediately above) — not an inconsistency, and documented
explicitly here so a future engineer doesn't "fix" it into a TTL'd cache
under the mistaken assumption every cache in the system should follow
the same expiry policy.

CONSEQUENCE, EXPLICITLY CONSIDERED: if a user is REMOVED from the Slack
workspace, their cached DM channel ID becomes stale (pointing at a channel
that can no longer receive messages). Today's design accepts this as a
rare, self-resolving edge case — the NEXT sendDirectMessage attempt
against that stale channel ID will fail with a Slack error (channel_not_found
or a similar slug), correctly caught by the "Slack failure never blocks the
rest of the notify job" rule (§11), logged, and simply not retried
successfully until/unless a future enhancement adds active cache
invalidation on this specific failure signal — a documented, accepted
tradeoff, not a silent gap.
```

---

## 9. Layer 4 — Block Kit Message Builders

### File: `notifications/slack-blocks.ts`

Every function here is **pure**: given identical domain-data input, it
returns identical Block Kit JSON output, with zero network calls, zero
database access, and zero reference to Redis, Prisma, or any provider
client. This is a direct, deliberate application of the Day 18 coding
standard ("pure functions where possible... trivially unit-testable") to
the highest-visibility user-facing output this integration produces — a
malformed or ugly Slack message is immediately, visibly embarrassing in a
way a malformed log line never is, which is exactly why these builders are
isolated for focused, easy testing separate from any network-dependent
integration test.

### `buildMeetingSummaryBlocks(input)`

Assembles: a header (meeting title), a compact metadata line (duration +
participant count), a divider, a conditionally-rendered "commitments
extracted" section (only present if `commitmentCount > 0` — an empty
"0 Commitments Extracted" section would be visual noise for the common
case of a meeting that generated no commitments), a conditionally-rendered
"open from before" section (only present when carry-forward items exist,
directly surfacing the platform's own "cross-meeting memory" differentiator,
HLD §9, inside the Slack message itself — accountability visibility
extending into the channel where the team already congregates), and a
closing action button linking back to the full summary inside Vocaply's
web app.

### `buildCommitmentMissedBlocks(input)`

A single-commitment alert layout: owner name, the commitment's original
text, its due date (in the human-readable `dueDateRaw` form, e.g. "by
Thursday," never the raw ISO timestamp — a direct continuation of the
Day 3 schema's own stated design rationale for preserving `dueDateRaw`
alongside the parsed `dueDate`), and a link button to the commitment's
detail page.

### `buildDeadlineReminderBlocks(input)`

Structurally near-identical to the missed-commitment layout but with
distinct framing copy ("Due soon" vs. "Missed") and a distinct color/emoji
treatment — the two builders are kept as SEPARATE functions rather than one
parameterized function with a `variant` flag, because their copy and tone
are genuinely different product decisions (a reminder should feel
helpful/neutral; a missed alert should feel more urgent), and collapsing
them into one conditionally-branching function would make that copy harder
to review and adjust independently later.

### Why These Three Builders, Not a Generic "Notification-to-Blocks" Mapper

A tempting alternative design — one generic `buildNotificationBlocks(type,
data)` function with an internal switch — is explicitly rejected today.
Three distinct, independently-named, independently-typed functions keep
each notification type's Slack-specific formatting concerns isolated and
individually testable, mirroring exactly the same reasoning already applied
to Jira's ADF description builder being its own focused function (Day 58
§8) rather than a generic "format description for any provider" abstraction
— formatting logic is provider-and-purpose-specific by nature, and forcing
it into a shared generic function tends to produce a worse abstraction than
several small, honest, purpose-built ones.

---

## 10. Layer 5 — integrations.service.ts (Slack-Specific Orchestration)

### The Headline Claim of This Section, Stated Plainly

Today's `integrations.service.ts` changes are **smaller than either Day 56's
or Day 58's**, and that shrinkage is itself the day's architectural payoff.
`initiateProviderConnect(provider, teamId, userId)` and
`configureProviderMetadata(provider, teamId, metadataPatch)` — both built
generically on Day 56/58 — require **zero modification** to serve Slack;
they are called with `'SLACK'` as the provider argument and work correctly
on the first attempt, precisely because they were never written with
Google- or Jira-specific assumptions baked in.

### `completeProviderConnect('SLACK', code, state)` — The One Provider-Specific Branch

Exactly as Jira required a provider-specific post-processing hook for
cloudId resolution (Day 58 §12), Slack requires its own narrow hook: after
`exchangeCodeForTokens` returns, persist `team.id`/`team.name` into the
integration's `workspace_id`/`workspace_name` columns (not `metadata` — these
are the SAME top-level columns Jira could have used but didn't need in the
same way, since Jira's equivalent site identity lives inside its
`cloudId`/`metadata` structure by necessity of the resource-scoped OAuth
model, §9 Day 58) and `bot_user_id` into `metadata.botUserId`. This is the
SECOND deliberate, acknowledged exception to the "no provider-name branching
outside the provider file" rule (Day 58 §12 established the first, for
Jira's cloudId) — and today's implementation explicitly notes, in code
comments at this exact branch point, that this is the pattern's SECOND
occurrence, reinforcing that "occasionally, a provider's OAuth response
needs one small, acknowledged, provider-specific persistence step" is now a
recognized, bounded pattern in this codebase, not an unbounded license for
provider-specific logic to creep back into the orchestration layer.

### `disconnectProvider('SLACK', teamId, userId)`

Calls Slack's `auth.revoke` endpoint (added as an optional `revokeAccess()`
method on `slack.provider.ts`, mirroring the same optional-capability
pattern already established for Jira's webhook deregistration, Day 59 §7)
before deleting the local row — per §17's restated "disconnect must fully
revoke" sprint-wide rule, now demonstrated for its third distinct kind of
external footprint this sprint (Google token, Jira OAuth grant + webhook
subscription, and today, the Slack app installation itself).

---

## 11. Layer 6 — notify.worker.ts (Wiring the Slack Branch)

### The Structural Pattern, Applied Identically Across All Three Notification Types

```
For EACH of the three existing case blocks (MEETING_PROCESSED,
COMMITMENT_MISSED, DEADLINE_REMINDER), the SAME five-step sequence is
appended AFTER the existing, untouched email-dispatch logic:

STEP 1 — Check Integration Health:
  if (!slackIntegration?.isActive) → skip entirely, no log noise (a team
  that never connected Slack should not generate a log line on every
  single notification job — this is the expected, common case, not
  worth mentioning)

STEP 2 — Check Configuration Completeness:
  if (!slackIntegration.metadata.defaultChannelId) → for CHANNEL-bound
  messages (MEETING_PROCESSED only — the other two are DM-bound, see
  Step 2b) log at INFO ("Slack connected but no default channel
  configured — skipping") and skip; this is a genuinely different,
  more informative signal than Step 1's silent skip, since it tells an
  admin who half-finished setup exactly what's missing
  (STEP 2b, for DM-bound notification types): no channel configuration
  is needed at all — resolveUserByEmail() is attempted directly against
  the notification's target user

STEP 3 — Check User Preference:
  if (ownerPrefs?.slack?.{notificationType} === false) → skip, per the
  EXISTING, unmodified notification-preference system (Day 18/20's
  notification_preferences JSONB shape already anticipates a "slack"
  sub-object per notification type — today is simply the first day that
  sub-object's values are actually consulted before a real send, rather
  than being dead configuration with no live consumer)

STEP 4 — Build Blocks and Attempt Delivery:
  Call the appropriate pure builder from slack-blocks.ts, obtain a valid
  access token via getValidAccessToken() (§14), call
  sendChannelMessage() or sendDirectMessage() as appropriate for the
  notification type

STEP 5 — Independently Try/Catch:
  Wrapped in ITS OWN try/catch block, entirely separate from the email
  dispatch block above it and from any other channel's block — a
  caught Slack failure logs an ERROR (distinct from Step 1/2's benign
  INFO-level skips, since a delivery ATTEMPT failing is a genuinely
  different, more actionable signal than "not configured") and the
  function CONTINUES — it does not re-throw, does not fail the overall
  notify job, and does not prevent any subsequent channel or
  notification-type processing in the same job from proceeding.
```

### Which Notification Types Are Channel-Bound vs. DM-Bound

```
MEETING_PROCESSED    → CHANNEL (posts a team-wide summary to the
                        configured defaultChannelId) — this is a
                        team-visibility event by nature, matching the
                        HLD §11 "Meeting Summary Message" design intent
                        exactly

COMMITMENT_MISSED     → DM to the commitment owner (a personal
                        accountability signal — the HLD explicitly also
                        specifies "alert managers" via a SEPARATE DM,
                        meaning this case block sends TWO independent
                        DMs: one to the owner, one to each manager,
                        each independently try/caught per the SAME
                        Step 5 discipline, so a failed DM to one manager
                        never prevents the owner's DM or another
                        manager's DM from still succeeding)

DEADLINE_REMINDER     → DM to the commitment owner only (a personal,
                        forward-looking nudge — no manager visibility
                        needed for a reminder that hasn't yet become a
                        problem)
```

---

## 12. Layer 7 — HTTP Layer (Controller, Routes, Validators)

### Controllers (6 New/Modified Handlers)

- `connectSlackController` / `slackCallbackController` — thin wrappers
  around the SAME generic `initiateProviderConnect`/`completeProviderConnect`
  functions Jira already proved out, per §10.
- `listSlackChannelsController` — calls a Slack-specific service function
  paralleling Day 58's `getJiraProjects`, returning `{ id, name }[]`.
- `configureSlackController` — calls the SAME generic
  `configureProviderMetadata('SLACK', teamId, req.body)`.
- `disconnectSlackController` — calls `disconnectProvider('SLACK', ...)`.
- `testNotificationController` — **the one genuinely new piece of business
  wiring today**, at `POST /api/v1/notifications/test`: loads the current
  user's connected integrations (Slack, and confirms email delivery
  separately), constructs a SAMPLE payload for each connected channel
  (reusing `buildMeetingSummaryBlocks` with representative placeholder
  data, e.g. "This is a sample meeting summary"), and calls the SAME
  `sendChannelMessage`/`sendDirectMessage` functions the real
  `notify.worker.ts` path uses — critically, NOT a separate, parallel
  "test mode" implementation of message sending, ensuring a passing test
  notification is a genuine, meaningful confidence signal that the real
  pipeline will also work, not a facade that could pass while the real
  path is broken.

### Routes — Role Enforcement

Connect/callback/channels/configure/disconnect: `requireRole('ADMIN')`,
identical justification to every prior integration-management route this
sprint. `POST /notifications/test`: **any authenticated role** (per the
already-existing HLD §11 specification, unmodified today) — a MEMBER should
be able to verify THEIR OWN notification delivery is working without
needing elevated permissions, a meaningfully different concern from
connecting/reconfiguring the team's shared integration.

---

## 13. The IntegrationProvider Interface — Slack as the Partial-Implementation Stress Test

### Restating the Interface's Optional-Method Design (Day 58 §6)

```
export interface IntegrationProvider {
  readonly name: TeamProvider
  getAuthorizationUrl(state, teamId): string
  exchangeCodeForTokens(code): Promise<OAuthTokenResult>
  refreshAccessToken(refreshToken): Promise<OAuthTokenResult>
  testConnection(accessToken, metadata): Promise<boolean>
  createExternalItem(input): Promise<ExternalItemResult>
  updateExternalItemStatus?(...): Promise<void>   ← marked OPTIONAL
}
```

Notice `createExternalItem` itself is **not** marked optional on the
interface as originally specified (Day 58) — only `updateExternalItemStatus`
carries the `?`. This means today's Slack implementation faces a genuine
design decision the interface, as currently specified, does not cleanly
accommodate: Slack has no meaningful `createExternalItem` behavior at all.

### The Decision Made Today

Two candidate resolutions were weighed:

```
OPTION A — Retroactively mark createExternalItem optional on the shared
  interface (a one-line interface change), and have
  provider.registry.ts's getProvider() callers (integrate.worker.ts,
  specifically) already correctly handle a provider that doesn't
  implement it — which integrate.worker.ts ALREADY DOES, structurally,
  since it always routes through getProvider(provider) where provider is
  read from the job's own explicit provider field, meaning a job would
  only ever be enqueued for a provider the ENQUEUEING code (action-items
  sync flow) already knows supports ticket creation — Slack was never
  going to be a legal value for that job's provider field in the first
  place, since Day 20's sync endpoint only accepts JIRA/LINEAR/NOTION as
  valid sync targets.

OPTION B — Implement createExternalItem on slack.provider.ts as an
  explicit, immediate throw of AppError('PROVIDER_NOT_SUPPORTED', 501,
  'Slack does not support ticket creation'), satisfying the interface's
  CURRENT (non-optional) contract literally, while making misuse
  impossible to miss at runtime if it were ever mistakenly attempted.

DECISION FOR TODAY: Option A. Retroactively marking createExternalItem
as optional (`createExternalItem?(...)`) on provider.interface.ts is the
SMALL, HONEST INTERFACE CHANGE today's work reveals is correct, and
making it is preferable to Option B's "implement a method whose entire
body exists to say this method shouldn't be called" pattern, which is
exactly the kind of fake-behavior-to-satisfy-an-interface anti-pattern
§2's Principle 4 explicitly commits to avoiding. This is documented here,
explicitly, as a DELIBERATE, MINIMAL, JUSTIFIED refinement to Day 58's
original interface design — not a mistake being corrected, but the
interface maturing in exactly the way a well-designed abstraction should
when its second and third real implementations reveal which parts were
genuinely universal and which parts were (understandably, at the time)
overfit to Jira being the only implementation that existed yet.
```

### Why This Matters Beyond Today

This is the moment Phase 5's `IntegrationProvider` interface earns its
"proven, not just asserted" status. A code review today explicitly
confirms: (1) the one-line optional-marker change to `createExternalItem`,
(2) that `provider.registry.ts` and `integrate.worker.ts` required **zero**
further changes as a consequence, and (3) that `slack.provider.ts` contains
no stub, no fake implementation, no throwing placeholder for a capability
it genuinely doesn't have — three concrete, checkable facts (tracked in
§26) that collectively demonstrate the abstraction generalizes correctly
across genuinely different provider shapes, which was always the actual
point of building it on Day 58 in the first place.

---

## 14. Token Lifecycle — the Third Data-Point Proving getValidAccessToken() Generalizes

`token-refresh.service.ts`'s shared `getValidAccessToken()` helper (Day 56,
extended Day 58) is exercised today by its **third** distinct provider
behavior pattern:

```
Google Calendar (Day 56):  tokenExpiresAt IS SET, refresh does NOT
                            reissue a new refresh token
Jira (Day 58):              tokenExpiresAt IS SET, refresh DOES reissue
                            a new refresh token (the conditional-spread
                            persistence pattern, Day 58 §16)
Slack (today):               tokenExpiresAt is ALWAYS NULL, refreshAccessToken
                            is NEVER CALLED at all
```

The existing function's `needsRefresh` computation —
`integration.tokenExpiresAt && integration.tokenExpiresAt < addMinutes(new Date(), 30)`
— evaluates to `false` for a `null` `tokenExpiresAt` by the short-circuiting
behavior of the `&&` operator itself, with **zero code change required**
inside `getValidAccessToken()` to correctly handle Slack. This is the
concrete, mechanical proof that the function's original design — "the DATA
drives the behavior, not a provider-name check" (Day 58 §16) — was
genuinely provider-agnostic and not merely convenient-so-far. Today's
checklist (§26) includes an explicit item confirming
`token-refresh.service.ts` required literally zero modification, as the
final, strongest evidence for that claim.

**On `slack.provider.ts`'s `refreshAccessToken` method, specifically:**
because the shared interface requires it (it is NOT marked optional, unlike
`updateExternalItemStatus`/today's newly-optional `createExternalItem`),
Slack's implementation exists but is explicitly documented, in an inline
comment, as **unreachable in normal operation** — it exists purely to
satisfy the interface's type contract for a hypothetical future scenario
(Slack itself changing its token model, or a defensive code path
elsewhere calling it unconditionally) and its body, if ever actually
invoked, would correctly throw a clear
`AppError('SLACK_REFRESH_NOT_SUPPORTED', 501, ...)` rather than silently
doing nothing or crashing on an undefined operation.

---

## 15. Frontend Deliverables

### `SlackIntegration.tsx`

States, mirroring the by-now-established card pattern (Day 56, Day 58)
applied to its third provider:

```
NOT_CONNECTED       → "Connect Slack" button → useConnectSlack() (full-page
                       redirect, non-XHR OAuth navigation)

CONNECTED, NO        → workspace name shown ("Connected to TechFlow"),
DEFAULT CHANNEL       prominent "Choose a channel for meeting summaries"
                       prompt — mirroring Jira's "connected but
                       unconfigured" intermediate state (Day 58 §17)
                       exactly, applied to Slack's own required
                       configuration step

FULLY CONFIGURED     → workspace name, configured channel name (with a
                       "#" prefix, Slack convention), "Send test
                       notification" button (wired to the real
                       POST /notifications/test, §12), "Reconfigure" and
                       "Disconnect" actions

ERROR                 → distinct "Needs attention" state — though notably,
                       per §19, this state is EXPECTED TO BE RARE for
                       Slack specifically, since there's no token-expiry-
                       driven failure mode the way Google/Jira have; an
                       error state here more likely indicates the app was
                       manually removed from the Slack workspace via
                       Slack's own admin UI, an external revocation
                       Vocaply only discovers reactively, on the next
                       failed send attempt
```

### `SlackChannelPicker.tsx`

Consumes `useSlackChannels()` (`GET /slack/channels`) to populate a
searchable dropdown (public channels only, per §7's scope decision) — a
near-identical component shape to Jira's `JiraProjectConfigForm` (Day 58
§17), reusing the same underlying searchable-select UI primitive from the
shared component library rather than building a new one.

---

## 16. State & Lifecycle Design

### TeamIntegration (Slack) Row Lifecycle

```
                    ┌───────────────────┐
                    │   NOT CONNECTED   │  ← no row exists
                    └─────────┬─────────┘
                              │ OAuth callback succeeds (§10)
                    ┌─────────▼─────────┐
                    │ CONNECTED, NO      │  metadata.defaultChannelId unset
                    │ CHANNEL CONFIGURED │
                    └─────────┬─────────┘
                              │ PATCH /configure
                    ┌─────────▼─────────┐
                    │  FULLY CONFIGURED  │  isActive=true
                    │  (notify-ready)    │
                    └─────────┬─────────┘
                              │ (RARE — see below) manual removal from
                              │ Slack workspace, discovered reactively
                    ┌─────────▼─────────┐
                    │  DELIVERY FAILING  │  individual send attempts fail;
                    │  (not auto-disabled│  NOTE: today's design does NOT
                    │   at this layer)   │  wire Slack into the SAME
                    └────────────────────┘  5-consecutive-failures→
                                             isActive=false auto-disable
                                             mechanism Jira uses (Day 58
                                             §15) — EXPLICITLY, because a
                                             failed Slack send must never
                                             have any consequence beyond
                                             itself (§19); auto-disabling
                                             the INTEGRATION after
                                             repeated notify-job failures
                                             is a decision explicitly
                                             deferred, since implementing
                                             it today would require notify
                                             jobs to write back to
                                             consecutiveErrors in a way
                                             that risks violating the
                                             "Slack failure never affects
                                             anything else" isolation this
                                             day is built around — flagged
                                             here as a considered,
                                             deliberate scope boundary,
                                             not an inconsistency with
                                             Jira's pattern

                    From CONNECTED, admin-initiated:
                    │ DELETE /slack
                    ▼
                    auth.revoke called → row deleted → NOT CONNECTED
```

**Why Slack deliberately does NOT get the same auto-disable-after-5-failures
treatment Jira has:** Jira's auto-disable (Day 58 §15) exists because a
persistently-failing OUTBOUND sync represents a genuinely broken
configuration an admin needs to know about and fix (a wrong project key, a
revoked token) — the integration's core PURPOSE (ticket creation) is not
happening at all. Slack's failure mode is different in kind: even a
completely broken Slack integration never prevents a SINGLE notification
from reaching its recipient, because email delivery is entirely
independent and unaffected (§2 Principle 2). Auto-disabling Slack after
failures would add complexity and a new failure-tracking write path for a
scenario where the actual user-facing harm of NOT auto-disabling is
approximately zero — the admin will notice missing Slack messages on their
own timeline, without Vocaply needing to proactively flag it the way a
genuinely broken Jira sync (silently missing tickets nobody would otherwise
notice) demands.

---

## 17. Security Architecture

```
THREAT                                MITIGATION
─────────────────────────────────────────────────────────────────────────
CSRF on the OAuth callback            Provider-namespaced Redis state key
                                       (oauth:state:slack:{state}), SAME
                                       generalized pattern from Day 58 §12,
                                       now serving its THIRD provider
                                       namespace with zero additional
                                       infrastructure

Open redirect via callback            Allow-listed redirect constant,
                                       identical discipline to Days 56/58

Bot token treated as "less secret"    EXPLICITLY REJECTED — even though
because it doesn't expire             Slack bot tokens have no expiry-
                                       driven urgency, they remain
                                       AES-256-GCM encrypted at rest via
                                       the SAME crypto.service.ts, with
                                       the SAME never-logged, never-in-
                                       response-body discipline as every
                                       other credential this sprint. A
                                       non-expiring credential is, if
                                       anything, MORE valuable to an
                                       attacker (no natural expiry ever
                                       forces re-authentication), which
                                       argues for EQUAL OR GREATER care,
                                       never less

Scope creep                           chat:write + channels:read +
                                       users:read.email + im:write ONLY
                                       (§6) — no admin scopes, no
                                       destructive-capability scopes,
                                       explicitly justified per-scope

Interactive component forgery         OUT OF SCOPE TODAY by design (§2,
(future concern, explicitly NOT       restated) — no Block Kit interactive
addressed today)                      elements (buttons that trigger a
                                       callback TO Vocaply, as opposed to
                                       today's link-only "View Full
                                       Summary" button that simply opens a
                                       URL) are built today. The moment
                                       ANY interactive component is added
                                       in a future day, that work MUST
                                       include SLACK_SIGNING_SECRET-based
                                       request verification for
                                       slack.webhook.ts, mirroring the
                                       Recall.ai/Jira HMAC pattern exactly
                                       — today's link-only buttons carry
                                       NO such requirement, since a URL
                                       button click is just a normal,
                                       already-authenticated browser
                                       navigation to Vocaply's own web
                                       app, not an inbound webhook call
                                       Vocaply must independently verify

Least privilege on disconnect         auth.revoke called before local row
                                       deletion — Day 56/58/59's "disconnect
                                       must fully revoke" principle
                                       exercised for its fourth distinct
                                       external-footprint category this
                                       sprint (Google token, Jira OAuth
                                       grant, Jira webhook subscription,
                                       Slack app installation)

Tenant isolation                      Slack messages are sent using ONLY
                                       the connecting team's OWN bot token
                                       and OWN configured channel/DM
                                       targets — no cross-tenant message-
                                       sending path exists or is
                                       introduced today
```

---

## 18. Performance & Scalability Architecture

### Why No Dedicated Slack Rate Limiter Is Built Today (Restated and Justified Further)

```
Slack's chat.postMessage Tier 2 limit: ~1 request/second/channel,
enforced Slack-side with a 429 + Retry-After on violation.

Today's notify queue (Day 18/19) already runs at concurrency 5 — meaning
AT MOST 5 notify jobs process simultaneously across the ENTIRE platform,
not per-team and not per-channel. Given that a single notify job typically
sends AT MOST one channel message (MEETING_PROCESSED) or a small, bounded
number of DMs (COMMITMENT_MISSED's owner + N managers), the realistic
peak throughput against any SINGLE Slack channel is far below Slack's
per-channel ceiling under normal operation — a genuine burst scenario
(many teams' meetings concluding within the same minute, all posting to
DIFFERENT channels across DIFFERENT Slack workspaces) doesn't concentrate
load against any one channel's rate limit at all, since Slack's limit is
scoped per-channel, not platform-wide.

The one retryable failure mode this DOES leave unguarded against: a
single, unusually chatty team's channel receiving multiple rapid Vocaply
messages (e.g. several meetings processed back-to-back) COULD trip that
channel's own 1/sec ceiling — handled correctly, if unglamorously, by the
EXISTING exponential-backoff retry wrapper (§7) honoring Slack's
Retry-After header, exactly as designed for this exact scenario, without
requiring any NEW rate-limiting infrastructure.
```

### DM Channel Caching as Today's Primary Cost Lever

Exactly as incremental sync was Day 56's biggest lever and the assignee
cache was Day 58's, the no-TTL DM-channel-ID cache (§8) is today's — a team
with 10 members receiving personal deadline reminders daily would otherwise
pay a `conversations.open` API round-trip on literally every single
reminder, forever; with the cache, that cost is paid exactly once per
person, ever (barring the rare workspace-removal edge case, §8).

---

## 19. Reliability & Failure Handling

```
FAILURE MODE                          BEHAVIOR
─────────────────────────────────────────────────────────────────────────
Slack entirely unreachable/down       The Slack branch's independent
                                       try/catch (§11, Step 5) catches it,
                                       logs ERROR, the notify job's EMAIL
                                       dispatch (already completed, or
                                       running in its own independent
                                       block) is COMPLETELY UNAFFECTED —
                                       this is the single most important
                                       reliability property this entire
                                       day's design protects

App removed from Slack workspace       Next send attempt fails with a
via Slack's own admin UI (external,    Slack-side error (e.g.
outside Vocaply's control)             account_inactive or a similar
                                       slug) — caught, logged, notify job
                                       continues unaffected. NOT auto-
                                       disabled at the integration level
                                       today (§16's explicit design
                                       decision) — the admin discovers
                                       this via the settings page showing
                                       a stale "connected" state until
                                       they either notice missing
                                       messages or attempt a test
                                       notification (§12) and see it fail

DM channel cache references a          Send attempt fails against the
user later removed from the             stale channel ID; caught, logged,
Slack workspace                        NOT auto-invalidated today (§8's
                                       documented, accepted tradeoff) —
                                       every SUBSEQUENT attempt for that
                                       same user will ALSO fail
                                       identically until the cache entry
                                       is manually cleared or a future
                                       enhancement adds failure-triggered
                                       invalidation

Configured default channel is          Send attempt fails with
later archived/deleted in Slack        channel_not_found; caught, logged;
                                       the admin must notice and
                                       reconfigure via
                                       SlackChannelPicker (§15) — not
                                       proactively detected by Vocaply
                                       today

Test notification (§12) itself fails   Returns a clear, structured error
                                       response to the CALLING USER
                                       directly (this is the ONE path
                                       today where a Slack failure DOES
                                       surface synchronously to a human,
                                       by deliberate design — the entire
                                       point of a "test" action is
                                       immediate, honest feedback, unlike
                                       the fire-and-forget notify.worker
                                       path)
```

---

## 20. Observability & Monitoring

### Structured Log Events (New Today)

```
integrations.slack.connect_initiated    { teamId, userId }
integrations.slack.callback_failed      { teamId, reason }
notify.worker.slack.skipped_inactive    { teamId, notificationType } — no
                                          log at all in the common
                                          not-connected case (§11 Step 1);
                                          this line is reserved for a
                                          DIFFERENT, more specific signal
                                          if ever needed — see note below
notify.worker.slack.skipped_unconfigured { teamId, notificationType } — INFO
notify.worker.slack.skipped_preference   { teamId, userId, notificationType } — INFO
notify.worker.slack.user_unresolved      { teamId, email } — INFO, benign
notify.worker.slack.sent                { teamId, notificationType,
                                            channel: 'channel'|'dm', durationMs }
notify.worker.slack.send_failed         { teamId, notificationType, err } — ERROR
notifications.test.slack.sent           { userId, teamId }
notifications.test.slack.failed         { userId, teamId, err }
```

### Metrics (Grafana Dashboard Additions)

```
notify.slack.sent_total{type="channel"|"dm"}
notify.slack.failed_total{notification_type="meeting_processed"|"commitment_missed"|"deadline_reminder"}
notify.slack.skip_reason_total{reason="inactive"|"unconfigured"|"preference"|"unresolved_user"}
notify.slack.dm_cache_hit_ratio
```

The `notify.slack.*` metric naming convention deliberately mirrors
`integrate.jira.*`'s established `{feature}.{provider}.*` shape (Day 58
§22), reinforcing the same cross-provider dashboard-panel-reuse principle
via label dimensions rather than proliferating per-provider panels.

### Alerting — Deliberately Minimal Today

```
No CRITICAL/page-worthy alert is added for Slack delivery failures today
— consistent with §19's design, a Slack failure has no urgent, cascading
consequence the way a webhook signature-failure spike (Day 59) or a
sustained Jira sync failure rate (Day 58) does. A WARNING-tier addition
is reasonable follow-up work (e.g. "notify.slack.failed_total rate > 20%
over 1 hour" as a Slack-alert-to-the-team, ironically), but is explicitly
NOT built today, since manufacturing an alert for a low-urgency failure
mode would be inconsistent with the platform's own stated alerting
philosophy (Day 19: alerts should be actionable and proportionate to
actual user impact).
```

---

## 21. Redis Key Space Additions

```
NAMESPACE                    KEY FORMAT                                    TTL      VALUE
────────────────────────────────────────────────────────────────────────────────────────
OAuth CSRF (Slack,           oauth:state:slack:{state}                    600s     JSON { provider, teamId, userId }
extending the Day 58
provider-namespaced format)

Slack user resolution cache  cache:slack:user:{teamId}:{email}            86400s   Slack user ID, or "NONE"

Slack DM channel cache       cache:slack:dm-channel:{teamId}:{slackUserId} none     Slack DM channel ID (permanent)
```

---

## 22. API Endpoint Specification

### `GET /api/v1/integrations/slack/connect`

Role: ADMIN+. Response: `302` redirect to Slack's OAuth v2 authorization screen.

### `GET /api/v1/integrations/slack/callback`

No `requireAuth` (Redis-state-secured). Query: `code`, `state`, optional
`error`. Response: `302` redirect to an allow-listed settings destination.

### `GET /api/v1/integrations/slack/channels`

Role: ADMIN+. Response: `200` with
`{ success: true, data: { channels: { id: string; name: string }[] } }`.

### `PATCH /api/v1/integrations/slack/configure`

Role: ADMIN+. Body: `{ defaultChannelId, defaultChannelName }`. Response:
`200` with the updated integration's sanitized representation.

### `DELETE /api/v1/integrations/slack`

Role: ADMIN+. Response: `200` with
`{ success: true, data: { message: 'Slack disconnected' } }`.

### `POST /api/v1/notifications/test`

Role: any authenticated user. Body: optional `{ channel?: 'slack' | 'email' }`
(defaults to testing every connected channel for the requesting user).
Response: `200` with
`{ success: true, data: { results: { channel: string; success: boolean; error?: string }[] } }`
— reporting per-channel outcome individually, since a user testing both
email and Slack should see each channel's result independently, not a
single collapsed pass/fail.

### HTTP Status Reference (This Day's Additions)

```
200  OK               → channels list, configure, disconnect, test success
                         (note: "test success" here means the REQUEST
                         completed and returned a results array — an
                         individual channel WITHIN that array can still
                         report success: false without the overall HTTP
                         call being anything other than 200, since the
                         endpoint's job is to REPORT outcomes, not to
                         fail the request itself over a downstream
                         delivery failure)
302  Found             → connect (to Slack), callback (to frontend)
401  Unauthorized      → missing/invalid JWT
403  Forbidden         → non-ADMIN attempting management routes
502  Bad Gateway       → Slack's OAuth/API entirely unreachable during
                          connect (callback path only, same precedent as
                          Days 56/58)
```

---

## 23. Error Taxonomy

```
SLACK_AUTH_CODE_INVALID          400-class  → OAuth callback: bad/expired code
SLACK_TOKEN_INVALID               401-class  → bot removed/token revoked
                                                externally (§19)
SLACK_CHANNEL_NOT_FOUND           404-class  → configured channel archived/
                                                deleted (§19)
SLACK_USER_NOT_FOUND              —          → NOT an error; resolveUserByEmail's
                                                normal "no match" return (§7)
SLACK_RATE_LIMITED                429-class  → retry honoring Retry-After
SLACK_SERVICE_ERROR               5xx-class  → retry with backoff, max 3
SLACK_REFRESH_NOT_SUPPORTED       501        → defensive-only; unreachable
                                                in normal operation (§14)
PROVIDER_NOT_SUPPORTED            501        → attempting createExternalItem
                                                against Slack post-§13's
                                                interface refinement (should
                                                be structurally unreachable
                                                given Day 20's sync-target
                                                validation, defended anyway)
```

---

## 24. Hour-by-Hour Execution Plan

```
9:00 – 9:30    Slack app configuration audit: confirm the registered Slack
               app's bot scopes match §6 exactly, confirm OAuth v2 (not
               the legacy v1) flow, verify redirect URI configuration —
               done BEFORE any code, since a misconfigured Slack app
               wastes the rest of the day debugging a symptom, not a cause

9:30 – 10:15   slack.provider.ts: getAuthorizationUrl, exchangeCodeForTokens
               (with explicit ok:false/error-slug handling, distinct from
               every prior provider's status-code-driven pattern),
               listChannels

10:15 – 11:00  slack.provider.ts: resolveUserByEmail with positive/negative
               Redis caching (24h TTL, mirroring Jira's pattern exactly)

11:00 – 12:00  slack.provider.ts: sendChannelMessage, sendDirectMessage
               (with the no-TTL DM-channel-ID cache)

12:00 – 1:00   Lunch

1:00 – 1:45    notifications/slack-blocks.ts: buildMeetingSummaryBlocks,
               buildCommitmentMissedBlocks, buildDeadlineReminderBlocks —
               written and unit-tested as pure functions before any
               worker wiring touches them

1:45 – 2:45    notify.worker.ts: the 5-step Slack branch appended to all
               3 existing case blocks, each independently try/caught,
               preference-aware, channel-vs-DM routing correct per §11's
               table

2:45 – 3:30    integrations.service.ts: confirm the GENERIC connect/
               configure/disconnect functions work unmodified for Slack;
               add the ONE Slack-specific post-processing hook (workspace
               id/name/botUserId persistence); provider.registry.ts:
               fill the SLACK slot; provider.interface.ts: the single
               justified createExternalItem?() optional-marker change (§13)

3:30 – 4:15    integrations.controller.ts + routes + validators (6
               endpoints); notifications.controller.ts: wire the REAL
               POST /notifications/test against the SAME send functions
               notify.worker.ts uses

4:15 – 5:00    Frontend: SlackIntegration.tsx (4-state card) +
               SlackChannelPicker.tsx + hooks

5:00 – 5:30    Manual E2E test against a real Slack workspace: connect →
               configure channel → trigger a real MEETING_PROCESSED event
               → verify channel message → trigger COMMITMENT_MISSED →
               verify owner + manager DMs → send a test notification →
               verify it uses the identical code path

5:30 – 6:00    Checklist review + Phase 5 sprint retrospective (§27) +
               sign-off
```

---

## 25. Testing & Verification Plan

### Provider Layer (Unit, Mocked HTTP)

```
Test 1 — getAuthorizationUrl requests ONLY bot scopes (chat:write,
         channels:read, users:read.email, im:write), never populates
         user_scope
Test 2 — exchangeCodeForTokens correctly extracts team.id, team.name,
         bot_user_id from a realistic mocked Slack response shape
Test 3 — A mocked response with ok: false, error: "invalid_auth" (HTTP
         200 status) is correctly detected and mapped to a retryable-or-
         not error per §23 — proving the ok-field-inspection pattern
         works, not just status-code checking
Test 4 — resolveUserByEmail with a users_not_found error → returns null,
         does NOT throw
Test 5 — sendDirectMessage correctly calls conversations.open THEN
         chat.postMessage, in that order, using the resolved channel ID
```

### Block Builders (Pure Unit Tests, No Mocking Needed)

```
Test 1 — buildMeetingSummaryBlocks with commitmentCount: 0 → the
         "Commitments Extracted" section is ABSENT from the output
         (not present-but-empty)
Test 2 — buildMeetingSummaryBlocks with openFromLastWeek: [] → the
         "Open From Before" section is absent
Test 3 — buildCommitmentMissedBlocks and buildDeadlineReminderBlocks
         produce STRUCTURALLY DIFFERENT output for identical underlying
         data (proving they are genuinely distinct functions, not
         accidentally identical copies)
```

### Caching (Unit + Integration)

```
Test 1 — Email resolution: cache miss → live lookup → cache set →
         second call for same email → NO live lookup (mock/spy assertion)
Test 2 — Email resolution negative cache: "NONE" sentinel correctly
         short-circuits a second lookup attempt
Test 3 — DM channel cache: first sendDirectMessage call → conversations.open
         IS called; second call to the SAME user → conversations.open is
         NOT called (mock/spy assertion), confirming the no-TTL cache
         behavior
```

### Worker Integration (Real Redis + Test DB, Mocked Slack)

```
Test 1 — MEETING_PROCESSED with Slack connected + configured + owner
         preference enabled → channel message sent; email dispatch
         ALSO still occurs (assert BOTH, proving additive, not
         replacement, behavior)
Test 2 — Same, but Slack integration inactive → channel message NOT
         attempted; email STILL sent (isolation proof)
Test 3 — Same, but Slack API call throws (simulated network failure) →
         caught, logged, job completes successfully overall (email
         dispatch's success/failure is entirely independent — verify the
         job doesn't fail/retry due to the Slack error)
Test 4 — COMMITMENT_MISSED with 2 managers configured → 3 total DM
         attempts (owner + 2 managers), each independently try/caught —
         simulate ONE manager's DM failing → confirm the owner's DM AND
         the other manager's DM still succeed
Test 5 — User preference slack.commitmentMissed: false → Slack branch
         skipped entirely for that notification type, email unaffected
```

### End-to-End (Manual, Real Slack Workspace)

```
Test 1 — Full OAuth connect: consent screen → callback → workspace
         name/bot_user_id correctly persisted, visible in settings
Test 2 — Configure a default channel → trigger a real meeting-processed
         event → verify the Block Kit message renders correctly in
         Slack's actual UI (not just structurally valid JSON — visually
         correct, readable, correctly formatted)
Test 3 — Trigger a real commitment-missed event → verify the owner
         receives a DM, and a configured manager also receives a
         separate DM
Test 4 — Use the "Send test notification" button (§12/§15) → verify it
         succeeds and the resulting message is visually indistinguishable
         in format/quality from a real notification (proving it uses the
         SAME code path, not a parallel demo path)
Test 5 — Disconnect → verify (via Slack's own "Apps" management page in
         the workspace) the Vocaply app installation is genuinely
         removed, not just locally forgotten
Test 6 — Remove the Vocaply app from Slack via Slack's OWN admin UI
         (simulating external revocation, §19) → trigger a notification
         → confirm it fails gracefully (logged, email unaffected) rather
         than crashing the worker
```

---

## 26. End-of-Day Checklist

```
SCHEMA
  [ ] Confirmed ZERO migrations needed — team_integrations already
      supports Slack's provider enum value and nullable refresh-token/
      expiry columns from Day 3

DATA MODEL PLACEMENT
  [ ] Slack integration correctly lives in team_integrations, NOT
      user_integrations — explicit sanity check per §6/§17, confirmed by
      code review, not assumed

BOT TOKEN DISCIPLINE
  [ ] getAuthorizationUrl requests ONLY bot scopes via the `scope`
      parameter — `user_scope` is never populated (grep to confirm)
  [ ] Persisted token is verified (via a manual sandbox test) to remain
      valid after simulating the connecting admin's account being
      deactivated (as close to this as the sandbox environment allows,
      or at minimum confirmed conceptually against Slack's documented
      bot-token behavior)

ABSTRACTION PROOF (§13 — THIS DAY'S HEADLINE ARCHITECTURAL DELIVERABLE)
  [ ] provider.interface.ts's ONLY change today is marking
      createExternalItem as optional (`?`) — no other interface change
  [ ] slack.provider.ts implements NO fake/stub createExternalItem —
      either omits it entirely or the interface change makes omission valid
  [ ] provider.registry.ts and integrate.worker.ts required ZERO changes
      beyond filling the SLACK registry slot — grep-confirmed
  [ ] token-refresh.service.ts required ZERO code changes — Slack's null
      tokenExpiresAt correctly short-circuits existing logic, verified
      via a real connect + a real getValidAccessToken() call

NOTIFY WORKER — ADDITIVE, NEVER LOAD-BEARING (§2 PRINCIPLE 2)
  [ ] Email dispatch code, across all 3 case blocks, is BYTE-FOR-BYTE
      unchanged in the diff (verified via git diff review, not just
      described)
  [ ] Slack branch is independently try/caught, separate from email's
      try/catch, in all 3 case blocks
  [ ] A simulated Slack API failure does NOT fail, retry, or delay the
      overall notify job (integration test, §25)
  [ ] A simulated Slack failure does NOT prevent email delivery
      (integration test, §25)

CHANNEL VS. DM ROUTING
  [ ] MEETING_PROCESSED → channel message only
  [ ] COMMITMENT_MISSED → DM to owner AND separately to each manager,
      independently try/caught per recipient
  [ ] DEADLINE_REMINDER → DM to owner only

CACHING
  [ ] User resolution: positive AND negative caching both verified (24h TTL)
  [ ] DM channel ID: no-TTL caching verified (second send to same user
      makes zero conversations.open calls)

SECURITY
  [ ] Bot token AES-256-GCM encrypted at rest — spot-checked in the
      database, same rigor as every prior token this sprint despite its
      non-expiring nature
  [ ] No token values in any log line (grep confirmed)
  [ ] Only chat:write, channels:read, users:read.email, im:write scopes
      requested — verified against the actual consent screen shown
      during manual testing
  [ ] Disconnect calls Slack's auth.revoke BEFORE local row deletion

TEST NOTIFICATION
  [ ] POST /notifications/test uses the SAME underlying send functions
      as notify.worker.ts — no parallel/demo-only implementation exists
  [ ] Per-channel results reported individually in the response, not
      collapsed into a single pass/fail

FRONTEND
  [ ] SlackIntegration renders all documented states correctly
  [ ] SlackChannelPicker correctly populates from GET /channels

SIGN-OFF
  [ ] Full manual E2E test pass completed against a REAL Slack workspace
      (connect → configure → real notification → test notification →
      disconnect → verify removed)
  [ ] External-revocation resilience test completed (app removed via
      Slack's own UI, subsequent notification attempt fails gracefully)
```

---

## 27. Phase 5 Sprint Retrospective — What Days 56–60 Collectively Prove

Today closes the first five-day arc of Phase 5. Before moving on to Linear
(Day 61) and Notion (Day 62), the sprint's actual architectural thesis is
worth stating plainly, as the explicit output of today's final planning
hour:

```
CLAIM: A single IntegrationProvider interface, a single provider registry,
and a single getValidAccessToken() helper can correctly serve FOUR
external systems with meaningfully different auth models and data
directions, with NO per-provider special-casing leaking into the shared
orchestration layer.

EVIDENCE ACCUMULATED ACROSS THE SPRINT:
  Day 56 (Google Calendar): read-only ingestion, user-level credential,
    refresh token that never reissues
  Day 57 (Dedup hardening): proved the SHARED dedup utility correctly
    generalizes across two independent producers (manual add, calendar
    sync) at real concurrency — a parallel, equally important
    "abstraction actually works" proof alongside the provider interface's
  Day 58 (Jira outbound): write-out, team-level credential, refresh token
    that DOES reissue, required exactly ONE acknowledged provider-
    specific orchestration hook (cloudId resolution)
  Day 59 (Jira inbound webhook): proved Day 18's GENERIC webhook
    ingestion pattern (a full sprint-and-a-half old, at this point)
    needed zero modification for a third provider
  Day 60 (Slack): team-level credential, NO token expiry at all, required
    a SECOND acknowledged provider-specific orchestration hook (workspace
    identity persistence), and — most importantly — revealed and
    corrected a genuine gap in the original interface design
    (createExternalItem needing to be optional), which the abstraction
    absorbed as a small, honest refinement rather than a rewrite

CONCLUSION FOR THE TEAM GOING INTO DAY 61/62: Linear and Notion should
each require, if today's abstraction is sound: one new provider file, one
registry line, and AT MOST one small, acknowledged, provider-specific
orchestration hook if their OAuth/data model demands it (following the
now twice-precedented cloudId/workspace-identity pattern) — and NOTHING
ELSE should need to change in integrations.service.ts, provider.registry.ts,
token-refresh.service.ts, or any webhook infrastructure. THIS is the
concrete, falsifiable prediction the sprint's architecture makes about
itself, and Days 61/62 are where it gets tested one final time before
Phase 5 moves on.
```

---

## 28. Risks & Edge Cases Register

```
RISK                                          MITIGATION / DISPOSITION
─────────────────────────────────────────────────────────────────────────────
Slack app manually removed from the           Accepted, documented (§16,
workspace via Slack's own admin UI —          §19) — no active detection
Vocaply has no proactive signal this           built today; discovered
happened until the next failed send            reactively via a failed
attempt                                       send or a test notification;
                                               explicit design choice NOT
                                               to auto-disable given the
                                               low-urgency nature of a
                                               Slack-only failure (§16)

DM channel cache staleness after a            Accepted, documented (§8,
user is removed from the Slack                §19) tradeoff — no active
workspace                                     invalidation built today;
                                               every subsequent send to
                                               that user fails identically
                                               until manually addressed or
                                               a future enhancement adds
                                               failure-triggered cache
                                               invalidation

Slack's ok:false + error-slug pattern         Explicitly called out (§7,
being missed by a developer pattern-          §24) as a genuine departure
matching too literally against Google's/      from every prior provider's
Jira's status-code-driven error detection      error-detection pattern —
                                               flagged for careful review
                                               during implementation, not
                                               assumed to be "the same as
                                               before"

createExternalItem interface change (§13)     Deliberately scoped as the
being perceived as scope creep beyond          SMALLEST possible change
"just build Slack notifications"               (a single `?` marker) that
                                               makes an honest interface
                                               more accurately reflect
                                               reality — documented
                                               extensively (§13) as a
                                               considered refinement, not
                                               an unplanned expansion of
                                               today's work

No auto-disable mechanism for a                Accepted, deliberate
persistently-broken Slack integration          asymmetry with Jira's
(in contrast to Jira's 5-failure                pattern (§16) — justified
auto-disable)                                  by the fundamentally
                                               different consequence
                                               profile of a failure in
                                               each provider; explicitly
                                               NOT an oversight, and
                                               flagged as a considered
                                               future enhancement
                                               (WARNING-tier alerting,
                                               §20) rather than a gap in
                                               today's design

Test notification (§12) and the real           Explicitly verified as
notify.worker path silently diverging          using the IDENTICAL send
over time if a future engineer modifies        functions (§12's stated
one without the other                          design requirement,
                                               tested in §25/§26) — the
                                               shared-function design is
                                               the mitigation itself; the
                                               risk would only
                                               materialize if a future
                                               change violated this
                                               day's established pattern,
                                               which is why it's recorded
                                               here as an ongoing
                                               maintenance invariant to
                                               protect, not a one-time
                                               task
```

---

*Document: DAY-60-PLAN-001 | Vocaply | Day 60: Slack Integration*
*Full Scalable Industry-Level Build Plan | Principal Backend Engineer Edition*
*Phase 5 — Integrations | Planning & Architecture Blueprint — No Code, Pure Design*
*Bot-token durability · Additive-never-load-bearing notifications · Interface refinement · Sprint-closing abstraction proof*
