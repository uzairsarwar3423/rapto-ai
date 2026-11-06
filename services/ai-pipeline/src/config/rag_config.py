"""
config/rag_config.py
─────────────────────
RAG infrastructure configuration (Day 56).

TWO TIERS:
  1. FROZEN constants — changing one needs a schema migration + full re-embed,
     so they are code, never env vars (ADR-5).
  2. RUNTIME knobs — env-overridable, range-validated (RagSettings).

RAG is OPT-IN (RAG_ENABLED=false by default): the service must keep booting on
deployments whose Postgres has no pgvector yet.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ─── Frozen constants ─────────────────────────────────────────────────────────

EMBEDDING_MODEL: str = "text-embedding-3-small"
EMBEDDING_DIMENSIONS: int = 1536          # must equal vector(1536) in migration 001
CONTENT_HASH_ALGORITHM: str = "sha256"
HASH_NORMALIZATION_VERSION: int = 1       # bump → every content_hash changes (re-embed)
EMBEDDING_TOKENIZER: str = "cl100k_base"  # tokenizer of the text-embedding-3 family
EMBEDDING_MAX_ATTEMPTS: int = 5           # OpenAI retry budget (429/5xx/timeouts)

RAG_SCHEMA: str = "rag"
EMBEDDINGS_TABLE: str = "rag.embeddings"
JOBS_TABLE: str = "rag.embedding_jobs"
APP_ROLE: str = "vocaply_ai_app"

# MUST stay identical to the CHECK constraint in migration 001 (parity test).
SOURCE_TYPES: tuple[str, ...] = (
    "transcript_chunk",
    "commitment",
    "action_item",
    "decision",
    "summary",
    "digest",
)

# Metadata keys that callers may filter on (validated against this allow-list).
FILTERABLE_METADATA_KEYS: frozenset[str] = frozenset(
    {"meeting_id", "speaker_name", "speaker_user_id", "commitment_owner_id"}
)

IterativeScan = Literal["off", "strict_order", "relaxed_order"]


# ─── Runtime knobs ────────────────────────────────────────────────────────────


class RagSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Feature flags / connections ───────────────────────────────────────────
    rag_enabled: bool = False
    # Runtime DSN — MUST connect as the NOBYPASSRLS role (vocaply_ai_app).
    rag_database_url: SecretStr | None = None
    # Owner/admin DSN, used ONLY by `python -m src.rag.migrate` (never at runtime).
    rag_admin_database_url: SecretStr | None = None
    # Optional read-only DSN onto the application tables (commitments, meetings…)
    # for backfill. Unset → backfill can only read transcripts from MongoDB.
    rag_source_database_url: SecretStr | None = None
    # True when rag_database_url goes through a transaction-mode pooler
    # (Supavisor / PgBouncer): disables the prepared-statement cache.
    rag_db_pooled: bool = False
    rag_pool_min_size: int = Field(default=2, ge=1, le=50)
    rag_pool_max_size: int = Field(default=10, ge=1, le=100)
    rag_db_command_timeout_seconds: float = Field(default=30.0, gt=0)
    rag_db_max_attempts: int = Field(default=3, ge=1, le=6)
    # Mongo database holding the `transcripts` collection (backfill source).
    rag_mongo_database: str = "rapto"

    # ── Embedding pipeline ────────────────────────────────────────────────────
    embedding_batch_size: int = Field(default=100, ge=1, le=2048)
    embedding_batch_max_tokens: int = Field(default=100_000, ge=1_000, le=250_000)
    embedding_max_input_tokens: int = Field(default=8_000, ge=16, le=8_191)
    embedding_concurrency: int = Field(default=5, ge=1, le=20)
    # Process-local budget. With N replicas set this to (org TPM limit * 0.8) / N.
    embedding_tpm_budget: int = Field(default=800_000, ge=1_000)

    # ── Search ────────────────────────────────────────────────────────────────
    hnsw_ef_search: int = Field(default=100, ge=10, le=1_000)
    hnsw_iterative_scan: IterativeScan = "relaxed_order"
    hnsw_max_scan_tuples: int = Field(default=20_000, ge=100)
    similarity_top_k: int = Field(default=20, ge=1, le=100)
    rerank_top_n: int = Field(default=8, ge=1)
    min_similarity: float = Field(default=0.0, ge=0.0, le=1.0)
    search_statement_timeout_ms: int = Field(default=2_000, ge=100)
    # Steer the planner to the HNSW index inside search transactions (transaction-local).
    # Measured on 50k vectors: the default plan is an exact Seq Scan + Sort (~790 ms) because
    # pgvector's HNSW cost is pessimistic and TOAST detoasting is not costed; HNSW takes ~11 ms.
    # Small tenants still use the btree path (exact, ~7 ms). Set false to let the planner decide.
    rag_force_index_search: bool = True

    # ── Limits ────────────────────────────────────────────────────────────────
    max_chunks_per_source: int = Field(default=200, ge=1, le=10_000)
    max_upsert_request_chunks: int = Field(default=1_000, ge=1, le=10_000)
    rag_max_concurrent_upserts: int = Field(default=8, ge=1, le=100)
    rag_upsert_write_batch_rows: int = Field(default=500, ge=1, le=5_000)
    idempotency_ttl_seconds: int = Field(default=86_400, ge=60)
    query_embedding_cache_size: int = Field(default=1_024, ge=0)

    # ── Chunking for RAG (smaller than the 90k-token extraction chunks) ──────
    rag_chunk_max_tokens: int = Field(default=400, ge=50, le=4_000)
    rag_chunk_overlap_turns: int = Field(default=1, ge=0, le=10)

    # ── Backfill worker ───────────────────────────────────────────────────────
    rag_worker_enabled: bool = False
    rag_worker_poll_seconds: float = Field(default=5.0, gt=0)
    rag_job_heartbeat_stale_seconds: int = Field(default=300, ge=30)
    rag_job_checkpoint_every_sources: int = Field(default=25, ge=1)
    rag_backfill_page_size: int = Field(default=50, ge=1, le=1_000)

    @model_validator(mode="after")
    def _cross_field_checks(self) -> "RagSettings":
        if self.hnsw_ef_search < self.similarity_top_k:
            raise ValueError(
                f"HNSW_EF_SEARCH ({self.hnsw_ef_search}) must be >= SIMILARITY_TOP_K "
                f"({self.similarity_top_k}); ef_search caps the candidates HNSW can return"
            )
        if self.rerank_top_n > self.similarity_top_k:
            raise ValueError("RERANK_TOP_N must be <= SIMILARITY_TOP_K")
        if self.rag_pool_min_size > self.rag_pool_max_size:
            raise ValueError("RAG_POOL_MIN_SIZE must be <= RAG_POOL_MAX_SIZE")
        if self.embedding_max_input_tokens > self.embedding_batch_max_tokens:
            raise ValueError("EMBEDDING_MAX_INPUT_TOKENS must be <= EMBEDDING_BATCH_MAX_TOKENS")
        if self.rag_enabled and self.rag_database_url is None:
            raise ValueError("RAG_ENABLED=true requires RAG_DATABASE_URL")
        return self


@lru_cache(maxsize=1)
def get_rag_settings() -> RagSettings:
    return RagSettings()
