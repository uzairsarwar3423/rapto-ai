"""
P0: cross-tenant isolation across ALL stores the chat touches — Mongo, Redis, caches, quota, leases — plus the Q1
within-team access scope. (Postgres RLS-only isolation against a real server: tests/chat/integration/test_pg_chat.py.)
"""

from __future__ import annotations

import asyncio
import random
import re
import uuid

import pytest

from src.models.chat_models import ChatFilters
from src.models.rag_models import AccessScope
from src.services.chat.errors import NotFoundError, QuotaExceededError
from src.services.chat.suggestions import SuggestionService
from tests.chat.conftest import make_claims
from tests.chat.harness import make_harness, streamed_text
from tests.chat.helpers import FakeRetriever, FakeStore, FakeStreamer, make_chunk, make_retrieval, meeting

pytestmark = pytest.mark.asyncio
USERS = [("teamA", "userA1"), ("teamA", "userA2"), ("teamB", "userB1"), ("teamB", "userB2")]


class TeamTaggedRetriever(FakeRetriever):
    """Returns chunks whose text names the team that ASKED. If the chat layer ever passed the wrong team_id (or reused
    another request's state), the tag in the answer would not match the caller."""

    def __init__(self) -> None:
        super().__init__(None)

    async def retrieve(self, query_text, team_id, **kw):
        self.calls.append({"query": query_text, "team_id": team_id, **kw})
        chunk = make_chunk(f"[{team_id}] Ahmed will ship billing by Friday", meeting_id="m1")
        return make_retrieval([chunk])


async def test_100_randomized_queries_never_mix_tenants_in_any_store():
    h = await make_harness(settings_kw=dict(chat_rate_limit_per_min=600, chat_team_rate_limit_per_min=6000, chat_daily_limit_pro=500))
    h.deps.retriever = TeamTaggedRetriever()
    h.svc.d.retriever = h.deps.retriever
    rng = random.Random(7)
    sessions: dict[tuple[str, str], str] = {}
    for _ in range(100):
        team, user = rng.choice(USERS)
        claims = make_claims(team=team, user=user)
        sid = sessions.get((team, user))
        frames, prepared = await h.query(req=h.request("What did Ahmed commit to?", session_id=sid), claims=claims)
        sessions[(team, user)] = prepared.accepted.session_id
        assert h.deps.retriever.calls[-1]["team_id"] == team                       # identity came from the claims, every time
        other = "teamB" if team == "teamA" else "teamA"
        sources = [f for f in frames if f.event == "sources"][0].data["sources"]
        assert all(other not in (s["preview"] or "") for s in sources) and f"[{team}]" in sources[0]["preview"]
        assert other not in h.streamer.last_user

    # Mongo: every document carries the tenant it was written for, and content never crosses
    for coll in ("chat_sessions", "chat_messages"):
        async for d in h.db[coll].find({}):
            assert d["team_id"] in ("teamA", "teamB") and d["user_id"] in {u for _, u in USERS}
            assert d["team_id"] == ("teamA" if d["user_id"].startswith("userA") else "teamB"), d
    async for d in h.db["chat_messages"].find({"role": "assistant"}):
        for ref in d["source_refs"]:
            assert f"[{d['team_id']}]" in ref["preview"]

    # Redis: every key is namespaced `{team}` (hash-tagged); nothing is shared across teams except the global outbox
    keys = [k.decode() for k in await h.redis.keys("*")]
    assert keys
    for k in keys:
        assert k == "chat:ledger:outbox" or re.match(r"^chat:\{team[AB]\}:", k), k
    for k in keys:
        if k.startswith("chat:{teamA}"):
            assert "userB" not in k
        if k.startswith("chat:{teamB}"):
            assert "userA" not in k


async def test_same_session_and_message_ids_across_teams_are_independent_and_unreadable():
    h = await make_harness()
    _, pa = await h.query(claims=make_claims(team="teamA", user="u1"))
    sid = pa.accepted.session_id
    with pytest.raises(NotFoundError):                                              # same user id, other team
        await h.deps.repo_factory("teamB", "u1").get_session(sid)
    with pytest.raises(NotFoundError):                                              # same team, other user
        await h.deps.repo_factory("teamA", "u2").get_session(sid)
    cmid = str(uuid.uuid4())                                                         # the same client_message_id in two teams: two runs
    fa, _ = await h.query(claims=make_claims(team="teamA", user="u1"), req=h.request(client_id=cmid))
    fb, pb = await h.query(claims=make_claims(team="teamB", user="u1"), req=h.request(client_id=cmid))
    assert fa[0].data["replayed"] is False and fb[0].data["replayed"] is False


async def test_quota_leases_and_rate_limits_are_per_team():
    h = await make_harness(settings_kw=dict(chat_daily_limit_pro=1, chat_rate_limit_per_min=1))
    await h.query(claims=make_claims(team="teamA", user="u1"))
    with pytest.raises(Exception):                                                  # team A is out of quota / rate
        await h.prepare(make_claims(team="teamA", user="u1"))
    frames, _ = await h.query(claims=make_claims(team="teamB", user="u1"))          # team B is untouched
    assert frames[-1].data["finish_reason"] == "stop"


