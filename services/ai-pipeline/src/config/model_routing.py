"""
config/model_routing.py
───────────────────────
Task-type → model-tier routing table and pricing constants.

PRINCIPAL DESIGN DECISIONS:

1. Task-type-routed, not thin-wrapper: callers say "I'm doing EXTRACTION",
   never "use gpt-4.1-mini". This is a Strategy/routing-table pattern
   that decouples *what the caller wants* from *which model does it best/cheapest*.
   Swapping to a new model = one-line edit here, not a nine-file grep.

2. MODEL_TIER_TO_NAME resolved from settings (not hardcoded): a model name
   change (Google retiring/renaming) is an env var change in deployment config,
   never a code deploy.

3. PRICING_TABLE is explicitly commented "verify before each deploy" — provider
   pricing changes are outside this codebase's control, and silent staleness
   would corrupt every cost report from Day 60 onward.

4. resolve_model() is the ONLY public surface other modules touch — callers
   never reach into the dicts directly, keeping routing logic swappable
   behind one function signature.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.config.settings import Settings, get_settings
from src.models.common import ModelTier, TaskType


# ─── Task → Tier Routing Table ────────────────────────────────────────────────
# RATIONALE PER TASK:
#   TRANSCRIPT_CLEANUP: Flash-Lite — simple cleanup, cost-sensitive, high volume
#   EXTRACTION:         Flash-Lite — structured extraction, cost-sensitive
#   RESOLUTION_CHECK:  Flash-Lite — lightweight binary/categorical check
#   SUMMARY:            Flash     — narrative prose requires higher capability
#   CHAT_ANSWER:        Flash     — interactive, quality-sensitive
#   EMBEDDING:          Embedding — entirely different SDK code path
#   RERANK:             Flash-Lite — lightweight pairwise comparison

TASK_MODEL_MAP: dict[TaskType, ModelTier] = {
    TaskType.TRANSCRIPT_CLEANUP: ModelTier.MINI,
    TaskType.EXTRACT_COMMITMENTS: ModelTier.MINI,
    TaskType.EXTRACT_ACTION_ITEMS: ModelTier.MINI,
    TaskType.EXTRACT_DECISIONS: ModelTier.MINI,
    TaskType.EXTRACT_BLOCKERS: ModelTier.MINI,
    TaskType.EXTRACT_RISKS: ModelTier.MINI,
    TaskType.EXTRACTION: ModelTier.MINI,
    TaskType.RESOLUTION_CHECK: ModelTier.MINI,
    TaskType.SUMMARY: ModelTier.FULL,
    TaskType.CHAT_ANSWER: ModelTier.FULL,
    TaskType.CHAT_REWRITE: ModelTier.MINI,
    TaskType.CHAT_INTENT: ModelTier.MINI,
    TaskType.CHAT_MEMORY: ModelTier.MINI,
    TaskType.EMBEDDING: ModelTier.EMBED,
    TaskType.RERANK: ModelTier.MINI,
    TaskType.DATE_PARSE: ModelTier.MINI,
    TaskType.TRANSLATE: ModelTier.MINI,
}

MODEL_TASK_TEMPERATURE_OVERRIDES: dict[TaskType, float] = {
    TaskType.DATE_PARSE: 0.0,
    TaskType.TRANSLATE: 0.0,          # faithful, deterministic translation
    TaskType.TRANSCRIPT_CLEANUP: 0.1,
    TaskType.EXTRACT_COMMITMENTS: 0.1,
    TaskType.EXTRACT_ACTION_ITEMS: 0.1,
    TaskType.EXTRACT_DECISIONS: 0.0,
    TaskType.EXTRACT_BLOCKERS: 0.0,
    TaskType.EXTRACT_RISKS: 0.1,
    TaskType.EXTRACTION: 0.1,
    TaskType.SUMMARY: 0.3,
    TaskType.RERANK: 0.0,       # deterministic grading
    TaskType.CHAT_REWRITE: 0.0,  # Day 58: structured stages are deterministic
    TaskType.CHAT_INTENT: 0.0,
    TaskType.CHAT_MEMORY: 0.0,
}


# ─── Pricing Constants ────────────────────────────────────────────────────────
# IMPORTANT: Verify against current Google AI pricing before each deploy.
# https://ai.google.dev/pricing
# These are USD per 1,000,000 tokens as of mid-2025.
# Silent staleness here corrupts every cost record from Day 60 onward.


@dataclass(frozen=True)
class PricingRates:
    input_per_million_usd: float   # Cost per 1M input tokens
    output_per_million_usd: float  # Cost per 1M output tokens


PRICING_TABLE: dict[ModelTier, PricingRates] = {
    # gpt-5-mini: cheapest text generation tier
    ModelTier.MINI: PricingRates(
        input_per_million_usd=0.40,
        output_per_million_usd=1.60,
    ),
    # gpt-5: standard quality text generation
    ModelTier.FULL: PricingRates(
        input_per_million_usd=2.50,
        output_per_million_usd=10.00,
    ),
    # text-embedding-3-small: embedding generation
    # NOTE: Embedding API pricing differs significantly — confirm at implementation
    ModelTier.EMBED: PricingRates(
        input_per_million_usd=0.02,
        output_per_million_usd=0.0,  # Embeddings have no "output tokens" cost
    ),
}


# ─── Public Interface ─────────────────────────────────────────────────────────


def resolve_model(
    task_type: TaskType,
    settings: Settings | None = None,
) -> tuple[str, ModelTier]:
    """Resolve a TaskType to (model_name, model_tier).

    This is the ONLY function other modules call — they never reach into
    TASK_MODEL_MAP or MODEL_TIER_TO_NAME directly. This keeps the routing
    logic swappable behind a single stable function signature.

    Args:
        task_type: The semantic task being performed.
        settings: Settings instance; defaults to the process singleton.

    Returns:
        (model_name, model_tier) — model_name is the actual OpenAI model
        identifier string to pass to the SDK.
    """
    if settings is None:
        settings = get_settings()

    tier = TASK_MODEL_MAP[task_type]

    # Resolved from settings at call time — not at import time —
    # so a test can override settings without needing a module reload.
    tier_to_name: dict[ModelTier, str] = {
        ModelTier.MINI: settings.openai_gpt41_mini_model_name,
        ModelTier.FULL: settings.openai_gpt41_model_name,
        ModelTier.EMBED: settings.openai_embedding_model_name,
    }

    model_name = tier_to_name[tier]
    return model_name, tier


def compute_cost(
    input_tokens: int,
    output_tokens: int,
    model_tier: ModelTier,
) -> float:
    """Compute estimated USD cost for a single AI call.

    Pure function — no I/O, easily unit-testable with hand-calculated
    expected values (per §7 test criteria).
    """
    rates = PRICING_TABLE[model_tier]
    input_cost = (input_tokens / 1_000_000) * rates.input_per_million_usd
    output_cost = (output_tokens / 1_000_000) * rates.output_per_million_usd
    return input_cost + output_cost


# ─── Confidence-gated fallback routing ────────────────────────────────────────
# The fallback (OpenAI full-tier by default, or Claude) is NOT a load-balanced peer of the primary model — it is
# invoked deliberately by services/extraction/confidence_gate.py when a chunk's
# extraction confidence is low, and by the LiteLLM backend on provider failure.
# Keeping the eligible set explicit stops an accidental global switch to Claude.

FALLBACK_ELIGIBLE_TASKS: frozenset[TaskType] = frozenset({
    TaskType.EXTRACT_COMMITMENTS,
    TaskType.EXTRACT_ACTION_ITEMS,
    TaskType.EXTRACT_DECISIONS,
    TaskType.EXTRACT_BLOCKERS,
    TaskType.EXTRACT_RISKS,
})

# USD per 1M tokens for the fallback model. Used only when LiteLLM's own cost
# map does not know the model (litellm.completion_cost raises / returns 0).
# Verify against https://www.anthropic.com/pricing before each deploy.
FALLBACK_PRICING_TABLE: dict[str, PricingRates] = {
    "claude-sonnet-5-5": PricingRates(input_per_million_usd=2.00, output_per_million_usd=10.00),
    "claude-sonnet-5": PricingRates(input_per_million_usd=2.00, output_per_million_usd=10.00),
    "claude-sonnet-4-6": PricingRates(input_per_million_usd=3.00, output_per_million_usd=15.00),
    "claude-haiku-5-5": PricingRates(input_per_million_usd=0.10, output_per_million_usd=0.50),
    "claude-opus-5-5": PricingRates(input_per_million_usd=4.00, output_per_million_usd=20.00),
}


def resolve_fallback_model(
    task_type: TaskType,
    settings: Settings | None = None,
) -> str | None:
    """Return the fallback model name for a task, or None if no fallback applies.

    None when the task is not fallback-eligible, the confidence gate is off,
    the Claude fallback is selected without an Anthropic key, or the OpenAI
    fallback model is the same as the primary mini model.
    """
    if settings is None:
        settings = get_settings()
    if task_type not in FALLBACK_ELIGIBLE_TASKS:
        return None
    if not settings.confidence_gate_enabled:
        return None
    if settings.confidence_gate_fallback_provider == "anthropic":
        return settings.anthropic_claude_model_name if settings.claude_fallback_available else None
    model = settings.resolved_openai_fallback_model
    return None if model == settings.openai_gpt41_mini_model_name else model


def compute_cost_for_model(
    input_tokens: int,
    output_tokens: int,
    model_name: str,
    model_tier: ModelTier,
) -> float:
    """Cost estimate by concrete model name, falling back to tier pricing."""
    bare = model_name.split("/", 1)[-1]
    rates = FALLBACK_PRICING_TABLE.get(bare)
    if rates is None:
        return compute_cost(input_tokens, output_tokens, model_tier)
    return (
        (input_tokens / 1_000_000) * rates.input_per_million_usd
        + (output_tokens / 1_000_000) * rates.output_per_million_usd
    )
