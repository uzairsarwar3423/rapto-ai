# Chat — privacy and access decisions

Status: **GA is BLOCKED on Q1.** The feature ships dark (`CHAT_ENABLED=false`) and can be enabled per team
(`CHAT_ENABLED_TEAM_IDS`) for internal dogfooding only until the items marked ❗ are decided and recorded here.

## Decided in code

| topic | decision |
|---|---|
| Tenant isolation | Postgres: FORCE RLS + a NOBYPASSRLS role + explicit `team_id` predicates; the role reads **views only** (migration 004), never core tables. Mongo: a repository base class injects `team_id` and `user_id` into every filter and every document, callers cannot supply them, and a guard test inspects every issued filter. Redis: every key carries a `{team}` hash tag. |
| Session ownership | Sessions/messages/feedback are owned by one user. A teammate's (or another team's) session id is a **404**, indistinguishable from a nonexistent one. |
| Stored citations | References + a ≤ 200-char preview are stored. Access is **re-checked on every history read**; previews of meetings the reader can no longer see (deleted, anonymized, access revoked) are blanked. A purge hook (`TeamAdmin.redact_meeting_sources`) is called by the meeting-deletion flow, and `TeamAdmin.purge_user` by user anonymization. |
| Retention | Soft-deleted sessions are purged after `CHAT_SESSION_RETENTION_DAYS` (30) with their messages and feedback; empty sessions after 24 h. |
| Logs | No message text, chunk text, previews or titles at INFO. Logs carry ids, counts, flags, timings, cost. Validation failures log field *locations* only. |
| Output | Model output is scrubbed in-stream: no images, links, bare URLs or HTML; unknown citation ids removed; a canary token in the system prompt blocks prompt leakage (page on `chat_canary_trip_total`). |
| End-user cost display | Token counts and quota remaining only; **dollars are never sent to end users** (Q7). |
| Admin access to others' chats | **Not available.** No endpoint, no role bypass. |

## Open decisions (owner + decision date required before GA)

| # | question | recommendation | owner / date |
|---|---|---|---|
| ❗ Q1 | Within-team visibility of meetings. `team_wide` (today's product behaviour) or `attendee_only`? | Decide per product policy. `CHAT_ACCESS_SCOPE_MODE=attendee_only` is **implemented** end to end (retrieval, analytics counts, hydration, history redaction, suggestions) using the attendee set (cap 5,000 meetings). For larger teams add migration 005 (indexed `meeting_id` column on `rag.embeddings` + access-view join). | _TBD_ |
| Q4 | Do `no_results`, chitchat, out-of-scope count toward the daily query quota? | No (their dollars still hit the monthly ceiling; the per-minute rate limit applies). Implemented as `CHAT_COUNT_NO_RESULTS_AS_QUERY=false`, `CHAT_COUNT_CHITCHAT_AS_QUERY=false`. | _TBD_ |
| Q5 | Daily quota boundary: UTC or team timezone? | Team timezone (implemented; the boundary comes from the JWT `tz` claim). | _TBD_ |
| ❗ Q6 | Is "fail open with a local rate limit for paid plans during a Redis outage" acceptable? | Implemented behind `CHAT_FAIL_OPEN_PAID_PLANS` (default true): free plan fails closed (`QUOTA_UNAVAILABLE`); paid plans proceed, are marked `unmetered` in the ledger, and counters heal from the ledger afterwards. Needs finance sign-off. | _TBD_ |
| Q7 | Show dollar cost to end users? | No (implemented). | _TBD_ |
| ❗ Q8 | Data-processing terms for sending transcript content to the model provider(s): retention, region, training opt-out. | Review the provider DPA before GA. Only OpenAI is wired today; adding Google needs a second review. | _TBD_ |
| Q9 | Break-glass admin access to a user's chat (legal hold) and retention periods. | Not built. If required: an audited, time-boxed, two-person path, never a standing role. | _TBD_ |

## Scope policy (what the assistant answers)

In scope: the team's meetings — what was said, decided, promised, who owns what, what is overdue — and short drafts
(follow-ups, agendas) **based on** those sources. Out of scope (declined in one friendly sentence): general trivia, creative
writing, coding help. Out-of-scope is **soft**: a request phrased as an instruction ("draft a follow-up to Ahmed about his
commitments") is in scope; the classifier must be confident (≥ 0.8) to refuse.
