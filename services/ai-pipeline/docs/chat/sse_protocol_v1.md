# Chat SSE protocol v1 (the Day 59 contract)

Source of truth for the chat UI and the Node BFF. Golden transcripts live in
`tests/fixtures/golden_sse_transcripts/` and are validated against the event schemas and the ordering rules in CI
(`tests/chat/contract/test_sse_contract.py`). Build the client against the transcripts first.

## 1. Transport

`POST /chat/query` — `Content-Type: application/json`, response `text/event-stream`. Because it is a POST, the
browser's `EventSource` cannot be used: use `fetch` with a streaming body reader and an `AbortController`.

Response headers: `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `Content-Encoding: identity`,
`Connection: keep-alive`. **The BFF must not buffer or compress this route and must abort the upstream request when the
browser disconnects** (otherwise the model keeps generating and the user is billed for text nobody reads).

Authentication: `Authorization: Bearer <service JWT>` signed by the BFF (see §8). The AI service is reachable only on the
private network. Identity (`team_id`, `user_id`, role, plan, timezone) comes **only** from the verified claims.

## 2. Request

```json
{ "session_id": "uuid|null", "message": "1..2000 chars", "client_message_id": "uuid",
  "filters": { "meeting_ids": [≤50], "speaker_ids": [≤50], "date_from": "YYYY-MM-DD", "date_to": "YYYY-MM-DD" } }
