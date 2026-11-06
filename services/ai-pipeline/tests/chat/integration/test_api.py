"""HTTP layer: JWT auth, SSE over ASGI, error mapping, owner scoping, history redaction, suggestions."""

from __future__ import annotations

import json
import time
import uuid
from types import SimpleNamespace

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from src.api.internal_auth import InternalJWTVerifier
from src.api.routes import chat as chat_routes
from src.middleware.error_handler import request_validation_error_handler
from src.services.chat.errors import ChatError
from src.services.chat.suggestions import SuggestionService
from tests.chat.conftest import make_settings
from tests.chat.harness import Harness, make_harness, parse_frames

pytestmark = pytest.mark.asyncio

_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PRIV = _KEY.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
PUB = _KEY.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
_OTHER = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_PRIV = _OTHER.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()


def token(team="teamA", user="userA1", plan="PRO", tz="Asia/Karachi", priv=PRIV, **over) -> str:
    now = int(time.time())
    claims = dict(iss="vocaply-bff", aud="vocaply-ai-chat", iat=now, exp=now + 30, team_id=team, user_id=user, role="MEMBER",
                  plan=plan, tz=tz)
    claims.update(over)
    return jwt.encode(claims, priv, algorithm="RS256", headers={"kid": "k1"})


def hdr(**kw) -> dict[str, str]:
    return {"Authorization": f"Bearer {token(**kw)}"}


def make_app(h: Harness, *, runtime: bool = True) -> FastAPI:
    app = FastAPI()
    app.add_exception_handler(ChatError, chat_routes.chat_error_handler)            # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, request_validation_error_handler)   # type: ignore[arg-type]
    app.include_router(chat_routes.router)
    verifier = InternalJWTVerifier(h.settings, key_set={"k1": PUB})
    app.state.chat_jwt_verifier = verifier
    app.state.chat = SimpleNamespace(
        service=h.svc, verifier=verifier, settings=h.settings, repo_factory=h.deps.repo_factory, store=h.store,
        suggestions=SuggestionService(h.redis, h.store, h.settings)) if runtime else None
    return app


@pytest.fixture
async def h():
    return await make_harness()


@pytest.fixture
async def client(h):
    transport = httpx.ASGITransport(app=make_app(h))
    async with httpx.AsyncClient(transport=transport, base_url="http://ai") as c:
        yield c


def body(message="What did Ahmed commit to?", **kw):
    return {"message": message, "client_message_id": str(uuid.uuid4()), **kw}


# ─── auth ─────────────────────────────────────────────────────────────────────


async def test_missing_forged_expired_and_wrong_audience_tokens_are_401_with_one_generic_body(client):
    forged = {"Authorization": f"Bearer {token(priv=OTHER_PRIV)}"}
    expired = {"Authorization": f"Bearer {token(exp=int(time.time()) - 100, iat=int(time.time()) - 130)}"}
    wrong_aud = {"Authorization": f"Bearer {token(aud='someone-else')}"}
    bodies = []
    for headers in ({}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer garbage"}, forged, expired, wrong_aud):
        r = await client.post("/chat/query", json=body(), headers=headers)
        assert r.status_code == 401
        bodies.append(r.json())
    assert all(b == bodies[0] for b in bodies) and bodies[0]["error"]["code"] == "UNAUTHENTICATED"
    for path in ("/chat/sessions", "/chat/suggestions"):
        assert (await client.get(path)).status_code == 401


async def test_identity_cannot_be_supplied_in_the_body(client):
    r = await client.post("/chat/query", json=body(team_id="teamB", user_id="victim"), headers=hdr())
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_INPUT"


# ─── query over HTTP ──────────────────────────────────────────────────────────


async def test_query_streams_sse_with_the_required_headers_and_a_valid_event_sequence(client, h):
    r = await client.post("/chat/query", json=body(), headers=hdr())
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    assert "no-transform" in r.headers["cache-control"] and r.headers["x-accel-buffering"] == "no"
    assert r.headers["content-encoding"] == "identity"
    frames = parse_frames([chunk.encode() for chunk in r.text.split("\n\n") if chunk.strip() and not chunk.startswith(":")]
                          and [(c + "\n\n").encode() for c in r.text.split("\n\n") if c.strip()])
    assert frames[0].event == "meta" and frames[-1].event == "done"


async def test_validation_error_never_echoes_the_users_message(client):
    r = await client.post("/chat/query", json={"message": "TOP-SECRET-DEAL-TERMS", "client_message_id": "not-a-uuid"}, headers=hdr())
    assert r.status_code == 422 and "TOP-SECRET-DEAL-TERMS" not in r.text
    assert r.json()["error"]["fields"] == ["client_message_id"]


async def test_quota_and_rate_limit_map_to_429_with_retry_after():
    h = await make_harness(settings_kw=dict(chat_daily_limit_pro=1))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=make_app(h)), base_url="http://ai") as c:
        assert (await c.post("/chat/query", json=body(), headers=hdr())).status_code == 200
        r = await c.post("/chat/query", json=body(), headers=hdr())
        assert r.status_code == 429 and r.json()["error"]["code"] == "QUOTA_EXCEEDED" and int(r.headers["retry-after"]) > 0
    h2 = await make_harness(settings_kw=dict(chat_rate_limit_per_min=1))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=make_app(h2)), base_url="http://ai") as c:
        await c.post("/chat/query", json=body(), headers=hdr())
        r = await c.post("/chat/query", json=body(), headers=hdr())
        assert r.status_code == 429 and r.json()["error"]["code"] == "RATE_LIMITED" and "retry-after" in r.headers


