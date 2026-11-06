# Chat runbook (Day 58)

## Enable (dark launch first)

1. **Prerequisites:** RAG is enabled and healthy (`RAG_ENABLED=true`, runtime role DSN, migrations 001–003 applied) and the
   Day 56/57 embeddings exist for the team. Redis and Mongo are reachable.
2. **Apply migration 004** (admin/owner DSN, session connection): `python -m src.rag.migrate up`, or paste
   `migrations/supabase_sql_editor_apply_all.sql` (regenerate it first: `python scripts/build_supabase_sql.py`) into the Supabase
   SQL editor. It needs the Prisma tables `commitments, action_items, meetings, users, meeting_participants` and fails
   loudly otherwise. It is **not** applied automatically by a deploy.
3. **Env:** `INTERNAL_JWT_PUBLIC_KEYS='{"k1":"-----BEGIN PUBLIC KEY-----…"}'` (kid → PEM; the BFF signs with the private key),
   `INTERNAL_JWT_ISSUER`, `INTERNAL_JWT_AUDIENCE`, then `CHAT_ENABLED_TEAM_IDS=<internal team>` (global flag stays false).
   The service refuses to start if chat is enabled without RAG or without JWT keys, or if the Mongo indexes cannot be ensured.
4. **Verify:** `python scripts/chat_smoke.py` through the BFF (gate: first event p95 < 300 ms, TTFT p50 ≤ 2.5 s / p95 ≤ 5 s, no
   buffering suspects). Check `chat_leak_detected_total == 0`.
5. **GA** is blocked on Q1 (see `privacy_decisions.md`), the Day 60 evaluation, cost per query within budget, and a rehearsed runbook.
   Ramp 5% → 25% → 100% with automatic halt on an SLO breach or **any** canary trip.

## Kill switch

`CHAT_DISABLED_TEAM_IDS=<ids>` (per team, wins over everything) or `CHAT_ENABLED=false` (global). New requests get
`503 FEATURE_DISABLED`; in-flight streams finish. No deploy is needed beyond an env change + restart.

## Alerts and first actions

| alert | meaning | action |
|---|---|---|
| `chat_canary_trip_total` > 0 (**page**) | the model emitted the system-prompt canary: prompt leak or injection | grab the request id from logs (`chat_canary_tripped`), review the source meeting/title that triggered it, consider the per-team kill switch |
| `chat_leak_detected_total` > 0 | a lease release failed (TTL will expire it) | check Redis health; leases self-heal in ≤ 30 s |
| `chat_unsafe_markup_after_scrub_total` > 0 | the streaming scrubber missed something | treat as a security bug: capture the persisted message, add it to the splice/fuzz fixtures |
| breaker open > 2 min (`chat_breaker_open`) | provider 5xx/429/timeouts | requests fast-fail with 503; check provider status; the breaker half-opens by itself |
| `chat_unmetered_total` > 0 | Redis was down; paid plans ran without counters | after recovery run `scripts/reconcile_quota.py --team … --apply`; ledger rows are marked `unmetered` |
| `chat_persist_failed_total` > 0 | an answer was shown but could not be stored | check Mongo; the user's history will lack that answer |
| `chat_estimator_error_ratio` > 15% | token estimator drift (Urdu script especially) | recalibrate `token_estimator._CHARS_PER_TOKEN` |
| ledger outbox depth growing (`LedgerOutbox.depth`) | Postgres writes failing | rows are safe in Redis (or the in-memory spill); fix Postgres, the flusher drains automatically |

## Quota repair

Redis holds fast counters; `rag.chat_usage_ledger` is authoritative. After a Redis failover or suspicious lockouts:
`python scripts/reconcile_quota.py --team <id> --tz <tz>` (report) then `--apply` (rebuild). Reservations of crashed pods expire by TTL
(`CHAT_RESERVATION_TTL_S`) and are reaped inline by the next reserve.

## Prompts

`src/prompts/chat_*.txt` carry `# prompt_version:`; the version is stored on every assistant message
(`prompt_versions`). `tests/chat/unit/test_prompts_and_gate.py` pins each file's hash: editing a prompt requires bumping its version and the
pinned hash. Roll back by reverting the file; no migration is involved.

## Deviations from the Day 58 plan (deliberate)

* **Model provider:** OpenAI (the project's provider) behind a `ChatStreamer` Protocol; the plan's Gemini client (A1) is a second implementation of the same Protocol and was not built.
* **`ai_usage` ledger (A3):** it did not exist, so migration 004 creates `rag.chat_usage_ledger`.
* **Date ranges:** Day 51's `date_parser` resolves deadline instants, not ranges; ranges are resolved by `services/chat/date_ranges.py` (documented conventions, echoed to the UI).
* **Retrieval failure** (timeout/unavailable) with no analytics source ends as `error(TIMEOUT|INTERNAL)`, not `no_results`: telling the user "nothing found" when the search broke would be false.
* **Speaker filter:** Day 57 supports one equality metadata filter, so exactly one `speaker_id` is applied; more than one is ignored with a note (needs the Day 56 `speaker_user_ids[]` amendment).
* **Owner "hard filter":** commitments for a resolved person come from the authoritative `find_commitments` tool (live status); transcripts get a lexical boost with the canonical name.
* **Cleanup order:** persist → quota → ledger enqueue → terminal events happen in the shielded finalizer; leases then the ledger flush run from the cleanup registry (LIFO).

## Not built / follow-ups

Migration 005 (`meeting_id` column for large `attendee_only` teams), the Gemini streamer, the cross-encoder re-ranker, the Day 60 faithfulness judge,
and the BFF changes (JWT signing, no buffering/compression on this route, abort upstream on disconnect — assumption A5, verify with `chat_smoke.py`).
