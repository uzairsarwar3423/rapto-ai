"""
config/chat_config.py
─────────────────────
Day 58 chat backend configuration.

Same two-tier approach as rag_config.py: FROZEN protocol constants (code) and
RUNTIME knobs (env-overridable, range-validated, cross-validated at startup).

CHAT IS DARK BY DEFAULT (CHAT_ENABLED=false): the service must keep booting on
deployments that have not provisioned migration 004 / the BFF signing keys yet.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ─── Frozen protocol constants ────────────────────────────────────────────────

SSE_PROTOCOL_VERSION: int = 1
SOURCE_ID_PREFIX: str = "S"
MIN_ASYMMETRIC_ALGS: frozenset[str] = frozenset({"RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "EdDSA"})
PLANS: tuple[str, ...] = ("FREE", "PRO", "BUSINESS", "ENTERPRISE")

AccessScopeModeName = Literal["team_wide", "attendee_only"]


class ChatSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore",
    )

    # ── Feature switches ──────────────────────────────────────────────────────
    chat_enabled: bool = False                                   # global kill switch (dark launch)
    chat_enabled_team_ids: str = ""                              # CSV allow-list while the global flag is off
    chat_disabled_team_ids: str = ""                             # CSV per-team kill switch (wins over everything)

    # ── Context budget (input tokens) ─────────────────────────────────────────
    chat_ctx_budget: int = Field(default=12_000, ge=2_000, le=100_000)
    chat_ctx_budget_free: int = Field(default=9_500, ge=2_000, le=100_000)
    chat_history_turns: int = Field(default=6, ge=0, le=20)
    chat_history_max_tokens: int = Field(default=2_500, ge=0, le=20_000)
    chat_sources_min_tokens: int = Field(default=6_000, ge=500)
    chat_question_max_tokens: int = Field(default=500, ge=20, le=4_000)
    chat_question_max_chars: int = Field(default=2_000, ge=20, le=10_000)
    chat_summary_max_tokens: int = Field(default=300, ge=50, le=1_000)

    # ── Output / cost ─────────────────────────────────────────────────────────
    chat_max_output_tokens_free: int = Field(default=400, ge=50, le=8_000)
    chat_max_output_tokens: int = Field(default=700, ge=50, le=8_000)
    chat_max_output_tokens_business: int = Field(default=1_000, ge=50, le=8_000)
    chat_thinking_budget: int = Field(default=0, ge=0)           # 0 = no reasoning budget (OpenAI gpt-4.1 has none)
    chat_answer_temperature: float = Field(default=0.2, ge=0.0, le=1.0)

    # ── Quotas (queries/day) and monthly dollar ceilings, by plan ─────────────
    chat_daily_limit_free: int = Field(default=20, ge=0)
    chat_daily_limit_pro: int = Field(default=200, ge=0)
    chat_daily_limit_business: int = Field(default=1_000, ge=0)
    chat_monthly_usd_free: float = Field(default=2.0, ge=0)
    chat_monthly_usd_pro: float = Field(default=25.0, ge=0)
    chat_monthly_usd_business: float = Field(default=120.0, ge=0)
    chat_rewrite_cost_allowance_usd: float = Field(default=0.002, ge=0)
    chat_rerank_cost_allowance_usd: float = Field(default=0.004, ge=0)
    chat_fail_open_paid_plans: bool = True                       # Q6: needs finance sign-off
    chat_count_no_results_as_query: bool = False                 # Q4 recommendation
    chat_count_chitchat_as_query: bool = False                   # Q4 recommendation

    # ── Concurrency / rate limits ─────────────────────────────────────────────
    chat_max_streams_per_user: int = Field(default=2, ge=1, le=10)
    chat_global_max_streams: int = Field(default=16, ge=1, le=500)       # per pod
    chat_global_wait_ms: int = Field(default=500, ge=0, le=10_000)
    chat_rate_limit_per_min: int = Field(default=20, ge=1, le=600)
    chat_team_rate_limit_per_min: int = Field(default=200, ge=1, le=6_000)

    # ── Timeouts (seconds) ────────────────────────────────────────────────────
    chat_total_timeout_s: float = Field(default=45.0, gt=0)
    chat_first_token_timeout_s: float = Field(default=6.0, gt=0)
    chat_idle_timeout_s: float = Field(default=10.0, gt=0)
    # Covers embed + vector/lexical search + source context + re-rank. 3 s was too tight on the
    # deployed host (remote embedding API + DB round-trips) and surfaced as TIMEOUT on normal questions.
    chat_retrieval_timeout_s: float = Field(default=15.0, gt=0)
    chat_rewrite_timeout_s: float = Field(default=2.0, gt=0)
    chat_intent_timeout_s: float = Field(default=1.5, gt=0)
    chat_analytics_timeout_s: float = Field(default=2.0, gt=0)
    chat_hydrate_timeout_s: float = Field(default=0.5, gt=0)
    chat_persist_timeout_s: float = Field(default=1.0, gt=0)
    chat_cleanup_timeout_s: float = Field(default=5.0, gt=0)
    chat_heartbeat_s: float = Field(default=15.0, gt=0)
    chat_reservation_ttl_s: int = Field(default=300, ge=30)
    chat_lease_ttl_s: int = Field(default=30, ge=5)
    chat_lease_refresh_s: float = Field(default=10.0, gt=0)
    chat_event_queue_size: int = Field(default=256, ge=8)
    chat_stall_timeout_s: float = Field(default=15.0, gt=0)

    # ── Relevance gate (Day 57 is the primary signal; cosine only if re-rank degraded) ──
    chat_min_grade_lookup: int = Field(default=2, ge=0, le=3)
    chat_min_grade_summary: int = Field(default=1, ge=0, le=3)
    chat_min_cosine_fallback: float = Field(default=0.30, ge=0.0, le=1.0)

    # ── Access scope (Q1) ─────────────────────────────────────────────────────
    chat_access_scope_mode: AccessScopeModeName = "team_wide"

    # ── Persistence ───────────────────────────────────────────────────────────
    chat_mongo_database: str = "rapto"
    chat_session_retention_days: int = Field(default=30, ge=1)
    chat_empty_session_ttl_hours: int = Field(default=24, ge=1)
    chat_title_max_chars: int = Field(default=60, ge=10, le=120)
    chat_cursor_secret: SecretStr = SecretStr("")                # falls back to API_SHARED_SECRET at wiring time
    chat_suggestions_ttl_s: int = Field(default=600, ge=0)

    # ── Circuit breaker (provider failures only: 5xx / 429 / timeouts) ─────────
    chat_breaker_min_calls: int = Field(default=10, ge=1)
    chat_breaker_failure_ratio: float = Field(default=0.5, gt=0, le=1)
    chat_breaker_window_s: float = Field(default=60.0, gt=0)
    chat_breaker_open_s: float = Field(default=30.0, gt=0)

    # ── Models ────────────────────────────────────────────────────────────────
    chat_answer_model: str = ""                                  # "" → routing table (TaskType.CHAT_ANSWER)
    chat_fallback_model_enabled: bool = False                    # ADR-9: default OFF
    chat_fallback_model: str = ""

    # ── Internal (BFF → AI service) JWT ───────────────────────────────────────
    # JSON map {"<kid>": "<PEM public key>"}; several kids may be live during a rotation.
    internal_jwt_public_keys: SecretStr = SecretStr("{}")
    internal_jwt_algorithms: str = "RS256"                       # CSV; asymmetric only
    internal_jwt_issuer: str = "vocaply-bff"
    internal_jwt_audience: str = "vocaply-ai-chat"
    internal_jwt_leeway_s: int = Field(default=10, ge=0, le=60)
    internal_jwt_max_lifetime_s: int = Field(default=60, ge=5, le=300)
    # TEMPORARY, INSECURE escape hatch: when true the service-JWT SIGNATURE is not verified; the identity claims are read
    # from the token as-is, so anyone who can reach /chat can act as any team. Only for a pre-launch environment with no
    # real tenants. Default false; remove the env var (CHAT_AUTH_DISABLED) to restore verification.
    chat_auth_disabled: bool = False

    # ── Parsed helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _csv(value: str) -> frozenset[str]:
        return frozenset(p.strip() for p in value.split(",") if p.strip())

    @property
    def enabled_team_ids(self) -> frozenset[str]:
        return self._csv(self.chat_enabled_team_ids)

    @property
    def disabled_team_ids(self) -> frozenset[str]:
        return self._csv(self.chat_disabled_team_ids)

    @property
    def jwt_algorithms(self) -> list[str]:
        return [a.strip() for a in self.internal_jwt_algorithms.split(",") if a.strip()]

    def jwt_key_set(self) -> dict[str, str]:
        raw = self.internal_jwt_public_keys.get_secret_value() or "{}"
        data = json.loads(raw)
        return {str(k): str(v) for k, v in data.items()}

    def is_enabled_for(self, team_id: str) -> bool:
        if team_id in self.disabled_team_ids:
            return False
        return self.chat_enabled or team_id in self.enabled_team_ids

    # ── Per-plan limits ───────────────────────────────────────────────────────

    def daily_limit(self, plan: str) -> int:
        return {"FREE": self.chat_daily_limit_free, "PRO": self.chat_daily_limit_pro}.get(
            plan.upper(), self.chat_daily_limit_business)

    def monthly_usd_ceiling(self, plan: str) -> float:
        return {"FREE": self.chat_monthly_usd_free, "PRO": self.chat_monthly_usd_pro}.get(
            plan.upper(), self.chat_monthly_usd_business)

    def max_output_tokens(self, plan: str) -> int:
        p = plan.upper()
        if p == "FREE":
            return self.chat_max_output_tokens_free
        if p in ("BUSINESS", "ENTERPRISE"):
            return self.chat_max_output_tokens_business
        return self.chat_max_output_tokens

    def ctx_budget(self, plan: str) -> int:
        return self.chat_ctx_budget_free if plan.upper() == "FREE" else self.chat_ctx_budget

    def is_paid(self, plan: str) -> bool:
        return plan.upper() != "FREE"

    # ── Validation ────────────────────────────────────────────────────────────

    @field_validator("internal_jwt_algorithms")
    @classmethod
    def _asymmetric_only(cls, v: str) -> str:
        algs = [a.strip() for a in v.split(",") if a.strip()]
        if not algs:
            raise ValueError("INTERNAL_JWT_ALGORITHMS must not be empty")
        bad = [a for a in algs if a not in MIN_ASYMMETRIC_ALGS]
        if bad:
            raise ValueError(f"INTERNAL_JWT_ALGORITHMS must be asymmetric (got {bad}); 'none'/HS* are refused")
        return ",".join(algs)

    @model_validator(mode="after")
    def _cross_validate(self) -> "ChatSettings":
        for budget in (self.chat_ctx_budget, self.chat_ctx_budget_free):
            if self.chat_history_max_tokens >= budget - self.chat_sources_min_tokens:
                raise ValueError(
                    "CHAT_HISTORY_MAX_TOKENS must be < context budget - CHAT_SOURCES_MIN_TOKENS "
                    f"({self.chat_history_max_tokens} vs {budget - self.chat_sources_min_tokens}): sources win over history")
        if not (self.chat_first_token_timeout_s < self.chat_total_timeout_s):
            raise ValueError("CHAT_FIRST_TOKEN_TIMEOUT_S must be < CHAT_TOTAL_TIMEOUT_S")
        if not (self.chat_idle_timeout_s < self.chat_total_timeout_s):
            raise ValueError("CHAT_IDLE_TIMEOUT_S must be < CHAT_TOTAL_TIMEOUT_S")
        if self.chat_retrieval_timeout_s + self.chat_rewrite_timeout_s + self.chat_intent_timeout_s >= self.chat_total_timeout_s:
            raise ValueError("pre-generation stage timeouts must leave room inside CHAT_TOTAL_TIMEOUT_S")
        if self.chat_lease_refresh_s * 2 > self.chat_lease_ttl_s:
            raise ValueError("CHAT_LEASE_REFRESH_S must be <= CHAT_LEASE_TTL_S / 2 (a lease must survive a missed refresh)")
        if self.chat_reservation_ttl_s <= self.chat_total_timeout_s:
            raise ValueError("CHAT_RESERVATION_TTL_S must exceed CHAT_TOTAL_TIMEOUT_S")
        if self.chat_max_streams_per_user > self.chat_global_max_streams:
            raise ValueError("CHAT_MAX_STREAMS_PER_USER must be <= CHAT_GLOBAL_MAX_STREAMS")
        return self


@lru_cache(maxsize=1)
def get_chat_settings() -> ChatSettings:
    return ChatSettings()
