# Rapto & Vocaply Systems — Master API Endpoints Specification
**Document Version:** 1.0.0-PROD  
**Author:** Principal Backend & API Architecture Team  
**System Architecture:** Multi-Tenant Distributed B2B SaaS (Node.js/Express Core API, Python/FastAPI AI Microservice, Next.js App Router BFF)  
**Host Domains:**
- **Core REST & Realtime API:** `https://api.rapto.cloud` (Internal container `api:5000`)
- **Internal AI Pipeline Service:** `http://ai-pipeline:8003` (Non-internet-facing, internal Docker network)
- **Web Frontend Application:** `https://app.rapto.cloud` / `https://rapto.cloud`

---

## 1. Global Architectural & Security Standards

### 1.1 Authentication & Identity Schemes
1. **Bearer JWT (`Authorization: Bearer <accessToken>`)**:
   - Short-lived Access Token (15 minutes).
   - Payload: `{ sub: userId, email: string, teamId: string | null, role: UserRole }`.
2. **HttpOnly Cookie (`rapto_refresh`)**:
   - Long-lived Refresh Token (30 days).
   - Attributes: `HttpOnly=true; Secure=true; SameSite=None; Domain=.rapto.cloud; Path=/`.
3. **Internal Service Token (`X-Internal-Service-Key`)**:
   - Used for internal service-to-service communication between Node.js core API workers and the FastAPI AI Pipeline microservice.
   - Constant-time HMAC/timingSafeEqual evaluation.
4. **Webhook HMAC Signatures**:
   - **Recall.ai**: Svix headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`) or legacy `X-Recall-Signature: sha256=<hex>`.
   - **Paddle**: `Paddle-Signature: ts=<timestamp>;h1=<hmac>` validated via official Paddle SDK.
   - **Jira Cloud**: `X-Hub-Signature: sha256=<hex>` or per-team callback query secret `?teamId=<id>&secret=<token>`.
   - **Slack Interactive**: `X-Slack-Signature: v0=<hex>` with `X-Slack-Request-Timestamp` (< 300s replay window).

### 1.2 Multi-Tenant Isolation Pattern (`injectTenant`)
- All team-scoped routes pass through `injectTenant` middleware immediately following `requireAuth`.
- `req.teamId` is derived strictly from `req.user.teamId` in the cryptographically verified JWT.
- Requests without a team context receive `403 Forbidden` (`TENANT_REQUIRED`).

### 1.3 Role-Based Access Control (RBAC) Hierarchy
Roles follow a strict hierarchical level:
$$\text{OWNER (4)} > \text{ADMIN (3)} > \text{MANAGER (2)} > \text{MEMBER (1)}$$

| Role | Permissions & Responsibilities |
| :--- | :--- |
| **OWNER** | Full root tenant control, transfer workspace ownership, delete tenant workspace. |
| **ADMIN** | Billing management, team settings, invite/remove members (except OWNER), third-party integrations, delete meetings. |
| **MANAGER** | Team accountability stats, team performance metrics, view team members. |
| **MEMBER** | Personal dashboard, view team meetings, join bots, manage assigned commitments & action items. |

### 1.4 Standardized Response Envelopes

#### Success Envelope
```json
{
  "success": true,
  "data": { ... }
}
```

#### Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Human readable error description",
    "details": { ... }
  }
}
```

---

## 2. Global Rate Limiting Tiers

| Tier | Window | Limit | Target Routes / Conditions |
| :--- | :--- | :--- | :--- |
| **IP Global Rate Limit** | 60 seconds | 100 requests | All standard incoming API endpoints per IP |
| **Auth Strict Limit** | 15 minutes | 5 attempts | `/api/v1/auth/login`, `/register`, `/forgot-password`, `/reset-password` |
| **Calendar Sync Limit** | 120 seconds | 1 trigger | `/api/v1/integrations/*-calendar/sync-now` per user |
| **NGINX Edge Limit** | 1 second | 30 req/s (burst 50) | SSL Termination Layer (`api.conf`) |
| **NGINX Auth Limit** | 1 second | 5 req/s (burst 10) | NGINX Proxy to `/api/v1/auth/*` |

---

## 3. Core API — System & Health Probes

### 3.1 `GET /`
- **Description:** Root service identity and uptime ping.
- **Auth:** Public.
- **Rate Limit:** IP Global.
- **Headers:** None.
- **Query / Path Parameters:** None.
- **Response (200 OK):**
```json
{
  "status": "ok",
  "service": "rapto-api",
  "version": "1.0.0",
  "timestamp": "2026-09-08T11:00:00.000Z"
}
```

---

### 3.2 `GET /health`
- **Description:** Fast liveness probe for Docker container healthcheck and NGINX upstream health monitoring. Registered before any DB connections, body parsers, rate limiters, or logging middleware.
- **Auth:** Public.
- **Rate Limit:** None (bypasses all middleware).
- **Response (200 OK):**
```json
{
  "status": "ok",
  "service": "rapto-api",
  "timestamp": "2026-09-08T11:00:00.000Z"
}
```

---

### 3.3 `GET /ready`
- **Description:** Deep readiness probe evaluating connection state for PostgreSQL (via server state), Redis ping, MongoDB ping, and AI Pipeline connectivity.
- **Auth:** Public / Internal Orchestrator.
- **Response (200 OK / 503 Service Unavailable):**
```json
{
  "status": "ready",
  "checks": {
    "redis": true,
    "mongodb": true,
    "ai_pipeline": true
  },
  "timestamp": "2026-09-08T11:00:00.000Z"
}
```

---

### 3.4 `GET /admin/queues*` (BullBoard)
- **Description:** BullMQ Administrative Monitoring Dashboard (transcribe, extract, notify, integrate, deadline queues).
- **Auth:** Protected by Secret Token.
- **Headers:**
  - `Authorization: Bearer <BULL_BOARD_SECRET>`
- **Environment Availability:** Staging / Development only (disabled in production).

---

## 4. Core API — Authentication Module (`/api/v1/auth`)

Base path: `/api/v1/auth`

### 4.1 `POST /api/v1/auth/register`
- **Description:** Register a new user account with email and password.
- **Auth:** Public.
- **Rate Limit:** `loginRateLimiter` (5 attempts / 15 min).
- **Headers:** `Content-Type: application/json`
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `name` | string | Yes | Min 2, Max 100 characters, trimmed | Full name of the user |
| `email` | string | Yes | Valid email format, lowercase, trimmed | User email address |
| `password` | string | Yes | Min 8, Max 128 chars; 1 uppercase, 1 number, 1 special character | Strong password |
| `inviteToken`| string | Optional | Non-empty string | Pending invitation token to join team automatically |

- **Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "cuid_123",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "emailVerified": false
    },
    "message": "Verification email sent"
  }
}
```

---

### 4.2 `POST /api/v1/auth/login`
- **Description:** Authenticate using email and password, establishing an access token and HttpOnly refresh cookie.
- **Auth:** Public.
- **Rate Limit:** `loginRateLimiter`.
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `email` | string | Yes | Valid email, lowercase, trimmed | Account email |
| `password` | string | Yes | Min 1 char | Account password |

- **Response (200 OK):**
  - **Sets Cookie:** `rapto_refresh=<jwt>; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=2592000`
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "user": {
      "id": "cuid_123",
      "email": "jane@example.com",
      "name": "Jane Doe",
      "role": "OWNER",
      "teamId": "team_cuid_456",
      "avatarUrl": null,
      "onboardingCompleted": true
    }
  }
}
```

---

### 4.3 `POST /api/v1/auth/logout`
- **Description:** Revoke current session, blacklist refresh token, and clear refresh cookie.
- **Auth:** Public / Cookie present.
- **Headers / Cookies:** `Cookie: rapto_refresh=<jwt>`
- **Response (200 OK):**
  - **Clears Cookie:** `rapto_refresh=; Max-Age=0`
```json
{
  "success": true,
  "data": { "message": "Logged out successfully" }
}
```

---

### 4.4 `POST /api/v1/auth/refresh`
- **Description:** Rotate refresh token and issue a fresh access token.
- **Auth:** Public (Requires refresh token via cookie or request body).
- **Cookies / Body:** `Cookie: rapto_refresh=<jwt>` OR Body `{ "refreshToken": "..." }`
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi..."
  }
}
```

---

### 4.5 `GET /api/v1/auth/verify-email`
- **Description:** Verify user email address from the verification link sent upon signup.
- **Auth:** Public.
- **Query Parameters:**
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `token` | string | Yes | Single-use email verification token |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": { "message": "Email verified successfully" }
}
```

---

### 4.6 `POST /api/v1/auth/resend-verification`
- **Description:** Resend email verification email.
- **Auth:** Public.
- **Rate Limit:** `loginRateLimiter`.
- **Request Body:**
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `email` | string | Yes | Email address of the unverified account |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": { "message": "Verification email sent if account exists" }
}
```

---

### 4.7 `POST /api/v1/auth/forgot-password`
- **Description:** Initiate password reset workflow.
- **Auth:** Public.
- **Rate Limit:** `loginRateLimiter`.
- **Request Body:**
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `email` | string | Yes | Registered account email |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": { "message": "Password reset instructions sent" }
}
```

---

### 4.8 `POST /api/v1/auth/reset-password`
- **Description:** Complete password reset using token received via email.
- **Auth:** Public.
- **Rate Limit:** `loginRateLimiter`.
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `token` | string | Yes | Non-empty | Password reset token |
| `newPassword`| string | Yes | Min 8, Max 128 chars, 1 uppercase, 1 number, 1 special char | New strong password |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": { "message": "Password reset successfully" }
}
```

---

### 4.9 `GET /api/v1/auth/google`
- **Description:** Redirect client to Google OAuth 2.0 consent screen.
- **Alias:** Redirect from `/auth/google/callback` supported at root for legacy configurations.
- **Auth:** Public.
- **Query Parameters:**
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `inviteToken` | string | Optional | Preserves team invite link context across the OAuth roundtrip |

- **Response:** `302 Redirect` to `https://accounts.google.com/o/oauth2/v2/auth`.

---

