"""
rag/errors.py
──────────────
RAG-specific errors. All subclass AIPipelineError, so the global handler turns
them into the standard {error_code, message, request_id} envelope with the
right HTTP status (§8 of the plan).
"""

from __future__ import annotations

from src.models.exceptions import AIPipelineError


class RagError(AIPipelineError):
    error_code = "RAG_ERROR"


class RagDisabledError(RagError):
    error_code = "RAG_DISABLED"
    http_status = 503


class RagValidationError(RagError):
    error_code = "RAG_VALIDATION_ERROR"
    http_status = 400


class RagConflictError(RagError):
    error_code = "RAG_CONFLICT"
    http_status = 409


class PayloadTooLargeError(RagError):
    error_code = "PAYLOAD_TOO_LARGE"
    http_status = 413


class RagBusyError(RagError):
    error_code = "RAG_BUSY"
    http_status = 429


class RagUnavailableError(RagError):
    """Database unavailable / timed out."""

    error_code = "RAG_DATABASE_UNAVAILABLE"
    http_status = 503


class UpstreamEmbeddingError(RagError):
    """OpenAI failed after retries and nothing could be embedded."""

    error_code = "EMBEDDING_UPSTREAM_FAILED"
    http_status = 502


class EmbeddingValidationError(RagError):
    """The embedding API returned a malformed vector (wrong dim / NaN / not normalised).

    Indicates a model or config mismatch → alert metric, whole batch rejected.
    """

    error_code = "EMBEDDING_VALIDATION_FAILED"
    http_status = 502


class TenantIsolationError(RagError):
    """A startup safety check failed (BYPASSRLS role, RLS not forced, wrong dim…)."""

    error_code = "TENANT_ISOLATION_MISCONFIGURED"
    http_status = 500


class RagNotFoundError(RagError):
    error_code = "RAG_NOT_FOUND"
    http_status = 404


class RetrievalTimeoutError(RagError):
    """A MANDATORY retrieval stage (embed / vector leg) ran out of its deadline."""

    error_code = "RETRIEVAL_TIMEOUT"
    http_status = 504

    def __init__(self, message: str, *, stage: str = "unknown") -> None:
        super().__init__(message, stage=stage)
        self.stage = stage