```

* Unknown fields are rejected (422). `client_message_id` is required and is the **idempotency key** (§5).
* `session_id: null` starts a conversation (created lazily when the first message is accepted).
* Ids in `filters` that do not belong to the caller are **dropped silently** (indistinguishable from nonexistent ids).
  If *every* requested meeting id is dropped the search covers nothing (it does not widen to the whole team).
* A date range typed in the question ("last week") is **intersected** with `filters`; the UI filter is the outer bound.
  The range actually applied is echoed in the `status` event (`detail.date_range`) so a misread is visible.

## 3. Events

Every event is `event: <name>\ndata: <json>\n\n`. `data` always contains `"v": 1`. **Clients must ignore unknown events
and unknown fields** (forward compatibility). A line starting with `:` is a comment (`: ping` heartbeat, every 15 s).

| event | data (besides `v`) | notes |
|---|---|---|
| `meta` | `request_id, session_id, message_id, replayed` | first event. `message_id` = id of the assistant message that will be stored. |
| `status` | `stage` ∈ `rewriting, searching, reading, answering`; optional `detail` | `detail` may carry `question` (the interpreted standalone question), `date_range {from,to,label,convention}`, `people [{mention,names}]`. |
| `sources` | `sources: SourceItem[]` | emitted **after** context building: exactly the sources the model sees. Ids `S1…Sn`, contiguous, in rank order. |
| `token` | `t` | text is already scrubbed: markers valid, no links/images/HTML. |
| `citations` | `valid[], removed[], grounded, flags[]` | `removed` is informational (hallucinated marker ids the scrubber stripped). `grounded=false` ⇒ show a soft "verify" hint. |
| `usage` | `input_tokens, output_tokens, quota_remaining` | **no dollars** (admins see cost elsewhere). |
| `done` | `finish_reason` ∈ `stop, no_results, cancelled, length, filtered` | terminal. |
| `error` | `code` ∈ `MODEL_UNAVAILABLE, TIMEOUT, CONTENT_FILTERED, INTERNAL`, `message`, `retryable` | terminal; replaces `usage`/`done`. |

`SourceItem`: `{source_id:"S3", type, meeting_id, meeting_title, commitment_id?, speaker, start_ms, end_ms, occurred_at, preview}`.
`type` ∈ `transcript_chunk, commitment, action_item, decision, summary, digest, analytics`. **Analytics** sources carry
`{tool, params, as_of}` instead (use `tool`+`params` to deep-link a filtered list). `preview` is plain text — **escape it**.

### Ordering (enforced server-side, validated by the contract tests)

```
meta → status* → [sources] → status(answering)? → token* → citations → usage → done        (grounded answer)
meta → token* → done                                                                       (chitchat / out of scope)
meta → status* → token* → done(no_results)                                                 (deterministic message, no sources)
… → error                                                                                   (error is always last)
```

`no_results`: the server made **zero** answer-model calls; `token` carries a fixed message. `length`: the answer was cut by
the output cap — show a truncation note. `filtered`: provider safety or the leak guard fired — the text is a safe message.

## 4. Rendering rules (mandatory)

* Render plain text and a small markdown subset only: paragraphs, bullet lists, **bold**, *italic*.
* **Never render images, links or HTML from message text**, and escape titles/previews. The server strips them in-stream, but
  the UI is the second line of defence (markdown exfiltration).
* `[S#]` markers map to `sources` by id. Unknown ids cannot occur.
* On `error` after tokens: mark the partial text as incomplete; the server has stored it with `finish_reason=error`.

## 5. Idempotency (`client_message_id`, scoped to team + user)

| state of the id | behavior | charge |
|---|---|---|
| unknown | new run | reserve → commit |
| in flight | `409 DUPLICATE_IN_FLIGHT` (+`request_id`) — wait, then read history | none |
| completed | **replay**: `meta.replayed=true`, then sources, the stored text, citations, usage, done | none |
| failed / cancelled | new run on the same user message, new assistant message | new reservation |
| in flight but the run died (lease expired) | treated as failed | new reservation |

Retries reuse the **same** `client_message_id`; a new question gets a new one. `Last-Event-ID` resume is **not** supported
(replay-by-id replaces it).

## 6. Pre-stream HTTP errors (no stream is opened)

Body: `{"error": {"code", "message", "retryable", "retry_after_s"?}}` plus `Retry-After` when applicable.

| status | code | meaning |
|---|---|---|
| 401 | `UNAUTHENTICATED` | bad/expired/forged service JWT (always the same generic body) |
| 403 | `FORBIDDEN` | plan/feature not allowed |
| 404 | `NOT_FOUND` | unknown **or foreign** session/message (never 403 — no existence oracle) |
| 409 | `DUPLICATE_IN_FLIGHT`, `SESSION_BUSY` | same id already running / another answer is being written in this session |
| 422 | `INVALID_INPUT` | validation (control/bidi characters are stripped; over-long text is **rejected**, not truncated) |
| 429 | `RATE_LIMITED`, `TOO_MANY_STREAMS`, `QUOTA_EXCEEDED` | `Retry-After` / `retry_after_s` (quota: seconds to the team-timezone midnight) |
| 503 | `MODEL_UNAVAILABLE`, `FEATURE_DISABLED`, `QUOTA_UNAVAILABLE`, `SERVICE_UNAVAILABLE` | breaker open / kill switch / quota store down on the free plan / a dependency is down |

`QUOTA_UNAVAILABLE` and `SERVICE_UNAVAILABLE` are additions to the original spec (documented here as contract).

## 7. Other endpoints

| route | notes |
|---|---|
| `GET /chat/sessions?limit&cursor` | newest first; opaque signed cursors; `limit` clamped to 50 |
| `GET /chat/sessions/{id}/messages?limit&cursor` | items are **chronological within a page**; `next_cursor` pages toward **older** messages. Source previews of meetings the caller can no longer see are blanked (`redacted:true`). |
| `PATCH /chat/sessions/{id}` `{title}` | 1–120 chars |
| `DELETE /chat/sessions/{id}` | soft delete, idempotent, 204 |
| `POST /chat/messages/{id}/feedback` `{rating:up|down, reason?, comment?}` | upsert; only on your own assistant messages; 204 |
| `GET /chat/suggestions` | 4–6 deterministic items from the caller's accessible data (static fallback for an empty team) |

## 8. BFF → AI service JWT

`Authorization: Bearer`, header `{alg: RS256 (or another asymmetric alg configured in INTERNAL_JWT_ALGORITHMS), kid}`,
claims `iss=vocaply-bff`, `aud=vocaply-ai-chat`, `iat`, `exp` (**≤ 60 s** after `iat`), `team_id`, `user_id`, `role`,
`plan` (`FREE|PRO|BUSINESS|ENTERPRISE`), `tz` (IANA, e.g. `Asia/Karachi`), optional `rid` (request id, propagated into logs).
The AI service holds a key **set** by `kid`, so rotation needs no downtime. `none`, HS* and algorithm confusion are rejected.
