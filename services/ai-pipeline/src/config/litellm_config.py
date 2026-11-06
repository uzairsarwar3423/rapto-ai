"""
config/litellm_config.py
─────────────────────────
LiteLLM route configuration for model-agnostic AI calls.

WHY LITELLM:
  - One completion API for OpenAI and Anthropic — model swaps are config changes
  - Unified usage + cost reporting across providers (litellm.completion_cost)
  - Same code path for the primary model and the Claude fallback

FALLBACK STRATEGY:
  Primary:  OpenAI  (settings.openai_gpt41_mini_model_name / ..._model_name)
  Fallback: Anthropic Claude (settings.anthropic_claude_model_name)
  Triggers: (1) confidence_gate detects low-confidence extraction for a chunk
            (2) provider failure on the primary after retries (LiteLLM backend only)

WHY NOT A litellm.Router WITH TWO DEPLOYMENTS UNDER ONE NAME:
  Two deployments sharing a model_name are a *load-balancing group* — the
  router would send ~50% of normal traffic to Claude. That is exactly the
  "litellm routes to Claude always" risk in the upgrade plan's risk register.
  Routes are therefore explicit: one primary route per tier, one Claude route,
  and the caller decides when to use the Claude route.

PROVIDER QUIRKS ENCODED HERE (not scattered through the client):
  - Current Claude models reject non-default `temperature` and forced
    `tool_choice`. instructor's TOOLS mode forces a tool call, so Claude routes
    use instructor's MD_JSON mode (schema in prompt, JSON parsed + validated).
  - Anthropic requires max_tokens on every call.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.config.settings import Settings, get_settings
from src.models.common import ModelTier

# instructor Mode names (resolved to instructor.Mode members lazily in the
# client so this module never imports instructor).
INSTRUCTOR_MODE_TOOLS = "TOOLS"
INSTRUCTOR_MODE_MD_JSON = "MD_JSON"

# How many times instructor re-asks the model after a Pydantic validation error.
INSTRUCTOR_VALIDATION_RETRIES: int = 2

PROVIDER_OPENAI = "openai"
PROVIDER_ANTHROPIC = "anthropic"


@dataclass(frozen=True)
class LiteLLMRoute:
    """One concrete provider/model target for a LiteLLM call."""

    provider: str                 # "openai" | "anthropic"
    model: str                    # LiteLLM model string, e.g. "openai/gpt-4.1-mini"
    model_name: str               # bare model name for logs/cost records
    model_tier: ModelTier
    api_key: str = ""
    organization: str | None = None
    timeout_seconds: float = 30.0
    max_output_tokens: int | None = None
    supports_temperature: bool = True
    instructor_mode: str = INSTRUCTOR_MODE_TOOLS

    def completion_kwargs(self) -> dict[str, object]:
        """Provider-specific kwargs shared by every completion call on this route."""
        kwargs: dict[str, object] = {"api_key": self.api_key, "timeout": self.timeout_seconds}
        if self.organization:
            kwargs["organization"] = self.organization
        if self.max_output_tokens:
            kwargs["max_tokens"] = self.max_output_tokens
        return kwargs


def primary_route(tier: ModelTier, settings: Settings | None = None) -> LiteLLMRoute:
    """The OpenAI route for a model tier."""
    settings = settings or get_settings()
    model_name = {
        ModelTier.MINI: settings.openai_gpt41_mini_model_name,
        ModelTier.FULL: settings.openai_gpt41_model_name,
        ModelTier.EMBED: settings.openai_embedding_model_name,
    }[tier]
    return LiteLLMRoute(
        provider=PROVIDER_OPENAI,
        model=f"openai/{model_name}",
        model_name=model_name,
        model_tier=tier,
        api_key=settings.openai_api_key.get_secret_value(),
        organization=settings.openai_org_id,
        timeout_seconds=settings.openai_timeout_seconds,
        supports_temperature=True,
        instructor_mode=INSTRUCTOR_MODE_TOOLS,
    )


def claude_route(settings: Settings | None = None) -> LiteLLMRoute | None:
    """The Claude fallback route, or None when no Anthropic key is configured."""
    settings = settings or get_settings()
    if not settings.claude_fallback_available:
        return None
    assert settings.anthropic_api_key is not None  # narrowed by claude_fallback_available
    model_name = settings.anthropic_claude_model_name
    return LiteLLMRoute(
        provider=PROVIDER_ANTHROPIC,
        model=f"anthropic/{model_name}",
        model_name=model_name,
        # Cost is computed from FALLBACK_PRICING_TABLE by model name; the tier
        # only labels the CostRecord.
        model_tier=ModelTier.MINI,
        api_key=settings.anthropic_api_key.get_secret_value(),
        timeout_seconds=settings.anthropic_timeout_seconds,
        max_output_tokens=settings.anthropic_max_output_tokens,
        supports_temperature=False,
        instructor_mode=INSTRUCTOR_MODE_MD_JSON,
    )


def build_litellm_model_list(settings: Settings | None = None) -> list[dict[str, object]]:
    """Describe every configured route (for diagnostics / the /ready endpoint).

    Secrets are never included.
    """
    settings = settings or get_settings()
    routes = [primary_route(t, settings) for t in (ModelTier.MINI, ModelTier.FULL, ModelTier.EMBED)]
    fallback = claude_route(settings)
    if fallback is not None:
        routes.append(fallback)
    return [
        {
            "provider": r.provider,
            "model": r.model,
            "tier": r.model_tier.value,
            "role": "fallback" if r.provider == PROVIDER_ANTHROPIC else "primary",
        }
        for r in routes
    ]