### 4.10 `GET /api/v1/auth/google/callback`
- **Description:** Google OAuth 2.0 callback handler.
- **Auth:** Public (Code exchange).
- **Query Parameters:** `code` (string), `state` (string), `error` (optional string).
- **Response:** `302 Redirect` to frontend application with tokens/session cookie set.

---

### 4.11 `GET /api/v1/auth/google-calendar`
- **Description:** Initiate Google Calendar OAuth consent flow for current authenticated user.
- **Auth:** Bearer JWT required.
- **Query Parameters:** `context` (`onboarding` | `settings`, default: `settings`).
- **Response:** `302 Redirect` to Google OAuth consent page.

---

### 4.12 `GET /api/v1/auth/google-calendar/check-config`
- **Description:** Health/configuration check verifying server credentials exist for Google Calendar integration.
- **Auth:** Bearer JWT required.
- **Response (200 OK):**
```json
{
  "success": true,
  "data": { "configured": true }
}
```

---

### 4.13 `GET /api/v1/auth/google-calendar/callback`
- **Description:** Google Calendar OAuth callback handler.
- **Auth:** Public (OAuth code exchange verified via Redis state token).
- **Query Parameters:** `code` (string), `state` (string), `error` (optional string).
- **Response:** `302 Redirect` to settings/onboarding page.

---

### 4.14 `GET /api/v1/auth/me`
- **Description:** Retrieve currently authenticated user profile and team tenancy.
- **Auth:** Bearer JWT required.
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "cuid_123",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "OWNER",
      "teamId": "team_cuid_456",
      "timezone": "America/New_York",
      "avatarUrl": "https://img.rapto.cloud/avatars/123.png",
      "onboardingCompleted": true,
      "createdAt": "2026-08-01T00:00:00.000Z"
    }
  }
}
```

---

### 4.15 `PATCH /api/v1/auth/me`
- **Description:** Update current user profile fields.
- **Auth:** Bearer JWT required.
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `name` | string | Optional | Min 2, Max 100 chars, trimmed | Updated full name |
| `timezone` | string | Optional | Valid IANA timezone string | User default timezone |
| `avatarUrl` | string | Optional | Valid URL or empty string/null | Profile picture URL |
| `onboardingCompleted` | boolean | Optional | Boolean | Marks onboarding flow finished |

- **Response (200 OK):** Updated user object.

---

### 4.16 `POST /api/v1/auth/change-password`
- **Description:** Change user password while verifying current password.
- **Auth:** Bearer JWT required.
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `currentPassword` | string | Yes | Min 1 char | Existing account password |
| `newPassword` | string | Yes | Min 8, Max 128 chars, 1 uppercase, 1 number, 1 special char | New password |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": { "message": "Password updated successfully" }
}
```

---

### 4.17 `GET /api/v1/auth/sessions`
- **Description:** List active login sessions/devices for current user.
- **Auth:** Bearer JWT required.
- **Response (200 OK):** Array of session records with IP, User Agent, active state, and current session indicator.

---

### 4.18 `DELETE /api/v1/auth/sessions/:id`
- **Description:** Revoke a specific active session.
- **Auth:** Bearer JWT required.
- **Path Parameters:** `id` (string, Session ID).
- **Response (200 OK):** `{ "success": true, "data": { "revoked": true } }`

---

### 4.19 `GET /api/v1/auth/test-middleware`
- **Description:** Internal verification probe for `requireAuth`, `injectTenant`, and `requireRole('ADMIN')`.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** `{ "success": true, "teamId": "...", "role": "ADMIN" }`

---

## 5. Core API — Teams Module (`/api/v1/teams`)

Base path: `/api/v1/teams`

### 5.1 `GET /api/v1/teams/check-slug`
- **Description:** Check if a workspace slug URL is available during onboarding/creation.
- **Auth:** Public.
- **Rate Limit:** IP Global.
- **Query Parameters:**
| Parameter | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `slug` | string | Yes | Min 2, Max 50 chars, regex `^[a-z0-9][a-z0-9-]*[a-z0-9]$` | Proposed team slug |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": { "available": true, "slug": "acme-engineering" }
}
```

---

### 5.2 `POST /api/v1/teams/invite/:token`
- **Description:** Accept an invitation to join a team workspace.
- **Auth:** Bearer JWT required (User must be logged in; does not need prior team).
- **Path Parameters:** `token` (string, required, Invite token from invitation link).
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "team": {
      "id": "team_cuid_123",
      "name": "Acme Corp",
      "slug": "acme-corp"
    },
    "role": "MEMBER"
  }
}
```

---

### 5.3 `POST /api/v1/teams`
- **Description:** Create a new team workspace. Caller becomes `OWNER`.
- **Auth:** Bearer JWT required (User must NOT already belong to an active team).
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `name` | string | Yes | Min 2, Max 100 characters | Name of the team/company |
| `slug` | string | Optional | Min 2, Max 50 chars, lowercase alphanumeric + hyphens | Custom subdomain/slug |

- **Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "team": {
      "id": "team_cuid_123",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "createdAt": "2026-09-08T11:00:00.000Z"
    }
  }
}
```

---

### 5.4 `GET /api/v1/teams/me`
- **Description:** Get full team details, settings, seat usage, and members list.
- **Auth:** Bearer JWT, `injectTenant` (Any team role).
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "team_cuid_123",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "settings": {
      "defaultTimezone": "America/New_York",
      "weeklyDigestEnabled": true,
      "weeklyDigestDay": "MONDAY",
      "allowMembersToInvite": false,
      "customBotName": "Acme Notetaker",
      "autoSyncEnabled": true,
      "autoSyncProviders": ["JIRA", "LINEAR"]
    },
    "membersCount": 12,
    "plan": "BUSINESS"
  }
}
```

---

### 5.5 `GET /api/v1/teams/me/health`
- **Description:** Compute team commitment execution health score (0–100 scale).
- **Auth:** Bearer JWT, `injectTenant`.
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "healthScore": 87,
    "trend": "improving",
    "commitmentsFulfilledRate": 0.89,
    "overdueCount": 3
  }
}
```

---

### 5.6 `GET /api/v1/teams/me/members`
- **Description:** List members of the current team with pagination, search, and role filters.
- **Auth:** Bearer JWT, `injectTenant`.
- **Query Parameters:**
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | integer | Optional | Min 1, Default: `1` | Page number |
| `limit` | integer | Optional | Min 1, Max 100, Default: `20` | Items per page |
| `role` | string | Optional | `OWNER`, `ADMIN`, `MANAGER`, `MEMBER` | Filter by user role |
| `search` | string | Optional | Max 100 characters | Search by name or email |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "members": [
      {
        "id": "user_123",
        "name": "Alice Smith",
        "email": "alice@acme.com",
        "role": "ADMIN",
        "joinedAt": "2026-08-15T00:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

---

### 5.7 `PATCH /api/v1/teams/me`
- **Description:** Update team name and/or workspace configuration settings.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `name` | string | Optional | Min 2, Max 100 chars | New team display name |
| `settings` | object | Optional | Strict object | Workspace configuration |
| `settings.defaultTimezone` | string | Optional | Valid IANA timezone | Default team timezone |
| `settings.weeklyDigestEnabled` | boolean | Optional | Boolean | Toggle weekly summary email |
| `settings.weeklyDigestDay` | string | Optional | `MONDAY`, `FRIDAY`, `SUNDAY` | Digest dispatch day |
| `settings.allowMembersToInvite`| boolean | Optional | Boolean | Allow non-admins to invite |
| `settings.customBotName` | string | Optional | Max 50 chars | Name of recording bot |
| `settings.autoSyncEnabled` | boolean | Optional | Boolean | Auto sync action items |
| `settings.autoSyncProviders` | string[] | Optional | Max 3 (`JIRA`, `LINEAR`, `NOTION`) | Providers enabled for sync |

- **Response (200 OK):** Updated team details.

---

### 5.8 `POST /api/v1/teams/me/invite`
- **Description:** Invite new team members by email.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+ (or member if `allowMembersToInvite=true`).
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `emails` | string[] | Yes | Min 1, Max 20 unique valid email addresses | Recipient emails |
| `role` | string | Yes | `MEMBER`, `MANAGER`, `ADMIN` (cannot invite OWNER) | Assigned role |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "invitationsSent": 2,
    "invited": ["eng1@acme.com", "eng2@acme.com"]
  }
}
```

---

### 5.9 `PATCH /api/v1/teams/me/members/:userId/role`
- **Description:** Change a member's role.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+ (Caller cannot assign role $\ge$ own role level).
- **Path Parameters:** `userId` (string, required).
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `role` | string | Yes | `MEMBER`, `MANAGER`, `ADMIN` | New assigned role |

- **Response (200 OK):** Updated member record.

---

### 5.10 `DELETE /api/v1/teams/me/members/:userId`
- **Description:** Remove a member from the team.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+ (Cannot remove higher-level roles or OWNER).
- **Path Parameters:** `userId` (string, required).
- **Response (200 OK):** `{ "success": true, "data": { "removed": true } }`

---

## 6. Core API — Meetings Module (`/api/v1/meetings`)

Base path: `/api/v1/meetings`

