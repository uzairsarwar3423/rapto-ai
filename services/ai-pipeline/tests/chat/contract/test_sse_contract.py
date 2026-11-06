"""
Contract tests: the golden transcripts ARE the Day 59 contract.

  * every scenario's live output must equal its committed golden transcript (drift = a contract change → regenerate with
    UPDATE_GOLDEN=1 and review the diff WITH the frontend owner);
  * every golden transcript must validate against the event schemas and the ordering rules;
  * a reference client must ignore unknown events and unknown fields (forward compatibility);
  * error mapping: each failure produces the documented HTTP status / SSE code.
"""

from __future__ import annotations

import json
import os

import pytest

from src.api.sse import OrderValidator
from src.models.chat_models import decode_event
from src.services.chat import errors as E
from tests.chat.contract.scenarios import GOLDEN_DIR, SCENARIOS, golden_path, normalize, write_golden

UPDATE = os.environ.get("UPDATE_GOLDEN") == "1"


@pytest.mark.parametrize("name", sorted(SCENARIOS))
async def test_scenario_matches_its_golden_transcript(name):
    frames = await SCENARIOS[name]()
    if UPDATE:
        write_golden(name, frames)
    path = golden_path(name)
    assert path.exists(), f"missing golden transcript {path.name}: run with UPDATE_GOLDEN=1 and commit it"
    assert normalize(frames) == json.loads(path.read_text(encoding="utf-8")), (
        f"{name}: the SSE output drifted from the published contract. If intentional, regenerate with UPDATE_GOLDEN=1 "
        "and review the diff with the Day 59 owner.")


def goldens():
    return sorted(GOLDEN_DIR.glob("*.json")) if GOLDEN_DIR.exists() else []


def test_golden_set_is_complete():
    assert {p.stem for p in goldens()} >= set(SCENARIOS)


@pytest.mark.parametrize("path", goldens(), ids=lambda p: p.stem)
def test_every_golden_validates_against_schemas_and_ordering(path):
    frames = json.loads(path.read_text(encoding="utf-8"))
    v = OrderValidator(strict=True)
    for f in frames:
        v.check(f["event"])
        decoded = decode_event(f["event"], json.dumps({**f["data"]}))
        assert decoded is not None and decoded.v == 1
    assert v.terminated, "a transcript must end with done or error"
    assert frames[0]["event"] == "meta"
    terminal = [f["event"] for f in frames if f["event"] in ("done", "error")]
    assert len(terminal) == 1 and frames[-1]["event"] in ("done", "error")


def test_golden_content_expectations():
    g = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in goldens()}
    ev = lambda name: [f["event"] for f in g[name]]  # noqa: E731
    h = ev("happy")
    assert h[:5] == ["meta", "status", "status", "sources", "status"] and h[-3:] == ["citations", "usage", "done"]
    assert set(h[5:-3]) == {"token"} and len(h[5:-3]) >= 1
    assert [f["data"]["stage"] for f in g["happy"] if f["event"] == "status"] == ["searching", "reading", "answering"]
    assert ev("no_results") == ["meta", "status", "status", "token", "done"] and g["no_results"][-1]["data"]["finish_reason"] == "no_results"
    assert ev("chitchat") == ["meta", "token", "done"]
    assert ev("error")[-1] == "error" and "usage" not in ev("error") and "done" not in ev("error")
    assert ev("mid_stream_error")[-1] == "error" and "token" in ev("mid_stream_error")
    assert g["cancelled"][-1] == {"event": "done", "data": {"v": 1, "finish_reason": "cancelled"}}
    assert "citations" not in ev("cancelled") and "usage" not in ev("cancelled")
    assert 1 <= ev("cancelled").count("token") <= 4                           # stopped promptly (the model had 20 more words)
    assert g["replay"][0]["data"]["replayed"] is True and g["replay"][-1]["data"]["finish_reason"] == "stop"
    assert g["analytics"][[f["event"] for f in g["analytics"]].index("sources")]["data"]["sources"][0]["type"] == "analytics"
    assert g["filtered_canary"][-1]["data"]["finish_reason"] == "filtered"
    text = "".join(f["data"]["t"] for f in g["filtered_canary"] if f["event"] == "token")
    assert "CANARY" not in text
    for frames in g.values():                                             # dollars never reach end users
        assert all("cost_usd" not in f["data"] for f in frames)


def test_reference_client_ignores_unknown_events_and_fields():
    frames = json.loads((GOLDEN_DIR / "happy.json").read_text(encoding="utf-8"))
    out = []
    for f in frames:
        data = {**f["data"], "future_field": {"x": 1}}                    # a v1 server may add fields later
        out.append(decode_event(f["event"], json.dumps(data)))
    assert all(e is not None for e in out)
    assert decode_event("telepathy", '{"v":1}') is None                   # an unknown event name is ignored, not an error


@pytest.mark.parametrize("cls,args,status,code", [
    (E.UnauthenticatedError, (), 401, "UNAUTHENTICATED"), (E.ForbiddenError, (), 403, "FORBIDDEN"),
    (E.NotFoundError, (), 404, "NOT_FOUND"), (E.DuplicateInFlightError, ("r",), 409, "DUPLICATE_IN_FLIGHT"),
    (E.SessionBusyError, (), 409, "SESSION_BUSY"), (E.InvalidInputError, ("x",), 422, "INVALID_INPUT"),
    (E.RateLimitedError, (), 429, "RATE_LIMITED"), (E.TooManyStreamsError, (), 429, "TOO_MANY_STREAMS"),
    (E.QuotaExceededError, ("daily_queries",), 429, "QUOTA_EXCEEDED"), (E.ModelUnavailableError, (), 503, "MODEL_UNAVAILABLE"),
    (E.FeatureDisabledError, (), 503, "FEATURE_DISABLED"), (E.QuotaUnavailableError, (), 503, "QUOTA_UNAVAILABLE"),
    (E.DependencyUnavailableError, (), 503, "SERVICE_UNAVAILABLE"),
])
def test_error_mapping_matches_the_documented_table(cls, args, status, code):
    e = cls(*args)
    assert (e.http_status, e.code) == (status, code)
    body = e.to_body()["error"]
    assert body["code"] == code and "message" in body and "retryable" in body


def test_documented_codes_are_all_in_the_protocol_doc():
    doc = (GOLDEN_DIR.parents[2] / "docs" / "chat" / "sse_protocol_v1.md")
    text = doc.read_text(encoding="utf-8")
    for code in ["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "DUPLICATE_IN_FLIGHT", "SESSION_BUSY", "INVALID_INPUT", "RATE_LIMITED",
                 "TOO_MANY_STREAMS", "QUOTA_EXCEEDED", "MODEL_UNAVAILABLE", "FEATURE_DISABLED", "QUOTA_UNAVAILABLE",
                 "SERVICE_UNAVAILABLE", "CONTENT_FILTERED", "TIMEOUT"]:
        assert code in text, code
