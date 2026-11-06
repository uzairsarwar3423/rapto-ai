"""Confidence-gate fallback client selection (OpenAI default, Claude optional)."""

from __future__ import annotations

from pydantic import SecretStr

from src.api.main import build_ai_clients, build_fallback_client
from src.config.model_routing import resolve_fallback_model
from src.models.common import ModelTier, TaskType
from src.services.litellm_client import LiteLLMClient
from src.services.openai_client import OpenAIClient


def _settings(test_settings, **update):
    return test_settings.model_copy(update=update)


def test_default_fallback_is_openai_full_model(test_settings):
    client, model = build_fallback_client(test_settings)
    assert isinstance(client, OpenAIClient)
    assert model == "gpt-4.1"
    assert client._resolve(TaskType.EXTRACT_DECISIONS) == ("gpt-4.1", ModelTier.FULL)
    # embeddings never use the override
    assert client._resolve(TaskType.EMBEDDING)[1] == ModelTier.EMBED


def test_primary_client_unchanged(test_settings):
    primary, fallback = build_ai_clients(test_settings)
    assert isinstance(primary, OpenAIClient)
    assert primary._resolve(TaskType.EXTRACT_DECISIONS) == ("gpt-4.1-mini", ModelTier.MINI)
    assert fallback is not None and fallback is not primary


def test_custom_openai_fallback_model(test_settings):
    _, model = build_fallback_client(_settings(test_settings, openai_fallback_model_name="gpt-5"))
    assert model == "gpt-5"


def test_fallback_equal_to_primary_is_disabled(test_settings):
    settings = _settings(test_settings, openai_fallback_model_name="gpt-4.1-mini")
    assert build_fallback_client(settings) == (None, None)
    assert resolve_fallback_model(TaskType.EXTRACT_RISKS, settings) is None


def test_gate_disabled(test_settings):
    assert build_fallback_client(_settings(test_settings, confidence_gate_enabled=False)) == (None, None)


def test_anthropic_fallback_requires_key(test_settings):
    settings = _settings(test_settings, confidence_gate_fallback_provider="anthropic")
    assert build_fallback_client(settings) == (None, None)
    client, model = build_fallback_client(_settings(
        test_settings, confidence_gate_fallback_provider="anthropic", anthropic_api_key=SecretStr("sk-ant-x")))
    assert isinstance(client, LiteLLMClient) and model == "claude-sonnet-5-5"


def test_resolve_fallback_model_only_for_extractors(test_settings):
    assert resolve_fallback_model(TaskType.EXTRACT_DECISIONS, test_settings) == "gpt-4.1"
    assert resolve_fallback_model(TaskType.SUMMARY, test_settings) is None