### 6.1 `POST /api/v1/meetings/bot/add`
- **Description:** Dispatch an instant AI notetaker bot to join an active or imminent video conference.
- **Notice:** Route registered BEFORE parameterized `/:meetingId` to avoid wildcard collisions.
- **Auth:** Bearer JWT, `injectTenant`, `checkMeetingLimit` (Subscription quota check).
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `meetingUrl` | string | Yes | Valid URL, Max 2048 chars | Zoom, Meet, Teams, or Webex meeting URL |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "meetingId": "cuid_meeting_789",
    "botId": "recall_bot_uuid_abc",
    "status": "BOT_JOINING"
  }
}
```

---

### 6.2 `POST /api/v1/meetings`
- **Description:** Schedule a future meeting for recording and automated intelligence extraction.
- **Auth:** Bearer JWT, `injectTenant`, `checkMeetingLimit`.
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `title` | string | Yes | Min 1, Max 500 chars, trimmed | Meeting title |
| `platform` | string | Yes | `ZOOM`, `GOOGLE_MEET`, `TEAMS`, `WEBEX`, `MANUAL` | Meeting software platform |
| `meetingUrl`| string | Yes | Valid URL, Max 2048 chars | Platform join URL (validated by platform regex) |
| `scheduledAt`| string | Yes | ISO 8601 Datetime string | Scheduled start (must be in future) |
| `calendarEventId`| string | Optional | Max 500 chars | Linked external calendar event ID |

- **Response (201 Created):** Created meeting record with status `SCHEDULED`.

---

### 6.3 `GET /api/v1/meetings`
- **Description:** List meetings with cursor-based pagination and multifaceted filtering.
- **Auth:** Bearer JWT, `injectTenant`.
- **Query Parameters:**
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `status` | string / string[]| Optional | `SCHEDULED`, `BOT_JOINING`, `RECORDING`, `PROCESSING`, `DONE`, `FAILED`, `CANCELLED` | Comma-separated or multiple status filter |
| `platform` | string | Optional | `ZOOM`, `GOOGLE_MEET`, `TEAMS`, `WEBEX`, `MANUAL` | Filter by platform |
| `from` | string | Optional | ISO 8601 Datetime | Meetings scheduled after this timestamp |
| `to` | string | Optional | ISO 8601 Datetime | Meetings scheduled before this timestamp |
| `search` | string | Optional | Max 200 chars | Free-text search on title |
| `limit` | integer | Optional | Min 1, Max 100, Default: `20` | Number of meetings to return |
| `cursor` | string | Optional | String | Opaque pagination cursor |
| `sortBy` | string | Optional | `scheduledAt`, `createdAt`, `title`, Default: `scheduledAt` | Sort field |
| `sortOrder`| string | Optional | `asc`, `desc`, Default: `desc` | Sort direction |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "meetings": [ ... ],
    "nextCursor": "cursor_token_xyz",
    "hasMore": true
  }
}
```

---

### 6.4 `GET /api/v1/meetings/:meetingId`
- **Description:** Retrieve comprehensive meeting details with selective relational inclusions.
- **Auth:** Bearer JWT, `injectTenant`.
- **Path Parameters:** `meetingId` (string, required).
- **Query Parameters:**
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `include` | string | Optional | Comma-separated list of relations: `participants`, `commitments`, `actionItems`, `decisions`, `blockers`. Defaults to all. |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "cuid_meeting_789",
    "title": "Sprint Planning 42",
    "status": "DONE",
    "platform": "GOOGLE_MEET",
    "scheduledAt": "2026-09-08T10:00:00.000Z",
    "durationMinutes": 45,
    "summary": "Sprint objectives and release milestones aligned.",
    "participants": [ ... ],
    "commitments": [ ... ],
    "actionItems": [ ... ],
    "decisions": [ ... ],
    "blockers": [ ... ]
  }
}
```

---

### 6.5 `GET /api/v1/meetings/:meetingId/transcript`
- **Description:** Stream or retrieve cleaned & diarized conversation turns from MongoDB.
- **Auth:** Bearer JWT, `injectTenant`.
- **Path Parameters:** `meetingId` (string, required).
- **Query Parameters:**
| Parameter | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `search` | string | Optional | Max 200 chars | Text search within transcript turns |
| `speaker` | string | Optional | Valid email | Filter turns by speaker email |
| `fromTime` | number | Optional | $\ge 0$ | Start time offset in seconds |
| `toTime` | number | Optional | $\ge 0$, must be $> \text{fromTime}$ | End time offset in seconds |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "turns": [
      {
        "turnId": "turn_uuid_1",
        "speakerName": "Jane Doe",
        "speakerEmail": "jane@acme.com",
        "startTime": 12.4,
        "endTime": 18.2,
        "cleanedText": "We will ship the payments redesign next Tuesday.",
        "uncertain": false
      }
    ]
  }
}
```

---

### 6.6 `DELETE /api/v1/meetings/:meetingId/bot`
- **Description:** Remove bot from meeting or cancel scheduled bot arrival.
- **Auth:** Bearer JWT, `injectTenant`.
- **Path Parameters:** `meetingId` (string, required).
- **Response (200 OK):** `{ "success": true, "data": { "cancelled": true } }`

---

### 6.7 `DELETE /api/v1/meetings/:meetingId`
- **Description:** Permanently delete a meeting record and optionally its transcript stored in MongoDB.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Path Parameters:** `meetingId` (string, required).
- **Query Parameters:**
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `deleteTranscript` | boolean | Optional | `false` | When `true`, purges raw and cleaned transcripts from MongoDB |

- **Response (200 OK):** `{ "success": true, "data": { "deleted": true } }`

---

### 6.8 `POST /api/v1/meetings/:meetingId/reprocess`
- **Description:** Re-enqueue transcript processing through cleanup, extraction, and resolution pipelines.
- **Auth:** Bearer JWT, `injectTenant`.
- **Path Parameters:** `meetingId` (string, required).
- **Response (200 OK):** `{ "success": true, "message": "Meeting re-processing initiated" }`

---

### 6.9 `POST /api/v1/meetings/:meetingId/simulate-complete` (DEV Only)
- **Description:** Development & QA simulation endpoint to complete a meeting, synthesize transcripts, and trigger BullMQ queues without an active live video call.
- **Environment:** Enabled only when `NODE_ENV=development`.
- **Auth:** Bearer JWT, `injectTenant`.
- **Path Parameters:** `meetingId` (string, required).
- **Response (200 OK):** `{ "success": true, "message": "Simulation initiated" }`

---

## 7. Core API — Commitments Module (`/api/v1/commitments`)

Base path: `/api/v1/commitments`

### 7.1 `GET /api/v1/commitments`
- **Description:** List team-wide commitments with advanced multidimensional filters.
- **Auth:** Bearer JWT, `injectTenant`.
- **Query Parameters:**
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `status` | string / string[]| Optional | `PENDING`, `FULFILLED`, `DEFERRED`, `MISSED`, `CANCELLED` | Filter status |
| `ownerId` | string / string[]| Optional | User CUID(s) | Filter by commitment owner |
| `meetingId` | string | Optional | Valid CUID | Scoped to specific source meeting |
| `overdue` | boolean | Optional | `true`, `false`, `1`, `0` | Filter commitments past due date |
| `from` | string | Optional | ISO 8601 Datetime | Filter commitments due after |
| `to` | string | Optional | ISO 8601 Datetime | Filter commitments due before |
| `search` | string | Optional | Max 200 chars | Free-text search across commitment statement |
| `confidenceScore`| number | Optional | $0.0 - 1.0$ | Filter by minimum AI extraction confidence |
| `limit` | integer | Optional | Default: `20` | Pagination page size |
| `cursor` | string | Optional | String | Cursor token |
| `sortBy` | string | Optional | `dueDate`, `createdAt` | Order column |
| `sortOrder`| string | Optional | `asc`, `desc` | Order direction |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "commitments": [
      {
        "id": "commit_cuid_1",
        "text": "I will deliver the API documentation by Friday noon.",
        "status": "PENDING",
        "owner": { "id": "user_1", "name": "Jane Doe", "email": "jane@acme.com" },
        "dueDate": "2026-09-11T12:00:00.000Z",
        "confidenceScore": 0.94,
        "createdAt": "2026-09-08T10:30:00.000Z"
      }
    ],
    "nextCursor": null,
    "hasMore": false
  }
}
```

---

### 7.2 `GET /api/v1/commitments/my`
- **Description:** List commitments owned specifically by the requesting authenticated user.
- **Auth:** Bearer JWT, `injectTenant`.
- **Query Parameters:** Identical parameters and filters to `GET /api/v1/commitments` (implicitly sets `ownerId = req.user.id`).

---

### 7.3 `GET /api/v1/commitments/stats`
- **Description:** Retrieve aggregation metrics on fulfillment rates and commitment turnaround across team members.
- **Auth:** Bearer JWT, `injectTenant`, Role: `MANAGER`+.
- **Query Parameters:**
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `from` | string | Optional | Start ISO datetime window |
| `to` | string | Optional | End ISO datetime window |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "total": 54,
    "fulfilled": 46,
    "deferred": 5,
    "missed": 3,
    "fulfillmentRate": 0.852
  }
}
```

---

### 7.4 `GET /api/v1/commitments/:id`
- **Description:** Retrieve details of a single commitment.
- **Auth:** Bearer JWT, `injectTenant`.
- **Path Parameters:** `id` (string, required, Commitment CUID).
- **Response (200 OK):** Full commitment object with owner and source meeting details.

---

### 7.5 `PATCH /api/v1/commitments/:id/status`
- **Description:** Manually update the status of a commitment (fulfill, defer, or cancel).
- **Auth:** Bearer JWT, `injectTenant` (Owner or `MANAGER`+).
- **Path Parameters:** `id` (string, required).
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `status` | string | Yes | `FULFILLED`, `DEFERRED`, `CANCELLED` | Target status |
| `note` | string | Conditional | Max 1000 chars. **Required if `status === 'CANCELLED'`** | Reason for cancellation or notes |
| `newDueDate`| string | Conditional | ISO 8601 Datetime. **Required if `status === 'DEFERRED'`** | Rescheduled deadline |

- **Response (200 OK):** Updated commitment record.

---

## 8. Core API — Action Items Module (`/api/v1/action-items`)

Base path: `/api/v1/action-items`

### 8.1 `GET /api/v1/action-items`
- **Description:** List team action items with filtering across assignees, tickets, and completion states.
- **Auth:** Bearer JWT, `injectTenant`.
- **Query Parameters:**
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `assigneeId` | string | Optional | Valid CUID | Filter by assignee user ID |
| `completed` | boolean | Optional | `true`, `false` | Completion status filter |
| `priority` | string[] | Optional | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | Filter by priority levels |
| `meetingId` | string | Optional | Valid CUID | Source meeting filter |
| `hasJiraTicket` | boolean | Optional | `true`, `false` | Filter if synced to Jira issue |
| `hasLinearIssue`| boolean | Optional | `true`, `false` | Filter if synced to Linear issue |
| `from` | string | Optional | ISO 8601 Datetime | Created after date |
| `to` | string | Optional | ISO 8601 Datetime | Created before date |
| `search` | string | Optional | Min 2, Max 200 chars | Search action item description |
| `limit` | integer | Optional | Min 1, Max 100, Default: `20` | Page limit |
| `cursor` | string | Optional | String | Pagination cursor |
| `sortBy` | string | Optional | `createdAt`, `dueDate`, `priority` | Sort attribute |
| `sortOrder` | string | Optional | `asc`, `desc` | Direction |

