# Vocaply — Day 58: Jira Integration (Outbound)
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-58-PLAN-001 | Version 1.0 | Phase 5 — Integrations | Planning Only — No Code

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Architecture Philosophy](#2-architecture-philosophy)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Dependency Flow & Layering](#4-dependency-flow--layering)
5. [Data Model — What Already Exists vs. What's Added](#5-data-model--what-already-exists-vs-whats-added)
6. [Layer 1 — The Provider Abstraction](#6-layer-1--the-provider-abstraction)
7. [Layer 2 — Provider Registry](#7-layer-2--provider-registry)
8. [Layer 3 — Jira Provider Implementation](#8-layer-3--jira-provider-implementation)
9. [Layer 4 — Jira Cloud ID Resolution (The Critical Jira-Specific Step)](#9-layer-4--jira-cloud-id-resolution-the-critical-jira-specific-step)
10. [Layer 5 — Assignee Resolution & Caching](#10-layer-5--assignee-resolution--caching)
11. [Layer 6 — Priority & Field Mapping](#11-layer-6--priority--field-mapping)
12. [Layer 7 — integrations.service.ts (OAuth Orchestration)](#12-layer-7--integrationsservicets-oauth-orchestration)
13. [Layer 8 — HTTP Layer (Controller, Routes, Validators)](#13-layer-8--http-layer-controller-routes-validators)
14. [Layer 9 — integrate.worker.ts (Real Jira Branch)](#14-layer-9--integrateworkerts-real-jira-branch)
15. [Layer 10 — Retry Policy Design](#15-layer-10--retry-policy-design)
16. [Token Lifecycle Integration](#16-token-lifecycle-integration)
17. [Frontend Deliverables](#17-frontend-deliverables)
18. [State & Lifecycle Design](#18-state--lifecycle-design)
19. [Security Architecture](#19-security-architecture)
20. [Performance & Scalability Architecture](#20-performance--scalability-architecture)
21. [Reliability & Failure Handling](#21-reliability--failure-handling)
22. [Observability & Monitoring](#22-observability--monitoring)
23. [Redis Key Space Additions](#23-redis-key-space-additions)
24. [API Endpoint Specification](#24-api-endpoint-specification)
25. [Error Taxonomy](#25-error-taxonomy)
26. [Hour-by-Hour Execution Plan](#26-hour-by-hour-execution-plan)
27. [Testing & Verification Plan](#27-testing--verification-plan)
28. [End-of-Day Checklist](#28-end-of-day-checklist)
29. [Risks & Edge Cases Register](#29-risks--edge-cases-register)

---

## 1. Day Overview & Goals

### What Gets Built Today

Days 56–57 built the calendar ingestion pipeline and hardened the
deduplication layer that protects it — both concerned with **data flowing
into** Vocaply. Day 58 is the pivot point of Phase 5: the first day Vocaply
**writes data outward** into a third-party system of record. A team connects
their Jira Cloud instance, and from that point forward, action items
extracted from meeting transcripts become real, visible Jira tickets —
either automatically (queued from the extraction pipeline) or on-demand (via
the already-existing Day 20 `POST /action-items/:id/sync` endpoint, whose
contract this day finally fulfills with a real implementation instead of a
scaffold).

Just as important as the Jira-specific plumbing: today is the day the
codebase commits to a **generic `IntegrationProvider` interface** and a
**provider registry**. This is a deliberate architectural investment — Jira
is the first of at least three planned outbound integrations (Linear, Day
61; Notion, Day 62), and the entire value of building the abstraction today,
on the *first* provider, is that Days 61 and 62 become "implement the
interface, add one registry line" rather than "duplicate today's
orchestration logic a second and third time." If the abstraction is skipped
today in favor of Jira-specific shortcuts, Days 61/62 pay the cost twice
over.

```
TODAY BUILDS:
  ✅ IntegrationProvider interface — the shared contract every outbound
     provider (Jira today, Linear/Notion later) implements
  ✅ provider.registry.ts — the single lookup point integrations.service.ts
     and integrate.worker.ts depend on, never a concrete provider directly
  ✅ jira.provider.ts — OAuth 2.0 (3LO), cloudId resolution, issue creation,
     assignee resolution, connection testing
  ✅ Atlassian Document Format (ADF) description builder
  ✅ Priority mapping table (Vocaply enum → Jira priority name)
  ✅ integrate.worker.ts — replaces the Day 18 scaffold with a real,
     idempotent, retryable Jira sync branch
  ✅ 5 new REST endpoints (connect, callback, projects, configure, disconnect)
  ✅ Redis-cached email→accountId resolution (24h TTL)
  ✅ Distinct 5-attempt retry policy for the integrate queue, justified
     against the transcribe/extract queues' different policies
  ✅ Frontend: JiraIntegration settings card + project/issue-type configuration UI

DOWNSTREAM IMPACT:
  Day 59 — Jira's REVERSE webhook (ticket status → action item status) can
           only exist because today establishes the OAuth connection, the
           cloudId, and the action_items.jiraIssueId linkage it looks up
           against
  Day 61/62 — Linear and Notion are, by design, mechanical extensions of
           today's IntegrationProvider interface — if either of those days
           requires touching integrations.service.ts's core orchestration
           logic, that is a signal today's abstraction was insufficiently
           generic and should be revisited, not a normal cost of adding a
           provider
  Day 64 — The proactive token-refresh cron treats team_integrations rows
           (Jira, Slack) exactly like Day 56 taught it to treat
           user_integrations rows (Google Calendar) — via the SAME shared
           getValidAccessToken() helper, extended today to its second provider

DO NOT SKIP OR RUSH:
  Getting the cloudId resolution step wrong (§9) is the single most common
  real-world Jira OAuth integration bug industry-wide — silently building a
  Jira client that "mostly works" until the first API call 404s because it
  was never routed through the resource-scoped cloud endpoint. Getting the
  ADF description format wrong means every single ticket creation attempt
  fails with a 400 the very first time it's tried against a real Jira Cloud
  instance, not caught by any mocked test. Both are addressed explicitly and
  deliberately today, not left as "figure it out during QA" gaps.
```

### 8-Hour Time Allocation

```
9:00 AM  – 9:45 AM   → provider.interface.ts + provider.registry.ts (the
                        shared contract, written BEFORE any Jira-specific code)
9:45 AM  – 10:45 AM  → jira.provider.ts: OAuth URL, code exchange, refresh,
                        cloudId resolution (accessible-resources call)
10:45 AM – 11:30 AM  → jira.provider.ts: createExternalItem() + ADF builder
                        + priority mapping
11:30 AM – 12:00 PM  → jira.provider.ts: resolveJiraAssignee() + Redis cache
12:00 PM – 1:00 PM   → Lunch break
1:00 PM  – 1:45 PM   → integrations.service.ts: connect/callback/configure/
                        disconnect orchestration for Jira specifically
1:45 PM  – 2:30 PM   → integrate.worker.ts: replace Day 18 scaffold with the
                        real Jira branch, idempotency, error classification
2:30 PM  – 3:00 PM   → Retry policy configuration + 4xx-vs-5xx error mapping
3:00 PM  – 3:45 PM   → integrations.controller.ts + routes + validators
                        (5 new endpoints)
3:45 PM  – 4:30 PM   → Frontend: JiraIntegration.tsx + project/issue-type
                        configuration form
4:30 PM  – 5:15 PM   → Manual end-to-end test against a REAL Jira Cloud
                        sandbox instance
5:15 PM  – 5:45 PM   → Observability wiring (metrics, structured logs)
5:45 PM  – 6:00 PM   → Checklist review + sign-off
```

---

## 2. Architecture Philosophy

### Five Guiding Principles for Today's Build

```
PRINCIPLE 1 — The Interface Comes First, the Implementation Comes Second
  provider.interface.ts is written and reviewed BEFORE a single line of
  Jira-specific code exists. This ordering is deliberate: it forces the
  interface's shape to be justified by what a GENERIC outbound integration
  needs, not retrofitted around whatever Jira's API happens to look like —
  the surest way to end up with an interface that secretly only works for
  Jira.

PRINCIPLE 2 — No Caller Ever Imports a Concrete Provider
  integrations.service.ts and integrate.worker.ts depend ONLY on
  provider.registry.ts's getProvider() function. Neither file contains the
  string "Jira" in an import statement or a conditional branch. This is the
  literal, mechanical test for whether the abstraction is doing its job.

PRINCIPLE 3 — Every Outbound Call Is Wrapped, Timed, and Typed
  Exactly like recall.service.ts (Day 17) and google-calendar.provider.ts
  (Day 56) before it: dedicated HTTP client, explicit timeout, typed retry-
  eligible error mapping, structured logging with correlation context. Jira
  is not a special case that gets looser discipline than the integrations
  that came before it.

PRINCIPLE 4 — Configuration Is Not a Secret
  cloudId, projectKey, defaultIssueType are business configuration, stored
  in plaintext JSONB metadata. OAuth tokens are secrets, AES-256-GCM
  encrypted. Conflating these two categories — either by over-encrypting
  config (breaking queryability) or under-encrypting tokens (a real
  security incident) — is the single most consequential category error
  possible in this day's data model, and is called out explicitly wherever
  the metadata shape is discussed.

PRINCIPLE 5 — External Side Effects Get External-Grade Retry Discipline
  A failed database write can simply be retried with no user-visible
  consequence. A failed-then-retried Jira ticket creation risks a DUPLICATE
  ticket appearing on someone's board if idempotency isn't airtight. Every
  retry decision made today is justified against this asymmetry, not
  copy-pasted from the transcribe/extract queues' policies.
```

---

## 3. File Structure to Create

```
services/api/src/
│
├── modules/integrations/
│   ├── integrations.controller.ts          ← MODIFY: 5 new Jira handlers
│   ├── integrations.service.ts             ← MODIFY: generic OAuth orchestration
│   │                                          (connect/callback/configure/disconnect)
│   │                                          written generically, Jira is its first caller
│   ├── integrations.repository.ts          ← MODIFY: TeamIntegration CRUD
│   │                                          (findActive, upsert, updateMetadata)
│   ├── integrations.validator.ts           ← MODIFY: Jira-specific Zod schemas
│   ├── integrations.types.ts               ← MODIFY: CreateExternalItemInput,
│   │                                          ExternalItemResult, JiraMetadata
│   ├── integrations.routes.ts              ← MODIFY: register 5 new routes
│   └── providers/
│       ├── provider.interface.ts           ← NEW: shared contract
│       ├── provider.registry.ts            ← NEW: factory/lookup
│       └── jira.provider.ts                ← NEW: Jira Cloud REST client
│
├── modules/action-items/
│   └── action-items.service.ts             ← MODIFY: wire POST /:id/sync to
│                                              enqueue a real integrate job
│                                              (was a Day 20 stub-acknowledging
│                                              endpoint until today)
│
├── queues/
│   ├── workers/
│   │   └── integrate.worker.ts             ← REPLACE SCAFFOLD (Day 18 stub
│   │                                          → real Jira branch)
│   └── jobs/
│       └── integrate.job.ts                ← MODIFY: finalize IntegrateJobData shape
│
├── services/
│   ├── crypto.service.ts                   ← REUSED — no changes
│   └── token-refresh.service.ts            ← MODIFY (Day 56 origin): extend
│                                              the provider registry it consults
│                                              to include Jira
│
└── config/
    └── oauth-providers.config.ts           ← MODIFY (Day 56 origin): add
                                                JIRA constants alongside
                                                GOOGLE_CALENDAR

apps/web/src/features/integrations/
├── components/
│   ├── providers/
│   │   └── JiraIntegration.tsx             ← NEW
│   ├── JiraProjectConfigForm.tsx           ← NEW: project/issue-type/priority picker
│   └── IntegrationCard.tsx                 ← REUSED (Day 56 generic shell)
├── hooks/
│   ├── useConnectJira.ts                   ← NEW
│   ├── useJiraProjects.ts                  ← NEW
│   └── useConfigureJira.ts                 ← NEW
└── api/
    └── integrations.api.ts                 ← MODIFY: 5 new endpoint calls
```

### What Is Explicitly NOT Built Today

No new database tables and no new columns beyond what the Day 3 schema
already provisions (`team_integrations.metadata` JSONB, `action_items.jiraIssueId`
/`jiraIssueUrl`/`jiraIssueSyncedAt`) — confirmed, not assumed, in §5. No
Jira webhook (that is explicitly Day 59's scope). No Linear or Notion
provider implementation (Days 61/62) — only the registry slot for them.

---

## 4. Dependency Flow & Layering

```
HTTP-triggered path (connect/configure/disconnect/manual sync):
integrations.routes.ts
  └── integrations.controller.ts (req/res only)
        └── integrations.service.ts (orchestration — provider-agnostic)
              ├── provider.registry.ts → jira.provider.ts (Jira-specific HTTP)
              ├── integrations.repository.ts (Prisma — TeamIntegration CRUD)
              ├── crypto.service.ts (token encrypt/decrypt)
              └── redis (OAuth CSRF state)

action-items.service.ts (Day 20 endpoint, wired for real today)
  POST /:id/sync
    └── enqueues a job onto the 'integrate' BullMQ queue (does NOT call
        the provider directly — the whole point of a queue here is that
        ticket creation is async, retryable, and never blocks the HTTP
        response, per the Day 18 "async heavy work" principle)

integrate.worker.ts (job-triggered path, both from manual sync AND future
                      automatic extraction-pipeline triggers)
  └── calls the SAME integrations orchestration primitives as the HTTP path
        ├── provider.registry.ts → jira.provider.ts
        ├── token-refresh.service.ts.getValidAccessToken()
        └── action-items.repository.ts (persist jiraIssueId/Url/SyncedAt)
```

**Design rule enforced today:** the HTTP-triggered `POST /:id/sync` endpoint
never calls `jira.provider.ts` directly and never blocks on the Jira API
call — it validates the request, checks the per-team throttle (Day 20 §6.2),
enqueues a job with an idempotency key, and returns `202`-shaped
acknowledgment immediately. All actual provider communication happens inside
`integrate.worker.ts`, exactly mirroring the Day 18 principle that heavy,
potentially-slow, potentially-failing external work never runs inside the
request/response cycle.

---

## 5. Data Model — What Already Exists vs. What's Added

### Already Exists (Day 3 schema) — Confirmed, No Migration Needed Today

```sql
-- team_integrations (already defined, Day 3/DB-SCHEMA-001)
CREATE TABLE team_integrations (
  id                  VARCHAR(36)     PRIMARY KEY,
  team_id             VARCHAR(36)     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  provider            team_provider   NOT NULL,   -- 'JIRA' | 'LINEAR' | 'SLACK' | 'NOTION'
  access_token_enc    TEXT            NOT NULL,
  refresh_token_enc   TEXT,
  token_expires_at    TIMESTAMPTZ,
  workspace_id        VARCHAR(255),               -- unused by Jira (cloudId lives in metadata)
  workspace_name      VARCHAR(255),               -- e.g. "techflow.atlassian.net"
  workspace_url       TEXT,
  metadata            JSONB           NOT NULL DEFAULT '{}',
  is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
  last_synced_at      TIMESTAMPTZ,
  last_error          TEXT,
  consecutive_errors  SMALLINT        NOT NULL DEFAULT 0,
  connected_by_id     VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,
  disconnected_by_id  VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,
  disconnected_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_team_int_team_provider ON team_integrations (team_id, provider);
CREATE INDEX idx_team_int_expiry ON team_integrations (token_expires_at)
  WHERE is_active = TRUE AND token_expires_at IS NOT NULL;
```

```sql
-- action_items, relevant subset (already defined, Day 3/DB-SCHEMA-001)
jira_issue_id           VARCHAR(50)    -- "TECH-142", the human-readable key
jira_issue_url          TEXT
jira_issue_synced_at    TIMESTAMPTZ

CREATE UNIQUE INDEX idx_ai_jira_issue ON action_items (jira_issue_id)
  WHERE jira_issue_id IS NOT NULL;
```

Every field this day needs — the generic `team_integrations` shape for the
OAuth connection, the JSONB `metadata` column for Jira-specific config, and
the three `jira*` columns on `action_items` — was **deliberately
pre-provisioned** in the Day 3 schema. The unique partial index
`idx_ai_jira_issue` is what will power Day 59's reverse-webhook lookup; today's
code must respect it by construction (never write a `jiraIssueId` that could
collide across teams — see §19).

### Net Result

**Zero database migrations today**, mirroring Day 56's confirmed outcome —
this is now the second consecutive integration day validating that the Day 3
schema correctly anticipated Phase 5's needs. Confirming this is an explicit
checklist item (§28), not an assumption.

---

## 6. Layer 1 — The Provider Abstraction

### File: `providers/provider.interface.ts`

This file has **zero Jira-specific knowledge**. It is written to answer one
question generically: *what must any outbound ticketing/messaging
integration be able to do, regardless of which vendor it is?*

Contract surface:

- `name: TeamProvider` — a readonly discriminator, used for logging and
  registry lookups, never for branching logic inside a generic caller.
- `getAuthorizationUrl(state, teamId)` — every OAuth-based provider needs
  to build a consent URL; `teamId` is passed through (not just `state`)
  because some providers (Jira is not one of them, but this keeps the
  interface forward-compatible) embed team context directly in the
  authorization request itself.
- `exchangeCodeForTokens(code)` — returns a normalized `OAuthTokenResult`
  shape (`accessToken`, `refreshToken?`, `expiresAt?`) — normalized because
  Google (Day 56), Jira (today), and Slack (Day 60) each return
  differently-shaped raw responses; the interface's job is to hide that
  variance from every caller.
- `refreshAccessToken(refreshToken)` — same normalization requirement.
  Deliberately returns a shape that structurally cannot include a
  `refreshToken` field for providers (like Google) that don't reissue one on
  refresh — carried over verbatim from the Day 56 design decision, now
  formalized as part of the shared interface rather than a Google-specific
  convention.
- `testConnection(accessToken, metadata)` — a lightweight "is this
  connection still healthy" check, used by a future `/integrations/:id/test`
  endpoint (already referenced in the interface's JSDoc, not built as a
  route today — the method exists on the interface now so Jira's
  implementation of it is available whenever that endpoint is wired up,
  without an interface-breaking change later).
- `createExternalItem(input)` — the actual "push a Vocaply action item
  outward" operation. `input` is a normalized `CreateExternalItemInput`
  shape (action item fields + meeting context), decoupled from any
  provider's specific field names — Jira's implementation maps this generic
  input onto Jira's ADF-based issue-creation payload; Linear's future
  implementation will map the SAME input onto a GraphQL mutation; the
  action-item-shaped input never changes across providers.
- `updateExternalItemStatus?(...)` — marked **optional** on the interface
  (via the `?`) because not every provider direction needs this today (Slack
  has no concept of "external item status" at all) — an optional method
  rather than a required no-op stub keeps the interface honest about which
  providers genuinely support which capabilities.

### Why `CreateExternalItemInput`'s Shape Matters

The `context` sub-object (`meetingTitle`, `meetingDate`, optional
`transcriptExcerpt`) exists so that every provider's ticket/issue description
can include meeting provenance ("Extracted from meeting: X on Y") without
`integrations.service.ts` or `integrate.worker.ts` needing to know that
detail — the CALLER assembles a generic bundle of context; each PROVIDER
decides how (or whether) to render it into its own format (Jira: ADF rich
text, per §8; a hypothetical future Slack ticket-like integration: plain
Markdown). This is the interface doing its job — pushing formatting
decisions down into the provider that actually needs to know about them.

---

## 7. Layer 2 — Provider Registry

### File: `providers/provider.registry.ts`

A single object literal mapping `TeamProvider` enum values to
`IntegrationProvider` implementations, plus one lookup function,
`getProvider(name)`, that throws a typed `AppError('PROVIDER_NOT_SUPPORTED',
501, ...)` for any provider not yet implemented.

Today's registry state:

```
JIRA:   jira.provider.ts's exported instance   ← IMPLEMENTED today
LINEAR: not yet implemented                     ← placeholder, Day 61
NOTION: not yet implemented                     ← placeholder, Day 62
SLACK:  slack.provider.ts's exported instance   ← IMPLEMENTED Day 60 (this
                                                    file is touched again on
                                                    Day 60, not fully today)
```

**Why a 501, not a 404 or a 422, for an unimplemented provider:** `501 Not
Implemented` is the semantically correct HTTP status for "this is a
recognized, valid concept that the server does not currently support" — a
team attempting to sync to Linear before Day 61 ships should see a response
that clearly communicates "this is coming, not broken," distinct from a
`404` (resource doesn't exist) or a `422` (your request is malformed).

### Why This File Is Deliberately Boring

`provider.registry.ts` contains no logic beyond the lookup itself — no
caching, no lazy instantiation tricks, no dependency injection framework.
Each provider module already exports a ready-to-use singleton instance
(consistent with how `recall.service.ts` and `google-calendar.provider.ts`
are consumed elsewhere in the codebase — module-level singletons, not
classes requiring instantiation). The registry's entire value is being the
**one place** that maps a string enum to a concrete implementation — adding
Linear on Day 61 means adding one line here, confirmed as the acceptance
criterion for whether today's abstraction succeeded.

---

## 8. Layer 3 — Jira Provider Implementation

### File: `providers/jira.provider.ts`

Implements every required method of `IntegrationProvider` against Jira
Cloud's OAuth 2.0 (3LO — "3-legged OAuth," Atlassian's terminology for
standard authorization-code-grant OAuth) and REST API v3.

**Dedicated Axios instance**, timeout 15 seconds (Jira Cloud's API is
generally responsive, but issue-creation calls involving field validation
can occasionally run longer than the 10-second budget used for Google
Calendar's simpler list operations, Day 56 §6). Retry wrapper: 3 attempts,
exponential backoff, 429/5xx only — the same shared backoff utility used by
every prior provider, not reimplemented.

### `getAuthorizationUrl(state, teamId)`

Builds `https://auth.atlassian.com/authorize` with:
- `audience=api.atlassian.com` (this parameter is Jira-specific and easy to
  forget — its absence is a documented common failure mode, called out
  explicitly here)
- `client_id` from `oauth-providers.config.ts`
- `scope=read:jira-work write:jira-work read:jira-user offline_access`
  (`offline_access` is what makes Jira issue a refresh token at all — its
  absence silently produces an access-token-only grant that expires in ~1
  hour with no way to renew it without re-prompting the user)
- `redirect_uri`, `state`, `response_type=code`, `prompt=consent`

### `exchangeCodeForTokens(code)`

POST `https://auth.atlassian.com/oauth/token` with
`grant_type=authorization_code`. Returns `{ access_token, refresh_token,
expires_in, scope }` — normalized to the interface's `OAuthTokenResult`
shape before returning to the caller.

### `refreshAccessToken(refreshToken)`

POST with `grant_type=refresh_token`. Unlike Google (Day 56), **Atlassian
does reissue a new refresh token on every refresh call** — this is a
documented Jira-specific behavior distinct from Google's, and today's
implementation must persist the NEW refresh token, not silently discard it
and keep using the old one (which Atlassian will eventually invalidate).
This asymmetry between providers is exactly why `refreshAccessToken`'s
return type on the shared interface (§6) allows an optional new
`refreshToken` field — Google's implementation omits it, Jira's populates
it, and `token-refresh.service.ts` (§16) is written to handle both cases
correctly rather than assuming Google's behavior is universal.

### `testConnection(accessToken, metadata)`

A lightweight `GET /rest/api/3/myself` call against the resolved cloudId
endpoint — succeeds with a `200` if the token is valid and has basic access,
used to power connection-health checks without the overhead of a full
project list fetch.

### `createExternalItem(input)` — Full Detail

POST to `https://api.atlassian.com/ex/jira/{metadata.cloudId}/rest/api/3/issue`
with a payload assembled as follows:

```
project:     { key: metadata.projectKey }
summary:     actionItem.text, hard-truncated to 255 characters (Jira's
             field-level limit — truncation happens INSIDE this provider,
             not left to the caller, since only this provider knows Jira's
             specific limit)
description: Atlassian Document Format (ADF) — see dedicated sub-section
             below; NEVER a plain string
issuetype:   { name: metadata.defaultIssueType }
priority:    { name: mapPriority(actionItem.priority) } — see §11
duedate:     actionItem.dueDate formatted as YYYY-MM-DD if present,
             the field OMITTED ENTIRELY (not sent as null) if absent —
             Jira's API rejects a null value for this field type; omission
             is the only correct way to represent "no due date"
assignee:    { accountId: resolvedAccountId } if resolution succeeded
             (§10), the field OMITTED ENTIRELY if resolution failed or no
             email was available — an unassigned ticket is an acceptable,
             graceful degradation; a malformed assignee field is a hard
             400 failure for the entire request
labels:      ["vocaply", "meeting-action-item"] — fixed, always present,
             enabling a team's Jira admin to filter/report on
             Vocaply-originated tickets distinctly from manually-created ones
```

Returns `{ externalId: response.key, externalUrl: `${workspaceUrl}/browse/${response.key}` }`
— note the URL is constructed client-side from the known workspace URL and
issue key, not returned directly by Jira's create-issue response (which
returns only `id`, `key`, and `self`, where `self` is an API endpoint URL,
not a human-browsable one — a subtle distinction worth documenting since
naively using `self` as the "view in Jira" link would produce a broken link
for end users).

### Atlassian Document Format (ADF) — Dedicated Sub-Section

Jira Cloud's REST API v3 requires rich-text fields (`description`, comment
bodies) to be submitted as a structured ADF document tree, not a plain
string — a v2-API habit (`description: "some text"`) is a guaranteed `400
Bad Request` against v3. Today's implementation includes a minimal, purpose-
built ADF builder function, `buildIssueDescription(meetingTitle, meetingDate,
transcriptExcerpt?)`, producing:

```
{
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Extracted from meeting: {meetingTitle} on {meetingDate}" }
      ]
    }
    // + an optional second paragraph containing transcriptExcerpt, if provided,
    //   rendered as a distinctly-styled blockquote node — giving the ticket's
    //   reader one click of context without needing to open Vocaply itself
  ]
}
```

This builder is intentionally minimal — it is not a general-purpose
Markdown-to-ADF converter (that would be significant, unjustified scope for
today's need, which is exactly two short paragraphs of fixed-shape content).
If richer formatting is ever needed, this function is the single place to
extend, not a pattern to be reinvented at each call site.

---

## 9. Layer 4 — Jira Cloud ID Resolution (The Critical Jira-Specific Step)

### Why This Step Exists At All

Jira Cloud's OAuth 2.0 (3LO) is **resource-scoped**: an access token is not,
by itself, bound to a specific Jira site. A single Atlassian account can
have access to multiple Jira Cloud sites (a consultant working with several
clients' Jira instances, for example), so after obtaining an access token,
the API consumer must separately ask "which site(s) does this token grant
access to?" and select one — Jira's terminology for a site's unique
identifier in this context is `cloudId`. Every subsequent REST API call is
then routed through `https://api.atlassian.com/ex/jira/{cloudId}/...` rather
than a per-tenant subdomain URL.

### The Resolution Sequence

```
STEP 1 — Immediately after exchangeCodeForTokens() succeeds (inside
         integrations.service.ts's connect orchestration, §12, NOT inside
         jira.provider.ts's own exchangeCodeForTokens — cloudId resolution
         is deliberately a SEPARATE method, keeping the interface's
         generic exchangeCodeForTokens() method free of Jira-specific
         multi-step behavior other providers don't need):

  Call jiraProvider.getAccessibleResources(accessToken)
    → GET https://api.atlassian.com/oauth/token/accessible-resources
    → Returns an array of { id (this IS the cloudId), name, url, scopes }

STEP 2 — Site Selection:
  If the array has exactly one entry (the overwhelmingly common case for a
  team connecting their own single Jira instance) → select it automatically,
  no user interaction needed.
  If the array has MORE than one entry (the consultant/multi-site case) →
  today's implementation selects the FIRST entry and logs a WARNING noting
  multiple accessible sites were found — an explicit, documented scope
  limitation (a "choose which Jira site" UI step is deferred, not silently
  mishandled) rather than a genuine ambiguity resolved by guessing without
  acknowledgment.
  If the array is EMPTY → this means the connecting user has no Jira site
  access at all despite completing OAuth consent (a real, if rare, Atlassian
  account configuration edge case) → surface a clear
  JIRA_NO_ACCESSIBLE_SITES error rather than silently persisting an
  integration row with no usable cloudId.

STEP 3 — Persistence:
  The selected entry's { id, name, url } are persisted into
  team_integrations.metadata.cloudId, .workspaceName (also mirrored to the
  top-level workspace_name column for consistency with how Slack, Day 60,
  populates the same column), and .workspaceUrl respectively.
```

### Why This Is Called Out As "The Single Most Common Bug"

Every piece of Jira integration documentation and community discussion
converges on the same failure mode: an engineer builds against
`https://{site}.atlassian.net/rest/api/3/...` directly (the URL shape a
human sees when browsing Jira in a web browser, and the URL shape most
tutorials and copy-pasted examples use), which works fine for Basic Auth or
personal API tokens, but is **not** how OAuth 2.0 (3LO) access tokens are
authorized to reach the API — those tokens are only valid against the
`api.atlassian.com/ex/jira/{cloudId}/...` resource-scoped path. Skipping the
`accessible-resources` call and hardcoding a site-subdomain URL produces
requests that fail with a `401` or `404` that looks, superficially, like a
token or permissions problem — sending a debugging engineer down the wrong
path entirely. Documenting this explicitly today, and building the
resolution step as a mandatory, non-skippable part of the connect flow
(§12), closes this off structurally rather than relying on careful code
review to catch a shortcut.

---

## 10. Layer 5 — Assignee Resolution & Caching

### Why Resolution Is Required At All

Jira's issue-creation API accepts an `assignee` field shaped as
`{ accountId: "..." }` — a stable, Atlassian-internal identifier — never a
plain email address. Vocaply's action items carry an `assigneeEmail` (via
the linked `User.email`), so every ticket creation involving an assignee
requires a translation step.

### `resolveJiraAssignee(accessToken, cloudId, email): Promise<string | null>`

```
STEP 1 — Cache Check:
  Redis GET cache:jira:assignee:{teamId}:{email}
  Cache hit → return the cached accountId immediately (or null if the
  cache remembers a prior "not found" result — see Step 3's negative-
  caching note below)

STEP 2 — Cache Miss — Live Lookup:
  GET /rest/api/3/user/search?query={email} against the cloudId-scoped
  endpoint. Jira's search is a fuzzy match, not an exact-match lookup by
  design — the result array must be filtered for an EXACT, case-insensitive
  email match before accepting a result; taking the first returned result
  unconditionally risks assigning a ticket to the WRONG person if Jira's
  fuzzy search returns a similarly-named user first. This exact-match
  filter is a deliberate correctness safeguard, not an optional refinement.

STEP 3 — Cache the Result (Positive AND Negative):
  On a successful match: SETEX cache:jira:assignee:{teamId}:{email}
    {accountId} EX 86400
  On NO match found (the email doesn't correspond to any Jira user — a
  common case for a Vocaply user who isn't provisioned in the team's Jira
  instance): SETEX the SAME key to a sentinel value (e.g. "NONE") with the
  SAME 24h TTL — this is NEGATIVE CACHING, and it matters: without it,
  every single ticket creation for an unmapped user would re-attempt the
  (wasted) Jira user-search API call every time, indefinitely, since a
  "not found" result would otherwise never be cached at all.

STEP 4 — Return:
  The resolved accountId, or null (whether from a fresh negative lookup or
  a cached "NONE" sentinel) — the CALLER (createExternalItem, §8) is
  responsible for correctly omitting the assignee field entirely when this
  returns null, never for erroring the whole ticket-creation attempt over
  an unresolvable assignee.
```

### Why 24-Hour TTL, Not Longer or Shorter

24 hours balances two costs: a too-short TTL (e.g. 5 minutes) means the
common case — a team whose members rarely change — pays a repeated,
unnecessary Jira API call on every sync burst; a too-long TTL (e.g. 30 days)
means a genuinely new Jira user (someone just provisioned, previously
negative-cached as "NONE") stays incorrectly unassignable for up to a month.
24 hours is a deliberate middle ground, matching the TTL convention already
used elsewhere in the codebase for similarly-shaped "external identity
mapping" caches (this becomes the explicit precedent Slack's user-lookup
cache, Day 60, follows).

---

## 11. Layer 6 — Priority & Field Mapping

### Priority Mapping Table (Single Source of Truth)

```
Vocaply PriorityLevel    Jira Priority Name
────────────────────────────────────────────
LOW                 →    "Low"
MEDIUM               →    "Medium"
HIGH                 →    "High"
URGENT               →    "Highest"
```

Implemented as a single exported constant object
(`JIRA_PRIORITY_MAP: Record<PriorityLevel, string>`) inside `jira.provider.ts`
— deliberately **not** a database-configurable mapping today (a
team-customizable priority scheme mapping is a plausible future enhancement,
explicitly deferred rather than over-engineered into today's scope, which
already has enough genuinely-required complexity in the cloudId and ADF
handling above).

**Why `URGENT → "Highest"`, not `"Urgent"`:** Jira Cloud's default priority
scheme uses the label "Highest" for its top tier, not "Urgent" — a
plausible-looking but incorrect direct-name mapping is exactly the kind of
bug that passes a superficial code review and fails only against a real
Jira instance, which is why this mapping is stated explicitly, verified
against Jira's actual default scheme, and called out here rather than left
implicit in code.

### What Happens When a Team's Jira Instance Uses a CUSTOM Priority Scheme

Documented as an explicit, accepted limitation: if a team has renamed or
reconfigured their Jira priority levels away from the default English names
above, ticket creation will fail with a `400` (Jira rejects an unrecognized
priority name) rather than silently mismapping. This is the SAFER failure
mode of the two options (fail loudly vs. silently pick a wrong/default
priority), and the resulting `422`-mapped error (§25) surfaces clearly
enough in the integration's `lastError` field for an admin to diagnose and,
for now, manually adjust their Jira scheme to match — a small, deliberate
scope boundary rather than building a full custom-scheme-discovery feature
on day one of the integration's existence.

---

## 12. Layer 7 — integrations.service.ts (OAuth Orchestration)

This file's Jira-related additions are written **generically** wherever
possible — the connect/callback/disconnect sequence is the same shape
Google Calendar (Day 56) already established for `user_integrations`, now
applied to `team_integrations` for the first time.

### `initiateProviderConnect(provider, teamId, userId): string`

Generic across providers: generates a CSRF state token, stores
`{ provider, teamId, userId }` in Redis (`oauth:state:{provider}:{state}`,
10-min TTL — note the KEY NOW INCLUDES THE PROVIDER NAME, a refinement over
Day 56's calendar-only `oauth:state:calendar:{state}` format, generalized
today specifically because a second and third OAuth-based provider now
exist in the same namespace and must not collide), calls
`getProvider(provider).getAuthorizationUrl(state, teamId)`, returns the URL
for the controller to redirect to.

### `completeProviderConnect(provider, code, state): Promise<TeamIntegration>`

```
STEP 1 — Verify and consume the Redis state token (one-time use, exactly
         as established for calendar OAuth).
STEP 2 — Call getProvider(provider).exchangeCodeForTokens(code).
STEP 3 — PROVIDER-SPECIFIC POST-PROCESSING HOOK:
         For Jira specifically, this is where getAccessibleResources()
         (§9) is called and the cloudId resolved — implemented as an
         optional, provider-specific extension point rather than forcing
         every provider through a "resolve additional resource context"
         step that only Jira actually needs. (Today's implementation:
         a simple `if (provider === 'JIRA') { ... }` branch INSIDE
         integrations.service.ts's connect orchestration is the one
         deliberate, acknowledged exception to Principle 2's "no provider-
         name branching" rule — justified because cloudId resolution is
         genuinely a Jira-idiosyncratic OAuth quirk, not a generic
         "integration connection" concern any other provider shares; Day
         61/62 will confirm whether Linear/Notion need a similar
         provider-specific hook or whether Jira's need turns out to be
         unique.)
STEP 4 — Encrypt both tokens via crypto.service.ts.
STEP 5 — Upsert the TeamIntegration row (unique on teamId+provider,
         identical upsert-not-insert discipline established in Day 56
         §13 for reconnect scenarios).
STEP 6 — Return the persisted row (sans decrypted tokens) to the controller.
```

### `configureProviderMetadata(provider, teamId, metadataPatch): Promise<TeamIntegration>`

Generic JSONB merge-update (not blind overwrite) — mirrors the Day 16
`updateTeamSettings()` merge pattern exactly: `{ ...existing.metadata,
...metadataPatch }`, so a `PATCH .../configure` call setting only
`projectKey` never clobbers an already-configured `defaultIssueType`.

### `disconnectProvider(provider, teamId, userId): Promise<void>`

Loads the integration, decrypts the access token, calls a
**provider-specific revocation** if the provider supports one (Jira Cloud's
OAuth apps support token revocation via Atlassian's standard OAuth
revocation endpoint — implemented on `jira.provider.ts` as an optional
interface extension, following the exact "disconnect must fully revoke"
principle already established for Google Calendar, Day 56 §8.3), then
deletes the row, setting `disconnectedById`/`disconnectedAt` on a
short-lived audit record before the hard delete if the team's compliance
tier requires it (today: the simple case — direct delete, matching Day 56's
Google Calendar behavior — is implemented; audit-trail retention on
disconnect is a Business/Enterprise-tier consideration explicitly out of
scope for today).

---

## 13. Layer 8 — HTTP Layer (Controller, Routes, Validators)

### Controllers (New Handlers, Zero Business Logic Per the Established Rule)

- `connectJiraController` — calls `integrationsService.initiateProviderConnect('JIRA', teamId, userId)`, redirects.
- `jiraCallbackController` — calls `integrationsService.completeProviderConnect('JIRA', code, state)`,
  redirects to `/settings/integrations?connected=jira` on success or
  `?error=...` on failure — same allow-listed-redirect discipline as Day 56.
- `listJiraProjectsController` — calls a Jira-specific service function,
  `getJiraProjects(teamId)`, which decrypts the token, calls
  `jiraProvider`'s (new today) `listProjects(accessToken, cloudId)` method
  (`GET /rest/api/3/project/search`), returns a simplified `{ key, name }[]`
  for the settings dropdown.
- `configureJiraController` — calls
  `integrationsService.configureProviderMetadata('JIRA', teamId, req.body)`.
- `disconnectJiraController` — calls
  `integrationsService.disconnectProvider('JIRA', teamId, userId)`.

### Routes — Role Enforcement

Every Jira management route (connect, callback, projects, configure,
disconnect) is gated `requireRole('ADMIN')` **except** the callback itself,
which — identical to Day 56's Google Calendar callback — intentionally sits
outside the standard auth chain entirely, with the Redis state token as its
security boundary rather than a JWT (the user's session may have aged during
the OAuth round-trip). This ADMIN-gating decision is a direct, explicit
carryover of the Day 16 rule ("org-affecting actions require elevated
role") applied to the newest category of org-affecting action: connecting an
external system of record.

### Validators — New Schemas

```
jiraCallbackQuerySchema:      code (required), state (required, hex, min
                               32 chars), error (optional)
configureJiraBodySchema:      projectKey (required, matches Jira's project
                               key format: uppercase letters/numbers,
                               2-10 chars), defaultIssueType (required,
                               string), defaultPriority (optional, one of
                               the 4 PriorityLevel values — validated
                               against the SAME enum used everywhere else
                               in the platform, not a Jira-specific
                               duplicate enum)
```

---

## 14. Layer 9 — integrate.worker.ts (Real Jira Branch)

Replaces the Day 18 "acknowledge and log, do nothing" scaffold with the
first genuinely functional branch of this worker.

### Full Job Processing Sequence

```
STEP 1 — Idempotency Check (BEFORE any other work):
  Redis EXISTS integrate:done:{idempotencyKey}
  If present → log and return immediately, no side effects — this is what
  makes the job safe to enqueue redundantly (e.g. a retried HTTP request
  to POST /:id/sync carrying the same Idempotency-Key, per the Day 20
  hard requirement that this endpoint REQUIRES an idempotency key).

STEP 2 — Load the Team's Active Jira Integration:
  If missing or inactive → throw a typed, NON-RETRYABLE error
  (INTEGRATION_NOT_CONNECTED, 422-shaped) — BullMQ's retry policy (§15)
  is configured to recognize 4xx-shaped AppErrors and skip retrying them
  entirely, since retrying "the integration isn't connected" five times
  with backoff accomplishes nothing but delay.

STEP 3 — Load the Action Item:
  If it no longer exists (deleted between enqueue and processing) → silent
  no-op return, not an error — this is an expected, benign race (a user
  could delete an action item moments after triggering its sync), not a
  system failure.

STEP 4 — Resolve the Provider Implementation:
  providerRegistry.getProvider('JIRA') → jira.provider.ts's instance.

STEP 5 — Obtain a Valid Access Token:
  token-refresh.service.ts.getValidAccessToken(integration) — the SAME
  shared helper introduced on Day 56, now proven against its second
  provider (§16).

STEP 6 — Call createExternalItem():
  Maps the action item + meeting context into the generic
  CreateExternalItemInput shape, calls the provider, receives
  { externalId, externalUrl }.

STEP 7 — Persist the Result:
  Updates action_items.jiraIssueId, .jiraIssueUrl, .jiraIssueSyncedAt in
  a single update call.

STEP 8 — Mark Idempotency Complete:
  Redis SETEX integrate:done:{idempotencyKey} 86400 '1' — set AFTER
  successful persistence, not before, so a crash between Step 7 and Step 8
  results in, at worst, a harmless re-run (Step 7's update is naturally
  idempotent — writing the same jiraIssueId twice is not itself harmful),
  never a silently-skipped sync that never actually completed.

STEP 9 — Emit Real-Time Update:
  Socket.io 'action_item:synced' to the team room — the dashboard's
  SyncToJiraButton (Day 36, frontend build) can react to this without
  polling.
```

### Error Classification Inside the Worker

```
Errors thrown by getValidAccessToken() (token refresh failed) or by
createExternalItem() are inspected for their HTTP-status-class origin
(mapped by jira.provider.ts per its own error taxonomy, mirroring Day 56
§6's Google error mapping table):

  4xx-class (401 invalid token post-refresh, 403 no project access,
  422 field validation failure e.g. bad priority name, §11) →
  NON-RETRYABLE. The worker re-throws a shape BullMQ is configured to
  recognize as "do not retry" (see §15) — these represent configuration
  problems that will not self-resolve through waiting.

  5xx-class or network-level failures → RETRYABLE, handled entirely by
  BullMQ's queue-level backoff configuration (§15) — the worker itself
  contains no custom retry loop, consistent with the Day 18 standard that
  retry policy lives at the queue/job-options level, not hand-rolled
  inside worker bodies.
```

---

## 15. Layer 10 — Retry Policy Design

### The Integrate Queue's Distinct Policy (Justified Against Alternatives)

```
Queue: integrate
Attempts: 5
Backoff: exponential, base 15s → 15s, 30s, 60s, 120s, 240s (≈7.5 min total span)

COMPARISON TO OTHER QUEUES (justifying why THIS policy, not a copy-paste):

  transcribe/extract (Day 17/18): higher urgency, user is actively waiting
  to see their meeting processed — but those failures are typically
  INFRASTRUCTURE failures (MongoDB write, internal AI pipeline), not
  externally-visible side effects with their own audit trail on a THIRD
  PARTY'S system.

  notify (Day 18/19/67): lower retry count is appropriate there because a
  missed notification is recoverable via the next scheduled digest/cron
  sweep — there's a natural "it'll come around again" safety net that
  ticket sync does NOT have (a Jira ticket either gets created once, or an
  admin has to notice it's missing and manually retry via the UI).

  integrate (today): 5 attempts, moderate backoff. Rationale restated
  precisely: a transient Jira 5xx (their infrastructure blip) should
  self-resolve within the ~7.5 minute retry window without any human
  noticing; a retry policy that gives up too fast (e.g. 2 attempts) risks
  a permanently-unsynced action item after a brief, common Jira
  maintenance window; a retry policy that's too aggressive (e.g. 10
  attempts hammering every 5 seconds) risks looking "stuck" to an admin
  watching the settings page's sync status, AND risks tripping Jira's own
  rate limiting, making the actual problem worse.
```

### 4xx vs 5xx — The Retry-Eligibility Decision, Restated as a Rule

```
NEVER RETRY: 401 (bad/expired token that a refresh attempt already failed
             to fix), 403 (no project access — a permissions problem,
             not a timing problem), 422 (invalid field value, e.g. an
             unrecognized priority name per §11)

ALWAYS RETRY (up to the 5-attempt ceiling): 429 (Jira's own rate limiting
             — honor any Retry-After header if present, otherwise fall
             back to the queue's own exponential backoff), 5xx (Jira-side
             infrastructure issues), network-level timeouts/connection
             failures

CONSEQUENCE OF 5 CONSECUTIVE FAILURES (of the retryable kind, having
             exhausted all attempts for one job — or of 5 SEPARATE jobs
             each failing outright on a non-retryable error):
  team_integrations.consecutiveErrors incremented per failure; at
  consecutiveErrors >= 5, integration.isActive is set to FALSE and an
  email alert is queued to the team's ADMIN+ members — this is the
  IDENTICAL pattern already fully specified in the HLD (§10, "Integration
  Architecture" → Error Handling) for Jira specifically; today is where
  that already-documented design is actually implemented in code, not a
  new decision being made from scratch.
```

---

## 16. Token Lifecycle Integration

Today extends `token-refresh.service.ts`'s `getValidAccessToken()` (built on
Day 56 for Google Calendar, `user_integrations`) to correctly handle its
**second** integration type, `team_integrations`, and its **second**
provider, Jira — proving the function's design generalizes rather than being
Google-specific.

```
Key extension point: Jira's refreshAccessToken() (§8) returns a NEW
refresh token on every call, unlike Google's (which never does). The
shared helper's persistence step must therefore be written as:

  update: {
    accessTokenEnc: encrypt(refreshed.accessToken),
    ...(refreshed.refreshToken
        ? { refreshTokenEnc: encrypt(refreshed.refreshToken) }
        : {}),   // only touch refreshTokenEnc if the provider returned one
    tokenExpiresAt: refreshed.expiresAt,
    consecutiveErrors: 0,
  }

This conditional-spread pattern is the concrete mechanism by which ONE
function correctly serves BOTH providers' differing refresh-token-reissue
behavior without an if (provider === 'JIRA') branch inside the shared
helper itself — the DATA (whether refreshed.refreshToken is present)
drives the behavior, not a provider-name check, preserving Principle 2
(§2) even inside this cross-provider shared utility.
```

The provider registry consulted internally by `getValidAccessToken()` (to
know which provider's `refreshAccessToken` implementation to call) is the
exact same `provider.registry.ts` from §7 — today is the moment that
registry goes from a single-entry (Google Calendar) lookup table to a
genuinely multi-provider one, the first real proof of its design.

---

## 17. Frontend Deliverables

### `JiraIntegration.tsx`

States handled, mirroring the Google Calendar card's state model
(Day 56 §12) generalized to a second provider:

```
NOT_CONNECTED  → "Connect Jira" button → useConnectJira() (full-page
                 redirect, same non-XHR OAuth navigation pattern as
                 calendar connect)

CONNECTED, NOT CONFIGURED → shows workspace name ("Connected to
                 techflow.atlassian.net"), a prominent "Finish setup:
                 choose a project" prompt — an integration that's
                 OAuth-connected but has no projectKey configured yet
                 cannot actually sync anything, and the UI makes this
                 intermediate state impossible to miss or mistake for
                 "fully working"

CONNECTED, CONFIGURED → shows workspace name, configured project
                 key/issue type, "Reconfigure" and "Disconnect" actions

ERROR (isActive=false) → distinct "Needs reconnect" alert state, mirroring
                 Day 56's calendar error state treatment exactly
```

### `JiraProjectConfigForm.tsx`

Consumes `useJiraProjects()` (calls `GET /jira/projects`) to populate a
project-key dropdown; a static, hardcoded issue-type selector
(`Task`/`Story`/`Bug`, the near-universal Jira defaults — a live
`GET /rest/api/3/issuetype` fetch per-project is an acknowledged future
refinement, not built today, since the three defaults cover the
overwhelming majority of real Jira project configurations and avoid an
extra round-trip + extra UI complexity for the common case); a priority
default selector using Vocaply's own 4-level enum (rendered via the
existing shared badge component, not a Jira-specific one). Submits via
`useConfigureJira()`.

---

## 18. State & Lifecycle Design

### TeamIntegration (Jira) Row Lifecycle

```
                    ┌───────────────────┐
                    │   NOT CONNECTED   │  ← no row exists
                    └─────────┬─────────┘
                              │ OAuth callback succeeds (§12)
                    ┌─────────▼─────────┐
                    │ CONNECTED, NO      │  metadata.projectKey is unset
                    │ PROJECT CONFIGURED │
                    └─────────┬─────────┘
                              │ PATCH /configure
                    ┌─────────▼─────────┐
                    │  FULLY CONFIGURED  │  isActive=true, consecutiveErrors=0
                    │  (sync-ready)      │
                    └─────────┬─────────┘
                              │ 5 consecutive sync failures
                    ┌─────────▼─────────┐
                    │  NEEDS RECONNECT   │  isActive=false, lastError set
                    └─────────┬─────────┘
                              │ admin re-initiates connect flow
                              │ (callback UPSERTs, resets error state)
                    ┌─────────▼─────────┐
                    │  FULLY CONFIGURED  │  (metadata.projectKey survives
                    │  (back to healthy) │   the upsert — only token fields
                    └────────────────────┘   are overwritten, per §12 Step 5)

                    From any CONNECTED state, admin-initiated:
                    │ DELETE /jira
                    ▼
                    row deleted → NOT CONNECTED
                    (already-synced action items KEEP their jiraIssueId/
                     Url/SyncedAt — historical record preserved, exactly
                     mirroring Day 56's "disconnect doesn't delete history"
                     principle)
```

**Important upsert-merge detail, explicit here because it's easy to get
wrong:** when an admin reconnects after a `NEEDS_RECONNECT` state (e.g.
their Jira admin rotated the OAuth app's credentials, forcing a
re-authorization), the callback's upsert (§12 Step 5) must **preserve** the
already-configured `metadata.projectKey`/`defaultIssueType` — only the token
fields and `isActive`/`consecutiveErrors` should reset. A naive upsert that
replaces the entire `metadata` object with a fresh empty `{}` would silently
un-configure a previously-working integration on every reconnect, forcing
the admin to redo project configuration for no reason — called out
explicitly as a test case in §27.

---

## 19. Security Architecture

```
THREAT                                MITIGATION
─────────────────────────────────────────────────────────────────────────
CSRF on the OAuth callback            Provider-namespaced Redis state key
                                       (oauth:state:jira:{state}, §12),
                                       single-use, 10-min TTL, bound to
                                       {provider, teamId, userId} at issuance

Open redirect via callback            Allow-listed redirect constant,
                                       identical discipline to Day 56

Cross-tenant jiraIssueId collision    idx_ai_jira_issue is a global
                                       UNIQUE index (not team-scoped) —
                                       today's create-ticket logic must
                                       never attempt to write a jiraIssueId
                                       that could already exist for ANOTHER
                                       team. In practice this is
                                       structurally guaranteed (Jira issue
                                       keys like "TECH-142" are only
                                       actually unique WITHIN one Jira
                                       Cloud site, and two different teams
                                       almost certainly have two different
                                       Jira sites/cloudIds) — but this
                                       assumption is explicitly documented
                                       here rather than silently relied
                                       upon, flagged as a genuine (if
                                       unlikely) edge case in §29 if two
                                       teams somehow share one Jira
                                       instance and identical project keys

Token theft (access + refresh)        AES-256-GCM encrypted at rest,
                                       reused crypto.service.ts unchanged;
                                       never logged; the NEWLY-REISSUED
                                       Jira refresh token (§8, §16) is
                                       encrypted with the SAME discipline
                                       as the original — a refreshed
                                       token is not treated as "less
                                       secret" than the one obtained at
                                       initial connect time

metadata vs. encrypted columns        cloudId, projectKey,
category confusion                    defaultIssueType, defaultPriority
                                       are business configuration, stored
                                       PLAINTEXT in JSONB metadata — this
                                       is a deliberate, reviewed decision
                                       (§2 Principle 4), not an oversight;
                                       code review for today explicitly
                                       confirms no token-shaped value ever
                                       lands in the metadata column

Least privilege (OAuth scopes)        read:jira-work + write:jira-work +
                                       read:jira-user + offline_access —
                                       the minimum scope set that allows
                                       reading project/issue-type lists,
                                       creating issues, and resolving
                                       assignees; no admin-level or
                                       destructive scopes requested

Role escalation via integration       connect/configure/disconnect all
management                            gated requireRole('ADMIN') — a
                                       MEMBER or MANAGER cannot silently
                                       redirect where the team's action
                                       items get synced to
```

---

## 20. Performance & Scalability Architecture

### Why Concurrency = 3 for the Integrate Queue (Not 5, Like Calendar Sync)

```
Calendar sync (Day 56): concurrency 5, justified by Google's generous
per-user quota headroom and the read-only nature of the work.

Integrate (today): concurrency 3, DELIBERATELY LOWER, because:
  a. Jira Cloud's documented rate limits are more conservative and more
     variable across different pricing tiers than Google Calendar's — a
     lower concurrency ceiling reduces the chance of a burst of ticket
     creations from ONE large team tripping Jira's rate limiter and
     causing cascading 429s across other teams' concurrently-processing
     jobs sharing the same worker pool.
  b. Ticket creation has a real, externally-visible side effect per call
     (unlike calendar sync's read-only listEvents) — a lower concurrency
     ceiling is a conservative choice appropriate to an operation with
     higher per-call consequence if something goes systematically wrong.
  Concurrency remains environment-tunable (per the Day 18 standard), so
  this starting value of 3 is a considered default, not a permanent ceiling.
```

### Assignee Cache as the Primary Cost Lever

Exactly as incremental sync was Day 56's biggest scalability lever, the
24-hour assignee-resolution cache (§10) is today's — without it, a team
syncing 20 action items across a burst of meetings would issue 20 redundant
Jira user-search API calls for what is very likely a small, stable set of
team members' emails; with it, the vast majority of those 20 calls resolve
from Redis in under a millisecond, and only genuinely new team members (or
the first sync of the day) pay the live-lookup cost.

### Idempotency Key TTL vs. Assignee Cache TTL — Two Different 24h Windows, Not Coincidental

Both `integrate:done:{idempotencyKey}` (§14) and
`cache:jira:assignee:{teamId}:{email}` (§10) use a 24-hour TTL — this
consistency is deliberate, matching the platform-wide convention (already
established for webhook idempotency, Day 18) that "24 hours" is Vocaply's
standard default window for "long enough to cover any realistic retry or
staleness window, short enough not to accumulate unboundedly," reused here
rather than inventing a new duration convention for this integration
specifically.

---

## 21. Reliability & Failure Handling

```
FAILURE MODE                          BEHAVIOR
─────────────────────────────────────────────────────────────────────────
Jira Cloud entirely unreachable        Job retries per the 5-attempt/
                                       exponential-backoff policy (§15);
                                       action item remains un-synced
                                       (jiraIssueId stays null) until
                                       either a retry succeeds or all
                                       attempts are exhausted — no partial/
                                       corrupt state is possible since the
                                       DB write (Step 7, §14) only happens
                                       after a fully successful API response

Access token expired AND refresh       getValidAccessToken() throws a
also fails (revoked app,               distinct, non-retryable error;
deleted OAuth grant)                   propagates to the worker, which
                                       classifies it as 4xx-shaped (§14)
                                       and does not retry; consecutiveErrors
                                       increments toward the 5-failure
                                       auto-disable threshold (§15)

Duplicate job enqueued for the         Caught entirely by the idempotency
same action item (e.g. a user          check (§14, Step 1) — the second
double-clicks "Sync to Jira" before    job is a fast, side-effect-free
the first request's UI has updated)    no-op, never a duplicate ticket

Action item deleted between            Silent, benign no-op (§14, Step 3)
enqueue and worker processing          — not logged as an error, since
                                       this is expected user behavior, not
                                       a system fault

Jira project reconfigured/renamed      Next sync attempt fails with a
externally after Vocaply's             422-mapped "project not found"
metadata.projectKey was set            error — surfaces in the
                                       integration's lastError field,
                                       visible to the admin in the
                                       settings UI; NOT auto-corrected
                                       (Vocaply cannot know the team
                                       intended to rename their project
                                       vs. made a genuine configuration
                                       error) — an explicit, admin-visible
                                       failure is the correct behavior here,
                                       not a silent retry loop against a
                                       permanently-broken configuration

Assignee resolution fails mid-sync     NEVER fails the whole ticket
(Jira user-search API error, not       creation — per §10's design, a
just "no match")                       resolution failure (distinct from
                                       a genuine "no match found") is
                                       treated the same as "no match":
                                       omit the assignee field, log a
                                       warning, proceed with an
                                       unassigned ticket rather than
                                       blocking the entire sync over a
                                       secondary field
```

---

## 22. Observability & Monitoring

### Structured Log Events (New Today)

```
integrate.jira.connect_initiated       { teamId, userId }
integrate.jira.cloud_id_resolved       { teamId, cloudId, siteCount }
                                        — siteCount > 1 logged at WARN
integrate.jira.callback_failed         { teamId, reason }
integrate.worker.idempotent_skip       { actionItemId, provider, idempotencyKey }
integrate.worker.assignee_resolved     { teamId, cached: boolean }
integrate.worker.assignee_unresolved   { teamId, email }  — INFO, not WARN;
                                        expected/benign per §21
integrate.worker.issue_created         { teamId, actionItemId, jiraIssueId, durationMs }
integrate.worker.issue_creation_failed { teamId, actionItemId, statusClass: '4xx'|'5xx', err }
integrate.worker.integration_disabled  { teamId, consecutiveErrors }  — WARN level
```

### Metrics (Grafana Dashboard Additions)

```
integrate.jobs_completed_total{provider="jira"}
integrate.jobs_failed_total{provider="jira", retryable="true"|"false"}
integrate.issue_creation_duration_ms{provider="jira"}   (histogram)
integrate.assignee_cache_hit_ratio{provider="jira"}
integrate.integrations_disabled_total{provider="jira"}
```

Tagging every metric with `provider="jira"` from day one (rather than a
Jira-only metric name) is a deliberate choice anticipating Days 61/62 —
Linear and Notion's future metrics slot into the SAME dashboard panels via
the `provider` label dimension, rather than requiring new panels per
provider.

### Alerting Additions (Extends Day 19/56/57's Alerting Rules Table)

```
WARNING (Slack alert, no page):
  → integrate.jobs_failed_total{retryable="false"} rate > 5 in 1 hour
    (a spike in non-retryable failures suggests a systemic configuration
    issue — e.g. Jira changed something API-side — worth investigating
    even though individual failures are correctly handled)
  → integrate.integrations_disabled_total{provider="jira"} > 3 in 1 hour
```

---

## 23. Redis Key Space Additions

```
NAMESPACE                         KEY FORMAT                              TTL      VALUE
──────────────────────────────────────────────────────────────────────────────────────────
OAuth CSRF (provider-namespaced,  oauth:state:{provider}:{state}          600s     JSON { provider, teamId, userId }
generalized today from Day 56's
calendar-only format)

Assignee resolution cache         cache:jira:assignee:{teamId}:{email}    86400s   accountId string, or "NONE"

Integrate job idempotency         integrate:done:{idempotencyKey}         86400s   "1"
```

---

## 24. API Endpoint Specification

### `GET /api/v1/integrations/jira/connect`

Role: ADMIN+. No body. Response: `302` redirect to Atlassian's consent screen.

### `GET /api/v1/integrations/jira/callback`

No `requireAuth` (Redis-state-secured, per §13). Query: `code`, `state`,
optional `error`. Response: `302` redirect to an allow-listed settings
destination, carrying a success or error query param.

### `GET /api/v1/integrations/jira/projects`

Role: ADMIN+. No body. Response: `200` with
`{ success: true, data: { projects: { key: string; name: string }[] } }`.
`422` if the integration exists but has no valid cloudId (should be
structurally impossible per §9's design, defended anyway).

### `PATCH /api/v1/integrations/jira/configure`

Role: ADMIN+. Body: `{ projectKey, defaultIssueType, defaultPriority? }`.
Response: `200` with the updated integration's sanitized (no tokens)
representation.

### `DELETE /api/v1/integrations/jira`

Role: ADMIN+. No body. Response: `200` with
`{ success: true, data: { message: 'Jira disconnected' } }`.

### HTTP Status Reference (This Day's Additions)

```
200  OK               → projects list, configure, disconnect success
302  Found            → connect (to Atlassian), callback (to frontend)
401  Unauthorized     → missing/invalid JWT on any admin-required route
403  Forbidden        → authenticated but not ADMIN+
422  Unprocessable    → callback with malformed code/state; configure
                         with invalid projectKey format; projects list
                         with a broken cloudId
501  Not Implemented  → attempting to sync to a provider not yet in the
                         registry (Linear/Notion before Days 61/62)
502  Bad Gateway      → Atlassian's OAuth/API entirely unreachable
                         during connect (callback path only — the one
                         case where a JSON error, not a redirect, is
                         appropriate, per Day 56's identical precedent)
```

---

## 25. Error Taxonomy

```
JIRA_AUTH_CODE_INVALID            400-class  → OAuth callback: bad/expired code
JIRA_NO_ACCESSIBLE_SITES          422        → accessible-resources returned empty
JIRA_TOKEN_INVALID                401-class  → forces a refresh attempt first
JIRA_ACCESS_DENIED                403-class  → no project access; logged, flagged
JIRA_RATE_LIMITED                 429-class  → retry honoring Retry-After
JIRA_SERVICE_ERROR                5xx-class  → retry with backoff, max 3 (provider layer)
                                                / 5 (queue layer, §15)
JIRA_FIELD_VALIDATION_FAILED      422-class  → e.g. unrecognized priority name (§11)
JIRA_PROJECT_NOT_FOUND            422-class  → stale/renamed projectKey (§21)
INTEGRATION_NOT_CONNECTED         422        → sync attempted with no active Jira integration
```

Every one of these extends the existing `AppError` hierarchy — no ad-hoc
`throw new Error(...)` anywhere in today's code, consistent with every prior
day's standard.

---

## 26. Hour-by-Hour Execution Plan

```
9:00 – 9:45    provider.interface.ts (written generically, zero Jira
               awareness) + provider.registry.ts (Jira slot filled, Linear/
               Notion slots explicitly placeholder)

9:45 – 10:45   jira.provider.ts: getAuthorizationUrl, exchangeCodeForTokens,
               refreshAccessToken (with the reissued-refresh-token handling),
               getAccessibleResources (cloudId resolution)

10:45 – 11:30  jira.provider.ts: createExternalItem() + buildIssueDescription
               (ADF) + JIRA_PRIORITY_MAP

11:30 – 12:00  jira.provider.ts: resolveJiraAssignee() with positive AND
               negative Redis caching

12:00 – 1:00   Lunch

1:00 – 1:45    integrations.service.ts: initiateProviderConnect,
               completeProviderConnect (with the Jira-specific cloudId
               post-processing hook), configureProviderMetadata,
               disconnectProvider — written generically, Jira as first caller

1:45 – 2:30    integrate.worker.ts: full replacement of the Day 18 scaffold
               — idempotency check, integration load, action item load,
               provider call, persistence, Socket.io emission

2:30 – 3:00    Retry policy: queue-level attempts/backoff config, 4xx-vs-5xx
               error classification wiring, consecutiveErrors/isActive
               auto-disable logic

3:00 – 3:45    integrations.controller.ts (5 handlers) + routes + validators

3:45 – 4:30    Frontend: JiraIntegration.tsx (4-state card) +
               JiraProjectConfigForm.tsx + hooks

4:30 – 5:15    Manual E2E test against a REAL Jira Cloud sandbox: connect →
               verify cloudId resolved correctly → configure project →
               sync an action item → verify ticket appears in Jira with
               correct summary, description, priority, assignee

5:15 – 5:45    Observability: structured log lines verified in output,
               Grafana panel additions

5:45 – 6:00    Checklist review + sign-off
```

---

## 27. Testing & Verification Plan

### Provider Layer (Unit, Mocked HTTP)

```
Test 1 — getAuthorizationUrl includes audience=api.atlassian.com and
         offline_access scope
Test 2 — refreshAccessToken's return correctly surfaces a NEW refreshToken
         field when Jira's mocked response includes one (contrast with
         Google's Day 56 behavior, explicitly tested as a DIFFERENCE, not
         assumed identical)
Test 3 — getAccessibleResources with exactly 1 site → auto-selected, no warning
Test 4 — getAccessibleResources with 2+ sites → first selected, WARN logged
Test 5 — getAccessibleResources with 0 sites → JIRA_NO_ACCESSIBLE_SITES thrown
Test 6 — createExternalItem builds valid ADF (structural shape assertion,
         not just "is a string")
Test 7 — createExternalItem with a due date → duedate field present as
         YYYY-MM-DD; without a due date → field ABSENT from the payload
         entirely (not null)
Test 8 — createExternalItem summary truncated at exactly 255 chars for a
         longer input
Test 9 — mapPriority(URGENT) === "Highest", not "Urgent"
```

### Assignee Resolution (Unit + Integration)

```
Test 1 — Cache miss → live lookup → exact-match filter applied (fuzzy
         near-match results correctly rejected)
Test 2 — Cache hit → live lookup API is NOT called (mock/spy assertion)
Test 3 — No match found → "NONE" sentinel cached; second call for the
         same email → still no live lookup, returns null
Test 4 — resolveJiraAssignee throwing (API error, not "no match") → caller
         (createExternalItem) still succeeds, omits assignee, logs a warning
```

### Worker & Idempotency (Integration, Real Redis + Test DB, Mocked Jira)

```
Test 1 — First job for an action item → ticket created, jiraIssueId
         persisted, idempotency key set
Test 2 — Second job with the SAME idempotencyKey → no-op, zero API calls
         made (mock/spy assertion), zero duplicate ticket creation
Test 3 — Action item deleted before job runs → silent no-op, no error thrown
Test 4 — Mocked 401 with a failed refresh → job fails as NON-retryable,
         consecutiveErrors incremented
Test 5 — Mocked 503 → job fails as RETRYABLE, BullMQ's attempts mechanism
         observed to actually retry (verified via job.attemptsMade in a
         test harness, not just asserting the error type)
Test 6 — 5 consecutive integration-level failures (across separate job
         runs) → isActive flips to false, notify job queued

RECONNECT / UPSERT-MERGE TEST (explicitly called out in §18):
  Configure a Jira integration with a projectKey set → simulate a
  NEEDS_RECONNECT state → run the callback flow again (reconnect) →
  assert metadata.projectKey SURVIVES the upsert unchanged, only token
  fields and isActive/consecutiveErrors reset.
```

### End-to-End (Manual, Real Jira Cloud Sandbox)

```
Test 1 — Full OAuth connect: consent screen → callback → cloudId
         correctly resolved and visible in the database (spot-check)
Test 2 — Configure a real project + issue type → sync a real action item →
         ticket appears in the actual Jira board with correct summary,
         rendered ADF description (verify it's readable, not raw JSON,
         in Jira's UI), correct priority, correct assignee (using a real
         team member's email that matches a real Jira user)
Test 3 — Sync an action item for a user with NO matching Jira account →
         ticket created successfully, unassigned
Test 4 — Disconnect → verify (as best possible via Atlassian's own
         connected-apps management page) the OAuth grant reflects the
         disconnection state
Test 5 — Reconnect after disconnect → clean upsert, project configuration
         must be re-entered (since disconnect, unlike a NEEDS_RECONNECT
         auto-disable, is a full row deletion per §18 — a DIFFERENT
         persistence path than the reconnect-after-auto-disable case
         tested above, and this distinction is worth confirming
         explicitly rather than assumed identical)
```

---

## 28. End-of-Day Checklist

```
SCHEMA
  [ ] Confirmed ZERO migrations needed — team_integrations.metadata and
      action_items.jira* columns already exist from Day 3 schema

PROVIDER ABSTRACTION
  [ ] provider.interface.ts contains ZERO Jira-specific field/method names
  [ ] provider.registry.ts is the ONLY file integrations.service.ts and
      integrate.worker.ts import a provider through — grep to confirm
      neither file imports jira.provider.ts directly
  [ ] Linear and Notion registry slots exist as explicit, documented
      placeholders (not silently absent)

OAUTH & CLOUD ID
  [ ] audience=api.atlassian.com present in every authorization URL
  [ ] offline_access scope present (refresh token actually issued,
      verified against a real sandbox connect)
  [ ] accessible-resources call happens on EVERY connect, cloudId
      persisted correctly
  [ ] Multi-site account correctly logs a WARN and selects the first site
      (tested, not just described)
  [ ] Reconnect after NEEDS_RECONNECT preserves metadata.projectKey
      (explicit test, §27)

TICKET CREATION
  [ ] Description is valid ADF, renders correctly in real Jira (not raw
      JSON visible to the ticket viewer)
  [ ] Due date omitted (not null) when absent
  [ ] Assignee omitted (not malformed) when unresolved
  [ ] Priority mapping verified against REAL Jira default scheme
      (URGENT → "Highest" confirmed, not assumed)
  [ ] Summary truncation at 255 chars verified

IDEMPOTENCY & RETRY
  [ ] Duplicate job with same idempotencyKey produces zero additional
      API calls
  [ ] 4xx errors do NOT retry (verified via BullMQ job inspection)
  [ ] 5xx/429 errors DO retry per the 5-attempt policy
  [ ] 5 consecutive failures correctly auto-disable the integration +
      queue a notify job

CACHING
  [ ] Assignee cache: positive hit verified (no live lookup on 2nd call)
  [ ] Assignee cache: negative ("NONE") hit verified (no live lookup on
      2nd call for an unmapped email)

SECURITY
  [ ] Tokens encrypted at rest (spot-checked in the database)
  [ ] No token values in any log line (grep the log output)
  [ ] metadata column confirmed to contain ONLY non-secret config
      (cloudId, projectKey, etc.) — no token-shaped values present
  [ ] All management endpoints (connect/projects/configure/disconnect)
      confirmed to reject a non-ADMIN role with 403

FRONTEND
  [ ] JiraIntegration renders all 4 states correctly (not-connected,
      connected-unconfigured, connected-configured, error)
  [ ] JiraProjectConfigForm correctly populates from GET /projects

SIGN-OFF
  [ ] Full manual E2E test pass completed against a REAL Jira Cloud
      sandbox instance (connect → configure → sync → verify in Jira UI →
      disconnect → reconnect)
```

---

## 29. Risks & Edge Cases Register

```
RISK                                          MITIGATION / DISPOSITION
─────────────────────────────────────────────────────────────────────────────
Team's Jira instance uses a custom            Accepted, documented
(non-default) priority scheme                 limitation (§11) — fails
                                               loudly with a clear 422,
                                               not silently mismapped;
                                               admin must align their
                                               scheme or a future
                                               team-configurable mapping
                                               feature is built if this
                                               becomes a common complaint

Consultant/multi-site Atlassian account       First-site-selected +
connecting produces multiple accessible       WARN-logged (§9) —
resources                                     explicit scope limitation,
                                               a "choose your site" UI
                                               step deferred until real
                                               demand is observed

Two different Vocaply teams somehow           Theoretically possible but
sharing one Jira Cloud site + identical       exceptionally unlikely
project key → jiraIssueId collision risk      given idx_ai_jira_issue's
against the GLOBAL unique index               global uniqueness (§19) —
                                               flagged explicitly rather
                                               than silently assumed
                                               impossible; if it ever
                                               occurs, the SECOND team's
                                               sync would fail with a
                                               DB unique-constraint
                                               error, surfaced as a
                                               clear 5xx-mapped failure
                                               rather than silently
                                               overwriting the first
                                               team's linkage

Jira project renamed/deleted after            Fails loudly per sync
Vocaply's projectKey configuration            attempt (§21) — admin-
was set, outside Vocaply's knowledge          visible via lastError,
                                               not auto-corrected

ADF builder scope creep pressure              Explicitly scoped to
(future requests for richer formatting,       exactly two paragraphs of
checklists, mentions, etc. inside the         fixed-shape content today
ticket description)                           (§8) — any richer
                                               formatting need is a
                                               deliberate, separate
                                               future enhancement to
                                               buildIssueDescription(),
                                               not scope for today

Rate-limit interaction between the            Concurrency deliberately
integrate queue's concurrency (3) and         set lower than calendar
Jira's own per-app rate limits under a        sync's (§20) as a
large team syncing many action items at       conservative starting
once (e.g. right after a large meeting        point; if 429s are
with 15 extracted action items all            observed in production at
triggering sync simultaneously)               this concurrency, the
                                               environment-tunable
                                               setting can be lowered
                                               further without a code
                                               change — explicitly
                                               flagged as a metric to
                                               watch (§22) post-launch
```

---

*Document: DAY-58-PLAN-001 | Vocaply | Day 58: Jira Integration (Outbound)*
*Full Scalable Industry-Level Build Plan | Principal Backend Engineer Edition*
*Phase 5 — Integrations | Planning & Architecture Blueprint — No Code, Pure Design*
*Provider abstraction · Cloud ID resolution · ADF formatting · Idempotent sync · Asymmetric retry policy*
