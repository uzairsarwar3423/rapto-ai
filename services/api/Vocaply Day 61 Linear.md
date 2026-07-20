# Vocaply — Day 61: Linear Integration (Outbound, GraphQL)
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-61-PLAN-001 | Version 1.0 | Phase 5 — Integrations (Days 56–70)

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Why Linear Is Architecturally Different From Jira](#2-why-linear-is-architecturally-different-from-jira)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Layer 1 — GraphQL Transport Layer](#4-layer-1--graphql-transport-layer)
5. [Layer 2 — Linear Provider Implementation](#5-layer-2--linear-provider-implementation)
6. [Layer 3 — Provider Registry Integration](#6-layer-3--provider-registry-integration)
7. [Layer 4 — Integrations Service Orchestration](#7-layer-4--integrations-service-orchestration)
8. [Layer 5 — HTTP Layer (Controller + Routes)](#8-layer-5--http-layer-controller--routes)
9. [Layer 6 — Validation Layer](#9-layer-6--validation-layer)
10. [Layer 7 — Worker Integration (integrate.worker.ts)](#10-layer-7--worker-integration-integrateworkerts)
11. [Data Model & Metadata Design](#11-data-model--metadata-design)
12. [Assignee & Team/State Resolution Logic](#12-assignee--teamstate-resolution-logic)
13. [Priority & Field Mapping Design](#13-priority--field-mapping-design)
14. [Security Architecture](#14-security-architecture)
15. [Performance Architecture](#15-performance-architecture)
16. [Caching Strategy](#16-caching-strategy)
17. [Error Handling & Retry Strategy](#17-error-handling--retry-strategy)
18. [Idempotency Design](#18-idempotency-design)
19. [Observability & Logging](#19-observability--logging)
20. [API Endpoints — Full Specification](#20-api-endpoints--full-specification)
21. [Middleware Chain Design](#21-middleware-chain-design)
22. [Frontend Integration Plan](#22-frontend-integration-plan)
23. [Types & Interfaces](#23-types--interfaces)
24. [Testing Plan](#24-testing-plan)
25. [End-of-Day Checklist](#25-end-of-day-checklist)
26. [Risks & Edge Cases](#26-risks--edge-cases)

---

## 1. Day Overview & Goals

### What Gets Built Today

Day 61 connects Vocaply to **Linear** — a project-management tool many
engineering-first teams use instead of (or alongside) Jira — so that extracted
action items can be pushed outward as real Linear issues, with correct
assignee resolution, priority mapping, and workflow-state placement. This is
the **third** provider to implement the `IntegrationProvider` interface first
established on Day 58 (Jira) and reused for Slack (Day 60), and it is
deliberately the **first GraphQL-based provider** the platform has ever
integrated with — every prior third-party integration (Recall.ai, Stripe,
Google Calendar, Jira, Slack) has been REST/webhook based.

```
TODAY BUILDS:
  ✅ A minimal, reusable GraphQL transport wrapper (utils/graphql-client.ts)
  ✅ linear.provider.ts — full IntegrationProvider implementation
  ✅ Linear OAuth 2.0 connect/callback/disconnect flow
  ✅ Linear teams + workflow-states discovery (settings configuration UX)
  ✅ Assignee email → Linear user ID resolution, Redis-cached
  ✅ Priority mapping (Vocaply enum → Linear's numeric priority scale)
  ✅ integrate.worker.ts extended with a Linear branch (column-mapping only)
  ✅ Linear-specific retry/backoff semantics (GraphQL error-code aware)
  ✅ Frontend: LinearIntegration.tsx settings card + hooks
  ✅ Full test coverage: unit (provider logic) + integration (mocked GraphQL)

DOWNSTREAM IMPACT:
  Day 62 — Notion integration will reuse today's OAuth/registry patterns,
           proving the abstraction generalizes to a THIRD API shape (REST +
           rich content, after REST-flat/Jira and GraphQL/Linear)
  Day 64 — Token refresh & alerting cron will treat Linear's non-expiring
           token as a first-class no-op case, exercised by today's design
  Day 65 — Integration test suite's composite scenarios depend on Linear
           being a fully working, independently-testable provider

DO NOT SKIP OR RUSH:
  The GraphQL error-handling distinction (HTTP 200 + errors[] vs. genuine
  HTTP-level failure vs. success:false with no errors at all) is the single
  most common mistake teams make when wrapping their first GraphQL API. If
  this is done wrong today, every future GraphQL-based provider inherits the
  same category of silent-failure bug.
```

### 8-Hour Time Allocation

```
9:00 AM – 9:45 AM    → utils/graphql-client.ts (transport wrapper)
9:45 AM – 10:30 AM   → oauth-providers.config.ts (Linear OAuth config) +
                        connect/callback service logic
10:30 AM – 12:00 PM  → linear.provider.ts — createExternalItem, testConnection,
                        listTeamsAndStates, resolveLinearAssignee
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 1:30 PM    → provider.registry.ts wiring + integrations.service.ts
                        orchestration updates
1:30 PM – 2:15 PM    → integrations.controller.ts + routes.ts + validator.ts
2:15 PM – 3:00 PM    → integrate.worker.ts Linear branch + retry policy wiring
3:00 PM – 3:45 PM    → Frontend: LinearIntegration.tsx + useOAuthConnect
                        generalization + settings dropdown wiring
3:45 PM – 4:30 PM    → Unit tests: graphql-client, priority mapping, assignee
                        resolution, success:false handling
4:30 PM – 5:15 PM    → Integration tests: mocked Linear GraphQL responses,
                        full connect → sync → disconnect flow
5:15 PM – 5:45 PM    → Manual E2E against a real (sandbox) Linear workspace
5:45 PM – 6:00 PM    → Checklist review + sign-off
```

---

## 2. Why Linear Is Architecturally Different From Jira

### The Core Distinction

```
JIRA (Day 58)                          LINEAR (Day 61)
──────────────────────────────────────────────────────────────────────────
REST — one endpoint per resource        GraphQL — ONE endpoint for everything
Status codes carry error semantics      Status codes only reflect TRANSPORT
                                         health; business errors live inside
                                         a 200 OK response body
Resource-scoped OAuth (cloudId lookup)  Standard authorization-code OAuth,
                                         no secondary resource-discovery step
Assignee needs accountId (REST lookup)  Assignee needs Linear user ID
                                         (GraphQL query, same shape of problem,
                                         different transport)
Priority: string enum ("High")          Priority: integer enum (1–4)
Description: Atlassian Document Format  Description: plain string (Linear
  (structured JSON)                      accepts markdown-flavored text directly)
```

### Why This Matters for the `IntegrationProvider` Contract

The entire point of Day 58's abstraction was to let `integrations.service.ts`
and `integrate.worker.ts` never know or care whether they are talking to
Jira, Linear, Notion, or any future provider. Today is the **proof day** for
that claim. If implementing Linear requires touching orchestration code
outside `linear.provider.ts` itself (beyond a one-line column-name mapping in
the worker), the abstraction has failed its design goal. This plan is written
so that failure mode is structurally impossible — every Linear-specific
concern (GraphQL transport, error-code interpretation, numeric priority,
assignee resolution) is fully contained inside the provider file and its
dedicated transport utility.

### The GraphQL Error Triad (Must Be Understood Before Writing Any Code)

Every GraphQL response Vocaply receives from Linear falls into exactly one of
three categories, and each demands different handling:

```
CATEGORY 1 — Transport-level failure (HTTP non-2xx)
  Cause: network failure, gateway timeout, invalid/expired OAuth token
         rejected outright, Linear platform outage
  Detection: response.ok === false
  Handling: treat exactly like any other HTTP integration failure —
            retryable if 5xx/429, non-retryable if 401/403

CATEGORY 2 — GraphQL-level error (HTTP 200, errors[] array present)
  Cause: malformed query, invalid variable, field-level permission denial,
         Linear's own rate-limit signal delivered via extensions.code
  Detection: HTTP 200, response body contains a non-empty errors[] array
  Handling: inspect errors[].extensions.code to decide retryable vs. not —
            THIS is the step most GraphQL integrations get wrong by treating
            any 200 status as unconditional success

CATEGORY 3 — Semantic/business rejection (HTTP 200, no errors[], but the
             mutation payload itself signals failure)
  Cause: Linear's mutation responses include their own success: boolean
         field independent of the GraphQL error mechanism — a mutation can
         be syntactically and permission-wise valid yet still fail for a
         business reason (e.g., a stateId that no longer exists because the
         team reconfigured their workflow after Vocaply's config was saved)
  Detection: body.data.issueCreate.success === false
  Handling: non-retryable — this is a configuration problem the admin must
            fix, not a transient fault
```

Any implementation that only handles Category 1 (the REST-instinct default)
will silently create phantom "successful" sync records for both Category 2
and Category 3 failures. This distinction drives the entire transport-layer
and provider-layer design below.

---

## 3. File Structure to Create

```
services/api/src/
│
├── utils/
│   └── graphql-client.ts                     ← NEW — generic GraphQL POST wrapper
│
├── modules/integrations/
│   ├── providers/
│   │   ├── linear.provider.ts                ← NEW — full IntegrationProvider impl
│   │   └── provider.registry.ts              ← MODIFY — register LINEAR
│   ├── integrations.service.ts                ← MODIFY — Linear OAuth orchestration
│   ├── integrations.repository.ts             ← MODIFY — no schema change, reused as-is
│   ├── integrations.controller.ts              ← MODIFY — new Linear routes
│   ├── integrations.validator.ts               ← MODIFY — new Zod schemas
│   ├── integrations.types.ts                   ← MODIFY — Linear-specific input/output types
│   └── integrations.routes.ts                  ← MODIFY — register Linear route group
│
├── queues/workers/
│   └── integrate.worker.ts                    ← MODIFY — Linear column-mapping branch
│
├── config/
│   └── oauth-providers.config.ts               ← MODIFY — LINEAR OAuth config block
│
└── services/
    └── crypto.service.ts                       ← REUSED — zero changes needed

services/api/tests/
├── unit/
│   ├── graphql-client.test.ts                  ← NEW
│   ├── linear-provider.test.ts                 ← NEW
│   └── linear-priority-mapping.test.ts         ← NEW
└── integration/
    └── linear-integration.test.ts              ← NEW (full connect→sync→disconnect)

apps/web/src/features/integrations/
├── components/providers/
│   └── LinearIntegration.tsx                   ← NEW — settings card
├── hooks/
│   ├── useOAuthConnect.ts                       ← MODIFY — generalized (already
│   │                                               provider-agnostic since Day 58;
│   │                                               verify, don't rewrite)
│   └── useLinearConfig.ts                       ← NEW — teams/states dropdown state
└── api/
    └── integrations.api.ts                       ← MODIFY — new Linear endpoints
```

### Dependency Flow (No Circular Deps)

```
integrations.routes.ts
  └── integrations.controller.ts
        └── integrations.service.ts
              ├── integrations.repository.ts       (DB access — team_integrations)
              ├── provider.registry.ts               (resolves 'LINEAR' → linearProvider)
              │     └── linear.provider.ts
              │           └── utils/graphql-client.ts   (transport only, no business logic)
              ├── crypto.service.ts                  (encrypt/decrypt tokens)
              └── cache.service.ts                   (Redis assignee cache)

queues/workers/integrate.worker.ts
  └── provider.registry.ts (same registry, same linearProvider instance)
        └── linear.provider.ts → createExternalItem()
```

---

## 4. Layer 1 — GraphQL Transport Layer

### File: `utils/graphql-client.ts`

**Responsibility:** A single, minimal, fully generic function that knows how
to POST a GraphQL query/mutation and correctly distinguish the three error
categories described in Section 2. This file has **zero knowledge of Linear,
Vocaply's domain model, or any specific provider** — it is pure transport,
reusable by any future GraphQL-based integration without modification.

### Design Rationale — Why Not a Full GraphQL Client Library

```
CONSIDERED: Apollo Client, urql, graphql-request
REJECTED BECAUSE:
  × Vocaply sends a small, fixed, hand-authored set of operations to Linear
    (viewer, issueCreate, users search, teams+states query) — never dynamic,
    never client-generated queries
  × Apollo/urql bring normalized caching, subscriptions, and a reactive
    query layer designed for frontend consumption patterns — none of which
    apply to a backend service making occasional outbound calls
  × A dependency that size for four hand-written operations is an
    unjustified maintenance and bundle-size cost on the backend

CHOSEN: A ~40-line typed wrapper around the platform's existing native fetch
        usage (same pattern already used for Recall.ai, Jira, Slack REST
        calls) — consistent with the codebase's existing HTTP client
        philosophy rather than introducing a second paradigm.
```

### Functional Contract

- **Input:** endpoint URL, headers (including the bearer/OAuth token), the
  raw GraphQL query or mutation string, an optional variables object, and an
  optional timeout override.
- **Behavior:**
  1. Issues the POST with an `AbortController`-backed timeout (default 15s,
     matching the Recall.ai/Jira provider convention already established).
  2. If the HTTP response itself is non-2xx → Category 1 failure → throws a
     typed `IntegrationError` tagged with the provider name, carrying the
     HTTP status for downstream retry-classification.
  3. If the HTTP response is 2xx, parses the JSON body and inspects it for a
     non-empty `errors` array → Category 2 failure → throws a dedicated
     `GraphQLClientError` carrying the full `errors[]` payload (including each
     error's `extensions.code`, which is what callers use to decide
     retryable vs. non-retryable).
  4. If neither of the above and the `data` field is missing entirely →
     treated as a malformed/unexpected response shape → thrown as an
     `IntegrationError`, never silently returned as `undefined`.
  5. Otherwise, returns the typed `data` payload to the caller.
- **What it explicitly does NOT do:** it does not know about `issueCreate`,
  `success` booleans, or any Linear-specific mutation shape — Category 3
  (semantic rejection) is entirely the calling provider's responsibility to
  detect from the returned `data`, because "was this successful" is a
  business question the transport layer cannot answer generically across
  different GraphQL APIs.

### Timeout & Abort Handling

Every call wraps the fetch in a timeout guard consistent with the platform's
`recall.service.ts` convention (Day 17): a `setTimeout` triggers
`controller.abort()`, and the `finally` block always clears the timer,
preventing timer leaks across the thousands of calls this function will make
over the service's lifetime.

---

## 5. Layer 2 — Linear Provider Implementation

### File: `providers/linear.provider.ts`

**Responsibility:** The complete `IntegrationProvider` implementation for
Linear. Everything Linear-specific — GraphQL query text, variable shaping,
priority mapping, assignee resolution, error-code interpretation — lives
here and nowhere else in the codebase.

### Method-by-Method Design

#### `getAuthorizationUrl(state, teamId)`

Builds Linear's OAuth 2.0 authorize URL
(`https://linear.app/oauth/authorize`) with the application's client ID,
a redirect URI pointing at the callback endpoint, requested scopes (`read`,
`write`), and the CSRF `state` parameter. This mirrors the exact
state-generation/storage pattern already used for Jira and Slack (Day
58/60): a cryptographically random state value stored in Redis
(`oauth:state:linear:{state}`) with a 10-minute TTL, bound to the initiating
team, consumed exactly once on callback.

#### `exchangeCodeForTokens(code)`

Performs the authorization-code-for-token exchange against Linear's token
endpoint. The resulting access token is treated as **non-expiring** for
storage purposes — `tokenExpiresAt` is persisted as `null`. This is a
deliberate design choice with a real consequence: the shared
`getValidAccessToken()` helper (built Day 60) already branches correctly on a
`null` expiry by never attempting a refresh, meaning **zero new refresh logic
is written today** — Linear's token lifecycle is handled entirely by logic
that already exists.

#### `testConnection(accessToken)`

Executes the simplest possible authenticated GraphQL query — the
"who am I" `viewer` query returning the connected identity's id, name, and
email. This powers the settings page's "Test Connection" button, an existing
UX pattern reused rather than invented fresh. A failure here (Category 1 or
Category 2) surfaces as "Connection test failed — please reconnect Linear,"
distinct from a sync-specific failure message.

#### `createExternalItem(input)`

The core outbound sync method, and the one place all three error categories
must be actively distinguished:

1. Builds the `issueCreate` mutation variables from the generic
   `CreateExternalItemInput` shape (the same input shape already used by
   Jira and Slack's `IntegrationProvider` contract — no new input type is
   introduced): team ID from stored metadata, a title truncated to Linear's
   accepted length, a description string containing meeting context, the
   mapped numeric priority, an optional due date, an optional resolved
   assignee ID, and the configured default workflow state ID.
2. Calls the shared `graphqlRequest()` transport function, which already
   handles Category 1 and Category 2 failures by throwing.
3. **Explicitly inspects the returned mutation payload's `success` field**
   (Category 3) — if `false`, throws a dedicated, non-retryable
   `IntegrationError` with a message pointing at likely causes (invalid
   state ID, revoked write permission) so the escalation email (Day 64) can
   surface something actionable to the admin rather than a generic failure.
4. On success, maps Linear's response (`issue.id`, `issue.identifier`,
   `issue.url`) into the standard `ExternalItemResult` shape
   (`externalId`, `externalUrl`) — identical contract to Jira and the
   future Notion implementation, meaning the calling worker never needs to
   know which provider it invoked.

#### `resolveLinearAssignee(accessToken, teamId, email)`

Resolves a Vocaply user's email address to the Linear user ID Linear's
`issueCreate` mutation requires. Logic:

1. Check Redis cache (`cache:linear:assignee:{teamId}:{email}`, 24h TTL) —
   if present, return immediately with zero network calls.
2. On cache miss, run a `users` query filtered by email equality.
3. If exactly one match is found, cache and return its ID.
4. If zero matches, return `null` (the field is simply omitted from the
   mutation — never a hard failure; an unassigned Linear issue is a
   perfectly valid outcome and better than blocking the whole sync).
5. If more than one match is returned (should not normally happen given
   email uniqueness within a workspace, but defensively handled), log a
   warning and treat as unresolved rather than guessing.

#### `listTeamsAndStates(accessToken)`

A single combined GraphQL query fetching all Linear teams the connected
integration can see, each with its nested workflow states. This is
explicitly called out as GraphQL's structural advantage over Jira's REST
equivalent (which would require at least two separate REST calls — list
projects, then list statuses per project). Powers the settings page's
"default team" and "default workflow state" configuration dropdowns, exactly
mirroring the Jira `projects` picker UX already shipped Day 58.

#### `mapPriority(vocaplyPriority)`

A pure, side-effect-free lookup function translating Vocaply's four-level
`PriorityLevel` enum into Linear's integer priority scale (documented in
Section 13). Because this is a pure function with a small fixed input
domain, it is exhaustively unit-tested rather than integration-tested.

---

## 6. Layer 3 — Provider Registry Integration

### File: `providers/provider.registry.ts`

**Change today:** the previously `null`-stubbed `LINEAR` entry (placeholder
since Day 58) is replaced with a real `linearProvider` instance. No other
line in this file changes. `getProvider('LINEAR')` now returns a fully
functional implementation instead of throwing `PROVIDER_NOT_SUPPORTED`.

**Why this is the entire scope of the change:** the registry's whole purpose,
established Day 58, is to be the **single point of variability** in the
system — every other file that needs "the Linear integration" asks the
registry for it by name and receives an object satisfying the same
interface as Jira, Slack, or any future provider. Today's work proves that
promise: `integrate.worker.ts` and `integrations.service.ts` require no
Linear-aware conditional logic anywhere, because the registry is the only
place that knows which concrete class backs the `'LINEAR'` string.

---

## 7. Layer 4 — Integrations Service Orchestration

### File: `integrations.service.ts` (modified)

**Responsibility:** Business logic for connecting, configuring, testing, and
disconnecting the Linear integration. Never touches HTTP directly, never
imports GraphQL specifics — all Linear-shaped behavior is delegated to
`linear.provider.ts` via the registry.

### Function: `initiateOAuth('LINEAR', teamId)`

Reused generic OAuth-initiation logic already built Day 58 for Jira and Day
60 for Slack: generate CSRF state, store in Redis scoped to the provider name
and team, call `providerRegistry.getProvider('LINEAR').getAuthorizationUrl()`,
return the resulting redirect URL. **No new code path** — this function was
already written generically; today's work is limited to confirming Linear's
provider correctly plugs into the existing generic flow.

### Function: `handleOAuthCallback('LINEAR', code, state, teamId)`

Also fully reused from the generic pattern: verify and consume the CSRF
state token, call the provider's `exchangeCodeForTokens()`, encrypt the
resulting access token via `crypto.service.ts` (Linear's `refreshToken` is
`null` and stored as such — the encryption helper already tolerates a null
refresh token, exercised previously for Slack), and upsert the
`TeamIntegration` row with `provider: 'LINEAR'`.

### Function: `configureLinear(teamId, { linearTeamId, defaultStateId })`

New today, but structurally identical to `configureJira()` from Day 58: loads
the existing `TeamIntegration` row, merges the two new fields into its
`metadata` JSONB (never overwriting unrelated keys — the same merge-not-replace
discipline already established for team settings updates on Day 16), and
persists.

### Function: `listLinearTeamsAndStates(teamId)`

Thin orchestration: decrypts the stored access token, delegates to the
provider's `listTeamsAndStates()`, returns the result to the controller
unmodified. No caching at this layer — this is a low-frequency,
settings-page-only call where always-fresh data is more valuable than saved
latency.

### Function: `disconnectIntegration('LINEAR', teamId)`

Reused generic disconnect flow: decrypt the current token, call the
provider's revocation behavior (Linear's OAuth token revocation endpoint),
delete the `TeamIntegration` row, and invalidate any related Redis caches
(`cache:linear:assignee:{teamId}:*` — a pattern-scan-and-delete, since
per-email cache keys can't be targeted individually at disconnect time).

---

## 8. Layer 5 — HTTP Layer (Controller + Routes)

### File: `integrations.controller.ts` (modified)

Following the established platform rule — controllers translate HTTP to
service calls and back, with zero business logic:

- `connectLinearController` — calls `integrationsService.initiateOAuth('LINEAR', req.teamId)`, redirects (302) to the returned URL.
- `linearCallbackController` — extracts `code`/`state` from query params, calls `handleOAuthCallback`, redirects to the frontend settings page with a success/failure query flag.
- `getLinearTeamsController` — calls `listLinearTeamsAndStates`, returns 200 with the team/state list.
- `configureLinearController` — validates body via Zod, calls `configureLinear`, returns 200 with the updated integration summary (never the raw token).
- `disconnectLinearController` — calls `disconnectIntegration('LINEAR', ...)`, returns 200 confirmation.

### File: `integrations.routes.ts` (modified)

```
GET    /integrations/linear/connect      → requireAuth, requireRole('ADMIN'), controller
GET    /integrations/linear/callback     → requireAuth, requireRole('ADMIN'), controller
GET    /integrations/linear/teams        → requireAuth, requireRole('ADMIN'), controller
PATCH  /integrations/linear/configure     → requireAuth, requireRole('ADMIN'), validate(configureLinearSchema), controller
DELETE /integrations/linear              → requireAuth, requireRole('ADMIN'), controller
```

All five routes require `ADMIN+` — consistent with the platform-wide rule
(established Day 16, reaffirmed Day 58/60) that connecting or reconfiguring a
team-level integration is an administrative action, never available to a
plain `MEMBER`.

---

## 9. Layer 6 — Validation Layer

### File: `integrations.validator.ts` (modified)

New schema added today: `configureLinearSchema`, validating:

- `linearTeamId`: required string, must correspond to a team ID the
  connected integration can actually see (cross-checked at the service
  layer against a fresh `listTeamsAndStates()` call, not merely
  format-validated — a stale or fabricated team ID must never be silently
  accepted).
- `defaultStateId`: required string, must belong to the selected
  `linearTeamId`'s workflow states (same cross-check discipline).

This mirrors the exact validation philosophy already used for Jira's
`projectKey`/`defaultIssueType` configuration (Day 58) — client-supplied IDs
for a third-party resource are never trusted at face value; they are
validated against a live lookup before being persisted.

---

## 10. Layer 7 — Worker Integration (`integrate.worker.ts`)

### The Only Change This File Receives Today

The worker's orchestration logic — load the `TeamIntegration`, resolve the
provider from the registry, call `createExternalItem()`, persist the
result, set the idempotency key, emit the Socket.io event — is **completely
unchanged** from the shape already built for Jira (Day 58). The single
addition is a column-name mapping so that a `'LINEAR'` job persists into
`linearIssueId` / `linearIssueUrl` / `linearIssueSyncedAt` rather than the
Jira-specific columns, using the same generic "provider name lowercased →
column prefix" convention already established.

### Why This Is the Day's Proof Point, Restated

If today's work required adding an `if (provider === 'LINEAR')` branch
anywhere inside the worker's control flow beyond that column-name lookup,
the `IntegrationProvider` abstraction from Day 58 would be proven
insufficiently general. The plan is deliberately structured so that does not
happen — all Linear-specific behavior is fully absorbed by
`linear.provider.ts`.

---

## 11. Data Model & Metadata Design

No new database migration is required today — the existing `team_integrations`
table (defined in the Day 3/DB-SCHEMA documents) already has a `provider`
enum column accepting `'LINEAR'` and a `metadata` JSONB column suitable for
any provider-specific configuration.

### `team_integrations.metadata` Shape for Linear

```
{
  "linearTeamId":   "<Linear internal team UUID>",
  "defaultStateId": "<Linear workflow state UUID, e.g. 'Todo'>",
  "workspaceName":  "<display name, fetched at connect time for settings UI>"
}
```

Consistent with the established secret-vs-config distinction (Day 58/60):
`linearTeamId` and `defaultStateId` are non-secret identifiers and live in
plaintext JSONB; only `accessTokenEnc` (and, if ever populated, a refresh
token) go through AES-256-GCM encryption via `crypto.service.ts`.

### `action_items` Columns Used (Already Exist)

`linearIssueId`, `linearIssueUrl`, `linearIssueSyncedAt` — all three already
defined in the Day 3 schema and Day 15 Action Items module, specifically
provisioned in anticipation of this integration. Today is simply the first
day they are actually written to.

---

## 12. Assignee & Team/State Resolution Logic

### The Assignee Resolution Problem, Restated for Linear

Linear's `issueCreate` mutation accepts an `assigneeId`, which must be a
Linear-internal user identifier — never an email address. Vocaply only knows
the assignee's email (from the Vocaply `User` record). This is structurally
the same class of problem already solved for Jira (email → `accountId`) and
Slack (email → Slack user ID), and today's solution deliberately follows the
identical shape:

1. Check a Redis cache keyed by team and email.
2. On miss, query Linear's API for a user matching that email within the
   connected workspace.
3. Cache the result (hit or a documented "no match" sentinel) for 24 hours.
4. Never block issue creation on a resolution failure — an unresolved
   assignee simply means the created Linear issue has no assignee set,
   exactly matching the product decision already made for Jira.

### Team & Workflow-State Resolution (Configuration-Time, Not Sync-Time)

Unlike assignee resolution (which happens on every single sync), the
`linearTeamId` and `defaultStateId` are resolved **once, at configuration
time**, by the admin picking from a live-fetched list in the settings UI, and
then stored in `metadata` for reuse on every subsequent sync. This avoids a
GraphQL round-trip on every action-item sync purely to determine "which
Linear team does this go into" — that answer is stable per-integration and
does not need to be re-derived per issue.

---

## 13. Priority & Field Mapping Design

### Priority Mapping Table (Locked-In Business Decision)

```
Vocaply PriorityLevel     Linear numeric priority     Linear display label
──────────────────────────────────────────────────────────────────────────
LOW                       1                            Low
MEDIUM                    2                            Medium
HIGH                      3                            High
URGENT                    4                             Urgent
```

This mapping lives as a single, pure, exhaustively-unit-tested lookup
function inside `linear.provider.ts` — never duplicated, never inferred, and
never exposed for per-team customization in this release (a future
enhancement could allow teams to remap this, but that is explicitly out of
scope for Day 61).

### Description Field Handling

Unlike Jira's Atlassian Document Format requirement (a structured JSON body
for rich text), Linear's `description` field on `issueCreate` accepts a plain
markdown-flavored string directly. This means the meeting-context description
text ("Extracted from meeting: {title} on {date}") is passed as-is, with no
document-structure wrapping required — one fewer transformation step than
Jira, worth calling out explicitly so a future engineer doesn't
"defensively" wrap it in an unnecessary structure by habit carried over from
the Jira implementation.

### Title Truncation

Linear enforces its own maximum title length; Vocaply defensively truncates
the action-item text to a safe character limit before sending, with an
ellipsis marker, so an unusually long extracted action item never causes the
mutation to be rejected outright for a reason unrelated to the actual sync
logic.

---

## 14. Security Architecture

### OAuth & Token Security

- Linear's OAuth 2.0 authorization-code flow reuses the exact CSRF
  state-token pattern already hardened for Jira and Slack: cryptographically
  random state (32 bytes), stored server-side in Redis with a short TTL,
  bound to the initiating team, consumed exactly once.
- The resulting access token is encrypted at rest using the platform's
  existing `crypto.service.ts` (AES-256-GCM) — no new encryption code is
  written today; this is a direct reuse of infrastructure built Day 14.
- Because Linear's tokens do not expire under normal operation, there is no
  refresh token to protect — but the access token itself remains a
  long-lived credential and is never logged, never returned in any API
  response body, and never included in Sentry error context (the platform's
  existing `beforeSend` scrubbing hook, established for Recall.ai and
  extended for every subsequent provider, covers this automatically).

### GraphQL Injection Surface

The single most important security rule for today's work: **every variable
passed to a Linear GraphQL operation goes through the `variables` object of
the request payload — never string-interpolated directly into the query or
mutation text.** This is the GraphQL-transport equivalent of SQL
parameterization, and a violation of it (e.g., building a query string via
template-literal interpolation of an actionItem's text field) would open an
injection vector into Linear's query parser. Code review for this day
explicitly checks every call site in `linear.provider.ts` for this pattern.

### Role-Based Access Control

Connecting, configuring, and disconnecting the Linear integration are all
`ADMIN+`-gated, identically to Jira and Slack — a `MEMBER` or `MANAGER` can
trigger an individual action-item sync (via the existing generic
`POST /action-items/:id/sync` endpoint from Day 20) but cannot alter which
Linear workspace/team/state the whole integration points at.

### Least-Privilege Scope Request

The OAuth authorization request asks only for `read` and `write` scopes —
the minimum Linear grants that allow both issue creation and the
team/state/user lookups this integration needs. No broader administrative
scope is ever requested.

---

## 15. Performance Architecture

### Why GraphQL's Single-Round-Trip Model Is a Performance Win Here

`listTeamsAndStates()` is the clearest example: the equivalent Jira operation
(Day 58) requires at least two sequential REST calls — list projects, then
for each project list its available issue types/priorities. Linear's
GraphQL schema allows teams and their nested workflow states to be fetched
in a **single request**, reducing both latency and the number of outbound
calls counted against Linear's API rate limits.

### Assignee Resolution Caching

Exactly mirroring the Jira/Slack pattern: a 24-hour Redis cache on the
email→user-ID mapping means a team syncing dozens of action items across a
day incurs the GraphQL user-lookup cost once per unique assignee, not once
per action item.

### Concurrency on the `integrate` Queue

No change to the existing queue configuration (concurrency of 3, established
Day 58) — Linear's sync work is added as a new *branch* of the same worker
and queue, not a new queue, deliberately keeping outbound integration write
traffic under one shared concurrency ceiling across all providers (Jira,
Linear, and — from Day 62 — Notion) so no single provider can monopolize
worker capacity.

### Timeout Discipline

The GraphQL transport wrapper's default 15-second timeout matches the
platform-wide convention already used for Recall.ai and Jira's REST calls —
consistency here means the same alerting thresholds (Day 19's observability
stack) apply without needing a Linear-specific carve-out.

---

## 16. Caching Strategy

```
CACHE KEY                                    TTL      INVALIDATED ON
──────────────────────────────────────────────────────────────────────
cache:linear:assignee:{teamId}:{email}       86400s   Integration disconnect
                                                       (pattern-scanned and
                                                        cleared), or never
                                                        otherwise (stable data)

No caching applied to:
  - listTeamsAndStates() results (always live — low-frequency, settings-only)
  - testConnection() results (always live — a deliberate freshness check)
  - createExternalItem() calls (never cached — every sync is a real mutation)
```

The single cache entry introduced today follows the exact pattern already
established for Jira's assignee cache (Day 58) and Slack's user-lookup cache
(Day 60) — no new caching *pattern* is invented, only a new key namespace
under the existing convention.

---

## 17. Error Handling & Retry Strategy

### Error Classification Table

```
CONDITION                                          RETRYABLE?   HANDLING
──────────────────────────────────────────────────────────────────────────
HTTP transport failure (network, timeout)          YES          Exponential
                                                                 backoff, same
                                                                 policy as Jira
HTTP 5xx from Linear's edge                         YES          Exponential backoff
HTTP 429 (rate limited)                            YES          Backoff honoring
                                                                 any Retry-After
                                                                 signal present
HTTP 401/403 (token rejected outright)              NO           Non-retryable;
                                                                 flagged via the
                                                                 consecutive-error
                                                                 tracking path
GraphQL errors[] with code AUTHENTICATION_ERROR      NO           Same as above
GraphQL errors[] with code RATELIMITED               YES          Backoff
GraphQL errors[] — other/unknown codes               NO           Treated
                                                                 conservatively as
                                                                 non-retryable;
                                                                 logged with full
                                                                 error detail for
                                                                 manual triage
issueCreate.success === false (no GraphQL errors)    NO           Non-retryable —
                                                                 configuration
                                                                 problem (bad
                                                                 stateId/teamId),
                                                                 surfaced to admin
```

### Retry Policy Parameters

Reuses the exact 5-attempt, exponential-backoff-with-base-15-seconds policy
already defined for Jira on Day 58 (15s, 30s, 60s, 120s, 240s) — the
rationale is identical: Jira/Linear sync has real, user-visible side effects
(a ticket appearing on someone's board), so the retry cadence balances
"don't look permanently broken on a transient blip" against "don't hammer a
struggling or misconfigured integration."

### Consecutive-Error Escalation

Every non-retryable failure (and every retry-exhaustion) increments the same
`consecutiveErrors` counter on the `TeamIntegration` row already used by
Jira and Slack — no new escalation mechanism is introduced today; Linear
simply becomes the third provider feeding into the existing (and, as of Day
64, further centralized) failure-tracking and alerting pipeline.

---

## 18. Idempotency Design

Reuses the exact idempotency mechanism already built for Jira sync (Day 58):
the `integrate` job carries an `idempotencyKey` (originating from the
`X-Idempotency-Key` header on the triggering `POST /action-items/:id/sync`
call), and before performing any Linear mutation, the worker checks
`integrate:done:{idempotencyKey}` in Redis — if present, the job is a safe
no-op. On success, the same key is set with a 24-hour TTL. This guarantees a
network retry of the sync-trigger endpoint can never create two duplicate
Linear issues for the same action item, exactly matching the guarantee
already in place for Jira.

---

## 19. Observability & Logging

### Structured Log Fields (Every Linear API Call)

Every outbound call through `linear.provider.ts` logs, at minimum: the
GraphQL operation name, the team ID, the HTTP status received, the response
latency in milliseconds, and — on any failure — the specific error category
(transport / GraphQL-level / semantic-rejection) and its underlying code or
message. This mirrors the Day 18 structured-logging standard applied
uniformly across every provider so far.

### What Is Never Logged

The raw access token, the full raw GraphQL response body (only the relevant
extracted fields), and any transcript-derived PII beyond what's already
scoped into the action item's own `text` field are excluded from log output
at `info` level, consistent with the platform-wide PII-handling discipline
established Day 18.

### Metrics

New counters introduced today, following the same naming convention as Day
57's dedup metrics: `integrate.linear.success`, `integrate.linear.failure`
(tagged by failure category), and `integrate.linear.assignee_cache_hit` /
`integrate.linear.assignee_cache_miss` — feeding the same Grafana dashboard
already tracking Jira's equivalent counters, so Linear's health is visible
alongside every other provider without a bespoke dashboard panel.

---

## 20. API Endpoints — Full Specification

### `GET /api/v1/integrations/linear/connect`

**Auth:** JWT required | **Role:** ADMIN+ | **Response:** 302 redirect to
Linear's OAuth consent screen.

### `GET /api/v1/integrations/linear/callback`

**Auth:** JWT required | **Role:** ADMIN+

**Query parameters:** `code` (Linear's authorization code), `state` (CSRF
token, verified and consumed).

**Success response:** 302 redirect to the frontend integrations settings
page with a success indicator.

**Error responses:**
- `400` → missing or invalid `code`/`state`
- `409` → CSRF state token expired or already consumed

### `GET /api/v1/integrations/linear/teams`

**Auth:** JWT required | **Role:** ADMIN+

**Response:** 200 with an array of Linear teams, each including its nested
workflow states — used to populate the settings configuration dropdowns.

**Error responses:**
- `422` → Linear integration not connected
- `502` → Linear API unreachable or returned an unexpected error

### `PATCH /api/v1/integrations/linear/configure`

**Auth:** JWT required | **Role:** ADMIN+

**Request body:** `{ linearTeamId: string, defaultStateId: string }`

**Success response:** 200 with the updated integration summary (workspace
name, configured team/state display names — never the token).

**Error responses:**
- `422` → `linearTeamId` or `defaultStateId` does not correspond to a real,
  currently-visible Linear team/state (validated via a live lookup, not
  merely format-checked)

### `DELETE /api/v1/integrations/linear`

**Auth:** JWT required | **Role:** ADMIN+

**Response:** 200 confirmation. Internally: revokes the token at Linear,
deletes the `TeamIntegration` row, clears cached assignee-lookup entries for
the team.

### HTTP Status Code Reference (This Module)

```
200  OK                → successful GET/PATCH/DELETE
302  Found              → OAuth connect/callback redirects
400  Bad Request        → malformed OAuth callback params
401  Unauthorized        → missing/invalid JWT
403  Forbidden           → authenticated but not ADMIN+
409  Conflict             → CSRF state invalid/expired/reused
422  Unprocessable        → invalid team/state ID, or integration not connected
502  Bad Gateway          → Linear API unreachable or returned malformed data
```

---

## 21. Middleware Chain Design

```
GET    /integrations/linear/connect
  chain: requireAuth → injectTenant → requireRole('ADMIN') → controller

GET    /integrations/linear/callback
  chain: requireAuth → injectTenant → requireRole('ADMIN') → controller

GET    /integrations/linear/teams
  chain: requireAuth → injectTenant → requireRole('ADMIN') → controller

PATCH  /integrations/linear/configure
  chain: requireAuth → injectTenant → requireRole('ADMIN') →
         validate(configureLinearSchema) → controller

DELETE /integrations/linear
  chain: requireAuth → injectTenant → requireRole('ADMIN') → controller
```

Every route in this module sits behind the identical five-layer chain
already established for every other admin-gated integration endpoint
(Jira, Slack) — no new middleware is introduced today, only new route
registrations against existing, already-tested middleware.

---

## 22. Frontend Integration Plan

### Component: `LinearIntegration.tsx`

A settings-page card mirroring the existing `JiraIntegration.tsx` and
`SlackIntegration.tsx` components (Day 58/60) in structure: a
connect/disconnect toggle button, a "Test Connection" action, and — once
connected — a configuration section with two dependent dropdowns (Linear
team, then that team's workflow states) populated from the
`GET /integrations/linear/teams` endpoint.

### Hook: `useLinearConfig.ts`

A small TanStack Query-backed hook responsible for fetching the
teams/states list and exposing the currently-selected values plus a
`configure()` mutation that calls `PATCH /integrations/linear/configure`.
Follows the identical optimistic-update-with-rollback pattern already
established for every other settings mutation on the platform (Day 16's
`updateTeamSettings` flow is the template).

### Hook Reuse: `useOAuthConnect.ts`

No Linear-specific changes required — this hook was **already generalized**
across providers as of Day 58/60 (accepting a provider name string and
redirecting to that provider's `/connect` endpoint). Today's frontend work
is limited to wiring `LinearIntegration.tsx` to call it with `'linear'` as
the provider argument, confirming the generalization holds for a third
provider without modification.

### Settings Page Registration

`LinearIntegration.tsx` is added to the existing integrations settings page's
provider list (`apps/web/src/app/(dashboard)/settings/integrations/page.tsx`),
alongside the Jira and Slack cards already present — no layout or page-level
logic changes, purely an additional entry in an already-existing list.

---

## 23. Types & Interfaces

### File: `integrations.types.ts` (additions)

- **`LinearConfigureInput`** — `{ linearTeamId: string; defaultStateId: string }`, the shape validated by `configureLinearSchema` and accepted by `configureLinear()`.
- **`LinearTeamWithStates`** — `{ id: string; name: string; states: { id: string; name: string; type: string }[] }`, the shape returned by `listTeamsAndStates()` and consumed by the frontend dropdown.
- **`LinearAssigneeCacheEntry`** — internal shape for the Redis-cached email→userId mapping, including a `resolvedAt` timestamp for potential future cache-warming diagnostics.

No changes are required to the shared `IntegrationProvider`,
`CreateExternalItemInput`, or `ExternalItemResult` interfaces defined Day 58
— today's entire type-level contribution is additive, provider-specific, and
contained within this module, which is itself confirmation that the
core abstraction needed no revision to accommodate a GraphQL-based provider.

---

## 24. Testing Plan

### Unit Tests

#### `graphql-client.test.ts`

- A 2xx response with a populated `data` field and no `errors` → returns
  the `data` payload unmodified.
- A 2xx response with a non-empty `errors` array → throws
  `GraphQLClientError` carrying the full errors array.
- A non-2xx HTTP response → throws `IntegrationError`, never attempts to
  parse `errors[]` (transport failure takes precedence).
- A 2xx response with neither `data` nor `errors` → throws
  `IntegrationError` for an unexpected/malformed shape.
- Timeout behavior: a slow-responding mock server triggers the abort within
  the configured timeout window, and the resulting error is a timeout-typed
  failure, not a hang.

#### `linear-priority-mapping.test.ts`

- All four `PriorityLevel` values map to their exact documented integer.
- An unrecognized input (defensive — should be unreachable given the
  enum's type safety, but tested anyway) falls back to a safe default
  rather than throwing mid-mutation-build.

#### `linear-provider.test.ts`

- `createExternalItem()` with a mocked `success: true` response correctly
  extracts `externalId`/`externalUrl`.
- `createExternalItem()` with a mocked `success: false` response (no
  GraphQL errors) throws a non-retryable error, and the thrown error's
  message is specific enough to be actionable in an alert email.
- `resolveLinearAssignee()` returns a cached value on the second call for
  the same email without issuing a second GraphQL request (verified via a
  call-count assertion on the mocked transport).
- `resolveLinearAssignee()` with zero matching users returns `null` rather
  than throwing.
- `listTeamsAndStates()` correctly shapes a multi-team, multi-state mocked
  response into the expected nested structure.

### Integration Tests

#### `linear-integration.test.ts`

- Full OAuth callback flow: valid code + valid state → `TeamIntegration` row
  created with an encrypted token and `tokenExpiresAt: null`.
- Invalid/reused state → `409`, no row created or modified.
- `configureLinear()` with a `linearTeamId`/`defaultStateId` pair not
  present in a live `listTeamsAndStates()` lookup → `422`, metadata
  unchanged.
- End-to-end sync: a seeded action item, triggered through the same
  `POST /action-items/:id/sync` endpoint used for Jira, results in a
  `linearIssueId`/`linearIssueUrl`/`linearIssueSyncedAt` populated on the
  action item row, using a fully mocked Linear GraphQL endpoint (never a
  real network call in CI).
- Retry-classification test: a mocked `RATELIMITED` GraphQL error code
  results in a retry attempt; a mocked `AUTHENTICATION_ERROR` code does not.
- Disconnect flow: token revocation call is made, `TeamIntegration` row
  deleted, and any cached assignee entries for that team are cleared —
  verified via a subsequent cache-miss on a previously-cached email.

### Manual Smoke Test (Required Before Sign-Off)

A hand-performed connect → configure → sync → verify-in-real-Linear-workspace
→ disconnect round trip against a real (sandbox/dev) Linear workspace,
since automated mocked tests — however thorough — cannot fully validate
Linear's actual response quirks the way a live call can. This mirrors the
manual-smoke-test requirement already called out for every prior provider
integration day.

---

## 25. End-of-Day Checklist

### GraphQL Transport

- [ ] `graphqlRequest()` correctly distinguishes all three error categories
      (transport / GraphQL-level / caller-detected semantic)
- [ ] Timeout aborts correctly and clears its timer in all code paths
      (success, GraphQL error, and transport error)
- [ ] No query or mutation string anywhere contains string-interpolated
      user input — all values pass through the `variables` object

### OAuth & Connection

- [ ] `GET /integrations/linear/connect` redirects to a valid Linear
      consent URL with correct scopes
- [ ] Callback with valid code+state persists an encrypted token,
      `tokenExpiresAt: null`
- [ ] Callback with expired/reused state → `409`, no data mutation
- [ ] Disconnect calls Linear's token revocation before deleting the local row

### Configuration

- [ ] `GET /integrations/linear/teams` returns teams with nested workflow
      states in a single call
- [ ] `PATCH /configure` rejects a team/state ID not present in a live
      lookup with `422`
- [ ] Valid configuration persists into `metadata` without disturbing any
      other existing metadata keys

### Sync Behavior

- [ ] `createExternalItem()` on `success: true` populates
      `linearIssueId`/`linearIssueUrl`/`linearIssueSyncedAt` correctly
- [ ] `createExternalItem()` on `success: false` (no GraphQL errors) is
      treated as a non-retryable failure, never silently recorded as success
- [ ] Priority mapping produces the exact documented integer for all four
      Vocaply priority levels
- [ ] Assignee resolution is cached on the second call for the same email
      (verified via call-count assertion)
- [ ] Unresolved assignee (no matching Linear user) results in an
      unassigned issue, not a failed sync

### Reliability

- [ ] `RATELIMITED` GraphQL error code triggers a retry with backoff
- [ ] `AUTHENTICATION_ERROR` GraphQL error code does not retry
- [ ] 5xx/network transport failures retry with the same 5-attempt
      exponential backoff policy as Jira
- [ ] Idempotency key prevents a duplicate Linear issue on a repeated sync
      trigger request

### Worker Integration

- [ ] `integrate.worker.ts` requires no Linear-specific conditional logic
      beyond the column-name mapping — verified by code review, not just
      functional testing
- [ ] Socket.io `action_item:synced` event fires correctly with
      `provider: 'LINEAR'`

### Frontend

- [ ] `LinearIntegration.tsx` renders connect/disconnect/test/configure
      states correctly, matching the existing Jira/Slack card patterns
- [ ] Team/state dropdowns populate from a live API call and are dependent
      (states filtered to the selected team)
- [ ] `useOAuthConnect` required zero modification to support Linear as a
      third provider

### Security & Observability

- [ ] No access token, full GraphQL response body, or PII beyond the
      action item's own text appears in `info`-level logs
- [ ] Sentry's existing scrubbing hook confirmed to redact Linear's
      Authorization header in a forced-error test
- [ ] `integrate.linear.success` / `integrate.linear.failure` metrics
      visible on the existing Grafana dashboard

### Sign-Off

- [ ] All unit and integration tests pass in CI with zero real network
      calls to `api.linear.app`
- [ ] Manual E2E performed against a real sandbox Linear workspace:
      connect → configure → sync → verify issue in Linear → disconnect

---

## 26. Risks & Edge Cases

```
RISK                                              MITIGATION BUILT TODAY
──────────────────────────────────────────────────────────────────────────
GraphQL 200-with-errors[] silently treated as
  success (the #1 GraphQL integration bug)         graphql-client.ts explicitly
                                                    checks errors[] on every
                                                    2xx response before returning

issueCreate succeeds at the GraphQL layer but
  fails semantically (success: false)              Explicitly checked in
                                                    linear.provider.ts,
                                                    non-retryable, surfaces to
                                                    admin via existing escalation

Team reconfigures Linear workflow, deleting the
  previously-configured defaultStateId              Detected as a success:false
                                                    semantic rejection on next
                                                    sync attempt, not a silent
                                                    data-corruption; admin must
                                                    reconfigure via settings

Assignee email exists in Vocaply but not in the
  connected Linear workspace                        Issue created unassigned,
                                                    never blocks the sync

Duplicate sync trigger due to client retry          Idempotency key (existing
                                                    mechanism, Day 58) prevents
                                                    a second Linear issue

Linear API rate limiting during a burst of
  action-item syncs                                 RATELIMITED GraphQL code
                                                    detected and retried with
                                                    backoff, distinct from a
                                                    hard failure

Injection via unescaped user-authored action-item
  text inside a GraphQL mutation                    All values passed via the
                                                    variables object, never
                                                    string-interpolated into
                                                    query/mutation text
```

---

*Document: DAY-61-PLAN-001 | Vocaply | Day 61: Linear Integration (Outbound, GraphQL)*
*Full Scalable Industry-Level Build Plan | Principal Engineer Edition*
*GraphQL transport · IntegrationProvider proof-of-generality · Priority/assignee mapping*
*Security-first · Performance-optimized · Production-grade · Planning Document — No Code*