- **Response (200 OK):** Paginated array of action item records.

---

### 8.2 `GET /api/v1/action-items/my`
- **Description:** List action items assigned to the currently authenticated user.
- **Auth:** Bearer JWT, `injectTenant`.
- **Query Parameters:** Identical parameters to `GET /api/v1/action-items`.

---

### 8.3 `GET /api/v1/action-items/:actionItemId`
- **Description:** Retrieve details of a specific action item.
- **Auth:** Bearer JWT, `injectTenant`.
- **Path Parameters:** `actionItemId` (string, required).
- **Response (200 OK):** Single action item record.

---

### 8.4 `PATCH /api/v1/action-items` (Bulk Update)
- **Description:** Atomically apply status, assignee, priority, or due date changes to multiple action items.
- **Auth:** Bearer JWT, `injectTenant`.
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `ids` | string[] | Yes | Min 1 CUID | Target action item IDs |
| `patch` | object | Yes | Object | Properties to patch |
| `patch.completed` | boolean | Optional | Boolean | Mark complete/incomplete |
| `patch.assigneeId`| string | Optional | Valid CUID or null | Assign or unassign |
| `patch.dueDate` | string | Optional | ISO 8601 Datetime or null | Set or clear deadline |
| `patch.priority` | string | Optional | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | Set priority |

- **Response (200 OK):** `{ "success": true, "data": { "updatedCount": 3 } }`

---

### 8.5 `PATCH /api/v1/action-items/:actionItemId`
- **Description:** Update an individual action item's status, assignee, text, or priority.
- **Auth:** Bearer JWT, `injectTenant`.
- **Path Parameters:** `actionItemId` (string, required).
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `completed` | boolean | Optional | Boolean | Toggle completed state |
| `assigneeId`| string | Optional | Valid CUID or null | Updated assignee |
| `dueDate` | string | Optional | ISO 8601 Datetime or null | Updated due date |
| `priority` | string | Optional | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | Updated priority |
| `text` | string | Optional | Min 1, Max 500 chars | Updated description |

- **Response (200 OK):** Updated action item object.

---

### 8.6 `POST /api/v1/action-items/:actionItemId/sync`
- **Description:** Synchronize an action item as an issue/ticket in an external task provider.
- **Auth:** Bearer JWT, `injectTenant`.
- **Path Parameters:** `actionItemId` (string, required).
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `provider` | string | Yes | `JIRA`, `LINEAR`, `NOTION` | Target project tracking platform |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "actionItemId": "ai_cuid_1",
    "externalId": "PROJ-1234",
    "externalUrl": "https://acme.atlassian.net/browse/PROJ-1234",
    "syncedAt": "2026-09-08T11:15:00.000Z"
  }
}
```

---

## 9. Core API — Integrations Module (`/api/v1/integrations`)

Base path: `/api/v1/integrations`

### 9.1 `GET /api/v1/integrations`
- **Description:** Returns all configured integrations across workspace-level toolings and personal calendars.
- **Auth:** Bearer JWT, `injectTenant`.
- **Response (200 OK):**
```json
{
  "teamIntegrations": [
    {
      "provider": "JIRA",
      "isActive": true,
      "metadata": { "projectKey": "ENG", "defaultIssueType": "Task" }
    },
    {
      "provider": "SLACK",
      "isActive": true,
      "metadata": { "defaultChannelName": "#engineering-sync" }
    }
  ],
  "userIntegrations": [
    {
      "provider": "GOOGLE_CALENDAR",
      "isActive": true,
      "syncEnabled": true,
      "lastSyncedAt": "2026-09-08T10:00:00.000Z",
      "calendarId": "user@acme.com"
    }
  ]
}
```

---

### 9.2 Calendar Integrations & Synchronization

#### `GET /api/v1/integrations/calendar/preview`
- **Description:** Preview upcoming meetings discovered from connected calendar before importing.
- **Auth:** Bearer JWT required.
- **Response (200 OK):** Array of detected calendar events with video conference join links.

#### `POST /api/v1/integrations/google-calendar/sync-now`
- **Description:** Force an immediate sync against Google Calendar API for current user.
- **Auth:** Bearer JWT required.
- **Rate Limit:** `calendarSyncNowRateLimiter` (1 request / 2 minutes).
- **Response (200 OK):** `{ "success": true, "data": { "syncedEventsCount": 4 } }`

#### `POST /api/v1/integrations/outlook-calendar/sync-now`
- **Description:** Force an immediate sync against Microsoft Graph / Outlook Calendar.
- **Auth:** Bearer JWT required.
- **Rate Limit:** `calendarSyncNowRateLimiter` (1 request / 2 minutes).
- **Response (200 OK):** Sync summary result.

#### `GET /api/v1/integrations/google-calendar/connect` & `/GOOGLE_CALENDAR/connect`
- **Description:** Start Google Calendar OAuth connection flow.
- **Auth:** Bearer JWT required.
- **Query Parameters:** `context` (`onboarding` | `settings`), `format` (`json` returns `{ authUrl }`, otherwise redirects).
- **Response:** `302 Redirect` or `200 OK { data: { authUrl } }`.

#### `GET /api/v1/integrations/google-calendar/callback` & `/GOOGLE_CALENDAR/callback`
- **Description:** Google Calendar OAuth callback receiver.
- **Auth:** Public (State verified against Redis key with 10-minute TTL).
- **Query Parameters:** `code` (string), `state` (string), `error` (optional).
- **Response:** `302 Redirect` to frontend.

#### `GET /api/v1/integrations/outlook-calendar/connect` & `/OUTLOOK_CALENDAR/connect`
- **Description:** Start Outlook Calendar OAuth connection flow.
- **Auth:** Bearer JWT required.

#### `GET /api/v1/integrations/outlook-calendar/callback` & `/OUTLOOK_CALENDAR/callback`
- **Description:** Outlook Calendar OAuth callback receiver.
- **Auth:** Public (State verified against Redis).

#### `POST /api/v1/integrations/calendar/:provider/test`
- **Description:** Test connectivity and access token validity for user calendar.
- **Auth:** Bearer JWT required.
- **Path Parameters:** `provider` (`GOOGLE_CALENDAR` | `OUTLOOK_CALENDAR`).
- **Response (200 OK):** `{ "success": true, "status": "CONNECTED" }`

#### `DELETE /api/v1/integrations/calendar/:provider`
- **Description:** Disconnect user calendar integration and revoke access tokens.
- **Auth:** Bearer JWT required.
- **Path Parameters:** `provider` (`GOOGLE_CALENDAR` | `OUTLOOK_CALENDAR`).
- **Response (200 OK):** `{ "success": true, "disconnected": true }`

#### `PATCH /api/v1/integrations/calendar/:provider/config`
- **Description:** Update settings (such as auto-join toggles) for user calendar.
- **Auth:** Bearer JWT required.
- **Path Parameters:** `provider` (`GOOGLE_CALENDAR` | `OUTLOOK_CALENDAR`).
- **Request Body:** `{ "config": { ... } }`

---

### 9.3 Jira Integration

#### `GET /api/v1/integrations/jira/connect`
- **Description:** Generate Atlassian OAuth 2.0 authorization URL for Jira Cloud.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** `{ "success": true, "data": { "authUrl": "https://auth.atlassian.com/..." } }`

#### `GET /api/v1/integrations/jira/callback`
- **Description:** Atlassian OAuth callback route.
- **Auth:** Public (OAuth state token validated against Redis with single-use consumption).
- **Query Parameters:**
| Parameter | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `code` | string | Conditional | Required if no error | Authorization code |
| `state` | string | Yes | Min 32 chars | Anti-CSRF / Tenant token |
| `error` | string | Optional | String | Error code if user denied |

- **Response:** `302 Redirect` to frontend integration settings.

#### `GET /api/v1/integrations/jira/projects`
- **Description:** Fetch list of accessible Jira projects for project mapping configuration.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** `{ "success": true, "data": { "projects": [{ "key": "ENG", "name": "Engineering" }] } }`

#### `PATCH /api/v1/integrations/jira/configure`
- **Description:** Configure default Jira destination project, issue type, and priority mapping.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `projectKey` | string | Yes | Min 2, Max 10 chars, regex `^[A-Z][A-Z0-9]+$` | Jira project key (e.g. `TECH`) |
| `defaultIssueType` | string | Yes | Min 1, Max 50 chars | Target issue type (e.g. `Task`, `Story`) |
| `defaultPriority` | string | Optional | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | Fallback ticket priority |

- **Response (200 OK):** Updated integration metadata.

#### `DELETE /api/v1/integrations/jira`
- **Description:** Disconnect Jira integration and delete OAuth credentials.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** `{ "success": true, "data": { "message": "Jira disconnected successfully" } }`

---

### 9.4 Slack Integration

#### `GET /api/v1/integrations/slack/connect`
- **Description:** Generate Slack OAuth install authorization URL.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** `{ "success": true, "data": { "authUrl": "https://slack.com/oauth/v2/authorize?..." } }`

#### `GET /api/v1/integrations/slack/callback`
- **Description:** Slack OAuth callback handler.
- **Auth:** Public (Redis state token).
- **Query Parameters:** `code` (string), `state` (string, min 32 chars), `error` (optional).
- **Response:** `302 Redirect`.

#### `GET /api/v1/integrations/slack/channels`
- **Description:** List public and bot-joined private channels in connected Slack workspace.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** `{ "success": true, "data": { "channels": [{ "id": "C0123456", "name": "general" }] } }`

#### `PATCH /api/v1/integrations/slack/configure`
- **Description:** Set default broadcast channel for meeting summaries and commitment notifications.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Request Body:**
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `defaultChannelId` | string | Yes | Slack Channel ID (e.g. `C0123456`) |
| `defaultChannelName` | string | Yes | Slack Channel Name (e.g. `#general`) |

