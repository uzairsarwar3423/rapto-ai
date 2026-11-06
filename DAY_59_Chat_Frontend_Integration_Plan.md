# DAY 59: AI Intelligence Chat Frontend Integration (BFF, SSE Client, Citations, Sessions, Quota UX, Accessibility)
### Principal Engineering & Product Design Execution Plan · Vocaply Web

> **Scope:** plan only. There is no code in this document. Every file, contract, state machine, design decision, trade-off and test is specified so that implementation is mechanical.
> **Builds on:** Day 58 (chat backend; the **amended** SSE protocol v1, golden transcripts, error mapping, idempotency/replay semantics), Day 57 (citations and source metadata), Day 48 (timestamp re-attachment for transcript deep links).
> **Unblocks:** Day 60 (evaluation and hardening: feedback backlog, client-perceived latency, citation click-through data).
> **Revision 2 (premium layer):** adds a ChatGPT/Claude-class component catalog (§5.9–5.12), its files (§7.1), a third work sitting **59C** (§8), capability-gated backend amendments (§3.4) and tests (§13.12). Core scope (Revision 1) is unchanged and still gates the day.
> **Inspection rule:** this plan was written **without access to the existing web codebase**. Nothing about the current architecture, design system or tooling is assumed. **Block B0 verifies every item in §3.1 before any change is made**, and the decisions it produces are recorded in the PR.

---