async def test_suggestion_cache_is_keyed_by_team_user_and_scope():
    store = FakeStore(meetings=dict([meeting("m1", "Team A secret board meeting")]))
    store.overdue = 3
    h = await make_harness(store=store)
    svc = SuggestionService(h.redis, store, h.settings)
    a = await svc.get(team_id="teamA", user_id="u1", tz="UTC", today=None, scope=AccessScope())
    assert "Which commitments are overdue?" in a and any("secret board" in s for s in a)
    store.overdue, store.meetings = 0, {}                                            # team B has nothing
    b = await svc.get(team_id="teamB", user_id="u1", tz="UTC", today=None, scope=AccessScope())
    assert "Which commitments are overdue?" not in b and not any("secret board" in s for s in b)
    other_user = await svc.get(team_id="teamA", user_id="u2", tz="UTC", today=None, scope=AccessScope())
    assert not any("secret board" in s for s in other_user)                          # cached per user, not per team
    scoped = await svc.get(team_id="teamA", user_id="u1", tz="UTC", today=None, scope=AccessScope(kind="meetings", meeting_ids=["x"]))
    assert not any("secret board" in s for s in scoped)                              # cached per access scope


# ─── Q1: within-team access scope ─────────────────────────────────────────────


class ScopedRetriever(FakeRetriever):
    """Applies the access scope the way the SQL layer does."""

    def __init__(self, chunks):
        super().__init__(None)
        self.chunks = chunks

    async def retrieve(self, query_text, team_id, **kw):
        self.calls.append({"query": query_text, "team_id": team_id, **kw})
        allowed = kw["filters"].effective_meeting_ids
        kept = [c for c in self.chunks if allowed is None or c.chunk.metadata["meeting_id"] in allowed]
        return make_retrieval(kept, no_context=not kept)


async def test_attendee_only_hides_private_meeting_content_everywhere():
    chunks = [make_chunk("Public: the launch is on Friday.", meeting_id="m-public", rank=1),
              make_chunk("PRIVATE 1:1: Sara's salary is being renegotiated.", meeting_id="m-private", rank=2, index=1)]
    store = FakeStore(meetings=dict([meeting("m-public", "All hands"), meeting("m-private", "Sara 1:1 salary")]),
                      users={"u1": "Ahmed Khan"}, attended={"userA1": ["m-public"]}, overdue=2)
    h = await make_harness(store=store, settings_kw=dict(chat_access_scope_mode="attendee_only"))
    h.svc.d.retriever = ScopedRetriever(chunks)
    frames, _ = await h.query("what is happening with salaries?")
    blob = h.streamer.last_user + streamed_text(frames) + str([f.data for f in frames if f.event == "sources"])
    assert "PRIVATE" not in blob and "salary" not in blob.lower() and "m-private" not in blob
    assert "launch is on Friday" in blob

    # a UI filter naming the private meeting is dropped silently, exactly like a nonexistent id
    f_private, _ = await h.query(req=h.request("what was said", filters=ChatFilters(meeting_ids=["m-private"])))
    f_ghost, _ = await h.query(req=h.request("what was said", filters=ChatFilters(meeting_ids=["ghost"])))
    strip = lambda fs: [(f.event, {k: v for k, v in f.data.items() if k not in ("request_id", "session_id", "message_id")}) for f in fs]  # noqa: E731
    assert strip(f_private) == strip(f_ghost)

    # suggestions never offer the private meeting; analytics SQL is scoped; history re-check hides it
    assert not any("salary" in s.lower() for s in await SuggestionService(h.redis, store, h.settings).get(
        team_id="teamA", user_id="userA1", tz="UTC", today=None, scope=AccessScope(kind="meetings", meeting_ids=["m-public"])))
    await h.query("how many open commitments do we have?")
    sql, args = store.analytics_calls[-1]
    assert "meeting_id = ANY(" in sql and ["m-public"] in args
    visible = await store.visible_meetings("teamA", ["m-public", "m-private"], AccessScope(kind="meetings", meeting_ids=["m-public"]))
    assert visible == {"m-public"}


async def test_team_wide_mode_is_the_default_and_unrestricted():
    store = FakeStore(meetings=dict([meeting("m1"), meeting("m2")]))
    h = await make_harness(store=store)
    await h.query()
    assert h.retriever.calls[0]["filters"].access_scope.kind == "team"


async def test_attendee_with_zero_meetings_searches_nothing():
    store = FakeStore(meetings=dict([meeting("m1")]), attended={})
    h = await make_harness(store=store, settings_kw=dict(chat_access_scope_mode="attendee_only"))
    h.svc.d.retriever = ScopedRetriever([make_chunk("secret", meeting_id="m1")])
    frames, _ = await h.query("anything")
    assert h.streamer.calls == 0 and frames[-1].data["finish_reason"] == "no_results" and "secret" not in streamed_text(frames)