- **Response (200 OK):** Updated Slack integration metadata.

#### `DELETE /api/v1/integrations/slack`
- **Description:** Disconnect Slack workspace and revoke OAuth bot tokens.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** `{ "success": true, "data": { "message": "Slack disconnected successfully" } }`

---

### 9.5 Linear Integration

#### `GET /api/v1/integrations/linear/connect`
- **Description:** Generate Linear OAuth 2.0 authorization URL.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** `{ "success": true, "data": { "authUrl": "https://linear.app/oauth/authorize?..." } }`

#### `GET /api/v1/integrations/linear/callback`
- **Description:** Linear OAuth callback handler.
- **Auth:** Public (Redis state token).
- **Query Parameters:** `code` (string), `state` (string, min 32 chars), `error` (optional).
- **Response:** `302 Redirect`.

#### `GET /api/v1/integrations/linear/teams`
- **Description:** List Linear teams and their corresponding workflow states.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** `{ "success": true, "data": { "teams": [{ "id": "...", "name": "Core", "states": [...] }] } }`

#### `PATCH /api/v1/integrations/linear/configure`
- **Description:** Set target Linear team and default workflow state for synced action items.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Request Body:**
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `linearTeamId` | string | Yes | Target Linear Team ID |
| `defaultStateId` | string | Yes | Default Workflow State ID (e.g. Todo) |

- **Response (200 OK):** Updated Linear integration metadata.

#### `DELETE /api/v1/integrations/linear`
- **Description:** Disconnect Linear integration.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** `{ "success": true, "data": { "message": "Linear disconnected successfully" } }`

---

### 9.6 Generic Provider Routes (`/:provider`)
*Applies to `JIRA`, `LINEAR`, `SLACK`, `NOTION`.*

- `GET /api/v1/integrations/:provider/connect` (Auth, Role: `ADMIN`+)
- `GET /api/v1/integrations/:provider/callback` (Public, Query: `code`, `state`, `error`)
- `DELETE /api/v1/integrations/:provider` (Auth, Role: `ADMIN`+)
- `POST /api/v1/integrations/:provider/test` (Auth, Role: `ADMIN`+)
- `PATCH /api/v1/integrations/:provider/config` (Auth, Role: `ADMIN`+, Body: `{ "config": { ... } }`)
- `GET /api/v1/integrations/:provider/options` (Auth, Role: `ADMIN`+)

---

## 10. Core API — Notifications Module (`/api/v1/notifications`)

Base path: `/api/v1/notifications`

### 10.1 `GET /api/v1/notifications/preferences`
- **Description:** Get current user notification channel preferences across Email, Slack, and In-App.
- **Notice:** User-scoped, not tenant-scoped (persists across workspace switches).
- **Auth:** Bearer JWT required.
- **Response (200 OK):**
```json
{
  "data": {
    "preferences": {
      "email": {
        "meetingSummary": true,
        "deadlineReminder": true,
        "commitmentMissed": true,
        "weeklyDigest": true,
        "paymentAlerts": true
      },
      "slack": {
        "meetingSummary": true,
        "deadlineReminder": true,
        "commitmentMissed": true,
        "dailyDigest": false,
        "personalDMs": true
      },
      "inApp": {
        "all": true
      }
    }
  }
}
```

---

### 10.2 `PATCH /api/v1/notifications/preferences`
- **Description:** Partially update notification preferences. Strict validation rejects unknown keys with `422 Unprocessable Entity`.
- **Auth:** Bearer JWT required.
- **Request Body:**
```json
{
  "email": {
    "meetingSummary": false,
    "weeklyDigest": true
  },
  "slack": {
    "personalDMs": true
  }
}
```
- **Response (200 OK):** Updated preferences object.

---

### 10.3 `GET /api/v1/notifications/in-app`
- **Description:** Retrieve cursor-paginated in-app notification feed for current user.
- **Auth:** Bearer JWT required.
- **Query Parameters:**
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `limit` | integer | Optional | `10` | Items to retrieve |
| `cursor` | string | Optional | None | Pagination cursor |

- **Response (200 OK):** Array of notification items (title, message, read state, action URL, createdAt).

---

### 10.4 `GET /api/v1/notifications/unread-count`
- **Description:** Retrieve total count of unread in-app notifications.
- **Auth:** Bearer JWT required.
- **Response (200 OK):** `{ "data": { "count": 4 } }`

---

### 10.5 `PATCH /api/v1/notifications/in-app/:id/read`
- **Description:** Mark a specific in-app notification as read.
- **Auth:** Bearer JWT required.
- **Path Parameters:** `id` (string, required).
- **Response (200 OK):** `{ "data": { "success": true } }`

---

### 10.6 `POST /api/v1/notifications/in-app/read-all`
- **Description:** Mark all in-app notifications as read for current user.
- **Auth:** Bearer JWT required.
- **Response (200 OK):** `{ "data": { "success": true } }`

---

### 10.7 `POST /api/v1/notifications/test`
- **Description:** Trigger an instant test notification to Email or Slack to test delivery pipelines.
- **Auth:** Bearer JWT required.
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `channel` | string | Optional | `email`, `slack` | Target channel (defaults to both if omitted) |

- **Response (200 OK):** `{ "success": true, "data": { "results": [{ "channel": "email", "success": true }] } }`

---

### 10.8 `POST /api/v1/notifications/email/owner-welcome`
- **Description:** Dispatch owner onboarding checklist welcome email.
- **Auth:** Bearer JWT required.
- **Request Body:**
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `to` | string | Yes | Owner email address |
| `ownerName` | string | Yes | Owner display name |
| `workspaceName` | string | Yes | Workspace name |
| `dashboardUrl` | string | Optional | Custom app link |
| `checklist` | array | Optional | Array of onboarding checklist steps |
| `userId` | string | Optional | User ID |

- **Response (200 OK):** `{ "success": true, "message": "Owner welcome email sent successfully" }`

---

### 10.9 `POST /api/v1/notifications/email/team-member-welcome`
- **Description:** Dispatch team member welcome email after joining via invitation.
- **Auth:** Bearer JWT required.
- **Request Body:**
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `to` | string | Yes | Member email |
| `memberName` | string | Yes | Member display name |
| `workspaceName` | string | Yes | Team workspace name |
| `inviterName` | string | Yes | Person who sent invite |
| `role` | string | Yes | Assigned member role |
| `dashboardUrl` | string | Optional | Direct link |
| `capabilities` | array | Optional | Feature highlights |
| `userId` | string | Optional | Target user ID |

- **Response (200 OK):** `{ "success": true, "message": "Team member welcome email sent successfully" }`

---

## 11. Core API — Analytics Module (`/api/v1/analytics`)

Base path: `/api/v1/analytics`

### 11.1 `GET /api/v1/analytics/overview`
- **Description:** Workspace high-level KPIs: total meetings recorded, commitments made, fulfillment rate, overdue counts.
- **Auth:** Bearer JWT, `injectTenant` (All roles receive identical team-level overview).
- **Query Parameters:**
| Parameter | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `from` | string | Optional | ISO 8601 Datetime with offset | Start date |
| `to` | string | Optional | ISO 8601 Datetime with offset ($\ge \text{from}$) | End date |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "meetingsCount": 24,
    "commitmentsCount": 58,
    "fulfilledCount": 51,
    "overdueCount": 2,
    "fulfillmentRate": 0.879,
    "averageTurnaroundDays": 3.4
  }
}
```

---

### 11.2 `GET /api/v1/analytics/members`
- **Description:** Member-level commitment accountability metrics. Non-managers only receive their own row; managers and admins receive the entire roster.
- **Auth:** Bearer JWT, `injectTenant`.
- **Query Parameters:** `from` (ISO datetime), `to` (ISO datetime).
- **Response (200 OK):** Array of member performance records (commitments made, fulfilled, missed, reliability score).

---

### 11.3 `GET /api/v1/analytics/trends`
- **Description:** Time-series trends data formatted for charting.
- **Auth:** Bearer JWT, `injectTenant`.
- **Query Parameters:**
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `metric` | string | Yes | `fulfillmentRate`, `meetingsCount` | Metric to aggregate |
| `granularity` | string | Optional | `week`, `month`, Default: `week` | Time bucket |
| `userId` | string | Optional | Valid UUID | Scope trend to specific member |
| `from` | string | Optional | ISO 8601 Datetime | Start date |
| `to` | string | Optional | ISO 8601 Datetime | End date |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "metric": "fulfillmentRate",
    "granularity": "week",
    "points": [
      { "date": "2026-08-01", "value": 0.82 },
      { "date": "2026-08-08", "value": 0.89 }
    ]
  }
}
```

---

### 11.4 `GET /api/v1/analytics/activity`
- **Description:** Real-time event log of recent meeting completions, commitments created, and status transitions.
- **Auth:** Bearer JWT, `injectTenant`.
- **Response (200 OK):** Array of timestamped activity events.

---

## 12. Core API — Billing Module (`/api/v1/billing`)

Base path: `/api/v1/billing`

### 12.1 `GET /api/v1/billing/plans`
- **Description:** Retrieve available subscription plans, tier feature matrix, and pricing quotas. Edge-cached for 1 hour (`Cache-Control: public, max-age=3600, stale-while-revalidate=300`).
- **Auth:** Bearer JWT required (Pre-onboarding accessible).
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": "STARTER",
        "name": "Starter",
        "monthlyPrice": 29,
        "annualPrice": 290,
        "meetingLimit": 30,
        "seats": 5
      },
      {
        "id": "GROWTH",
        "name": "Growth",
        "monthlyPrice": 79,
        "annualPrice": 790,
        "meetingLimit": 100,
        "seats": 15
      },
      {
        "id": "BUSINESS",
        "name": "Business",
        "monthlyPrice": 199,
        "annualPrice": 1990,
        "meetingLimit": 500,
        "seats": 50
      }
    ]
  }
}
```

---

### 12.2 `POST /api/v1/billing/checkout`
- **Description:** Initialize a Paddle billing checkout session for plan upgrade or purchase.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `planId` | string | Yes | `STARTER`, `GROWTH`, `BUSINESS` (Free and Enterprise excluded) | Target plan |
| `interval` | string | Yes | `month`, `year` | Billing frequency |

- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "transactionId": "txn_paddle_123",
    "checkoutUrl": "https://buy.paddle.com/checkout/..."
  }
}
```

