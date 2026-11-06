# Chat frontend — decisions, deviations, runbook (Day 59)

Plan: `DAY_59_Chat_Frontend_Integration_Plan.md`. Contract: `services/ai-pipeline/docs/chat/sse_protocol_v1.md`.

## 1. B0 findings (what the codebase actually is)
| Plan assumed | Reality | What was done |
|---|---|---|
| Jotai | Zustand + React Query (single `QueryProvider`) | Zustand stores; React Query for server data |
| Existing summary SSE + `parseSSE` to extract | None exists; no AI BFF at all | New `lib/sse/parseSSE.ts`, new `/api/ai/chat/*` routes |
| `app/api/ai/stream` with `kind` | n/a | `app/api/ai/chat/query` (cleaner; nothing to stay compatible with) |
| react-markdown/rehype | Not installed | Hand-written closed-AST renderer (`utils/renderAnswer.ts`): no HTML path at all, no new dependency |
| Vitest/MSW/Playwright | No test tooling | Added Vitest + Testing Library + jsdom (dev only). **No MSW**: BFF tests use a real local HTTP mock (`tests/bff/mockUpstream.ts`). **No Playwright** (not run here) |
| Docked panel | `/intelligence` was a stub page | Chat is the `/intelligence` page (full-bleed, sidebar + conversation) |
| Browser→BFF auth | Express HS256 access token (`rapto_access`, readable cookie, 15 min); web cannot verify it | BFF asks Express `GET /api/v1/auth/me` (cached 20 s per token hash, in-flight de-duplicated) for id/role/team/plan/timezone |
| Cmd/Ctrl+K free | Taken by the app `CommandMenu` | No competing chat switcher; sidebar search instead |
| Audio seek in transcript | Transcript viewer has no audio player | Deep link scrolls to and pulses the turn only |
| Day 58 §3.3 amendments | None in the backend | Coded to the real contract with fallbacks (below) |

## 2. Decisions
- **Plan mapping (needs billing sign-off):** the AI service gives `FREE`/`PRO` their own limits and *any other* value the business limits. Express has `STARTER`/`GROWTH`. `mapPlanForChat`: FREE→FREE, STARTER/GROWTH/PRO→PRO, BUSINESS→BUSINESS, ENTERPRISE→ENTERPRISE, unknown→FREE.
- **Upstream 401 ⇒ 503:** a 401 from the AI service means our service JWT was rejected (config drift), never a signed-out user.
- **Timezone (D-9):** the `tz` claim and all displayed times use the user's `timezone` (no team timezone exists in the schema).
- **D-1** compact numbered chips (native tooltip + Sources row); **D-2** no virtualization, "Load earlier messages" with scroll preservation; **D-6** streams survive in-app navigation (manager is module-level; aborted on Stop/logout/pagehide); **D-7** upgrade CTA only for ADMIN/OWNER; **D-5** "couldn't verify" note only when `grounded=false` and the answer is > 120 chars.
- `finalizing` is not a reducer state: the token buffer is flushed *before* `done` is reduced, so the reducer goes straight to a terminal phase.
- Quota is unknown until the first `usage` event or a 429 (no endpoint yet). Absolute "low" threshold = 10 until a `limit` arrives.
- Analytics deep links only map `status` and `ownerIds` (the commitments page's "overdue" is derived, not a status, and date-param semantics are unverified).

## 3. Server env (web)
| Var | Purpose |
|---|---|
| `INTERNAL_JWT_PRIVATE_KEY` | RSA ≥ 2048 PEM (`\n` escapes allowed). Missing ⇒ every chat route returns 503 |
| `INTERNAL_JWT_KID` | `kid` header; must exist in the AI service's `INTERNAL_JWT_PUBLIC_KEYS` |
| `AI_CHAT_URL` (fallback `AI_PIPELINE_URL`, default `http://ai-pipeline:8001`) | Fixed upstream base — never derived from a request |
| `INTERNAL_JWT_ISSUER` / `_AUDIENCE` / `_TTL_S` | Defaults `vocaply-bff` / `vocaply-ai-chat` / 45 (clamped 5–55; service max is 60) |
| `API_URL` | Express base for identity |

Rotation: add the new public key under a new `kid` on the AI service, deploy, switch `INTERNAL_JWT_KID` + private key here, then remove the old kid.

## 4. Not built (honest status)
- Premium Tier A beyond the basics: scope popover/`@` mentions, slash menu, quote-to-ask, activity timeline expansion, export, shortcuts dialog, first-run hints, connection banner (offline *is* handled by disabling Send with a reason). `FilterChips`: the plumbing (`filters`) exists, no UI sets it yet.
- Tier B (needs backend): result cards, follow-ups, regenerate/versions, source peek, auto-title, pin. Tier C (edit with branches): design only.
- Not run: Playwright E2E, axe, screen-reader scripts, cross-browser/device matrix, visual and performance suites, `next build`. Streaming through the real production proxy path (Safari buffering) is **unverified**.

## 5. Troubleshooting
- Stream arrives all at once ⇒ something buffers: check CDN/proxy compression for `/api/ai/chat/query` (`Cache-Control: no-transform` and `X-Accel-Buffering: no` are set; nginx needs `proxy_buffering off` for this location).
- Users see "Chat is temporarily unavailable" ⇒ `FEATURE_DISABLED` (AI service `CHAT_ENABLED`/team allow-list) or missing `INTERNAL_JWT_*` here; BFF logs `[chat-bff] …` without message content.
- Tests: `npm test` (all suites), `npm run typecheck`.
