"""B1/B2: settings cross-validation, event models, estimator, sanitizer, auth, rate limiter."""

from __future__ import annotations

import json
import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from pydantic import ValidationError

from src.api.internal_auth import InternalJWTVerifier
from src.config.chat_config import ChatSettings
from src.models.chat_models import (
    ChatFilters, ChatRequest, DoneEvent, MetaEvent, TokenEvent, decode_event, encode_event,
)
from src.services.chat.cost_accumulator import CostAccumulator
from src.services.chat.errors import InvalidInputError, UnauthenticatedError
from src.services.chat.input_sanitizer import sanitize_message, validate_filters
from src.services.chat.rate_limiter import RateLimiter
from src.services.chat.token_estimator import classify, estimate_tokens, truncate_to_tokens, LanguageClass
from tests.chat.conftest import make_settings

# ─── settings ─────────────────────────────────────────────────────────────────


def test_settings_defaults_are_dark_and_valid():
    s = ChatSettings(_env_file=None)
    assert s.chat_enabled is False
    assert s.is_enabled_for("t1") is False


def test_team_overrides_and_kill_switch():
    s = make_settings(chat_enabled=False, chat_enabled_team_ids="t1, t2", chat_disabled_team_ids="t2")
    assert s.is_enabled_for("t1") and not s.is_enabled_for("t2") and not s.is_enabled_for("t3")
    g = make_settings(chat_enabled=True, chat_disabled_team_ids="t9")
    assert g.is_enabled_for("t1") and not g.is_enabled_for("t9")


@pytest.mark.parametrize("kw", [
    dict(chat_history_max_tokens=7000),                                  # history would eat the sources minimum
    dict(chat_first_token_timeout_s=50.0),
    dict(chat_idle_timeout_s=60.0),
    dict(chat_lease_refresh_s=20.0, chat_lease_ttl_s=30),                # lease cannot survive one missed refresh
    dict(chat_reservation_ttl_s=30),
    dict(chat_max_streams_per_user=5, chat_global_max_streams=2),
    dict(internal_jwt_algorithms="HS256"),
    dict(internal_jwt_algorithms="none"),
])
def test_settings_cross_validation_rejects(kw):
    with pytest.raises(ValidationError):
        make_settings(**kw)


def test_plan_limits():
    s = make_settings()
    assert s.daily_limit("FREE") < s.daily_limit("PRO") < s.daily_limit("BUSINESS")
    assert s.max_output_tokens("FREE") < s.max_output_tokens("PRO") < s.max_output_tokens("BUSINESS")
    assert s.ctx_budget("FREE") < s.ctx_budget("PRO")


# ─── models ───────────────────────────────────────────────────────────────────


def test_request_rejects_unknown_fields_and_bad_ranges():
    cid = str(uuid.uuid4())
    with pytest.raises(ValidationError):
        ChatRequest(message="hi", client_message_id=cid, role="admin")               # extra=forbid
    with pytest.raises(ValidationError):
        ChatRequest(message="hi", client_message_id="not-a-uuid")
    with pytest.raises(ValidationError):
        ChatFilters(date_from="2026-02-01", date_to="2026-01-01")
    with pytest.raises(ValidationError):
        ChatFilters(meeting_ids=[f"m{i}" for i in range(51)])
    with pytest.raises(ValidationError):
        ChatFilters(meeting_ids=["bad id with spaces"])


def test_encode_only_accepts_protocol_events():
    wire = encode_event(MetaEvent(request_id="r", session_id="s", message_id="m")).decode()
    assert wire.startswith("event: meta\ndata: ") and wire.endswith("\n\n")
    assert '"v":1' in wire and '"event"' not in wire.split("data: ")[1]
    with pytest.raises(TypeError):
        encode_event({"event": "custom"})
    with pytest.raises(TypeError):
        encode_event(object())


def test_event_roundtrip_and_unknown_event_ignored():
    wire = encode_event(TokenEvent(t="héllo 🙂")).decode()
    name = wire.splitlines()[0].split(": ")[1]
    data = wire.splitlines()[1].split("data: ", 1)[1]
    assert decode_event(name, data).t == "héllo 🙂"
    assert decode_event("telepathy", "{}") is None                                    # forward compatible


def test_done_rejects_unknown_finish_reason():
    with pytest.raises(ValidationError):
        DoneEvent(finish_reason="quota")                                               # removed in v1


# ─── estimator ────────────────────────────────────────────────────────────────