---

### 12.3 `POST /api/v1/billing/portal`
- **Description:** Generate authenticated, time-limited Paddle Customer Self-Service Portal session URL.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** `{ "success": true, "data": { "portalUrl": "https://customer.paddle.com/portal/..." } }`

---

### 12.4 `GET /api/v1/billing/subscription`
- **Description:** Retrieve current workspace subscription status, renewal date, and plan details.
- **Auth:** Bearer JWT, `injectTenant` (All team members).
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "plan": "GROWTH",
    "status": "ACTIVE",
    "currentPeriodEnd": "2026-10-08T00:00:00.000Z",
    "cancelAtPeriodEnd": false,
    "seatsPurchased": 15,
    "paymentMethod": "visa_4242"
  }
}
```

---

### 12.5 `POST /api/v1/billing/cancel`
- **Description:** Schedule cancellation of active subscription at the conclusion of the current billing cycle.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** `{ "success": true, "data": { "status": "ACTIVE", "cancelAtPeriodEnd": true } }`

---

### 12.6 `POST /api/v1/billing/sync`
- **Description:** Force an immediate live reconciliation with the Paddle Subscription API.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** `{ "success": true, "data": { "synced": true } }`

---

### 12.7 `GET /api/v1/billing/invoices`
- **Description:** Retrieve paginated billing invoices with Paddle receipt links.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Query Parameters:**
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `limit` | integer | Optional | Min 1, Max 100, Default: `20` | Page limit |
| `cursor` | string | Optional | String | Pagination cursor |

- **Response (200 OK):** Array of invoice summaries (id, amount, currency, status, invoiceDate).

---

### 12.8 `GET /api/v1/billing/invoices/:id/pdf`
- **Description:** Retrieve invoice PDF download link.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Path Parameters:** `id` (string, required, Invoice ID).
- **Response (200 OK):** `{ "success": true, "data": { "pdfUrl": "https://invoices.paddle.com/..." } }`

---

### 12.9 `GET /api/v1/billing/usage`
- **Description:** Retrieve real-time meeting and seat quota utilization against plan caps.
- **Auth:** Bearer JWT, `injectTenant` (All members).
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "plan": "GROWTH",
    "meetingsUsed": 42,
    "meetingLimit": 100,
    "meetingsRemaining": 58,
    "seatsUsed": 11,
    "seatsLimit": 15
  }
}
```

---

### 12.10 `GET /api/v1/billing/webhook-status`
- **Description:** Diagnostic probe reporting Paddle webhook connectivity, last event receipt, and queue health.
- **Auth:** Bearer JWT, `injectTenant`, Role: `ADMIN`+.
- **Response (200 OK):** Diagnostics object with timestamps and latency records.

---

## 13. Core API — Inbound Webhooks Module

Base paths: Mounted concurrently at `/api/webhooks` AND `/api/v1/webhooks`  
*All webhook endpoints bypass standard IP rate limiting and enforce cryptographic HMAC signatures.*

### 13.1 `POST /api/webhooks/recall`
- **Description:** Receives real-time bot lifecycle events from Recall.ai (bot joining, recording started, recording finished, transcription ready).
- **Auth & Signature:**
  - Svix headers: `webhook-id`, `webhook-timestamp`, `webhook-signature` (checked against `RECALL_WEBHOOK_SECRET`), OR
  - Legacy header: `X-Recall-Signature: sha256=<hmac>` (constant-time evaluation).
- **Headers:** `Content-Type: application/json`
- **Payload Schema:**
```json
{
  "event": "bot.done",
  "data": {
    "bot": {
      "id": "b3e04a4e-1234-5678-9abc-def012345678"
    },
    "recording_id": "rec_987654"
  }
}
```
- **Lifecycle Events Handled:**
  - `bot.joining_call` $\rightarrow$ sets meeting status to `BOT_JOINING`
  - `bot.in_waiting_room` $\rightarrow$ logged
  - `bot.recording_started`, `bot.in_call_recording` $\rightarrow$ sets meeting status to `RECORDING`
  - `bot.done` $\rightarrow$ fetches transcript, uploads to MongoDB, sets status to `PROCESSING`, enqueues BullMQ `process-transcript` job
  - `bot.fatal`, `bot.failed` $\rightarrow$ sets status to `FAILED`
- **Response (200 OK):** `{ "received": true }`

---

### 13.2 `POST /api/webhooks/paddle`
- **Description:** Receives billing lifecycle events from Paddle Billing.
- **Auth & Signature:**
  - Validated via Paddle SDK with `Paddle-Signature` header and raw body.
- **Headers:** `Paddle-Signature: ts=1672531199;h1=5d6e...`
- **Events Handled:**
  - `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`
  - `transaction.completed`, `transaction.payment_failed`
- **Processing Guarantee:** Enqueued to BullMQ `billingWebhookQueue` with deterministic job ID (`paddle-evt:<eventId>`) for idempotency.
- **Response (200 OK):** `{ "received": true, "eventId": "evt_01h..." }`

---

### 13.3 `POST /api/webhooks/jira`
- **Description:** Inbound webhook from Jira Cloud alerting to issue status updates (e.g. marking synced Jira task done marks action item complete).
- **Auth & Signature:**
  - **Strategy A:** `X-Hub-Signature: sha256=<hmac>` using per-team decrypted webhook secret.
  - **Strategy B:** Query param verification `?teamId=<teamId>&secret=<perTeamSecret>`.
- **Query Parameters:** `teamId` (string, required, used to look up per-team signing secret).
- **Events Handled:** `jira:issue_updated`.
- **Response (200 OK):** `{ "received": true }`

---

### 13.4 `POST /api/webhooks/slack`
- **Description:** Slack interactive webhook receiver (Block Kit button clicks, e.g. "Mark Fulfilled" directly inside a Slack DM).
- **Auth & Signature:**
  - Header: `X-Slack-Signature: v0=<hmac>`
  - Header: `X-Slack-Request-Timestamp` ($\le 300\text{s}$ drift check)
  - Content-Type: `application/x-www-form-urlencoded`
- **Payload:** URL-encoded `payload={"type":"block_actions",...}`.
- **Response (200 OK):** Sent immediately within $< 3\text{s}$ before background execution.

---

## 14. Core API — Realtime WebSocket & Socket.io

WebSocket endpoint: `/socket.io/` (Transport: WebSocket preferred, HTTP long-polling fallback).  
Handshake Auth: `auth: { token: "<accessToken>" }` OR `Cookie: rapto_access=<jwt>`.

### 14.1 Rooms Topology
- `team:{teamId}` — Team-wide broadcasts (meeting created, integrations changed, plan upgraded).
- `meeting:{meetingId}` — Meeting detail live view (real-time diarized turns, live extraction cards).
- `user:{userId}` — Personal alerts (personal deadline notifications, direct commitment fulfillment).

### 14.2 Client $\rightarrow$ Server Events
| Event Name | Payload | Description |
| :--- | :--- | :--- |
| `join:team` | `{ "teamId": "..." }` | Joins room `team:{teamId}` |
| `leave:team` | `{ "teamId": "..." }` | Leaves room `team:{teamId}` |
| `join:meeting` | `{ "meetingId": "..." }` | Joins room `meeting:{meetingId}` |
| `leave:meeting` | `{ "meetingId": "..." }` | Leaves room `meeting:{meetingId}` |
| `presence:ping` | `{ "timestamp": 123456 }` | Keepalive and active user presence tracking |

### 14.3 Server $\rightarrow$ Client Events
| Event Name | Typical Payload | Description |
| :--- | :--- | :--- |
| `meeting:created` | `{ meeting: { id, title, scheduledAt } }` | New meeting scheduled |
| `meeting:bot_joining` | `{ meetingId }` | Bot is entering meeting waiting room |
| `meeting:recording` | `{ meetingId }` | Bot has started recording audio |
| `meeting:processing` | `{ meetingId }` | Call finished, pipeline commenced |
| `meeting:transcript_cleaned` | `{ meetingId, turnsCount }` | Transcript cleanup stage completed |
| `meeting:extracted` | `{ meetingId, commitmentsCount, actionItemsCount }`| Action items & commitments extracted |
| `meeting:resolved` | `{ meetingId, resolvedCount }` | Historical commitments resolved |
| `meeting:failed` | `{ meetingId, error }` | Processing pipeline error |
| `transcript:turn` | `{ meetingId, turn: { speaker, text, startTime } }`| Live transcription chunk |
| `commitment:created` | `{ commitment: { id, text, owner, dueDate } }` | New commitment recorded |
| `commitment:fulfilled` | `{ commitmentId, ownerId, resolvedAt }` | Commitment marked fulfilled |
| `commitment:missed` | `{ commitmentId, ownerId }` | Commitment passed deadline |
| `action_item:synced` | `{ actionItemId, provider, externalUrl }` | Action item synced to Jira/Linear |
| `action_item:completed`| `{ actionItemId, completed, source }` | Synced action item completed in Jira |
| `notification:created` | `{ notification: { id, title, message } }` | In-app notification received |
| `billing:plan_updated` | `{ plan, meetingLimit }` | Team plan changed |

---

## 15. Internal Microservice — AI Pipeline (FastAPI)

Base path: `http://ai-pipeline:8003` (Internal network only).  
Authentication: Header `X-Internal-Service-Key: <INTERNAL_SERVICE_SECRET>`.

### 15.1 `GET /health`
- **Description:** AI Pipeline container liveness probe.
- **Auth:** Public / Orchestrator.
- **Response (200 OK):** `{ "status": "ok" }`

---

### 15.2 `GET /ready`
- **Description:** AI Pipeline readiness probe. Verifies MongoDB, Redis, and OpenAI API connectivity.
- **Auth:** Requires `X-Internal-Service-Key`.
- **Response (200 OK / 503 Service Unavailable):**
```json
{
  "status": "ready",
  "checks": {
    "mongodb": true,
    "redis": true,
    "ai": true
  }
}
```