## Table of Contents
1. [Objective & Definition of Done](#1-objective--definition-of-done)
2. [Principal Review: Corrections to the Original Spec](#2-principal-review-corrections-to-the-original-spec)
3. [Verify-First Items, Open Decisions & Cross-Day Amendments](#3-verify-first-items-open-decisions--cross-day-amendments)
4. [Architecture Overview](#4-architecture-overview)
5. [UX & Design Specification (includes the ChatGPT/Claude-class component catalog, §5.9–5.12)](#5-ux--design-specification)
6. [Architecture Decision Records (ADRs)](#6-architecture-decision-records-adrs)
7. [File Inventory](#7-file-inventory)
8. [Day 59 Execution Timeline (Block by Block)](#8-day-59-execution-timeline-block-by-block)
9. [Security Model](#9-security-model)
10. [Reliability & Failure Handling](#10-reliability--failure-handling)
11. [Telemetry & Observability](#11-telemetry--observability)
12. [Performance & Budgets](#12-performance--budgets)
13. [End-of-Day Test Plan](#13-end-of-day-test-plan)
14. [Release & Rollout Plan](#14-release--rollout-plan)
15. [Risk Register](#15-risk-register)
16. [Handoff to Day 60](#16-handoff-to-day-60)
17. [Explicitly Out of Scope](#17-explicitly-out-of-scope)

---

## 1. Objective & Definition of Done

### 1.1 Objective
Make the Day 58 backend feel like a premium product: a fast, calm, trustworthy chat in `features/intelligence/` that streams answers, shows what it is doing, lets users verify every claim with one click, handles every failure honestly, and is fully usable by keyboard, screen reader and on a phone. It reaches the backend only through the existing BFF, preserves existing functionality and conventions, and introduces no duplicated logic.

### 1.2 Deliverables
| # | Deliverable | Proof |
|---|---|---|
| D1 | BFF: authenticated, validated, zero-buffering stream proxy plus session, feedback, suggestions and quota routes | BFF test suite, abort propagation proven in both directions |
| D2 | SSE client and a pure chat-turn state machine, contract-tested against the Day 58 golden transcripts | Fuzzed chunk-boundary tests, transcript replay |
| D3 | Answer rendering: safe markdown, citation chips, sources, deep links to the exact transcript moment | XSS corpus, deep-link E2E |
| D4 | The full chat experience: sessions, status, stop, retry, quota, feedback, empty/error/offline states | Component and E2E suites, visual states |
| D5 | Accessibility, responsive and RTL support | Axe scan, manual screen-reader script, device matrix |
| D6 | **Premium experience layer** (ChatGPT/Claude-class): pro composer, activity timeline, message toolbar, pro sidebar, rich result cards, shortcuts, export | Tiered delivery (§5.9); component, E2E and accessibility suites (§13.12) |

### 1.3 Definition of Done (every item requires verification evidence, not assertion)
- [ ] **Contract:** every Day 58 golden SSE transcript, replayed through the parser, reducer and UI, ends in the expected final state, including when the byte stream is split at **every** possible boundary (including inside a multi-byte Urdu or emoji character).
- [ ] **P0:** the browser never supplies `team_id`; the BFF-minted JWT carries all claims the Day 58 verifier requires (assertion on the outgoing token).
- [ ] **P0:** model text can never inject markup, links, images or scripts into the page (XSS corpus), and citation chips are created **only** from source ids present in that message's `sources`.
- [ ] **P0:** browser Stop, tab close, navigation and BFF-client disconnect propagate to the upstream request (observable on a mock upstream and in staging with Day 58's cancel metrics).
- [ ] No cross-user or cross-team state survives logout or team switch (query cache, atoms, drafts, in-flight streams).
- [ ] Every outcome from the Day 58 protocol has a designed, tested UI state: `stop`, `no_results`, `cancelled`, `length`, `filtered`, replayed, each error code, each pre-stream HTTP status.
- [ ] Citations deep-link to the right meeting, timestamp and highlighted turn; unavailable sources degrade without crashing.
- [ ] Quota is correct from first load (not only after the first message) and handled at ≥ 80% used, 100% used and on a 429.
- [ ] **Accessibility:** zero serious/critical axe violations across all states; keyboard-only completion of every flow; screen-reader script passes on VoiceOver and NVDA; reduced-motion respected; touch targets ≥ 44 px.
- [ ] **Performance:** INP for panel interactions < 200 ms (lab, 4× CPU throttle, mid-tier mobile profile); no long task > 50 ms from token flushing; zero layout shift during streaming; panel code is lazy-loaded within budget.
- [ ] Verified on Chrome, Firefox, desktop Safari (WebKit), iOS Safari and Android Chrome **through the real BFF/proxy path**, including incremental streaming (no buffering).
- [ ] Existing features (including the summary stream whose parser is extracted) show **no regression**: characterization tests written before the extraction pass after it.
- [ ] **Premium layer (59C):** every Tier A component in §5.9 is built, accessible and tested; every Tier B component is **capability-gated** (renders only when the backend advertises it, verified in both states); Tier C is designed but not built.
- [ ] Premium components add no new raw-HTML path, no new storage of message text, and no regression against the core budgets in §12.

---

## 2. Principal Review: Corrections to the Original Spec

The Day 59 spec is a good product sketch: the right trust signals (sources before text), rAF batching, MSW streaming tests, a Safari check. It was written against the **original** Day 58 contract, which the Day 58 plan then amended, and it has **28 defects or gaps**. P0 = security/data integrity; P1 = correctness; P2 = UX/robustness; P3 = hygiene.

### 2.1 BFF and security
| # | Original | Problem | Sev. | Fix adopted |
|---|---|---|---|---|
| 1 | JWT carries `{sub, team_id, aud, jti}` | Day 58's verifier requires `team_id`, `user_id`, `role`, `plan`, `tz`, issuer, audience, `kid`, short expiry and a pinned asymmetric algorithm. The spec's token would be rejected, or the server would be forced to look up plan/timezone, which the plan forbids. | **P0** | Token claims aligned with Day 58 §B2. `internalToken.ts` is a **server-only** module (cannot be bundled to the client); the private key comes from the secret manager; the existing summary stream is verified not to break (see #3). |
| 2 | "Pass JSON error through with the same status" | Leaks internal error bodies (and an LB's HTML error page would be passed raw). | P1 | Upstream errors are **normalized** into one BFF envelope with a whitelist (`code`, `message`, `retryable`, `retry_after`, `resets_at`, `request_id`); non-JSON or network failures map to generic 502/503. `Retry-After` is forwarded. |
| 3 | `internalToken.ts` is "MODIFY"; Day 58's `internal_auth.py` is NEW | The existing summary route presumably authenticates with the current scheme. Changing token format breaks it unless the FastAPI side accepts both. | **P1** | B0 inspects the existing scheme. Two verification paths coexist during migration, or the summary route is migrated in the same change with its tests green. No silent breaking change. |
| 4 | Zod "same limits as FastAPI" | Duplicated limits drift. Day 58 also added a **token** cap the edge cannot compute. | P1 | Contract types and schemas come from one source (codegen from the backend schema, or hand-written schemas guarded by contract tests against Day 58's golden transcripts, B0 decides). The edge validates only cheap limits (code-point length, list sizes, UUID formats); the **server stays authoritative** and its 422 detail is surfaced. |
| 5 | Session path ids are interpolated into upstream URLs | A crafted id (`../`, encoded separators) can redirect the upstream call. | **P0** | All path and query params validated (UUID format, cursor shape) and encoded; the upstream base URL is a fixed server-side constant, never derived from the request. |
| 6 | Cookie-authenticated POST/PATCH/DELETE with no CSRF mention | State-changing routes behind a session cookie need CSRF protection. | **P0** | Origin/Fetch-Metadata check on every mutating route (reuse the existing guard if present), JSON content type required, same-site cookies verified. |
| 7 | `signal` tied to the request abort, upstream body piped through | Right idea, but there are **two** cancellation paths (request signal, and the response body stream being cancelled by the client) and frameworks have been inconsistent about both. | **P0** | Both are wired and **both tested** (mock upstream observes abort in each case), plus a staging check against Day 58's cancel metrics. A `request_id` is generated at the BFF, forwarded upstream, and echoed in a response header for support. |
| 8 | Headers: `no-cache, no-transform`, `X-Accel-Buffering` | Insufficient alone: that header only helps nginx; compression layers, CDNs and some mobile Safari paths still buffer. | P1 | Every hop is audited in B0 (framework compression, CDN, load balancer, platform limits). Dynamic-route and streaming-safe settings are explicit. Safari/WebKit streaming is tested on the real path. An initial padding comment from the server is kept as a fallback option (§3.3). |

### 2.2 State and protocol handling
| # | Original | Problem | Sev. | Fix adopted |
|---|---|---|---|---|
| 9 | `messagesAtomFamily` **and** React Query for messages, while the text says "don't mix" | Two sources of truth for the same data. | **P1** | Messages live **only** in the query cache (infinite query per session). The optimistic user message and the in-flight assistant message live in stream state and are written into the cache on completion, then reconciled with the server. |
| 10 | One global `streamingStateAtom`; `abortControllerAtom` | The backend allows two concurrent streams per user in different sessions. Switching sessions mid-stream would show the stream in the wrong session or lose it. A mutable `AbortController` inside an atom is also an anti-pattern. | **P1** | Stream state is **keyed by session**, and controllers live in an app-level **stream manager** outside component lifecycles. In-app navigation does not abort; Stop, logout and page unload do (decision D-6). |
| 11 | rAF-batched token appends | rAF pauses in background tabs, and a terminal event (`citations`, `done`) can be processed **before** the last buffered tokens flush, producing a truncated final message. | **P1** | Flush on visibility change, and **always flush the buffer before processing any non-token event**. Ordering is test-asserted. |
| 12 | Parser tests cover chunk boundaries | Not UTF-8 multi-byte boundaries. Urdu script and emoji split across network chunks corrupt text unless decoding is streaming-aware. | **P1** | Streaming decoder; fuzz tests split every transcript at every byte offset, including inside multi-byte characters. Also: field parsing rules (multi-line data, CRLF, BOM), maximum buffered event size, JSON/schema validation failures treated as protocol errors, version mismatch handling. |
| 13 | Reducer covers only `stop` and `no_results` | Day 58 adds `length`, `filtered`, `cancelled`, replayed responses, `status.detail`, analytics sources, and 409/429/503 pre-stream variants. | **P1** | A formal chat-turn state machine (§4.4) and a status-mapping table (§4.5) cover all of them. |
| 14 | "Retry with the same `client_message_id`" | Correct, but unspecified against Day 58's state machine (in-flight → 409; completed → free replay; failed/cancelled → new run). | P1 | Retry behavior per outcome is defined in §4.5. Replay is shown without a typing animation. 409 triggers wait-and-refresh rather than an error. One silent auto-retry only for pre-response network failure (idempotent). |
| 15 | No stalled-connection handling | A half-open connection looks like "still answering" forever. | P1 | Client watchdog: no bytes (including server pings) for 35 s → abort and show "Connection lost" with Retry. |
| 16 | Quota banner at "≤ 20% remaining" | The client has no limit value, and **no endpoint returns quota before the first query** (Day 58's `usage` event arrives only after a message). Business plans have a team-wide pool and a monthly ceiling with different wording. | **P1** | Day 58 amendment: a `quota` object `{scope, limit, remaining, resets_at}` in `usage`, in the 429 body, and a `GET` quota route (§3.3). The banner shows scope-specific copy. |

### 2.3 Rendering, citations and deep links
| # | Original | Problem | Sev. | Fix adopted |
|---|---|---|---|---|
| 17 | Deep link `?t={start_ms}&hl={chunk_id}` | The Day 58 `sources` event carries no `chunk_id` (nor turn ids). The **transcript viewer is not in the file list**, yet it must scroll, highlight and seek audio. | **P1** | Day 58 amendment: each source carries a `highlight` reference (turn ids plus start/end ms). The transcript viewer modification is an explicit block (B8), with audio-missing and timestamp-mismatch cases handled. |
| 18 | "Chips are buttons" and "disabled chip resolved on click with a 404 check" | Navigation is a link, not a button (semantics, middle-click, copy-link). "Disabled" and "resolved on click" contradict each other. | P2 | Chips are real **links** (SPA navigation on plain click, new tab on modifier-click). Unavailable sources are known up front from the history API (`unavailable`) and render as disabled; for live sources the destination page owns its own not-found state. |
| 19 | Chip label `{meeting_title} · {mm:ss}` inline | Long labels break reading flow, wrap awkwardly, and overflow on mobile when a paragraph carries several citations. `mm:ss` is also wrong for meetings over an hour. | P2 | **Design decision D-1:** compact numbered inline chip; the full label lives in the accessible name, the hover/focus/tap preview and the Sources row. Time format is `h:mm:ss` when needed. |
| 20 | rehype-sanitize allowlist | An allowlist alone does not stop links or images the model might emit. Day 58 strips them server-side, but the client must independently refuse them. | **P0** | Defense in depth: link and image elements are disallowed and unwrapped, no raw HTML plugin, no `dangerouslySetInnerHTML` (lint rule), chip tokenization performed on parsed text nodes (never by pre-processing the string, so code spans stay literal). Defensive acceptance of `[S1, S3]`-style markers even though the server normalizes them. |
| 21 | `grounded:false` → "may not be fully supported" note | Day 58's grounding check is a heuristic. A frequent false alarm trains users to ignore the signal or distrust good answers. | P2 | **Decision D-5:** shown only when `grounded = false` **and** the answer is substantive; neutral copy; behind a flag; interaction tracked so Day 60 can calibrate. |
| 22 | `ChatMessageList` "virtualized" | Chat lists are short, heights are dynamic and grow while streaming. JS virtualization breaks browser find-in-page, complicates screen-reader navigation and scroll anchoring. | P2 | **Decision D-2:** no JS virtualization. Paginated history (older pages on scroll-up with scroll-position preservation) plus CSS off-screen rendering optimization. Revisit past a measured threshold. |

### 2.4 UX, accessibility and internationalization
| # | Original | Problem | Sev. | Fix adopted |
|---|---|---|---|---|
| 23 | "Input disabled while streaming" | Blocks drafting the next question, and loses focus context. | P2 | The textarea stays editable; only **Send** is replaced by **Stop**. Drafts persist per session; a failed send keeps the text and marks the message "Not sent". |
| 24 | Enter sends, Shift+Enter newline; 2,000-character counter | Enter during **IME composition** sends half-typed text; on touch keyboards Enter should insert a newline. The JS string length counts UTF-16 units, not the server's characters (emoji count double; Unicode normalization changes length). The server may also reject Urdu text under 2,000 characters on a **token** cap. | P1 | Composition-aware key handling; touch-device behavior defined; counter uses normalized code points and a **contract-supplied limit**; a token-limit 422 produces a clear "shorten your message" state. |
| 25 | `role="log"` + `aria-live="polite"`, "announce on completion" | A live log region announces incremental content as it streams unless it is marked busy. | P1 | `aria-busy` during streaming; a **separate** status region announces only stage changes and "Answer ready, N sources"; the completed message is then readable normally. Verified with real screen readers. |
| 26 | No RTL, bidi or script handling | Urdu/Arabic questions and answers, mixed Roman-Urdu/English text, and numerals inside RTL paragraphs are expected users (flagged in Days 57/58). | **P1** | `dir="auto"` on input and message bodies, logical CSS properties, bidi isolation for chips and numbers, a font stack with good Urdu script support and suitable line height, an RTL visual/behavior test pass. |
| 27 | Session switching/logout/team switch not mentioned | Cached chat data and drafts from one user or team leaking to the next on a shared machine. | **P0** | Query keys include team and user; logout and team switch clear the cache, stores and drafts and abort streams. |
| 28 | E2E "follow-up resolves correctly (validates the rewriter)" and others run against staging with live models | Non-deterministic, slow and costly; flaky as a PR gate. Also, reload-after-Stop reads history racing the server's shielded persistence. | P1 | PR-gating E2E runs against a **deterministic backend fixture mode** (recorded provider responses); a small **live-model suite runs nightly**. Reload-after-Stop waits for persistence (poll with a timeout). |

Smaller items folded in: `Lighthouse/INP` is clarified as a lab interaction measurement; streaming markdown is rendered with memoized completed blocks; a one-click **Copy** action is added (P2); the `[id]` route mapping to the backend `…/messages` path is documented; the active scoping filters are always visible (hidden state causes "why no results?"); and **client-measured** time-to-first-token is reported for Day 60.

### 2.5 Gaps versus a ChatGPT/Claude-class experience (added in Revision 2)
A correct, accessible chat still feels basic without the interaction layer users now expect from leading assistants. The original spec had the core loop but not these:

| Gap | What users expect | Addressed by | Tier |
|---|---|---|---|
| Composer | Auto-growing input, @-references, quick commands, quote-to-ask | C1–C6 | A |
| Process transparency | See what the assistant did and read, without noise | C7, C8 | A |
| Per-message actions | Copy, regenerate with versions, feedback, edit | C13–C16 | A / B / C |
| History navigation | Grouped, searchable, rename/pin/export, smart titles | C18–C23 | A / B |
| Rich results | Numbers and lists as cards, not only prose | C10, C11 | B |
| Next-step guidance | Follow-up suggestions | C12 | B |
| First impression | Personalized empty state, capability tiles, light hints | C24, C25 | A |
| System feedback | Toasts, skeletons, offline state, designed errors | C26–C31 | A |
| Speed of use | Keyboard shortcuts, quick switcher | C21, C23 | A |

---

## 3. Verify-First Items, Open Decisions & Cross-Day Amendments

### 3.1 Block B0 verification checklist (nothing is assumed; each answer is recorded)
| Item | What to find | What depends on it |
|---|---|---|
| Framework/runtime | Next.js version, App Router, Node vs Edge for the existing summary stream | Route runtime choice, streaming behavior |
| Hosting and edge path | Platform, CDN/proxy/LB in front, function duration limits, compression settings | `maxDuration`, buffering risk, Safari behavior |
| Existing SSE/summary code | Where the current parser lives, its behavior and tests | Safe extraction of `parseSSE` |
| Auth/session library | How the BFF resolves user/team/role; multi-team support | Route guards, team-switch handling |
| Existing internal token scheme | Algorithm, claims, TTL, who verifies it today | JWT migration plan (#3) |
| Design system | Token names, primitives (Button, Popover, Sheet, Tooltip, Toast, Skeleton, Dialog, Tabs), dark mode, spacing/typography scale | Reuse; no new primitives unless missing |
| State/data libraries | Jotai and React Query versions and conventions (key factories, store setup) | State layout |
| Markdown pipeline | Is react-markdown/rehype already used? Versions? | Dependency additions, bundle budget |
| Test tooling | Vitest, RTL, MSW (streaming support), Playwright projects (incl. WebKit), Storybook/visual tooling, axe | Test layout |
| Layout of the chat panel | Docked panel vs page vs overlay; where `AIChatPanel` mounts; persistence across routes | Sources drawer and navigation design (D-3, D-4) |
| Transcript viewer | Route, support for `t`/highlight params, audio player API, cleaned-turn identifiers | B8 scope |
| Commitments route | Does `/commitments/{id}` exist? | Citation links |
| Billing/upgrade route and role model | Who may upgrade | Quota CTA |
| i18n | Library or conventions, RTL support in the shell | Copy deck, RTL |
| Analytics and error reporting | SDK, event naming, PII scrubbing | Telemetry |
| Feature-flag mechanism | How `CHAT_ENABLED` per-team reaches the client | Rollout |
| CSP and security headers | Current policy | Rendering safety, no inline-script needs |
| Monorepo layout | Can the web app read the backend's golden transcripts and schemas directly? | Contract source of truth |

### 3.2 Open decisions (named owner and date required in the PR)
- **D-1 (design):** compact numbered chips with rich preview (recommended) vs full-label inline chips.
- **D-2:** no JS virtualization (recommended) vs virtualized list.
- **D-3:** citation click behavior: same-tab navigation with the chat state preserved (recommended default), new tab on modifier-click; optionally a **source peek** (in-panel preview with "Open in meeting"), a later enhancement.
- **D-4:** drawer placement given the panel layout (side sheet on desktop, bottom sheet on mobile; B0 decides after seeing the dock).
- **D-5:** `grounded:false` presentation and threshold.
- **D-6:** streams continue across in-app navigation and session switches (recommended), with an activity indicator in the session list.
- **D-7:** upgrade CTA only for roles that can buy; "ask your admin" copy for others.
- **D-8:** feedback privacy disclosure wording (ties to Day 58 Q9).
- **D-9:** displayed dates in the **team** timezone (matches the answer text, recommended) or the user's.
- **D-10:** Safari buffering fallback (server padding) adopted only if tests on the real path show buffering.

### 3.3 Cross-day amendments requested from Day 58 (small, backward compatible)
| Amendment | Why |
|---|---|
| `usage` event carries `quota {scope, limit, remaining, resets_at}`; the 429 body carries the same plus `Retry-After`; **new `GET /chat/quota`** | Correct quota UX from first load; scope-specific copy |
| `sources[].highlight {turn_ids[], start_ms, end_ms}`; analytics sources carry a link descriptor (tool + params) | Exact-moment deep links; analytics deep links |
| History messages return `finish_reason`, status, sources with an `unavailable` flag | "Stopped", truncation notes and disabled chips on reload |
| History pagination contract: newest page first, items oldest→newest within a page, opaque `next_cursor` for older | Scroll-up pagination without ambiguity |
| 422 body includes `field`, `reason` (`char_limit`, `token_limit`, `filters`) and the limits | Precise inline validation; shared limits |
| 409 bodies include the active `request_id` | Wait-and-refresh behavior |
| Canonical marker form `[S#]` (single id per marker) documented in the protocol doc | Renderer simplicity |
| Optional: request header for protocol version; optional initial padding comment | Forward compatibility; Safari fallback (D-10) |

### 3.4 Premium-layer dependencies (added in Revision 2)
**Capability gating.** The frontend reads a `capabilities` object (delivered with quota in a single bootstrap call) and renders Tier B components only when the matching flag is true. This decouples frontend delivery from backend delivery: each feature ships independently. Unknown flags are ignored.

| Capability | Backend amendment (Day 58, backward compatible) | Used by |
|---|---|---|
| `regenerate` | The chat request accepts `regenerate_of` (an assistant message id); the server re-runs the same user message, stores the result as a **variant** of that message, counts one query, and is idempotent by `client_message_id` | C13, C14 |
| `follow_ups` | Optional `follow_ups` event (2–3 short questions) after `citations`, produced by the cheap tier or deterministically from sources; cost accounted; omitted on `no_results` | C12 |
| `structured_results` | Analytics and commitment sources carry a compact, validated `data` payload (rows, counts, definition, as-of) in addition to their text | C10, C11 |
| `source_window` | A source-context endpoint: the cited turn plus N neighbors, access-checked, redacted when unavailable | C9 |
| `session_pin`, `session_search` | A `pinned` field on session PATCH; a title-search parameter on the list. (Message-content search is a later, separately reviewed feature, because it needs chat text indexed.) | C18 |
| `title_generation` | Async smart title after the first answer (cheap tier), never overwriting a user rename | C19 |
| `mention_lookup` | Only if B0 finds no existing people/meeting lookup: a tenant- and access-scoped search endpoint | C2 |

**Tier C (design only today): edit-and-resend with branches.** Needs a tree-shaped message model (`parent_id`, sibling ordering, an active-leaf pointer per session), history that returns the active path plus sibling counts, regenerate and edit both creating siblings, retention/GDPR cascades over all branches, and quota rules for edits. The UI contract is reserved now: the message view-model carries an optional `siblings {index, count}`, so regenerate (Tier B) and edit (Tier C) share one version pager.

---

## 4. Architecture Overview

### 4.1 Layers and data flow
```
Browser (features/intelligence)
   │  UI components ── useChatStream ── stream manager (app-level, owns AbortControllers)
   │        ▲                 │
   │        │ render          ├─ chatClient (fetch + streaming reader, watchdog)
   │   query cache            ├─ parseSSE (streaming decode, schema-validated frames)
   │  (server data)           └─ chat-turn state machine (pure reducer)
   ▼
BFF (Next route handlers, same origin, cookie session)
   │  auth → role/team check → origin check → zod (cheap limits, UUIDs)
   │  mint short-lived service JWT (server-only) → fixed upstream URL
   │  stream: pipe upstream body untouched | non-stream: normalize errors
   ▼
FastAPI /chat/*  (Day 58)  →  retrieval, quota, grounding, Mongo, Postgres
```

### 4.2 State ownership (single source of truth per datum)
| Data | Owner | Notes |
|---|---|---|
| Session list, message history, quota, suggestions | React Query (keys include team + user) | Infinite queries with opaque cursors |
| In-flight turn (optimistic user message, status, partial text, sources, verdict) | Stream state **keyed by session** | Discarded or written to the cache on completion |
| Active session id | URL (`?session=`) mirrored to a small atom | Deep-linkable, survives refresh |
| Scoping filters | Per-session atom | Always visible as chips |
| Draft text | Per-session, session-scoped browser storage | Cleared on logout |
| AbortControllers, active reader | Stream manager (not atoms) | Cleaned up on terminal events and logout |

When a turn ends, the final assistant message is written into the query cache and the stream state is reset; the server copy is then fetched to reconcile (ids, persisted text identical by Day 58's guarantee).

### 4.3 Request/stream lifecycle (client view)
1. Generate `client_message_id`, add the optimistic user message, set stage `sending`.
2. POST through the BFF. A pre-stream HTTP error maps to the UI per §4.5 and **no assistant placeholder is left behind**.
3. On the first `meta`: bind `message_id`/`session_id` (a new session is added to the sidebar and the URL updates), mark replayed responses.
4. Events drive the state machine; text is buffered per frame; the buffer is flushed before any non-token event.
5. On terminal events: finalize, write to the cache, update quota, focus management, announcements.
6. Anything unexpected (watchdog, decode error, schema failure) → controlled error state with Retry; **never** a blank or stuck UI.

### 4.4 Chat-turn state machine
| State | Entered when | Exits on |
|---|---|---|
| `idle` | Initial / after a terminal state is acknowledged | user send |
| `sending` | Send pressed, request in flight, no response headers | headers OK → `streaming`; pre-stream error → `rejected` |
| `streaming` (stage: rewriting / searching / reading / answering) | `meta` received | `done`, `error`, user Stop, watchdog |
| `finalizing` | `done` received, flushing buffer and writing the cache | completes → `complete` |
| `complete` (finish reason: stop / no_results / length / filtered / replayed) | finalized | next send |
| `stopped` | user Stop or Day 58 `cancelled` | next send / Retry |
| `failed` (retryable or not) | `error` event, watchdog, decode failure, network drop | Retry (same id) / dismiss |
| `rejected` | pre-stream 4xx/503 (mapped per §4.5) | per mapping |

Rules: events for a non-current `message_id` or after a terminal state are ignored and logged; an invalid transition is a logged anomaly, not a crash.

### 4.5 Outcome mapping (every Day 58 outcome has a designed UI)
| Outcome | UI behavior |
|---|---|
| `done: stop` | Message complete; actions appear (copy, feedback) |
| `done: no_results` | Informational style (not an error); suggest rephrasing; if filters are active, offer **Clear filters and retry**; suggestions chips |
| `done: cancelled` / user Stop | Message marked "Stopped"; partial text kept; **Retry** available |
| `done: length` | Message shows "Answer was cut short" with an "Ask for the rest" follow-up chip |
| `done: filtered` / `CONTENT_FILTERED` | Friendly "can't answer that one" copy; no retry loop |
| `error: MODEL_UNAVAILABLE`, `TIMEOUT`, `INTERNAL` | Inline error with Retry when retryable; partial text (if any) preserved and labeled |
| 401 | Session expired: preserve the draft, redirect to sign-in, restore after |
| 403 | No access to chat (role/plan): explanatory state, no retry; hides entry points |
| 404 (session) | "Conversation not found": offer a new chat |
| 409 `DUPLICATE_IN_FLIGHT` | Wait, then refresh history (no error toast) |
| 409 `SESSION_BUSY` | Send disabled with "Still answering your previous question" |
| 422 | Inline validation (length, token limit, filters) near the input |
| 429 `RATE_LIMITED` | Cooldown with a countdown from `Retry-After` |
| 429 `TOO_MANY_STREAMS` | "Finish or stop another answer first" |
| 429 `QUOTA_EXCEEDED` | Quota banner state; input send disabled until `resets_at`; scope-specific copy |
| 503 `MODEL_UNAVAILABLE` / `FEATURE_DISABLED` | Calm unavailable state with a retry-later hint; feature-disabled hides the panel entry |
| Network drop | "Connection lost" + Retry; one silent auto-retry only if no response headers were ever received |
| Replayed (`meta.replayed`) | Answer appears immediately, no typing animation, no quota change |

---

## 5. UX & Design Specification

> Principles: **calm, legible, trustworthy.** Content first (like Notion and Linear): a narrow readable column, minimal chrome, restrained color, hierarchy through type weight and space instead of boxes. Every state (empty, loading, partial, error) is designed, not left as a default. Reuse the existing design system's tokens and primitives; add a new primitive only if B0 proves none exists.

### 5.1 Layout (desktop, docked panel; adapt to the B0 layout finding)
```
┌────────────────────────────────────────────────────────────┐
│ Ask Vocaply        [filters ▾]            [history] [new +]│  header (sticky, quiet)
├──────────────┬─────────────────────────────────────────────┤
│ Sessions     │                                             │
│ (collapsible)│   ┌ you ─────────────────────────────┐      │
│  Today       │   │ What did Ahmed commit to last wk │      │  user: subtle container
│  Yesterday   │   └──────────────────────────────────┘      │
│  Earlier     │                                             │
│              │   Ahmed committed to shipping billing        │  assistant: plain text,
│              │   by Friday (1) and reviewing the API (2).   │  no bubble, max ~70ch
│              │                                             │
│              │   ▸ Based on 3 sources                      │  trust row (collapsed)
│              │   [copy] [👍] [👎]                          │  actions: visible on focus/touch
│              │                                             │
│              │   ↓ New response                            │  pill if not at bottom
├──────────────┴─────────────────────────────────────────────┤
│ Scope: Oct 26–Nov 1 ✕ · Ahmed ✕       quota 12/20 left      │  filter chips + quota (quiet)
│ ┌────────────────────────────────────────────┐ [Send/Stop] │
│ │ Ask about your meetings…            0/2000 │             │  autosizing textarea
│ └────────────────────────────────────────────┘             │
└────────────────────────────────────────────────────────────┘
```
Mobile: full-screen sheet; the session list is a top-left slide-over; sources open as a **bottom sheet**; the input sits above the on-screen keyboard (dynamic viewport units, safe-area insets).

### 5.2 Hierarchy and visual language
- **One focal point at a time:** while waiting, the status line; while streaming, the text; when done, the answer plus the trust row.
- **Assistant text has no bubble** (reduces visual noise and width loss); user text sits in a subtle container aligned to the reading column.
- **Type:** the system's body size with generous line height; answer text uses the readable-width cap; the status line, timestamps and quota use the smallest text token at secondary contrast (still AA).
- **Color:** neutral surfaces; the accent color is reserved for the primary action and focus rings; error uses the system's danger token sparingly (inline, not full-width banners, except quota).
- **Spacing:** the system's spacing scale; messages separated by space, not dividers.

### 5.3 Component states inventory (each is built, previewed and tested)
| Component | States |
|---|---|
| Panel | closed, open, loading history, empty (new), error boundary fallback, feature-disabled, offline |
| Message (user) | accepted, sending, **not sent (retry)** |
| Message (assistant) | thinking (status only), streaming, complete, stopped, error (partial/no partial), no_results, truncated (`length`), filtered, replayed |
| Status line | rewriting, searching (with interpreted question/date range), reading N sources, answering (hidden after first token) |
| Citation chip | default, hover/focus (preview), pressed, group, disabled (unavailable), unknown id (stripped, never rendered) |
| Sources row | collapsed, expanded/drawer open, analytics-only |
| Input | empty, typing, near-limit, over-limit, token-limit error, sending, streaming (Send→Stop), disabled by quota, disabled by `SESSION_BUSY`, cooldown |
| Quota | hidden, low (≤ 20%), exhausted, scope = team |
| Session list | loading, empty, normal, renaming, delete-confirm, generating-indicator, error |
| Feedback | idle, selected up, selected down + reasons, submitted, failed (retry) |
| Suggestions | loading, 4–6 items, static fallback (few meetings) |

### 5.4 Interaction and motion specification
- Status text crossfades between stages (≈150 ms, ease-out). Before the first token, a calm **skeleton** of 2–3 lines reserves space so the layout never jumps.
- Send and Stop **swap in place** (same button position and size, icon crossfade ≈120 ms) so the pointer target never moves.
- Sources row expands with a short height transition; the drawer slides in (≈200 ms). **All motion is removed** under reduced-motion preferences (no shimmer, no slide, instant states).
- Streaming text appears without a caret animation; once the stream completes, the actions row fades in (≈120 ms) at a reserved height (no layout shift).
- "↓ New response" pill appears only when the user has scrolled up while new content arrives; clicking scrolls smoothly (instant under reduced motion).
- Hover affordances are **never the only path**: actions are reachable by keyboard focus and are always visible on touch devices.

### 5.5 Copy deck (centralized for review and future translation)
| Context | Copy (draft, for product review) |
|---|---|
| Status: rewriting | "Understanding your question…" |
| Status: searching | "Searching meetings…" + detail ("Oct 26 – Nov 1 · blockers Ahmed raised") |
| Status: reading | "Reading 6 sources…" |
| Sources row | "Based on 3 sources" |
| No results | "I couldn't find anything in your team's meetings about that. Try a different name, time range, or meeting." (+ suggestion chips) |
| Stopped | "Stopped" |
| Truncated | "Answer was cut short." / action: "Ask for the rest" |
| Filtered | "I can't help with that one. Try rephrasing." |
| Error (retryable) | "Something went wrong. Try again." |
| Connection lost | "Connection lost. Your question wasn't lost, try again." |
| Not sent | "Not sent. Retry" |
| Session busy | "Still answering your previous question." |
| Rate limited | "Slow down for a moment. You can ask again in {n}s." |
| Quota low | "{remaining} questions left today." |
| Quota exhausted | "You've used today's questions. Resets at {time}." + CTA per D-7 |
| Source unavailable | "Source no longer available" |
| Possibly unsupported (D-5) | "Couldn't verify this against your meetings." |
| Empty state few meetings | "Connect a meeting to start asking questions." |
| Feedback reasons | Wrong info · Missing info · Wrong source · Not helpful · Other |
| Feedback thanks | "Thanks for the feedback." |

### 5.6 Accessibility specification
- **Structure:** the message list is a log region with **busy state during streaming**; a separate polite status region announces stage changes and "Answer ready, N sources"; no per-token announcements.
- **Focus:** after send, focus stays in the input; on completion focus is **not** moved; drawers and dialogs trap focus and return it to their trigger; popovers never trap focus and close on Escape.
- **Names:** every chip has the full label as its accessible name ("Monday Standup, 9:14, source 2"); icon-only buttons have text names; state changes use pressed/expanded semantics.
- **Keyboard map:** Enter send (not during IME composition), Shift+Enter newline, Escape stops generation when the input is focused and no overlay is open, Escape closes overlays first, Tab order follows visual order, arrow keys navigate the session list, chips and links are reachable in reading order.
- **Targets:** ≥ 44 px touch targets; AA contrast in light and dark; visible focus rings from the design system; no information by color alone.
- **Motion:** reduced-motion honored everywhere (§5.4); no auto-playing animation beyond the skeleton.
- **Zoom/reflow:** usable at 200% zoom and 320 px width with no horizontal scrolling.

### 5.7 Internationalization and RTL
- `dir="auto"` on the textarea and every message body; logical CSS properties throughout; chips, numbers and timestamps are bidi-isolated so they do not reorder inside RTL paragraphs.
- Fonts: the existing stack plus an Urdu-script-capable fallback with an adjusted line height for taller script.
- Copy lives in one module (§7) wired to the existing i18n mechanism if B0 finds one; dates/times formatted by locale, in the team timezone (D-9).
- The input counter and limits use normalized code points and the contract-supplied limit (#24).

### 5.8 Responsive behavior
Breakpoints follow the design system. Panel: docked (wide), overlay (medium), full-screen sheet (narrow). Session list: persistent (wide), slide-over (narrow). Sources: side sheet (wide), bottom sheet (narrow). Keyboard-aware input positioning on mobile; no `100vh` pitfalls.

### 5.9 Premium component catalog (ChatGPT/Claude-class experience)
Leading assistants share a recognizable interaction layer: a composer that does more than hold text, visible process, rich per-message actions, navigable history, structured results, and keyboard-first operation. This catalog adds that layer to the core chat **without changing the core contracts**.

**Tiers.** **A** = frontend-only (uses the Day 58 contract and the app's own APIs) → built in sitting 59C. **B** = needs one of the small amendments in §3.4 → built behind a capability flag, hidden when absent. **C** = needs a backend data-model change → designed here, built later. Every component reuses the design system's tokens and primitives (verified in B0); none introduces a new visual language.

#### Composer
| ID | Component | Behavior | Tier | Notes |
|---|---|---|---|---|
| C1 | `ComposerShell` | One rounded container; auto-growing textarea (1 → 8 lines, then internal scroll); Send/Stop inside the container; quiet icon buttons for Scope, `@`, `/` | A | Replaces the plain input styling; behavior from §5.10 |
| C2 | `MentionPicker` | `@` opens a keyboard-navigable list of **People** and **Meetings**; selection adds a scope chip and inserts the plain name | A* | *Needs an existing people/meeting lookup (B0); otherwise Tier B `mention_lookup` |
| C3 | `ScopePopover` | Date presets and custom range, meetings, people, source types; active-count badge; "Clear all" | A | Maps 1:1 to the request `filters` |
| C4 | `SlashMenu` | `/` opens quick prompts (Summarize last week, Show overdue commitments, Find decisions about…) | A | Static reviewed registry; inserted text is exactly what is sent |
| C5 | `QuoteToAsk` | Select text in an answer → "Ask about this" adds a quote chip above the composer | A | Keyboard and screen-reader path required |
| C6 | `ComposerHints` | Rotating example placeholders, Enter/Shift+Enter hint on focus (desktop only), counter only past 80% | A | Reduced motion: no rotation |

#### Process transparency and sources
| ID | Component | Behavior | Tier | Notes |
|---|---|---|---|---|
| C7 | `ActivityTimeline` | Live status line while working; afterwards collapses to "Searched 3 meetings · 2.8 s", expandable to steps | A | Pipeline facts only (ADR-11) |
| C8 | `SourceCards` | Meeting/commitment/analytics cards grouped by meeting, with cited snippets and "Open at 12:03" links | A | Upgrades the drawer content |
| C9 | `SourcePeek` | In-panel preview of the cited transcript window with the cited turn highlighted; chat stays visible | B (`source_window`) | The D-3 enhancement |

#### Rich results and guidance
| ID | Component | Behavior | Tier | Notes |
|---|---|---|---|---|
| C10 | `AnalyticsResultCard` | Big number, label, definition popover, as-of, "Open list" | B (`structured_results`) | Rendered from validated data; prose remains cited |
| C11 | `CommitmentCards` | Up to 5 rows: owner avatar, text, due-date chip, status badge, link; "Show all N" | B (`structured_results`) | Same source object as the prose |
| C12 | `FollowUpChips` | Up to 3 next-question chips under the last answer | B (`follow_ups`) | Click sends as a new message |

#### Message layer
| ID | Component | Behavior | Tier | Notes |
|---|---|---|---|---|
| C13 | `MessageToolbar` | Copy (plain / Markdown with source footnotes), feedback, More menu (Quote, Report issue); Regenerate when available | A (Regenerate: B) | Always reachable by keyboard and on touch |
| C14 | `RegenerateVersions` | Regenerate the last answer; "‹ 2 / 3 ›" version pager; tooltip "Uses 1 question" | B (`regenerate`) | Shares the pager with C15 |
| C15 | `EditMessage` | Inline edit of a user message with branch pager | **C** | Designed in §5.12, not built today |
| C16 | `MessageMeta` | Timestamp on hover/focus (absolute, team timezone); neutral "Stopped"/"Cut short" badges | A | |
| C17 | `DateSeparators` | "Today", "Yesterday", "Mon, Nov 2" labels; sticky in long histories | A | |

#### History and navigation
| ID | Component | Behavior | Tier | Notes |
|---|---|---|---|---|
| C18 | `SessionSidebar` (pro) | Date groups, title search, item menu (rename, export, delete), generating indicator, collapse/resize | A (Pinned, server search: B) | Extends `ChatSessionList` |
| C19 | `AutoTitle` | Immediate truncated title, then a smart title fades in; a user rename always wins | B (`title_generation`) | |
| C20 | `ChatHeader` | Inline-rename title, scope pill, overflow menu (Export, Clear scope, Delete, Shortcuts) | A | |
| C21 | `QuickSwitcher` | Cmd/Ctrl+K: search and open chats, New chat; registers into the app's command palette if one exists | A | Combobox pattern |
| C22 | `ExportDialog` | Export the conversation as Markdown (citations as footnotes) or print-friendly PDF | A | Client-side, from the cache |
| C23 | `ShortcutsDialog` | Lists every shortcut; opened by `?` | A | |

#### First impression and system states
| ID | Component | Behavior | Tier | Notes |
|---|---|---|---|---|
| C24 | `ChatEmptyState` (pro) | Greeting, four capability tiles, data-aware suggestion cards, recent chats | A | Backend suggestions already exist |
| C25 | `FirstRunHints` | Up to three dismissible hints (Scope, @, citations), once per user | A | Local flag only; no content stored |
| C26 | Toast catalog | Copied, Exported, Feedback sent, Deleted, Rename failed (Retry) | A | Design-system toasts |
| C27 | `ConnectionStatus` | Non-modal offline banner; Send disabled with a reason; recovers automatically | A | |
| C28 | Skeleton set | History, sidebar, source cards, peek | A | Static under reduced motion |
| C29 | `ErrorCard` | Icon, plain sentence, primary action, "Copy details" (request id) | A | One component for every error code |
| C30 | `StreamingPolish` | Subtle fade-in per flush, calm scroll-follow, reserved toolbar height | A | No caret animation |
| C31 | `PersonAvatar` and badges | Initials avatars (token-based colors, AA contrast); overdue/soon/done/open badges | A | Never color alone |

### 5.10 Composer specification
- **Shell.** The textarea grows with content up to 8 lines, then scrolls inside. Send and Stop occupy the same position (§5.4). Scope, `@` and `/` are quiet icon buttons with visible labels in tooltips. Mobile uses safe-area insets and the visual viewport.
- **Paste.** Plain text only. Over-limit paste shows inline guidance; nothing is silently truncated. A large paste reveals the counter immediately.
- **`@` mentions (ADR-10).** At a word boundary, `@` opens a combobox with two labeled groups, **People** and **Meetings** (recent first, then matches). Arrow keys move, Enter or Tab selects, Escape closes, typing filters. Selecting a person inserts their display name as plain text and adds a person scope chip; selecting a meeting does the same with its title. **The chips above the input are the single source of truth for `filters`.** Removing a chip removes the filter and never edits the user's words. At most 5 chips of each kind. Lookups come from existing app APIs through the BFF (tenant- and access-scoped), debounced 150 ms and cached per query, with escaped text and designed loading/empty/error states. On mobile the list docks above the keyboard.
- **Scope popover.** Presets: Today, Yesterday, Last 7 days, Last 30 days, This month, Custom range (accessible calendar, team timezone, `from ≤ to`, maximum span from the contract). Meetings and People are searchable multi-selects; Source types are Transcripts, Commitments and Summaries. Active count badge; "Clear all". A summary pill shows the active scope ("Oct 26 – Nov 1 · 2 people"). Scope is stored **per session**; changing it never rewrites past messages.
- **Slash menu.** `/` at the start of an empty composer or after a space lists quick prompts. Templates live in a static, reviewable module. Choosing one inserts text with the cursor on the placeholder; nothing is hidden from the user and nothing is sent without Enter.
- **Quote-to-ask.** Selecting at least 3 words inside an assistant message shows a small floating toolbar with "Ask about this" and "Copy". "Ask about this" adds a **quote chip** (≤ 300 characters, cut at a word boundary) and focuses the composer. On send, the message contains the quote as a clearly marked reference followed by the question, as plain text that counts toward limits and the counter. Keyboard path: a "Quote this message" item in the message menu plus a shortcut; screen-reader path is equivalent.
- **Hints and counters.** Rotating placeholders from a static list (none under reduced motion); the Enter/Shift+Enter hint appears on focus on desktop only; the counter appears past 80% of the limit.
- **Send states.** Each disabled state (empty, over limit, cooldown, quota, session busy, offline) exposes its reason as accessible text.
- **IME, drafts and touch behavior** follow §5.6 and B7.

### 5.11 Activity timeline, source cards and source peek
- **`ActivityTimeline`.** While working: one live line (the status), a small indicator (static under reduced motion), and a collapsed "Show steps" toggle. After completion it collapses to a single line such as "Searched 3 meetings · 2.8 s" that expands into: (1) Understood your question, with the interpreted text; (2) Applied scope, listing date range, people and meetings, or "No scope"; (3) Read N sources, shown as meeting chips; (4) Wrote the answer, with its duration. Timings are **client-measured** from event arrival. It shows pipeline facts only: **never** model reasoning, prompts, scores, costs or internal ids (ADR-11). Replayed responses show only the collapsed summary.
- **`SourceCards`.** A meeting card shows the title, date in the team timezone, a participant avatar stack with +N, up to two cited snippets with the cited phrase emphasized, "Open at 12:03" links, and "Show N more passages". A commitment card shows the owner avatar, text, due-date chip, status badge and link. An analytics group shows the definition, the as-of time and a link. Cards are grouped by meeting in order of first citation. Keyboard: arrows move between cards, Enter opens, Escape closes.
- **`SourcePeek` (Tier B).** A secondary "Peek" action on a chip or card opens a side sheet (bottom sheet on mobile) with the cited transcript window (about ±5 turns), speakers with avatars and timestamps, the cited turn highlighted, and a primary "Open in meeting at 12:03". The chat stays visible behind it on wide screens. It loads with a skeleton, traps focus, renders plain text only, and shows "Source no longer available" when redacted.

### 5.12 Rich results, message actions, history and shortcuts
- **Result cards (Tier B).** Rendered from the validated `data` payload and placed after the prose. `AnalyticsResultCard`: value, label, optional delta, a definition popover, the as-of time and "Open list". `CommitmentCards`: up to 5 rows (owner avatar and name, text clamped to two lines, due-date chip with overdue / soon / later tones, status badge, link) plus "Show all N". All text is plain. If the capability is absent or the data fails validation, **only the prose renders**. Consistency rule: cards and prose come from the same source object, and tests assert that the numbers match.
- **`FollowUpChips` (Tier B).** Up to three chips under the toolbar of the **last** assistant message only. Clicking sends a new message. They are hidden on errors, `no_results` and replays, and disappear once the user sends anything.
- **`MessageToolbar`.** Copy (menu: Copy as Markdown with sources as footnotes), feedback, More (Quote this message, Report an issue, which opens feedback with reason "Other"), and Regenerate (Tier B; tooltip "Uses 1 question"; disabled while another stream runs in the session). Desktop: shown on hover or focus-within and always visible on the last message. Touch: always visible in a compact form. Keyboard: a toolbar with roving focus, in reading order. Copy shows a toast and a polite status announcement.
- **Regenerate and versions (Tier B).** A "‹ 2 / 3 ›" pager appears on the assistant message. The latest variant is the conversation context. While a new variant streams, the pager is disabled, and Stop returns to the previous variant.
- **Edit message (Tier C, design only).** Inline edit on the user's message: the bubble becomes a textarea with "Save & submit" and "Cancel"; submitting creates a sibling branch with the shared pager, and downstream messages belong to that branch.
- **`MessageMeta` and separators.** Timestamp tooltip in the team timezone; neutral badges for Stopped and Cut short; date separators in the user's locale day boundaries.
- **`SessionSidebar` and `ChatHeader`.** Groups: Pinned (Tier B), Today, Yesterday, Previous 7 days, Previous 30 days, Older. A search field filters titles (client-side over loaded pages, plus server search when `session_search` exists) and highlights matches, with a "No chats match" state. Items show the title (single line, `dir="auto"`), a generating dot, and a "…" menu (Rename inline with Enter/Escape, Pin/Unpin (B), Export, Delete with confirm). The active item has `aria-current`. The sidebar collapses (state persisted) and resizes within bounds on wide screens. Keyboard: arrows, Home/End, F2 rename, Delete opens the confirm. The header shows the title (click or F2 to rename), the scope pill and an overflow menu.
- **`QuickSwitcher`.** Registers chat actions in the app's command palette if B0 finds one (New chat, Search chats, Open recent chat, Toggle sidebar, Focus composer); otherwise a small in-panel switcher on Cmd/Ctrl+K using the combobox pattern.
- **`ExportDialog`.** Markdown (conversation with citations as numbered footnotes: meeting title, date, timestamp, in-app link) and Print/PDF (a print stylesheet with sources as endnotes). Generated client-side from the cache using the current, access-checked previews; redacted sources export as "source unavailable". Filenames are sanitized, remaining history pages are fetched with progress and cancel, and no raw HTML is generated.
- **Shortcuts.** One constants module, with **conflicts verified against the app and common browsers in B0**. Proposed defaults, to be confirmed: `/` focus composer, `Esc` stop generation or close an overlay, `Cmd/Ctrl+K` search or switch chats, `?` shortcuts list, `Alt+↑/↓` previous/next chat, `Cmd/Ctrl+Shift+C` copy the last answer. Shortcuts never fire while typing in a field (apart from Escape/Enter behaviors), are listed in the dialog, and respect the app's keyboard-settings if one exists.
- **Empty state (pro).** First-name greeting (neutral fallback), a one-line value statement, four capability tiles (Commitments, Summaries, Decisions, People) that reveal 2–3 prompts in place, the 4–6 data-aware suggestion cards (two columns on desktop, one on mobile), and three recent chats. The few-meetings fallback keeps its call to action. No decorative illustration unless the design system already has one.
- **First-run hints.** At most three dismissible hints (Scope, `@`, citations), shown once, never blocking, never stealing focus, with a "Don't show tips" option. Stored as a local flag only.
- **System states.** The toast catalog states text, not color alone. The offline banner is non-modal, disables Send with a reason, and re-enables on reconnect. Skeletons cover history, sidebar, source cards and peek. `ErrorCard` offers a primary action (Retry) and a secondary "Copy details" with the request id.
- **Streaming polish.** New text fades in subtly (≈ 80 ms) per flush; scroll follows only while the user is at the bottom; the toolbar height is reserved so completion never shifts the layout; displayed text is never rewritten afterwards.
- **Avatars and badges.** Initials avatars use token-based color pairs that meet AA contrast. Status badges combine tone, icon and text. Date chips use the team timezone.

**ARIA patterns for the new components**
| Component | Pattern |
|---|---|
| MentionPicker, SlashMenu, QuickSwitcher | Combobox with listbox and `aria-activedescendant`; result count announced politely |
| ScopePopover | Popover with labeled groups; accessible calendar; focus returns to the trigger |
| MessageToolbar | Toolbar with roving tabindex |
| More and item menus | Menu-button pattern |
| Sidebar | Navigation landmark; list with `aria-current`; per-item menu |
| ActivityTimeline | Disclosure (button plus region) containing an ordered list of steps |
| SourcePeek, drawers, export, shortcuts | Modal dialog with focus trap and focus return |
| Version pager | Group with labeled previous/next buttons and "2 of 3" text |
| Result cards | List or table semantics; links remain links |
| Toasts | Status role; never duplicating a completion announcement |

**Motion additions.** Popovers and menus ≈ 120 ms fade/scale, sidebar collapse ≈ 200 ms, tile hover a subtle lift. All are removed under reduced motion.

---

## 6. Architecture Decision Records (ADRs)

### ADR-1: Pipe the stream through the BFF untouched
No re-parsing or buffering in the BFF: lowest latency, no protocol coupling, cancellation propagates naturally. The BFF only authenticates, validates, mints the token and normalizes **pre-stream** errors.

### ADR-2: One contract source, enforced by tests
Frontend types and runtime schemas derive from the backend's schemas (codegen preferred; otherwise hand-written) and are **continuously verified against Day 58's golden transcripts**. A protocol change without a frontend update fails CI. Unknown events and fields are ignored (forward compatibility); a version mismatch surfaces an "update required" state.

### ADR-3: Pure state machine + app-level stream manager
The reducer is a pure function (trivially testable, replayable from transcripts); side effects (fetch, abort, timers, cache writes) live in the manager. This isolates correctness from React lifecycles and enables streams to survive navigation.

### ADR-4: Server data in React Query; ephemeral stream in a keyed store
No duplicated message stores. Cache keys include team and user. On completion the turn is committed to the cache and reconciled.

### ADR-5: Frame-batched rendering with ordering guarantees
One flush per animation frame, plus a flush before every non-token event and on visibility changes. Completed markdown blocks are memoized so only the active block re-parses.

### ADR-6: Safe-by-construction rendering
No raw HTML path exists in the app for model text; link and image elements are disallowed; chips are produced by a parser-level transform from validated ids; all source-derived text (titles, speakers, previews) is rendered as plain text.

### ADR-7: Compact citation chips + rich preview (design decision D-1)
Readable paragraphs, small chips, full information on demand and in the Sources row. If product prefers long inline labels, the chip component takes a display mode switch; the rest of the architecture is unaffected.

### ADR-8: Deterministic backend fixture mode for PR-gating E2E
Recorded provider responses make E2E stable and free; a thin nightly live-model suite guards real-model behavior. This mirrors Day 58's testing split.

### ADR-9: Tiered, capability-gated premium features
Frontend-only features ship first; features needing backend support are built against **extended golden fixtures** and shown only when the backend advertises the capability. This lets the frontend finish early, lets backend work land in any order, and makes "hidden when absent" a tested state rather than an accident.

### ADR-10: Mentions create scope chips, not rich-text tokens
A plain textarea with chips above it avoids content-editable fragility (IME, selection, copy/paste, screen readers) and keeps `filters` structured and visible. The user's wording is never rewritten behind their back.

### ADR-11: The activity timeline shows pipeline facts, never model reasoning
Interpreted question, scope, sources read and timings are safe, useful and already in the protocol. Prompts, reasoning text, scores, costs and internal ids stay hidden, which avoids leaking internals and keeps the surface small.

---

## 7. File Inventory

```
apps/web/
├── app/api/ai/
│   ├── stream/route.ts                      [MODIFY] add kind:"chat"; shared proxy helper; no change to existing kinds
│   └── chat/
│       ├── sessions/route.ts                [NEW] GET list (cursor, limit)
│       ├── sessions/[id]/route.ts           [NEW] GET messages (→ backend …/messages) / PATCH rename / DELETE
│       ├── feedback/route.ts                [NEW] POST (→ backend …/messages/{id}/feedback)
│       ├── suggestions/route.ts             [NEW] GET
│       └── quota/route.ts                   [NEW] GET (requires the Day 58 amendment)
│
├── lib/
│   ├── ai/
│   │   ├── internalToken.ts                 [MODIFY] server-only; full claim set; kid; ≤ 60 s; pinned alg
│   │   ├── proxy.ts                         [NEW] fixed upstream, request-id, timeouts, error normalization,
│   │   │                                          header policy, abort wiring (stream and non-stream)
│   │   └── chatErrors.ts                    [NEW] BFF error envelope + code map
│   ├── security/originGuard.ts              [NEW only if none exists] Origin/Fetch-Metadata check
│   ├── sse/parseSSE.ts                      [EXTRACT from summary stream; characterization tests first]
│   └── contracts/chat.ts                    [NEW] event/response types + runtime schemas (generated or hand-written)
│
└── features/intelligence/
    ├── api/
    │   ├── chatClient.ts                    fetch + streaming reader, AbortController, idle watchdog,
    │   │                                    single silent pre-response retry, error classification
    │   └── chatSessionsApi.ts               query hooks: sessions, messages (infinite), suggestions, quota,
    │                                        feedback, rename, delete (optimistic with rollback)
    ├── state/
    │   ├── chatTurnMachine.ts               [NEW] pure reducer/state machine (§4.4)
    │   ├── streamManager.ts                 [NEW] per-session streams, controllers, cache commits, logout reset
    │   └── chatAtoms.ts                     active session mirror, per-session filters, UI flags
    ├── hooks/
    │   ├── useChatStream.ts                 binds a session to the manager; exposes state + actions
    │   ├── useCitationNavigation.ts         S# → route (meeting + timestamp + highlight; commitments; analytics)
    │   ├── useChatScroll.ts                 [NEW] stick-to-bottom, new-response pill, history scroll preservation
    │   └── useChatDraft.ts                  [NEW] per-session draft persistence, cleared on logout
    ├── components/
    │   ├── AIChatPanel.tsx                  [MODIFY] composition only; lazy-loads the markdown pipeline
    │   ├── ChatSessionList.tsx              history, rename, delete-confirm, generating indicator
    │   ├── ChatMessageList.tsx              paginated, off-screen rendering optimization, log semantics
    │   ├── ChatMessage.tsx                  [MODIFY] user/assistant variants and every state in §5.3
    │   ├── StreamingText.tsx                [NEW] memoized completed blocks; active block only re-renders
    │   ├── CitationChip.tsx                 link semantics, preview popover, group, disabled
    │   ├── SourcesDrawer.tsx                grouped by meeting; analytics group; side/bottom sheet
    │   ├── RetrievalStatus.tsx              stage line + detail
    │   ├── StatusAnnouncer.tsx              [NEW] screen-reader status region
    │   ├── ChatInput.tsx                    IME-safe, touch behavior, counter, Send↔Stop, drafts
    │   ├── FilterChips.tsx                  [NEW] visible scoping + clear
    │   ├── SuggestedQuestions.tsx / ChatEmptyState.tsx
    │   ├── QuotaBanner.tsx                  thresholds, scope copy, CTA by role
    │   ├── MessageActions.tsx               [NEW] copy + feedback container (always reachable)
    │   ├── FeedbackButtons.tsx              up/down + reasons + optional comment
    │   └── ChatErrorBoundary.tsx
    ├── utils/
    │   ├── renderAnswer.ts                  parser-level citation transform (text nodes only)
    │   ├── citationModel.ts                 [NEW] source view-models, grouping, validation against message sources
    │   ├── formatTime.ts                    [NEW] h:mm:ss, team-timezone dates
    │   └── inputLimits.ts                   [NEW] normalized code-point counting, contract limits
    ├── copy/chatCopy.ts                     [NEW] centralized strings (§5.5)
    └── telemetry/chatTelemetry.ts           [NEW] event definitions, PII-safe payloads

apps/web/<transcript viewer location per B0>   [MODIFY] honor timestamp + highlight params; seek audio;
                                                handle missing audio and timestamp mismatch (B8)
apps/web/<commitments route per B0>            [VERIFY / MODIFY ONLY IF NEEDED]

tests/ (placement follows existing convention, B0)
├── unit:        parseSSE, chatTurnMachine, renderAnswer, citationModel, formatTime, inputLimits, proxy,
│                chatErrors, internalToken, streamManager
├── component:   panel, message states, chip, drawer, input, quota, feedback, session list, status announcer
├── bff:         stream route, sessions, feedback, suggestions, quota, abort both ways, origin guard
├── contract:    golden-transcript replay + byte-boundary fuzz
├── e2e:         deterministic suite (fixture backend) + nightly live suite
├── a11y:        axe per state + manual SR script (checked-in checklist)
├── visual:      state screenshots (light/dark, LTR/RTL, 3 breakpoints)
├── perf:        interaction latency, streaming flush, bundle budget
└── fixtures:    golden transcripts (read from the backend fixtures), xss_corpus.json, rtl_samples.json
docs/chat/ : frontend_decisions.md (B0 findings + D-1…D-10 outcomes), runbook_chat_frontend.md
```

---

### 7.1 Premium-layer file additions (Revision 2; paths follow the B0 conventions)
```
apps/web/
├── app/api/ai/chat/
│   ├── bootstrap/route.ts                 [NEW] quota + capabilities in one call (quota route may be folded in)
│   ├── lookup/route.ts                    [NEW only if B0 finds no existing people/meeting lookup] (C2)
│   └── sources/[id]/window/route.ts       [NEW, Tier B] transcript window for peek (C9)
│       (regenerate rides the existing stream route; pin/title ride the sessions PATCH)
│
└── features/intelligence/
    ├── components/
    │   ├── ComposerShell.tsx, MentionPicker.tsx, ScopePopover.tsx, SlashMenu.tsx,
    │   │   QuoteToAsk.tsx, ComposerHints.tsx                          (C1–C6)
    │   ├── ActivityTimeline.tsx, SourceCards.tsx, SourcePeek.tsx      (C7–C9; peek is Tier B)
    │   ├── AnalyticsResultCard.tsx, CommitmentCards.tsx, FollowUpChips.tsx   (C10–C12, Tier B)
    │   ├── MessageToolbar.tsx, RegenerateVersions.tsx, MessageMeta.tsx, DateSeparator.tsx   (C13, C14, C16, C17)
    │   ├── SessionSidebar.tsx, SessionItemMenu.tsx, ChatHeader.tsx, QuickSwitcher.tsx,
    │   │   ExportDialog.tsx, ShortcutsDialog.tsx                      (C18, C20–C23)
    │   ├── CapabilityTiles.tsx, FirstRunHints.tsx                     (C24, C25; ChatEmptyState is MODIFIED)
    │   ├── ConnectionStatus.tsx, Skeletons.tsx, ErrorCard.tsx          (C27–C29)
    │   └── PersonAvatar.tsx, StatusBadge.tsx                          (C31; reuse design-system equivalents if they exist)
    ├── hooks/
    │   ├── useCapabilities.ts, useScopeFilters.ts, useMentionSearch.ts, useQuoteSelection.ts,
    │   │   useActivityTimeline.ts, useSessionSearch.ts, useChatShortcuts.ts, useConnectionStatus.ts
    ├── utils/
    │   ├── slashCommands.ts, shortcuts.ts, exportConversation.ts, avatar.ts, capabilities.ts
    └── (C15 EditMessage: design only; no file today)

tests/fixtures/ : extended golden transcripts for follow_ups, structured data, regenerate variants, and
                  capability-absent variants; mention/lookup fixtures; export snapshots
```

---

## 8. Day 59 Execution Timeline (Block by Block)

Each block ends with a **checkpoint**. Do not start the next until it is green. Two sittings with a gate in between.

| Block | Time | Focus | Sitting |
|---|---|---|---|
| **B0** | 0:00–0:50 | Inspect codebase, design system, hosting path; record decisions | 59A: foundations |
| B1 | 0:50–1:40 | Contracts, schemas, transcript harness, amendment requests | 59A |
| B2 | 1:40–2:50 | BFF foundation + stream route | 59A |
| B3 | 2:50–3:40 | BFF sessions/feedback/suggestions/quota | 59A |
| B4 | 3:40–4:50 | SSE parser extraction + chat client | 59A |
| B5 | 4:50–6:00 | State machine, stream manager, cache integration | 59A |
| **Gate** | 6:00–6:15 | **59A gate:** B0–B5 green; transcripts replay end to end headlessly | |
| B6 | 6:15–7:15 | Rendering pipeline + citation model | 59B: experience |
| B7 | 7:15–9:15 | Components and states (design pass) | 59B |
| B8 | 9:15–10:00 | Deep-link target + navigation | 59B |
| B9 | 10:00–10:45 | Accessibility, keyboard, mobile, RTL pass | 59B |
| B10 | 10:45–11:15 | Telemetry, flags, budgets, code-splitting | 59B |
| B11 | 11:15–13:00 | Test suites, cross-browser, manual QA | |
| B12 | 13:00–13:30 | **Core** sign-off, docs, Day 60 handoff | |
| **59C** | | **Premium layer (§5.9), a third sitting** | |
| B13 | +0:00–1:45 | Pro composer: scope, @ mentions, slash, quote-to-ask (C1–C6) | 59C: premium |
| B14 | +1:45–3:15 | Activity timeline, source cards, message toolbar, meta, polish (C7, C8, C13, C16, C17, C30, C31) | 59C |
| B15 | +3:15–5:15 | Pro sidebar, header, quick switcher, export, shortcuts (C18, C20–C23) | 59C |
| B16 | +5:15–6:15 | Pro empty state, first-run hints, system states (C24–C29) | 59C |
| B17 | +6:15–8:15 | Tier B behind capabilities: result cards, follow-ups, regenerate/versions, peek, auto-title, pin (C9–C12, C14, C19) | 59C |
| B18 | +8:15–10:15 | Premium test suites, accessibility re-pass, performance re-measure, premium sign-off | 59C |

**59C is effectively another full sitting (≈ 10 h).** Schedule it as an extension half-day after the core gate, or run B17 (Tier B) on Day 60 morning if the backend amendments are not ready. The core day (B0–B12) is **never** delayed by 59C. **59C priority order** if time is short: (1) B14, B15 and B16: the highest user value and all frontend-only; (2) B13 (composer) with scope and `@` first, then slash and quote-to-ask; (3) B17 items as their backend capabilities land; (4) export and first-run hints last. Tier C (edit with branches) is not built.

**Cut line (core day):** *must ship* = B0–B8, core accessibility (B9 except RTL polish), and every P0 test. *Defer to Day 60 morning* = feedback reason picker and comment (keep up/down), Copy action, FilterChips polish beyond visibility, visual-regression suite, RTL visual polish (behavior kept), rename (keep list and delete). **Never defer:** safe rendering, abort propagation, logout reset, contract tests, quota correctness, accessibility fundamentals.

---

### B0: Inspect, Verify, Decide
Work through §3.1 and record each answer. Produce `frontend_decisions.md` with: findings, D-1…D-10 outcomes (or owners), the JWT migration plan, the contract-source decision (codegen vs hand-written), the transcript viewer's current capabilities, and the hosting/edge buffering audit. Read the summary stream's tests; note behavior to preserve. **No production code changes in this block.**

**Checkpoint B0**
- [ ] Every row of §3.1 has a recorded answer.
- [ ] No assumption remains; unresolved items have an owner and a fallback.
- [ ] Characterization tests identified for the code about to be extracted or modified.

---

### B1: Contracts and Transcript Harness
- Create `lib/contracts/chat.ts`: event payload types and runtime schemas for every Day 58 event; response schemas for sessions, messages, feedback, suggestions, quota; error envelope; limits object. Unknown fields allowed, unknown events ignored.
- Build the **transcript harness**: loads every Day 58 golden transcript and exposes it as a byte stream that can be chunked arbitrarily (used by B4, B5 and B11).
- File the §3.3 amendment requests with the backend owner; where an amendment is not yet available, the frontend codes to the amended contract behind a documented fallback.

**Checkpoint B1**
- [ ] All golden transcripts validate against the schemas.
- [ ] A schema or protocol drift (a deliberately mutated transcript) fails the contract test.

---

### B2: BFF Foundation and Stream Route
**`lib/ai/internalToken.ts` (modify):** server-only module; claims aligned with Day 58 (`team_id`, `user_id`, `role`, `plan`, `tz`, issuer, audience, unique id, ≤ 60 s expiry, `kid` header, pinned asymmetric algorithm); key from the secret manager; never logged. The existing summary stream's verification path keeps working (B0 plan).

**`lib/ai/proxy.ts`:** fixed upstream base from config; request-id generated and forwarded and echoed; abort wiring for both cancellation paths; timeouts for non-stream calls; the error normalization whitelist; `Retry-After` forwarded; header policy for streaming responses (no-store, no-transform, buffering disabled, no compression, dynamic rendering, maximum duration ≥ the backend's total timeout plus preflight, runtime consistent with the summary stream).

**`app/api/ai/stream/route.ts` (modify):** a `chat` branch only: resolve session (401), role/team-status check (403), origin guard, validate the body (cheap limits only; `client_message_id` required UUID; filters shaped; **no `team_id` accepted from the body**), mint the token, forward, return the upstream body untouched. Pre-stream upstream errors normalized. The existing branches are untouched and re-tested.

**Checkpoint B2**
- [ ] Missing session → 401; wrong role/inactive team → 403; bad origin → rejected; oversized/invalid body → 422 with a field-level reason.
- [ ] A hostile body containing `team_id` is ignored (assert the outgoing token's team equals the session's).
- [ ] The outgoing token has every required claim and an expiry ≤ 60 s.
- [ ] Abort: request-signal abort **and** client-side body cancel both reach a mock upstream.
- [ ] Response headers verified; chunks reach a test client incrementally (not at the end).
- [ ] Upstream 429/503/HTML-error/network-failure are normalized correctly; no upstream internals leak.
- [ ] Existing summary stream tests still pass.

---

### B3: BFF Session, Feedback, Suggestions, Quota Routes
- Sessions: list (cursor, limit clamp), messages (`[id]` GET with cursor), rename (length cap), delete. Feedback: POST with validated rating/reason/comment lengths. Suggestions and quota: GET.
- All routes: same guards as B2; path parameters validated as UUIDs and encoded; cursors validated to the opaque format; `no-store` on every private response; per-route upstream timeout (≈10 s); consistent error envelope.
- Mapping between BFF paths and backend paths documented in the routes' header comments and the decisions doc.

**Checkpoint B3**
- [ ] Traversal-style ids (`../`, encoded slashes, very long strings) are rejected before any upstream call.
- [ ] Cross-user session id → upstream 404 normalized to 404 (no existence leak).
- [ ] Mutating routes reject missing/mismatched origins.
- [ ] Response caching headers are private and `no-store`.

---

### B4: SSE Parser and Chat Client
**`lib/sse/parseSSE.ts` (extract):** first write **characterization tests** against the existing summary stream behavior, extract, switch the summary stream to the shared parser, and confirm the tests still pass. Parser behavior: streaming UTF-8 decoding; CRLF/LF/CR line endings; BOM; comment lines ignored (heartbeats); multi-line `data` joined; `event`/`id`/`retry` fields handled; maximum event size guard; frames validated against schemas, with a validation failure becoming a protocol error (logged, never silently swallowed); unknown events ignored.

**`api/chatClient.ts`:** builds the request (new `client_message_id` per user send, reused on Retry), reads the stream, **idle watchdog (35 s)** treating pings as activity, normalizes errors (fetch rejection vs. HTTP status vs. in-stream `error` vs. watchdog), cross-browser abort differences normalized, single silent retry only before response headers, releases reader resources on every exit path.

**Checkpoint B4**
- [ ] The summary stream is unchanged in behavior (characterization suite green).
- [ ] Every golden transcript, split at **every byte offset** and at random sizes, parses to the identical event sequence, including inside multi-byte Urdu and emoji.
- [ ] Watchdog fires at 35 s of silence and not before when pings arrive.
- [ ] Abort mid-stream stops reading and releases resources; no unhandled rejections.

---

### B5: State Machine, Stream Manager, Cache Integration
- **`chatTurnMachine.ts`:** the pure reducer for §4.4/§4.5, including ignore rules for stale events, replay handling, `status.detail`, analytics-type sources, finish reasons, and error classification. Replayable from transcripts.
- **`streamManager.ts`:** per-session streams; controller lifecycle; frame-batched text buffering with the three flush triggers (frame, visibility change, before any non-token event); commits to the query cache on completion (optimistic user message + final assistant message), then triggers reconciliation; concurrency rules (one stream per session, up to two overall; local guard before the server's 409/429); `stopAll()` for logout, team switch and page unload.
- **`chatAtoms.ts`:** active session mirrored with the URL, per-session filters, UI flags. No message data.
- **`chatSessionsApi.ts`:** query keys with team and user, infinite history with older-page fetching, optimistic rename/delete with rollback, quota and suggestions queries, feedback mutation with idempotent upsert semantics.

**Checkpoint B5**
- [ ] Headless replay of every golden transcript through client → reducer → manager yields the expected final state (text, sources, verdict, finish reason, quota).
- [ ] The final text equals the concatenation of streamed text for all transcripts (no truncation from unflushed buffers).
- [ ] Starting a stream in session A, switching to B, and returning to A shows the complete answer; a second concurrent session is allowed; a third is refused locally.
- [ ] Logout and team switch clear the cache, atoms, drafts and abort streams (asserted).
- [ ] Repeated start/stop (50×) leaves no residual listeners or controllers.

---

### B6: Rendering Pipeline and Citation Model
- **`renderAnswer.ts`:** parse markdown, then transform **text nodes only**: `[S#]` markers become chips if and only if the id exists in that message's sources; unknown ids are stripped; adjacent markers collapse into a group; code spans/blocks remain literal. Defensive support for multi-id marker forms.
- **Markdown configuration:** allowlisted elements only (paragraph, line break, lists, emphasis, strong, inline code), links and images disallowed and unwrapped, no raw-HTML support, no dangerous-HTML escape hatch anywhere (lint rule).
- **`StreamingText.tsx`:** blocks are memoized as they complete; only the final block re-parses per frame; chip insertion does not shift layout (reserved dimensions).
- **`citationModel.ts`:** source view-models for transcript, commitment, action item, decision, summary/digest and **analytics** sources; grouping by meeting; display labels; accessible names; unavailable flag.
- **`formatTime.ts`:** `h:mm:ss` when ≥ 1 hour, `m:ss` otherwise; dates in the team timezone (D-9). **`inputLimits.ts`:** normalized code-point counting.

**Checkpoint B6**
- [ ] XSS corpus (script tags, event-handler attributes, `javascript:` links, markdown links and images, HTML entities, nested/obfuscated markup, bidi-override characters) renders inert; no element beyond the allowlist appears in the DOM.
- [ ] Markers inside code spans stay literal; invalid ids are stripped; groups collapse correctly; `[S1, S3]` handled.
- [ ] Source titles/speakers/previews containing markup render as plain text.
- [ ] Time formatting correct at 0:00, 59:59, 1:00:00 and beyond; code-point counter matches the contract's definition for emoji and combined characters.

---

### B7: Components and States (Design Pass)
Build and verify every state in §5.3 using the design system's tokens and primitives:
- **AIChatPanel** (composition, lazy loading, layout per B0), **ChatSessionList** (grouping by recency, rename, delete confirm, generating dot), **ChatMessageList** + **ChatMessage** (all variants), **StreamingText**, **RetrievalStatus** (with interpreted-question detail), **SourcesRow/SourcesDrawer** (side sheet or bottom sheet per D-4; analytics group with definition, as-of and a link), **CitationChip** (preview via hover, focus and tap), **ChatInput** (IME-safe, touch behavior, counter, Send↔Stop, drafts, cooldown, disabled reasons), **FilterChips**, **SuggestedQuestions/ChatEmptyState**, **QuotaBanner**, **MessageActions/FeedbackButtons**, **ChatErrorBoundary** (contained failure that keeps the rest of the app alive).
- A single copy module; all strings reviewed against §5.5.
- Each state previewed in isolation (existing component-preview tooling if any) in light and dark.

**Checkpoint B7**
- [ ] Every row in §5.3 renders and is covered by a component test.
- [ ] No layout shift when status → streaming → complete (measured).
- [ ] Failed send keeps the text and shows "Not sent"; Stop keeps partial text; quota exhausted disables Send with the reset time and role-appropriate CTA.
- [ ] `no_results` with active filters offers "Clear filters and retry".
- [ ] Replayed messages show instantly without a typing effect.

---

### B8: Deep-Link Target and Navigation
- **`useCitationNavigation.ts`:** maps a source to a destination: transcript source → meeting route with timestamp and highlight reference; commitment → its route; analytics → the filtered list route from the backend's link descriptor (only where a matching route exists); unavailable → no navigation. Chips are real links: plain click navigates in-app with chat state preserved (D-3), modifier/middle click opens a new tab, right-click and copy-link work.
- **Transcript viewer (location from B0):** accept the timestamp and highlight parameters; scroll to the cleaned turn(s), highlight them with a clear but quiet style, seek the audio player to the start time (before a short lead-in), handle: no audio, timestamp outside the recording, a highlight that spans multiple turns, a cleaned vs. raw timestamp mismatch (Day 48 re-attachment), a meeting that no longer exists (the page's own not-found state), and focus placement for keyboard/screen-reader users.
- Navigating away and back preserves the conversation (URL session param, cache, drafts, in-flight stream continues).

**Checkpoint B8**
- [ ] A citation click lands on the correct meeting, scrolls to and highlights the turn, and seeks the audio.
- [ ] Modifier-click opens a new tab at the same location; back button returns to the chat with the scroll position and draft intact.
- [ ] Missing audio, out-of-range time, deleted meeting and unavailable-source cases degrade gracefully (no crash, clear message).

---

### B9: Accessibility, Keyboard, Mobile, RTL
- Implement §5.6 fully: busy/status regions, focus management, keyboard map, names, targets, contrast, zoom/reflow.
- Mobile: full-screen sheet, bottom sheet for sources, keyboard-aware input, safe areas, touch-device Enter behavior; test with real virtual keyboards.
- RTL/bidi: auto direction, logical properties, isolated chips/numbers, Urdu font fallback and line height.
- Run the axe scan on every state; run the manual screen-reader script (VoiceOver + NVDA): open panel, ask, hear stage announcements and the completion announcement, navigate to a chip, open the sources, give feedback, hit an error, and stop an answer.

**Checkpoint B9**
- [ ] Zero serious/critical axe violations across the state matrix (light/dark, desktop/mobile, LTR/RTL).
- [ ] Keyboard-only run of the complete flow succeeds with a visible focus indicator at every step.
- [ ] Screen-reader script passes: no per-token chatter; a single concise announcement per stage and on completion.
- [ ] Reduced-motion preference removes all motion; 200% zoom and 320 px width remain usable.

---

### B10: Telemetry, Flags, Budgets, Code Splitting
- **Telemetry (§11):** event definitions, client-measured timings, PII-free payloads.
- **Flags:** respect the global and per-team chat flag through the existing flag mechanism (B0); the entry point is hidden when disabled; a mid-session `FEATURE_DISABLED` shows the unavailable state.
- **Code splitting:** the chat panel and its markdown pipeline load on first open; a prefetch on hover/focus of the entry point; the bundle budget (set from B0 measurements) enforced in CI.

**Checkpoint B10**
- [ ] No message text or source text in any telemetry payload (payload-scan test).
- [ ] The panel chunk is not in the initial bundle; the budget check passes.
- [ ] Flag off → no entry point, no network calls.

---

### B11: Test Suites, Cross-Browser, Manual QA
Run §13 in full: unit, component, BFF, contract and byte-fuzz, deterministic E2E, nightly live E2E (smoke now), accessibility, visual states, performance, and the cross-browser matrix with the manual script on real devices through the **real proxy path**.

### B12: Sign-off
Update `frontend_decisions.md`, the runbook (BFF routes, flags, buffering troubleshooting, protocol-version handling), and the Day 60 handoff; record D-1…D-10 owners and dates; attach the evidence list from §1.3.

---

### B13: Pro Composer (59C)
Build C1–C6 per §5.10: `ComposerShell`, `ScopePopover` (with `useScopeFilters` and the visible `FilterChips`), `MentionPicker` (with `useMentionSearch`; the BFF lookup route only if B0 found no existing lookup), `SlashMenu` (reviewed static registry), `QuoteToAsk` (with `useQuoteSelection`), and `ComposerHints`.

**Checkpoint B13**
- [ ] The `filters` in the outgoing request equal the visible chips exactly; removing a chip removes the filter and leaves the typed text intact.
- [ ] The mention flow works by keyboard alone (open, navigate, select, dismiss) and respects IME composition; lookups are debounced and cached; results are escaped.
- [ ] Quote-to-ask produces a plain-text, clearly marked quote within limits; the keyboard/screen-reader path exists.
- [ ] Pasting rich text yields plain text; over-limit paste shows guidance and never truncates silently.
- [ ] Scope dates are in the team timezone; `from ≤ to` and the maximum span are enforced.

### B14: Process Transparency and Message Layer (59C)
Build `ActivityTimeline` (replacing the plain status line), the upgraded `SourceCards`, `MessageToolbar` (copy variants, feedback, More menu), `MessageMeta`, `DateSeparator`, `StreamingPolish`, `PersonAvatar` and `StatusBadge`.

**Checkpoint B14**
- [ ] The timeline shows live steps while streaming and collapses to the one-line summary; expanded steps show only pipeline facts (a test asserts no reasoning, prompt, score, cost or internal id is ever rendered).
- [ ] Copy produces correct plain text and Markdown with footnoted sources; the toast and one polite announcement fire.
- [ ] The toolbar is reachable by keyboard and visible on touch; the layout does not shift when it appears.
- [ ] Replayed responses show the collapsed summary only.

### B15: History and Navigation (59C)
Build `SessionSidebar` (groups, title search, item menu, collapse/resize persistence), `ChatHeader`, `QuickSwitcher` (palette registration or in-panel), `ExportDialog` (`exportConversation`), `ShortcutsDialog` (`shortcuts.ts`, `useChatShortcuts`).

**Checkpoint B15**
- [ ] Grouping boundaries correct around midnight in the user's locale; search highlights matches; empty states designed.
- [ ] Rename, delete-confirm and active-item deletion behave correctly; keyboard map works (F2, Delete, arrows, Home/End).
- [ ] Shortcuts do not conflict with the app or common browsers (B0 audit) and never fire while typing.
- [ ] Export output contains footnoted citations with in-app links only, sanitized filenames, "source unavailable" for redacted sources, and no raw HTML.

### B16: First Impression and System States (59C)
Build the pro `ChatEmptyState` with `CapabilityTiles`, `FirstRunHints`, the toast catalog, `ConnectionStatus`, the skeleton set and `ErrorCard`.

**Checkpoint B16**
- [ ] Empty state works for a populated team and the few-meetings fallback; tiles reveal prompts in place; one tap sends a suggestion.
- [ ] Hints appear once, are dismissible, never steal focus, and honor "Don't show tips".
- [ ] Offline banner disables Send with a reason and recovers automatically; every error code renders through `ErrorCard`.

### B17: Tier B Behind Capabilities (59C)
First, `useCapabilities` and the bootstrap route so every Tier B component is gated. Then, in order of backend readiness: `AnalyticsResultCard` and `CommitmentCards` (validated `data` only), `FollowUpChips`, `RegenerateVersions` (the shared version pager), `SourcePeek`, `AutoTitle` and pin/session search. All are built against the extended golden fixtures, so they can be finished before the backend lands.

**Checkpoint B17**
- [ ] With each capability **absent**, the corresponding component is not rendered and the rest of the UI is unchanged; with it **present**, the component works.
- [ ] Result-card numbers equal the numbers in the prose for every fixture; invalid `data` falls back to prose only.
- [ ] Regenerate counts as one question (tooltip and quota update), is disabled during a stream, and Stop restores the previous variant; the pager shows "2 of 3" accessibly.
- [ ] Peek shows the redaction state for unavailable sources and never renders markup.

### B18: Premium QA and Sign-off (59C)
Run §13.12, repeat the accessibility script on the new surfaces, re-measure the §12 budgets, update the decisions doc (new capabilities, shortcut audit, tier status) and attach evidence for the premium DoD items.

---

## 9. Security Model

| Threat | Control |
|---|---|
| Model output injecting markup/links/images/scripts | Allowlist rendering with links/images disallowed, no raw-HTML path, lint ban on dangerous-HTML escape hatches, parser-level chip transform, plain-text rendering of all source-derived strings, XSS corpus in CI; server-side scrubbing (Day 58) is a second layer |
| Citation spoofing (fake `[S9]`) | Chips only for ids in that message's own sources; others stripped |
| Client-supplied tenant identity | BFF derives team/user/role/plan/tz from the session only; the body's `team_id` is ignored and tested |
| Token theft or misuse | Server-only module, short-lived (≤ 60 s), audience-bound, asymmetric signature, key in the secret manager, never logged or sent to the browser |
| CSRF on mutating routes | Origin/Fetch-Metadata check, JSON content type, same-site cookies |
| Path/URL injection into upstream calls | UUID validation, encoding, fixed upstream base, cursor format validation |
| Error-body leakage | Normalized envelope with a whitelist; no upstream internals, stack traces or HTML |
| Cross-user/team state leakage on shared devices | Keys include team+user; logout/team switch clears cache, atoms, drafts, aborts streams |
| Draft/PII persistence | Session-scoped storage only, cleared on logout; no message text in telemetry or error reports |
| Existence oracles | 404 for foreign sessions; foreign ids indistinguishable from absent |
| Resource exhaustion (huge frames, endless streams) | Maximum event size, idle watchdog, total duration aligned to the backend, local concurrency limits |
| Deep-link abuse | Only app-internal routes are generated from known source types; ids validated before routing; no user-controlled URLs |
| Clickjacking/CSP | Verified against the existing headers in B0; the feature needs no inline scripts or new origins |
| Mention/lookup data exposure within a team (Q1) | Lookups go through the BFF with the same tenant and access scope as retrieval; results escaped; no lookup returns data the user could not otherwise open |
| Quote-to-ask and slash templates as an injection vector | Quotes are plain text from the user's own screen, length-limited, clearly marked, and counted in limits; templates are static and reviewed; nothing is hidden from the user |
| Export leaking or mis-rendering content | Client-side from access-checked cache data; redacted sources exported as unavailable; no raw HTML; links limited to in-app routes; sanitized filenames |
| Result cards trusting server data | Runtime schema validation before render; plain-text rendering; invalid data falls back to prose |
| Premium local storage (hints, sidebar state, drafts) | Flags and layout state only; no message or source text beyond the existing session-scoped drafts; cleared on logout |
| Capability flags forged client-side | Flags come from the server bootstrap; hiding a component is cosmetic, and the backend still enforces every capability |

---

## 10. Reliability & Failure Handling

| Failure | Behavior |
|---|---|
| Pre-stream rejection | Mapped per §4.5; no assistant placeholder remains; the draft is preserved |
| Network failure before headers | One silent retry (idempotent id); then "Connection lost" + Retry |
| Stream stall (no bytes 35 s) | Abort, preserve partial text, "Connection lost" + Retry |
| Decode/schema failure | Controlled error with Retry; logged with request id; never a blank UI |
| Retry after a dropped completed stream | Backend replay returns the stored answer instantly, with no extra charge |
| Retry while the original is still running | 409 → wait and refresh history |
| Tab hidden mid-stream | Buffer retained; flush on visibility; no loss |
| Page unload mid-stream | Controllers abort (server persists the cancelled partial); history shows "Stopped" after reload |
| Session deleted elsewhere | 404 handling → new-chat prompt; list refreshes |
| Two tabs, same session | The second send gets `SESSION_BUSY` and is handled gracefully |
| Quota changes mid-session | Reconciled from `usage`, 429 bodies and the quota query |
| BFF or upstream timeout on non-stream routes | Normalized 503/504 with Retry; stale cache shown where safe |
| Panel render crash | Error boundary contains it, preserves the rest of the app, offers reload of the panel |
| Backend protocol version newer than the client | "Update required" state with a refresh action |
| Flag disabled mid-session | In-flight stream completes (backend behavior); next send shows the unavailable state |

---

## 11. Telemetry & Observability

**Events** (payloads contain ids, lengths, enums and timings only; **never message or source text**): `chat_opened`, `chat_message_sent` (length bucket, session new/existing, filters used), `chat_first_event_ms`, `chat_first_token_ms` (client-measured), `chat_completed` (finish reason, tokens/s, source count, replayed), `chat_stopped`, `chat_error` (code, retryable, phase), `chat_no_results`, `chat_citation_clicked` (source type, position), `chat_sources_opened`, `chat_suggestion_clicked`, `chat_feedback_submitted` (rating, reason), `chat_quota_banner_shown`, `chat_quota_exhausted`, `chat_unsupported_note_shown` and `…_interacted` (D-5 calibration), `chat_copy_clicked`, `chat_connection_lost`, `chat_watchdog_fired`.
**Premium-layer events (same PII rules):** `composer_mention_used` (kind), `composer_scope_applied` (which dimensions, never values), `composer_slash_used` (command id), `composer_quote_used`, `activity_timeline_expanded`, `source_peek_opened`, `source_card_clicked`, `followup_clicked`, `regenerate_clicked`, `version_switched`, `structured_card_clicked`, `session_searched` (result count only), `session_pinned`, `session_renamed`, `export_completed` (format, message count), `shortcut_used` (shortcut id), `first_run_hint_dismissed` (hint id, "don't show" flag), `offline_banner_shown`.

**Performance:** interaction latency (INP attribution), long tasks during streaming, frame-flush counts, bundle load time of the panel chunk.

**Error reporting:** the existing reporter with message content scrubbed; request id attached so support can correlate with Day 58 traces.

**Dashboards for Day 60:** client vs. server TTFT gap (proxy/edge overhead), error rate by code and browser, citation click-through, feedback ratio by intent, no-results rate, quota-exhaustion rate, watchdog and connection-lost rates by browser (Safari signal).

---

## 12. Performance & Budgets

| Budget | Target |
|---|---|
| INP, panel interactions (lab, 4× CPU, mid-tier mobile) | < 200 ms |
| Token flush | ≤ 1 React commit per animation frame; zero long tasks > 50 ms attributable to flushing |
| Layout shift during streaming | 0 |
| Time from `meta` to first paint of the assistant placeholder | < 100 ms |
| Panel code (initial bundle impact) | 0 KB (lazy); chat chunk size budget set from B0 measurements and enforced in CI |
| History load (first page, 20 messages) | < 300 ms from cache, < 800 ms cold on a typical connection |
| Memory | No growth over 50 start/stop cycles; completed messages memoized |
| Long histories | Paginated; off-screen content not rendered eagerly; scroll position preserved when older pages prepend |
| Mention picker latency | Opens in < 100 ms (cached or local), results within 250 ms of the last keystroke on a typical connection; no input lag while typing |
| Sidebar scale | Smooth at 500 sessions (grouping and search computed incrementally, no full re-render on keystroke) |
| Premium chunk size | Composer extras, export, peek and shortcuts load lazily; they add nothing to the initial bundle and respect the CI budget |
| Activity timeline overhead | No extra render commits beyond the existing one-per-frame flush |

Levers if a budget is missed: raise the memoization granularity, cap rendered history depth, defer preview content until first hover/focus, split the markdown pipeline further.

---

## 13. End-of-Day Test Plan

### 13.1 Traceability from the original spec
| Original test | Plan test |
|---|---|
| `parseSSE`: multi-event chunks, split boundaries, heartbeat, CRLF, unknown event | Kept, plus multi-byte boundaries, BOM, size guard, schema-failure handling, byte-offset fuzz |
| `renderAnswer`: chip, invalid stripped, code spans, `<script>` inert | Kept, plus the full XSS corpus, links/images, multi-marker forms, plain-text source strings |
| `useChatStream`: every event, retry keeps id, abort keeps partial | Replaced by the pure state-machine tests plus manager tests: all outcomes, flush ordering, session switching, logout |
| `AIChatPanel`: send → status → sources → text → chips; Stop; `no_results` | Kept, extended to every state in §5.3 |
| `CitationChip`: label/time, keyboard, disabled | Kept, plus link semantics, group, preview on focus/tap |
| `QuotaBanner`: thresholds, disabled at 0 | Kept, plus scope-specific copy, role-based CTA, first-load correctness |
| BFF: 401, ignored `team_id`, abort propagation, headers | Kept, plus full claim set, both abort paths, origin guard, param validation, error normalization |
| E2E 1–6 | Kept, restructured: deterministic PR suite + nightly live suite |
| Axe scan | Kept, across the full state matrix and screen-reader script |
| INP < 200 ms; cross-browser manual QA | Kept, with an explicit measurement method and the device matrix |

### 13.2 Unit (Vitest)
- [ ] `parseSSE`: all golden transcripts under random and exhaustive chunking produce identical events; multi-byte splits; CRLF/BOM; comments ignored; oversize event rejected; invalid JSON/schema → protocol error; unknown events and fields ignored.
- [ ] `chatTurnMachine`: every state/transition in §4.4; every outcome in §4.5; stale and post-terminal events ignored; replayed flag; analytics sources; length/filtered/cancelled handling.
- [ ] `streamManager`: flush-before-non-token ordering; visibility flush; per-session isolation; concurrency limits; commit to the cache; `stopAll`; no leaks over repeated cycles.
- [ ] `renderAnswer` / `citationModel`: validity against the message's sources; grouping; code spans literal; unknown ids stripped; labels and accessible names; unavailable sources.
- [ ] `formatTime`, `inputLimits`: boundary cases and Unicode (emoji, combining marks, normalization, Urdu).
- [ ] `proxy`, `chatErrors`, `internalToken`: error normalization table, header policy, claim set, expiry, algorithm, server-only enforcement.

### 13.3 Component (React Testing Library + MSW streaming handlers fed by golden transcripts)
- [ ] Panel flows: send → status text → sources row → streamed text → chips; Stop aborts the fetch and keeps partial text; `no_results` informational style with Clear-filters action.
- [ ] Message state matrix (§5.3), including Not sent, Stopped, truncated, filtered, replayed.
- [ ] Chip: link semantics, modifier click, keyboard activation, preview on hover/focus/tap, disabled state.
- [ ] Sources drawer: grouping by meeting, analytics group, focus trap and return.
- [ ] Input: Enter vs. Shift+Enter, **IME composition**, touch behavior, counter at limits, token-limit error, draft persistence and restore, Send↔Stop swap, disabled reasons.
- [ ] Quota banner and exhausted state; role-specific CTA; cooldown countdown.
- [ ] Feedback: optimistic toggle, reasons, failure and retry, announcements.
- [ ] Session list: grouping, rename, delete confirm, generating indicator, active-session deletion.
- [ ] Logout/team switch clears everything.

### 13.4 BFF route tests
- [ ] Auth/role/inactive-team matrix; origin guard; body validation; ignored hostile `team_id`.
- [ ] Outgoing JWT claim set and expiry; runs against the existing summary route unchanged.
- [ ] Abort propagation in **both** directions (mock upstream observes it).
- [ ] Streaming: headers present; incremental delivery verified; no BFF buffering.
- [ ] Pre-stream error normalization (401/403/404/409/422/429/503, HTML error pages, network failure, timeouts); `Retry-After` forwarded.
- [ ] Session/feedback/suggestions/quota routes: param validation, `no-store`, cross-user 404, mutating-route origin checks.

### 13.5 Contract
- [ ] Every golden transcript replayed end to end (client → reducer → manager → rendered DOM) with expected final states.
- [ ] Mutated transcripts (new event, extra field, version bump) behave per ADR-2.
- [ ] CI fails when the backend's protocol doc or schemas change without a frontend update.

### 13.6 E2E (Playwright)
*Deterministic suite (fixture backend, PR-gating):*
- [ ] New user asks a seeded question → answer streams with ≥ 1 citation → click chip → the transcript opens at the right timestamp with the turn highlighted and audio seeked.
- [ ] Follow-up in the same session resolves per the recorded rewrite fixture.
- [ ] Stop mid-stream → partial message kept; reload shows it marked Stopped (waits for server persistence).
- [ ] Session list: create, rename, delete, reopen with citations intact.
- [ ] Cross-tenant: a user from team B asking for team A's unique phrase gets `no_results` and no team A content in any DOM or network response.
- [ ] Quota: low-state banner, exhausted state, reset-time display; 429 handled identically.
- [ ] Error paths: model unavailable, timeout, connection drop with Retry using the same id (replay returns the stored answer), 409 in-flight, `SESSION_BUSY`, 401 with draft preservation.
- [ ] Logout, then a different user on the same browser sees none of the previous chat.
- [ ] Axe scan at each step.
- [ ] Runs on Chromium, Firefox and **WebKit** projects.

*Nightly live-model suite (small):* a handful of real questions end to end through the real BFF; asserts finish reason, ≥ 1 valid citation where expected, TTFT within the staging band, no buffering.

### 13.7 Accessibility
- [ ] Axe: zero serious/critical across empty, streaming, complete, error, drawer, popover, mobile sheet, dark mode, RTL.
- [ ] Manual SR script (VoiceOver macOS/iOS, NVDA): checklist committed and signed off.
- [ ] Keyboard-only full-flow run; focus order and focus return verified; reduced-motion verified; 200% zoom/320 px verified.

### 13.8 Visual states
- [ ] Screenshots for the §5.3 state matrix in light/dark, LTR/RTL, three breakpoints, with deterministic content; diffs reviewed by design.

### 13.9 Performance
- [ ] Interaction latency lab run with CPU throttling: INP < 200 ms for send, stop, chip hover/click, drawer open, session switch.
- [ ] Streaming a 700-token answer at a realistic rate: ≤ 1 commit per frame, no long tasks > 50 ms, zero layout shift.
- [ ] 100-message session render and older-page prepend with scroll preservation.
- [ ] Bundle budget check; the panel chunk absent from the initial load.
- [ ] 50× start/stop leak test.

### 13.10 Cross-browser and device matrix (manual, through the real proxy path)
| Platform | Checks |
|---|---|
| Chrome, Firefox (desktop) | Full flow; incremental streaming; abort |
| Safari (macOS) | Incremental streaming (no buffering), abort, fonts/RTL |
| **iOS Safari** (real device) | Streaming, keyboard-aware input, bottom sheet, Enter behavior, safe areas, background/foreground resume |
| Android Chrome (real device) | Same checks |

### 13.11 Definition-of-Done sign-off
- [ ] Every §1.3 item has linked evidence in the PR.
- [ ] All P0 tests green; contract and byte-fuzz suites green; E2E green on three engines.
- [ ] No regression in existing features (summary stream suite and the wider web suite).
- [ ] Coverage thresholds per existing convention (target ≥ 90% on new state/parsing/BFF modules); type checking strict on new code; lint clean including the dangerous-HTML ban.
- [ ] D-1…D-10 each have an owner and date; §3.3 amendments are filed or merged.

### 13.12 Premium layer tests (59C)
**Component (RTL, MSW fed by golden and extended transcripts)**
- [ ] Composer: auto-grow limits, paste handling, counter threshold, IME composition, touch Enter behavior, every disabled reason exposed as text.
- [ ] Scope and mentions: chips mirror `filters` exactly; keyboard-only operation; combobox semantics (`aria-activedescendant`, announced result count); lookup debounce, cache and escaped output; chip limits.
- [ ] Slash menu: templates insert exactly the reviewed text; nothing is sent without Enter. Quote-to-ask: chip creation, truncation at a word boundary, send formatting, removal, keyboard path.
- [ ] Activity timeline: live and collapsed states; expanded content restricted to pipeline facts (negative assertions); replayed responses.
- [ ] Toolbar and menus: roving focus, copy variants, feedback, Report issue, touch visibility, no layout shift.
- [ ] Sidebar: grouping across midnight, search highlight, rename, delete-confirm, collapse/resize persistence, keyboard map, generating indicator.
- [ ] Quick switcher or palette registration; shortcuts never fire inside fields; shortcuts dialog lists all.
- [ ] Export: Markdown and print output snapshots; footnotes with in-app links only; redacted sources; filename sanitization; large-history progress and cancel.
- [ ] Empty state, tiles, hints (once, dismissible, "don't show"), toasts, offline banner, skeletons, `ErrorCard` for every error code.
- [ ] **Capability gating (both states):** every Tier B component absent when its capability is false, correct when true; unknown capability flags ignored.
- [ ] Result cards: numbers equal the prose for every fixture; invalid `data` falls back to prose; plain-text rendering.
- [ ] Follow-ups: last message only, hidden on errors/`no_results`/replays, clicking sends a new message.
- [ ] Regenerate: disabled while streaming, counts one question, pager "2 of 3", Stop restores the previous variant.
- [ ] Peek: loading, redacted, error states; focus trap and return; plain text only.

**E2E (Playwright, deterministic fixture backend; Chromium, Firefox, WebKit)**
- [ ] `@` mention → scope chip → send → the request body's `filters` contain the selected ids and nothing else.
- [ ] Slash command inserts a template; Enter sends it.
- [ ] Select text in an answer → "Ask about this" → send → the user message contains the marked quote.
- [ ] Expand the activity timeline after an answer and verify steps and timings are present.
- [ ] Sidebar: search, rename, delete, reopen; export a conversation and verify the file's footnotes.
- [ ] Shortcuts: `/` focuses the composer, Cmd/Ctrl+K opens the switcher, Esc stops a running answer.
- [ ] Offline: banner shows, Send is disabled with a reason, and sending resumes on reconnect.
- [ ] Capability-absent run: the same flows without Tier B UI present and without errors; capability-present run with cards, follow-ups, regenerate and peek.

**Accessibility, visual and performance**
- [ ] Axe: zero serious/critical violations on every new surface and state (popovers, menus, dialogs, sheets, cards, banners), light/dark, LTR/RTL, desktop/mobile.
- [ ] Manual screen-reader script extended: use a mention, open the scope popover, expand the timeline, use the toolbar and version pager, navigate the sidebar, open peek.
- [ ] Visual states for the new components (including RTL and mobile sheets) reviewed by design.
- [ ] §12 budgets re-measured with the premium layer enabled: mention latency, sidebar at 500 sessions, no extra commits per frame, premium chunk lazy.

---

## 14. Release & Rollout Plan
1. **Dark launch:** the panel entry is hidden unless the chat flag is on for the team (Day 58's per-team flag through the existing flag system).
2. **Internal dogfood** with the telemetry dashboards watched: error codes by browser, watchdog/connection-lost (Safari), citation click-through, no-results rate, quota behavior.
3. **GA gates** (shared with Day 58): Q1 access decision implemented, Day 60 evaluation thresholds met, accessibility sign-off recorded, cross-browser matrix green on the production proxy path.
4. **Ramp:** staged percentages with automatic halt on error-rate or buffering signals.
5. **Rollback:** flag off hides the entry point immediately; the BFF routes are additive and inert without the feature; the extracted parser is covered by the summary suite.

---

## 15. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Streaming is buffered somewhere on the path (Safari, CDN, compression) | Med | High | B0 audit, real-path tests on every browser, buffering fallback option (D-10), connection-lost metric by browser |
| Cancellation does not propagate through the hosting platform | Med | High | Both abort paths tested; staging check against Day 58 cancel metrics |
| Day 58 amendments are not delivered in time | Med | Med | Frontend codes to the amended contract with documented fallbacks (client-side limits, quota from `usage` only, deep link by timestamp only) |
| Transcript viewer cannot support highlight/seek cleanly | Med | Med | B8 scoped explicitly; fallback to timestamp-only deep link |
| Extracting the shared parser regresses the summary feature | Low | High | Characterization tests first; unchanged behavior asserted |
| XSS or exfiltration via rendered model text | Low | **Critical** | Allowlist, disallowed links/images, no raw HTML, corpus tests, server-side scrubber |
| State leakage across users on shared devices | Low | **Critical** | Scoped keys, full reset on logout/team switch, tests |
| JWT format change breaks the existing summary stream | Med | High | Migration plan from B0, both paths verified, summary tests in the gate |
| Heuristic "unsupported" note erodes trust | Med | Med | D-5: strict display rule, flag, interaction telemetry |
| Accessibility regressions late in the day | Med | Med | A11y built into component work, not appended; axe in CI; manual script |
| RTL/Urdu rendering issues discovered late | Med | Med | RTL fixtures early (B6), visual states in both directions |
| Flaky E2E from live models | High if unaddressed | Med | Deterministic fixture mode for PR gating; live suite nightly and small |
| Bundle growth from markdown/preview libraries | Med | Low | Lazy loading, budget in CI |
| Premium scope delays the core day | High | Med | 59C is a separate sitting with its own gate; the core day is never blocked by it |
| Tier B backend capabilities land late or differently | Med | Med | Capability gating, extended golden fixtures, components finished before the backend; hidden when absent |
| Structured cards and prose disagree | Low | High | Single source object, equality tests on every fixture, prose-only fallback |
| Regenerate causes surprise quota consumption | Med | Med | Explicit "Uses 1 question" tooltip, quota update on completion, disabled during streams |
| Shortcut collisions with browsers or existing app shortcuts | Med | Low | B0 audit, central constants module, respect the app's keyboard setting |
| Mention/lookup exposes people or meetings the user should not see (Q1) | Med | High | Same access scope as retrieval; BFF-enforced; covered by the security tests |
| Feature density hurts the minimal feel | Med | Med | Quiet defaults (icons and tooltips, progressive disclosure), design review of every state, hints limited to three |

---

## 16. Handoff to Day 60

- **Data collected:** feedback ratings and reasons (with message ids) forming the evaluation backlog; client-measured first-event and first-token latency vs. server timings; citation click-through and sources-opened rates; no-results and unsupported-note interaction rates; error and watchdog rates by browser.
- **Evaluation inputs:** the deterministic E2E fixtures double as seed multi-turn scenarios; the nightly live suite is the seed of an end-to-end quality smoke run.
- **To calibrate with Day 60 results:** the D-5 unsupported-note threshold, suggestion quality, no-results copy effectiveness, chip design (D-1) using click-through data.
- **Open items passed on:** Tier C edit-with-branches (backend data model, §3.4), any Tier B capability not yet delivered by the backend, message-content search (needs reviewed indexing), virtualization threshold (D-2) if long histories appear in the data.
- **Premium-layer data for Day 60:** adoption of mentions, scope, slash commands, quote-to-ask, follow-ups, regenerate and export; timeline expansion rate; peek and card click-through; shortcut usage. These show which components earn their place and which to simplify.

---

## 17. Explicitly Out of Scope (Day 59)
- Backend changes beyond the small amendments listed in §3.3 (owned by Day 58)
- Offline faithfulness/quality evaluation, relevance calibration, and large evaluation sets (Day 60)
- Edit-and-resend with message branching (Tier C: designed in §5.12, not built); public share links for conversations (a privacy review is required first)
- Voice input, file or image attachments
- Voice dictation or voice mode (browser speech services may send meeting content to third parties, which needs a privacy decision first)
- Message-content search across chats (needs indexed chat text and a separate privacy review)
- Admin tooling to review conversations
- Native mobile apps (responsive web only)
- Resumable streams (replace-by-replay via the idempotent retry is the supported model)