def test_language_classes():
    assert classify("What did Ahmed commit to last week?") is LanguageClass.ENGLISH
    assert classify("Ahmed ne kya kaha tha aur kab tak karna hai") is LanguageClass.ROMAN_URDU
    assert classify("احمد نے پچھلے ہفتے کیا وعدہ کیا تھا اور کب تک") is LanguageClass.URDU_SCRIPT


def test_urdu_script_estimate_is_much_higher_per_char():
    en = "a" * 200
    ur = "ا" * 200
    assert estimate_tokens(ur) > 2 * estimate_tokens(en)


def test_estimator_errs_high_vs_tiktoken():
    tiktoken = pytest.importorskip("tiktoken")
    enc = tiktoken.get_encoding("cl100k_base")
    samples = [
        "Ahmed will ship the billing migration by Friday and Sara reviews it on Monday.",
        "ahmed ne kaha ke billing wala kaam jumma tak ho jayega aur sara kal review karegi",
        "احمد نے کہا کہ بلنگ کا کام جمعے تک مکمل ہو جائے گا اور سارہ پیر کو اس کا جائزہ لے گی",
    ]
    for text in samples:
        actual = len(enc.encode(text))
        est = estimate_tokens(text)
        assert est >= actual * 0.9, (text[:30], est, actual)      # never materially under
        assert est <= actual * 3, (text[:30], est, actual)         # and not absurdly over


def test_truncate_to_tokens_respects_budget_and_sentences():
    text = "First sentence here. " * 100
    cut = truncate_to_tokens(text, 50)
    assert estimate_tokens(cut) <= 50 and cut.endswith(".")
    assert truncate_to_tokens("short", 50) == "short"
    assert truncate_to_tokens("anything", 0) == ""


# ─── sanitizer ────────────────────────────────────────────────────────────────


def test_sanitizer_strips_hidden_characters():
    raw = "Wha‮t is​ the\u0000 status⁦?"
    assert sanitize_message(raw, max_chars=100, max_tokens=100) == "What is the status?"


def test_sanitizer_rejects_not_truncates():
    with pytest.raises(InvalidInputError):
        sanitize_message("x" * 101, max_chars=100, max_tokens=1000)
    with pytest.raises(InvalidInputError):
        sanitize_message("​ ‮", max_chars=100, max_tokens=100)               # empty after stripping


def test_urdu_script_over_token_cap_is_rejected_even_under_char_cap():
    msg = "احمد " * 300                                                                  # ~1500 chars
    assert len(msg) < 2000
    with pytest.raises(InvalidInputError):
        sanitize_message(msg, max_chars=2000, max_tokens=500)


class _Store:
    def __init__(self, meetings=(), users=()):
        self._m, self._u = set(meetings), set(users)

    async def known_meeting_ids(self, team_id, ids, scope):
        return {i for i in ids if i in self._m}

    async def known_user_ids(self, team_id, ids):
        return {i for i in ids if i in self._u}


async def test_foreign_ids_are_dropped_silently():
    from src.models.rag_models import AccessScope
    f = ChatFilters(meeting_ids=["m1", "foreign", "ghost"], speaker_ids=["u1", "uForeign"])
    out = await validate_filters(f, team_id="t", store=_Store({"m1"}, {"u1"}), scope=AccessScope())  # type: ignore[arg-type]
    assert out.meeting_ids == ("m1",) and out.speaker_ids == ("u1",)
    assert out.dropped_meeting_ids == 2 and out.dropped_speaker_ids == 1


# ─── internal auth ────────────────────────────────────────────────────────────


def _keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    pub = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    return priv.decode(), pub.decode()


PRIV1, PUB1 = _keypair()
PRIV2, PUB2 = _keypair()


def _claims(**over):
    now = int(time.time())
    c = dict(iss="vocaply-bff", aud="vocaply-ai-chat", iat=now, exp=now + 45, team_id="teamA", user_id="userA1",
             role="MEMBER", plan="pro", tz="Asia/Karachi", rid="r-1")
    c.update(over)
    return {k: v for k, v in c.items() if v is not None}


def _tok(priv=PRIV1, kid="k1", alg="RS256", **over):
    return jwt.encode(_claims(**over), priv, algorithm=alg, headers={"kid": kid})


def _verifier(keys=None):
    return InternalJWTVerifier(make_settings(), key_set=keys or {"k1": PUB1})


def test_valid_token_yields_claims():
    c = _verifier().verify(_tok())
    assert (c.team_id, c.user_id, c.plan, c.tz, c.request_id) == ("teamA", "userA1", "PRO", "Asia/Karachi", "r-1")