---

### 15.3 `POST /api/v1/transcripts/cleanup`
- **Description:** Stage 1 (Speaker diarization merge) & Stage 2 (Grammar normalization & filler word stripping) pipeline.
- **Auth:** Requires `X-Internal-Service-Key`.
- **Request Body (`CleanupRequest`):**
```json
{
  "meeting_id": "cuid_meeting_789",
  "team_id": "cuid_team_123",
  "raw_transcript": [
    {
      "speaker_tag": "speaker_0",
      "text": "Um, okay, so I will, uh, deliver the API docs by Friday.",
      "start_time": 0.0,
      "end_time": 4.5,
      "confidence": 0.98,
      "words": [
        { "text": "Um", "start_time": 0.0, "end_time": 0.4, "confidence": 0.9 }
      ]
    }
  ],
  "participants": {
    "speaker_0": {
      "user_id": "user_cuid_1",
      "name": "Jane Doe",
      "email": "jane@acme.com",
      "speaker_tag": "speaker_0"
    }
  }
}
```
- **Response (200 OK - `CleanupResult`):**
```json
{
  "meeting_id": "cuid_meeting_789",
  "team_id": "cuid_team_123",
  "cleaned_transcript": [
    {
      "turn_id": "turn_uuid_abc",
      "cleaned_text": "I will deliver the API docs by Friday.",
      "original_text": "Um, okay, so I will, uh, deliver the API docs by Friday.",
      "speaker_name": "Jane Doe",
      "speaker_user_id": "user_cuid_1",
      "start_time": 0.0,
      "end_time": 4.5,
      "filler_words_removed": 2,
      "was_modified": true,
      "was_modified_suspiciously": false,
      "uncertain": false
    }
  ],
  "metadata": {
    "model_version": "gpt-4.1-mini",
    "prompt_version": "v2.1",
    "total_fillers_removed": 2,
    "turns_before_merge": 1,
    "turns_after_merge": 1,
    "batches_total": 1,
    "batches_failed": 0,
    "processing_time_ms": 342.5,
    "ai_cost": {
      "prompt_tokens": 120,
      "completion_tokens": 35,
      "estimated_cost_usd": 0.000045
    }
  }
}
```

---

### 15.4 `POST /api/v1/extract`
- **Description:** Structured information extraction: Commitments, Action Items, Decisions, Blockers, Risks, and Executive Summary from cleaned transcript turns.
- **Auth:** Requires `X-Internal-Service-Key`.
- **Request Body (`ExtractRequest`):**
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `meeting_id` | string | Yes | Meeting CUID |
| `team_id` | string | Yes | Team CUID |
| `meeting_date` | string | Yes | ISO 8601 Datetime |
| `meeting_title` | string | Yes | Meeting title (max 500 chars) |
| `cleaned_transcript`| array | Yes | Array of `CleanedTranscriptTurn` objects |
| `participants` | array | Yes | Array of `ParticipantInfo` objects |
| `meeting_duration_seconds`| number | Yes | Total audio duration |
| `team_timezone` | string | Yes | IANA timezone (e.g. `America/New_York`) |

- **Response (200 OK / 206 Partial Content - `ExtractResponse`):**
  - **Headers on Partial (206):** `X-Extraction-Partial: true`
```json
{
  "success": true,
  "request_id": "req_uuid_999",
  "result": {
    "meeting_id": "cuid_meeting_789",
    "team_id": "cuid_team_123",
    "commitments": [
      {
        "text": "I will deliver the API documentation by Friday noon.",
        "owner_name": "Jane Doe",
        "owner_user_id": "user_cuid_1",
        "due_date_raw": "Friday noon",
        "due_date_utc": "2026-09-11T16:00:00Z",
        "confidence": 0.95,
        "normalized_text": "deliver the api documentation",
        "dedup_key": "dedup_hash_1"
      }
    ],
    "action_items": [
      {
        "text": "Provision new Redis cache replica",
        "assignee_name": "Bob Martin",
        "priority": "HIGH",
        "due_date_raw": null,
        "confidence": 0.91,
        "dedup_key": "dedup_hash_2"
      }
    ],
    "decisions": [
      {
        "text": "Adopt GPT-4.1 Mini as primary extraction model",
        "made_by": "Jane Doe",
        "decision_type": "TECHNICAL",
        "confidence": 0.98
      }
    ],
    "blockers": [],
    "risks": [],
    "summary": "Sprint planning meeting reviewed release criteria.",
    "summary_scope": "FULL",
    "extraction_model": "gpt-4.1-mini",
    "prompt_version": "v3.0",
    "chunks_total": 1,
    "chunks_succeeded": 1,
    "total_cost": {
      "prompt_tokens": 1200,
      "completion_tokens": 340,
      "estimated_cost_usd": 0.00045
    },
    "processing_time_ms": 1120.0
  }
}
```

---

### 15.5 `POST /api/v1/resolve`
- **Description:** Resolution Pipeline. Compares newly extracted commitments against historical open commitments for the team to detect if previous obligations have been resolved/fulfilled in the conversation.
- **Auth:** Requires `X-Internal-Service-Key`.
- **Request Body (`ResolveRequest`):**
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `meeting_id` | string | Yes | Current meeting ID |
| `team_id` | string | Yes | Team ID |
| `meeting_date` | string | Yes | Meeting start ISO datetime |
| `meeting_duration_seconds`| number | Optional | Duration |
| `new_commitments` | array | Yes | Newly extracted commitments from `/extract` |
| `historical_commitments` | array | Yes | Unresolved commitments from prior meetings (`PENDING` or `DEFERRED`) |
| `team_timezone` | string | Yes | IANA timezone |

- **Response Status Codes:**
  - `200 OK`: Full resolution success (`X-Resolve-Partial: false`).
  - `206 Partial Content`: Partial resolution success (`X-Resolve-Partial: true`, `X-Resolve-Failed-Ids: <ids>`).
  - `422 Unprocessable Entity`: Validation failure or total model failure.
  - `500 Internal Server Error`: Non-retryable invariant violation.
- **Response Body (`ResolveResponse`):**
```json
{
  "success": true,
  "partial": false,
  "request_id": "req_uuid_888",
  "result": {
    "meeting_id": "cuid_meeting_789",
    "team_id": "cuid_team_123",
    "resolved_updates": [
      {
        "historical_commitment_id": "commit_cuid_prev_456",
        "new_status": "FULFILLED",
        "evidence_quote": "I wrapped up the database migration yesterday.",
        "confidence": 0.94
      }
    ],
    "new_commitments_to_insert": [ ... ],
    "not_resolved_references": [ ... ],
    "total_cost": {
      "prompt_tokens": 850,
      "completion_tokens": 120,
      "estimated_cost_usd": 0.00021
    }
  }
}
```

---

## 16. Web Application BFF Routes (`web/src/app/api`)

Host: `https://app.rapto.cloud` (Next.js App Router API Routes).

### 16.1 `POST /api/waitlist`
- **Description:** Landing page public waitlist registration.
- **Auth:** Public.
- **Request Body:**
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `name` | string | Yes | Min 2 chars | Registrant name |
| `email` | string | Yes | Valid email format | Work email |
| `company` | string | Optional | String | Company name |
| `teamSize` | string | Yes | Min 1 char | Size range of team |
| `role` | string | Yes | Min 1 char | User role/job title |

- **Response (201 Created / 200 OK if existing):**
```json
{
  "message": "Successfully joined the waitlist!"
}
```

---

### 16.2 `POST /api/auth/refresh` & `POST /api/v1/auth/refresh`
- **Description:** Client-side Axios interceptor BFF proxy. Reads HttpOnly `rapto_refresh` cookie, proxies token rotation to Express backend, sets rotated cookies, and returns updated access token.
- **Auth:** Public (Requires `rapto_refresh` cookie).
- **Response (200 OK):**
```json
{
  "accessToken": "eyJhbGci...",
  "user": {
    "id": "cuid_123",
    "name": "Jane Doe",
    "email": "jane@acme.com"
  }
}
```

---

### 16.3 `GET /api/auth/refresh` & `GET /api/v1/auth/refresh`
- **Description:** Server Components (RSC) silent refresh and redirect route.
- **Auth:** Public (Requires `rapto_refresh` cookie).
- **Query Parameters:** `redirect` (string, target internal URL path, default: `/dashboard`).
- **Response:** `302 Redirect` to `redirect` parameter with rotated cookies.

---

## 17. Master Endpoint Summary Table