async def test_kill_switch_and_runtime_not_started_are_503_feature_disabled():
    h = await make_harness(settings_kw=dict(chat_enabled=False, chat_enabled_team_ids="teamZ"))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=make_app(h)), base_url="http://ai") as c:
        r = await c.post("/chat/query", json=body(), headers=hdr())
        assert r.status_code == 503 and r.json()["error"]["code"] == "FEATURE_DISABLED"
        assert (await c.post("/chat/query", json=body(), headers=hdr(team="teamZ"))).status_code == 200      # per-team override
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=make_app(await make_harness(), runtime=False)), base_url="http://ai") as c:
        assert (await c.post("/chat/query", json=body(), headers=hdr())).json()["error"]["code"] == "FEATURE_DISABLED"


# ─── sessions: owner scoping ──────────────────────────────────────────────────


async def _session(client, **kw) -> str:
    r = await client.post("/chat/query", json=body(), headers=hdr(**kw))
    meta = r.text.split("\n\n")[0].split("data: ")[1]
    return json.loads(meta)["session_id"]


async def test_foreign_sessions_are_404_never_403_on_every_route(client):
    sid = await _session(client)
    other = hdr(user="userA2")
    other_team = hdr(team="teamB", user="userA1")
    for headers in (other, other_team):
        assert (await client.get(f"/chat/sessions/{sid}/messages", headers=headers)).status_code == 404
        assert (await client.patch(f"/chat/sessions/{sid}", json={"title": "pwned"}, headers=headers)).status_code == 404
        assert (await client.delete(f"/chat/sessions/{sid}", headers=headers)).status_code == 404
        r = await client.post("/chat/query", json=body(session_id=sid), headers=headers)
        assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
        assert (await client.get("/chat/sessions", headers=headers)).json()["items"] == []
    assert (await client.get("/chat/sessions/%24%7Bjndi%7D/messages", headers=hdr())).status_code == 404       # malformed id ≡ unknown id
    mine = await client.get("/chat/sessions", headers=hdr())
    assert [s["id"] for s in mine.json()["items"]] == [sid]


async def test_history_pagination_rename_delete_and_feedback_flow(client, h):
    sid = None
    for i in range(3):
        r = await client.post("/chat/query", json=body(f"question {i}", **({"session_id": sid} if sid else {})), headers=hdr())
        sid = sid or json.loads(r.text.split("\n\n")[0].split("data: ")[1])["session_id"]
    page = (await client.get(f"/chat/sessions/{sid}/messages?limit=4", headers=hdr())).json()
    assert len(page["items"]) == 4 and page["next_cursor"]
    older = (await client.get(f"/chat/sessions/{sid}/messages?limit=4&cursor={page['next_cursor']}", headers=hdr())).json()
    assert len(older["items"]) == 2 and older["next_cursor"] is None
    texts = [m["content"] for m in older["items"] + page["items"] if m["role"] == "user"]
    assert texts == ["question 0", "question 1", "question 2"]                      # complete and chronological across pages
    assert (await client.get(f"/chat/sessions/{sid}/messages?cursor=garbage", headers=hdr())).status_code == 422

    assistant = [m for m in page["items"] if m["role"] == "assistant"][-1]
    assert assistant["sources"] and assistant["finish_reason"] == "stop"
    assert (await client.post(f"/chat/messages/{assistant['id']}/feedback", json={"rating": "down", "reason": "inaccurate"}, headers=hdr())).status_code == 204
    assert (await client.post(f"/chat/messages/{assistant['id']}/feedback", json={"rating": "up"}, headers=hdr(user="userA2"))).status_code == 404
    assert (await client.post(f"/chat/messages/{assistant['id']}/feedback", json={"rating": "meh"}, headers=hdr())).status_code == 422
    again = (await client.get(f"/chat/sessions/{sid}/messages?limit=2", headers=hdr())).json()
    assert [m for m in again["items"] if m["id"] == assistant["id"]][0]["feedback"] == "down"

    renamed = await client.patch(f"/chat/sessions/{sid}", json={"title": "Billing chat"}, headers=hdr())
    assert renamed.json()["title"] == "Billing chat"
    assert (await client.delete(f"/chat/sessions/{sid}", headers=hdr())).status_code == 204
    assert (await client.delete(f"/chat/sessions/{sid}", headers=hdr())).status_code == 204            # idempotent
    assert (await client.get(f"/chat/sessions/{sid}/messages", headers=hdr())).status_code == 404


async def test_history_redacts_sources_of_meetings_that_are_no_longer_visible(client, h):
    sid = await _session(client)
    before = (await client.get(f"/chat/sessions/{sid}/messages", headers=hdr())).json()["items"][-1]["sources"]
    assert before and before[0]["preview"] and before[0]["meeting_title"] == "Weekly Standup"
    h.store.meetings.pop("m1")                                                       # the meeting was deleted afterwards
    after = (await client.get(f"/chat/sessions/{sid}/messages", headers=hdr())).json()["items"][-1]["sources"]
    redacted = [s for s in after if s["meeting_id"] == "m1"][0]
    assert redacted["preview"] == "" and redacted["meeting_title"] is None and redacted["redacted"] is True


async def test_suggestions_are_data_aware_bounded_and_sanitized(client, h):
    h.store.overdue = 3
    h.store.meetings["m3"] = ('Q4 "plan" ‮<script>', h.store.meetings["m1"][1])
    items = (await client.get("/chat/suggestions", headers=hdr())).json()["items"]
    assert 4 <= len(items) <= 6 and "Which commitments are overdue?" in items
    joined = " ".join(items)
    assert "<script>" not in joined and "‮" not in joined
    h.store.overdue = 0
    h.store.meetings.clear()
    empty = (await client.get("/chat/suggestions", headers=hdr(user="other"))).json()["items"]
    assert 4 <= len(empty) <= 6                                                       # static starters for an empty team
