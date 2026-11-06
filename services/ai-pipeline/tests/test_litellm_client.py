"""LiteLLMClient: routing, Claude quirks, failover and error contract.

Uses LiteLLM's built-in `mock_response` so the real litellm + instructor
request/parse/error code paths run without any network call.
"""

from __future__ import annotations

from typing import Any

import pytest

litellm = pytest.importorskip("litellm")
pytest.importorskip("instructor")

from src.config.litellm_config import (  # noqa: E402
    INSTRUCTOR_MODE_MD_JSON,
    claude_route,
    primary_route,
)
from src.models.common import ModelTier, TaskType  # noqa: E402
from src.models.exceptions import (  # noqa: E402
    AINonRetryableError,
    AIRateLimitExhaustedError,
    AISchemaValidationError,
)
from src.models.extraction_models import DecisionsResponse  # noqa: E402
from src.services.litellm_client import LiteLLMClient  # noqa: E402

DECISIONS_JSON = '```json\n{"decisions": [{"text": "Ship on Friday", "confidence": 0.9, "reversible": false}]}\n```'


@pytest.fixture
def settings(test_settings):
    return test_settings.model_copy(update={
        "anthropic_api_key": __import__("pydantic").SecretStr("sk-ant-test"),
        "openai_max_retries": 1,  # no backoff sleeps in tests
    })


def _script(monkeypatch, per_provider: dict[str, Any]) -> list[str]:
    """Inject mock_response per provider; returns the list of providers called."""
    seen: list[str] = []
    original = LiteLLMClient._request_kwargs

    def patched(route, task_type):
        seen.append(route.provider)
        kwargs = original(route, task_type)
        kwargs["mock_response"] = per_provider[route.provider]
        return kwargs

    monkeypatch.setattr(LiteLLMClient, "_request_kwargs", staticmethod(patched))
    return seen


def _rate_limit():
    return litellm.RateLimitError("rate limited", llm_provider="openai", model="gpt-4.1-mini")


def test_claude_fallback_requires_key(test_settings):
    assert claude_route(test_settings) is None
    assert LiteLLMClient.claude_fallback(test_settings) is None


def test_claude_route_drops_temperature_and_uses_prompt_json(settings):
    route = claude_route(settings)
    assert route.model == "anthropic/claude-sonnet-5-5"
    assert route.instructor_mode == INSTRUCTOR_MODE_MD_JSON
    kwargs = LiteLLMClient._request_kwargs(route, TaskType.EXTRACT_DECISIONS)
    assert "temperature" not in kwargs and kwargs["max_tokens"] == settings.anthropic_max_output_tokens
    openai_kwargs = LiteLLMClient._request_kwargs(primary_route(ModelTier.MINI, settings), TaskType.EXTRACT_DECISIONS)
    assert openai_kwargs["temperature"] == 0.0


async def test_claude_fallback_structured_success(settings, monkeypatch):
    _script(monkeypatch, {"anthropic": DECISIONS_JSON})
    client = LiteLLMClient.claude_fallback(settings)
    result = await client.generate_structured(TaskType.EXTRACT_DECISIONS, "sys", "user", DecisionsResponse)
    assert result.provider_used == "anthropic"
    assert result.model_name == "claude-sonnet-5-5"
    assert result.data.decisions[0].reversible is False
    # priced from our table (2/10 USD per 1M) using the mock usage
    usage_in, usage_out = result.cost.input_tokens, result.cost.output_tokens
    assert result.cost.estimated_cost_usd == pytest.approx(usage_in * 2e-6 + usage_out * 10e-6)


async def test_provider_failover_to_claude_on_rate_limit(settings, monkeypatch):
    seen = _script(monkeypatch, {"openai": _rate_limit(), "anthropic": DECISIONS_JSON})
    client = LiteLLMClient(settings)
    result = await client.generate_structured(TaskType.EXTRACT_DECISIONS, "sys", "user", DecisionsResponse)
    assert result.provider_used == "anthropic"
    assert seen[0] == "openai" and seen[-1] == "anthropic"


async def test_no_failover_without_claude(test_settings, monkeypatch):
    settings = test_settings.model_copy(update={"openai_max_retries": 1})
    _script(monkeypatch, {"openai": _rate_limit()})
    with pytest.raises(AIRateLimitExhaustedError):
        await LiteLLMClient(settings).generate_structured(
            TaskType.EXTRACT_DECISIONS, "sys", "user", DecisionsResponse)


async def test_non_retryable_error_does_not_fail_over(settings, monkeypatch):
    bad = litellm.BadRequestError("bad request", model="gpt-4.1-mini", llm_provider="openai")
    seen = _script(monkeypatch, {"openai": bad, "anthropic": DECISIONS_JSON})
    with pytest.raises(AINonRetryableError):
        await LiteLLMClient(settings).generate_structured(
            TaskType.EXTRACT_DECISIONS, "sys", "user", DecisionsResponse)
    assert "anthropic" not in seen


async def test_unparseable_output_is_schema_error(settings, monkeypatch):
    _script(monkeypatch, {"anthropic": "this is not json"})
    with pytest.raises(AISchemaValidationError):
        await LiteLLMClient.claude_fallback(settings).generate_structured(
            TaskType.EXTRACT_DECISIONS, "sys", "user", DecisionsResponse)


async def test_generate_text(settings, monkeypatch):
    _script(monkeypatch, {"openai": "hello summary"})
    result = await LiteLLMClient(settings).generate_text(TaskType.SUMMARY, "sys", "user")
    assert result.data == "hello summary"
    assert result.provider_used == "openai" and result.model_name == "gpt-4.1"
    assert result.cost.estimated_cost_usd >= 0