| Method | Endpoint | Module | Auth Scheme | Min Role | Rate Limit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | System | Public | None | IP Global |
| `GET` | `/health` | System | Public | None | None |
| `GET` | `/ready` | System | Public | None | None |
| `ALL` | `/admin/queues*` | BullBoard | Bearer Secret | None | Internal |
| `POST`| `/api/v1/auth/register` | Auth | Public | None | 5/15m |
| `POST`| `/api/v1/auth/login` | Auth | Public | None | 5/15m |
| `POST`| `/api/v1/auth/logout` | Auth | Cookie | None | IP Global |
| `POST`| `/api/v1/auth/refresh` | Auth | Cookie / Body | None | IP Global |
| `GET` | `/api/v1/auth/verify-email` | Auth | Public | None | IP Global |
| `POST`| `/api/v1/auth/resend-verification` | Auth | Public | None | 5/15m |
| `POST`| `/api/v1/auth/forgot-password` | Auth | Public | None | 5/15m |
| `POST`| `/api/v1/auth/reset-password` | Auth | Public | None | 5/15m |
| `GET` | `/api/v1/auth/google` | Auth | Public | None | IP Global |
| `GET` | `/api/v1/auth/google/callback` | Auth | Public | None | IP Global |
| `GET` | `/api/v1/auth/google-calendar` | Auth | Bearer JWT | None | IP Global |
| `GET` | `/api/v1/auth/google-calendar/check-config` | Auth | Bearer JWT | None | IP Global |
| `GET` | `/api/v1/auth/google-calendar/callback` | Auth | State Token | None | IP Global |
| `GET` | `/api/v1/auth/me` | Auth | Bearer JWT | None | IP Global |
| `PATCH`| `/api/v1/auth/me` | Auth | Bearer JWT | None | IP Global |
| `POST`| `/api/v1/auth/change-password` | Auth | Bearer JWT | None | IP Global |
| `GET` | `/api/v1/auth/sessions` | Auth | Bearer JWT | None | IP Global |
| `DELETE`| `/api/v1/auth/sessions/:id` | Auth | Bearer JWT | None | IP Global |
| `GET` | `/api/v1/auth/test-middleware` | Auth | Bearer JWT + Tenant | ADMIN | IP Global |
| `GET` | `/api/v1/teams/check-slug` | Teams | Public | None | IP Global |
| `POST`| `/api/v1/teams/invite/:token` | Teams | Bearer JWT | None | IP Global |
| `POST`| `/api/v1/teams` | Teams | Bearer JWT | None | IP Global |
| `GET` | `/api/v1/teams/me` | Teams | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/teams/me/health` | Teams | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/teams/me/members` | Teams | Bearer JWT + Tenant | MEMBER | IP Global |
| `PATCH`| `/api/v1/teams/me` | Teams | Bearer JWT + Tenant | ADMIN | IP Global |
| `POST`| `/api/v1/teams/me/invite` | Teams | Bearer JWT + Tenant | ADMIN | IP Global |
| `PATCH`| `/api/v1/teams/me/members/:userId/role` | Teams | Bearer JWT + Tenant | ADMIN | IP Global |
| `DELETE`| `/api/v1/teams/me/members/:userId` | Teams | Bearer JWT + Tenant | ADMIN | IP Global |
| `POST`| `/api/v1/meetings/bot/add` | Meetings | Bearer JWT + Tenant | MEMBER | Plan Quota |
| `POST`| `/api/v1/meetings` | Meetings | Bearer JWT + Tenant | MEMBER | Plan Quota |
| `GET` | `/api/v1/meetings` | Meetings | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/meetings/:meetingId` | Meetings | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/meetings/:meetingId/transcript` | Meetings | Bearer JWT + Tenant | MEMBER | IP Global |
| `DELETE`| `/api/v1/meetings/:meetingId/bot` | Meetings | Bearer JWT + Tenant | MEMBER | IP Global |
| `DELETE`| `/api/v1/meetings/:meetingId` | Meetings | Bearer JWT + Tenant | ADMIN | IP Global |
| `POST`| `/api/v1/meetings/:meetingId/reprocess` | Meetings | Bearer JWT + Tenant | MEMBER | IP Global |
| `POST`| `/api/v1/meetings/:meetingId/simulate-complete` | Meetings | Bearer JWT + Tenant | MEMBER | Dev Only |
| `GET` | `/api/v1/commitments` | Commitments | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/commitments/my` | Commitments | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/commitments/stats` | Commitments | Bearer JWT + Tenant | MANAGER | IP Global |
| `GET` | `/api/v1/commitments/:id` | Commitments | Bearer JWT + Tenant | MEMBER | IP Global |
| `PATCH`| `/api/v1/commitments/:id/status` | Commitments | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/action-items` | Action Items | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/action-items/my` | Action Items | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/action-items/:actionItemId` | Action Items | Bearer JWT + Tenant | MEMBER | IP Global |
| `PATCH`| `/api/v1/action-items` | Action Items | Bearer JWT + Tenant | MEMBER | IP Global |
| `PATCH`| `/api/v1/action-items/:actionItemId` | Action Items | Bearer JWT + Tenant | MEMBER | IP Global |
| `POST`| `/api/v1/action-items/:actionItemId/sync` | Action Items | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/integrations` | Integrations | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/integrations/calendar/preview` | Integrations | Bearer JWT | None | IP Global |
| `POST`| `/api/v1/integrations/google-calendar/sync-now` | Integrations | Bearer JWT | None | 1/2m |
| `POST`| `/api/v1/integrations/outlook-calendar/sync-now` | Integrations | Bearer JWT | None | 1/2m |
| `GET` | `/api/v1/integrations/google-calendar/connect` | Integrations | Bearer JWT | None | IP Global |
| `GET` | `/api/v1/integrations/google-calendar/callback` | Integrations | State Token | None | IP Global |
| `GET` | `/api/v1/integrations/outlook-calendar/connect` | Integrations | Bearer JWT | None | IP Global |
| `GET` | `/api/v1/integrations/outlook-calendar/callback` | Integrations | State Token | None | IP Global |
| `GET` | `/api/v1/integrations/jira/connect` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `GET` | `/api/v1/integrations/jira/callback` | Integrations | State Token | None | IP Global |
| `GET` | `/api/v1/integrations/jira/projects` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `PATCH`| `/api/v1/integrations/jira/configure` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `DELETE`| `/api/v1/integrations/jira` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `GET` | `/api/v1/integrations/slack/connect` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `GET` | `/api/v1/integrations/slack/callback` | Integrations | State Token | None | IP Global |
| `GET` | `/api/v1/integrations/slack/channels` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `PATCH`| `/api/v1/integrations/slack/configure` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `DELETE`| `/api/v1/integrations/slack` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `GET` | `/api/v1/integrations/linear/connect` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `GET` | `/api/v1/integrations/linear/callback` | Integrations | State Token | None | IP Global |
| `GET` | `/api/v1/integrations/linear/teams` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `PATCH`| `/api/v1/integrations/linear/configure` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `DELETE`| `/api/v1/integrations/linear` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `GET` | `/api/v1/integrations/:provider/connect` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `GET` | `/api/v1/integrations/:provider/callback` | Integrations | State Token | None | IP Global |
| `DELETE`| `/api/v1/integrations/:provider` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `POST`| `/api/v1/integrations/:provider/test` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `PATCH`| `/api/v1/integrations/:provider/config` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `GET` | `/api/v1/integrations/:provider/options` | Integrations | Bearer JWT + Tenant | ADMIN | IP Global |
| `POST`| `/api/v1/integrations/calendar/:provider/test` | Integrations | Bearer JWT | None | IP Global |
| `DELETE`| `/api/v1/integrations/calendar/:provider` | Integrations | Bearer JWT | None | IP Global |
| `PATCH`| `/api/v1/integrations/calendar/:provider/config` | Integrations | Bearer JWT | None | IP Global |
| `GET` | `/api/v1/notifications/preferences` | Notifications | Bearer JWT | None | IP Global |
| `PATCH`| `/api/v1/notifications/preferences` | Notifications | Bearer JWT | None | IP Global |
| `GET` | `/api/v1/notifications/in-app` | Notifications | Bearer JWT | None | IP Global |
| `GET` | `/api/v1/notifications/unread-count` | Notifications | Bearer JWT | None | IP Global |
| `PATCH`| `/api/v1/notifications/in-app/:id/read` | Notifications | Bearer JWT | None | IP Global |
| `POST`| `/api/v1/notifications/in-app/read-all` | Notifications | Bearer JWT | None | IP Global |
| `POST`| `/api/v1/notifications/test` | Notifications | Bearer JWT | None | IP Global |
| `POST`| `/api/v1/notifications/email/owner-welcome` | Notifications | Bearer JWT | None | IP Global |
| `POST`| `/api/v1/notifications/email/team-member-welcome` | Notifications | Bearer JWT | None | IP Global |
| `GET` | `/api/v1/analytics/overview` | Analytics | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/analytics/members` | Analytics | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/analytics/trends` | Analytics | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/analytics/activity` | Analytics | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/billing/plans` | Billing | Bearer JWT | None | CDN Cached |
| `POST`| `/api/v1/billing/checkout` | Billing | Bearer JWT + Tenant | ADMIN | IP Global |
| `POST`| `/api/v1/billing/portal` | Billing | Bearer JWT + Tenant | ADMIN | IP Global |
| `GET` | `/api/v1/billing/subscription` | Billing | Bearer JWT + Tenant | MEMBER | IP Global |
| `POST`| `/api/v1/billing/cancel` | Billing | Bearer JWT + Tenant | ADMIN | IP Global |
| `POST`| `/api/v1/billing/sync` | Billing | Bearer JWT + Tenant | ADMIN | IP Global |
| `GET` | `/api/v1/billing/invoices` | Billing | Bearer JWT + Tenant | ADMIN | IP Global |
| `GET` | `/api/v1/billing/invoices/:id/pdf` | Billing | Bearer JWT + Tenant | ADMIN | IP Global |
| `GET` | `/api/v1/billing/usage` | Billing | Bearer JWT + Tenant | MEMBER | IP Global |
| `GET` | `/api/v1/billing/webhook-status` | Billing | Bearer JWT + Tenant | ADMIN | IP Global |
| `POST`| `/api/webhooks/recall` | Webhooks | Svix / Recall HMAC | None | Webhook |
| `POST`| `/api/webhooks/paddle` | Webhooks | Paddle SDK HMAC | None | Webhook |
| `POST`| `/api/webhooks/jira` | Webhooks | Jira HMAC / Secret | None | Webhook |
| `POST`| `/api/webhooks/slack` | Webhooks | Slack v0 HMAC | None | Webhook |
| `WS`  | `/socket.io/` | Realtime | Token / Cookie | MEMBER | Persistent |
| `GET` | `/health` (AI Pipeline) | AI Pipeline | Public | None | Internal |
| `GET` | `/ready` (AI Pipeline) | AI Pipeline | Service Key | None | Internal |
| `POST`| `/api/v1/transcripts/cleanup` (AI) | AI Pipeline | Service Key | None | Internal |
| `POST`| `/api/v1/extract` (AI Pipeline) | AI Pipeline | Service Key | None | Internal |
| `POST`| `/api/v1/resolve` (AI Pipeline) | AI Pipeline | Service Key | None | Internal |
| `POST`| `/api/waitlist` | Web BFF | Public | None | IP Global |
| `POST`| `/api/auth/refresh` | Web BFF | Cookie Proxy | None | IP Global |
| `GET` | `/api/auth/refresh` | Web BFF | Cookie Proxy | None | IP Global |