@pytest.mark.parametrize("make", [
    lambda: _tok(exp=int(time.time()) - 120, iat=int(time.time()) - 160),   # expired
    lambda: _tok(aud="someone-else"),
    lambda: _tok(iss="evil"),
    lambda: _tok(kid="unknown"),
    lambda: _tok(priv=PRIV2),                                               # signed by a different key
    lambda: _tok(exp=int(time.time()) + 3600),                              # lifetime > 60s
    lambda: _tok(team_id=None),
    lambda: _tok(team_id="bad team!"),
    lambda: _tok(tz="Mars/Olympus"),
    lambda: jwt.encode(_claims(), "secret-secret-secret-secret-32by", algorithm="HS256", headers={"kid": "k1"}),
    lambda: jwt.encode(_claims(), key="", algorithm="none", headers={"kid": "k1"}),
    lambda: "not.a.jwt",
])
def test_bad_tokens_all_return_the_same_generic_401(make):
    with pytest.raises(UnauthenticatedError) as ei:
        _verifier().verify(make())
    assert ei.value.http_status == 401 and "key" not in str(ei.value).lower()


def test_hs256_signed_with_the_public_key_is_refused():                      # algorithm-confusion attack
    forged = jwt.encode(_claims(), PUB1, algorithm="HS256", headers={"kid": "k1"}) if False else None
    header = {"alg": "HS256", "typ": "JWT", "kid": "k1"}
    import base64, hashlib, hmac

    def b64(b: bytes) -> bytes:
        return base64.urlsafe_b64encode(b).rstrip(b"=")

    signing_input = b64(json.dumps(header).encode()) + b"." + b64(json.dumps(_claims()).encode())
    sig = b64(hmac.new(PUB1.encode(), signing_input, hashlib.sha256).digest())
    forged = (signing_input + b"." + sig).decode()
    with pytest.raises(UnauthenticatedError):
        _verifier().verify(forged)


def test_key_rotation_two_kids_live():
    v = _verifier({"k1": PUB1, "k2": PUB2})
    assert v.verify(_tok(kid="k1")).team_id == "teamA"
    assert v.verify(_tok(priv=PRIV2, kid="k2")).team_id == "teamA"
    assert v.key_ids == ["k1", "k2"]


# ─── rate limiter ─────────────────────────────────────────────────────────────


async def test_bucket_allows_burst_then_429_with_retry_after(redis):
    rl = RateLimiter(redis, per_min=5, team_per_min=100)
    results = [await rl.check("t", "u") for _ in range(7)]
    assert [r.allowed for r in results] == [True] * 5 + [False] * 2
    assert results[5].retry_after_s >= 1 and results[5].backend == "redis"


async def test_buckets_are_per_user_and_per_team(redis):
    rl = RateLimiter(redis, per_min=2, team_per_min=3)
    assert (await rl.check("t", "u1")).allowed and (await rl.check("t", "u1")).allowed
    assert not (await rl.check("t", "u1")).allowed                                    # u1 exhausted
    assert (await rl.check("t", "u2")).allowed                                        # u2 unaffected …
    assert not (await rl.check("t", "u3")).allowed                                    # … until the TEAM bucket (3) is empty
    assert (await rl.check("other", "u1")).allowed                                    # other team unaffected


class _DeadRedis:
    async def eval(self, *a, **k):
        raise ConnectionError("redis down")


async def test_redis_down_falls_back_to_local_limiter(manual_clock):
    rl = RateLimiter(_DeadRedis(), per_min=3, team_per_min=100, local_clock=manual_clock)
    out = [await rl.check("t", "u") for _ in range(5)]
    assert [r.allowed for r in out] == [True, True, True, False, False]
    assert all(r.backend == "local" for r in out)
    manual_clock.advance(61)                                                          # refilled
    assert (await rl.check("t", "u")).allowed


# ─── cost accumulator ─────────────────────────────────────────────────────────


def test_cost_accumulator_totals_and_stage_breakdown():
    from src.models.common import ModelTier
    acc = CostAccumulator()
    acc.add_usage("rewrite", model="m", tier=ModelTier.MINI, input_tokens=600, output_tokens=60)
    acc.add_usage("generate", model="g", tier=ModelTier.FULL, input_tokens=10_000, output_tokens=500)
    acc.add("embed", provider="openai", model="e", input_tokens=30, output_tokens=0, cost_usd=0.0000006)
    assert acc.generation_tokens() == (10_000, 500)
    assert acc.total_cost_usd == pytest.approx(sum(acc.by_stage().values()), abs=1e-7)
    assert not acc.any_estimated
    acc.add("generate", provider="openai", model="g", input_tokens=1, output_tokens=1, cost_usd=0, estimated=True)
    assert acc.any_estimated
