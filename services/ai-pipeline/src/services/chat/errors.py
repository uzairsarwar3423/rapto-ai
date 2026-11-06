"""
services/chat/errors.py
───────────────────────
Typed chat errors → HTTP status (pre-stream) or SSE `error` code (in-stream).

PRE-STREAM codes only ever become real HTTP statuses (the route handler raises
them during PREFLIGHT, before any byte of the 200 stream is written).
IN-STREAM codes are the four the SSE contract defines.
"""

from __future__ import annotations

from typing import Optional


class ChatError(Exception):
    """Base class. `public_message` is safe to return to a client (no internals)."""

    http_status: int = 500
    code: str = "INTERNAL"
    public_message: str = "Something went wrong."
    retryable: bool = False

    def __init__(self, message: Optional[str] = None, *, retry_after_s: Optional[int] = None,
                 extra: Optional[dict[str, object]] = None) -> None:
        super().__init__(message or self.public_message)
        self.retry_after_s = retry_after_s
        self.extra = extra or {}

    def to_body(self) -> dict[str, object]:
        body: dict[str, object] = {"code": self.code, "message": self.public_message, "retryable": self.retryable}
        if self.retry_after_s is not None:
            body["retry_after_s"] = self.retry_after_s
        body.update(self.extra)
        return {"error": body}

    def headers(self) -> dict[str, str]:
        return {"Retry-After": str(self.retry_after_s)} if self.retry_after_s is not None else {}


# ── Pre-stream (HTTP) ─────────────────────────────────────────────────────────

class UnauthenticatedError(ChatError):
    http_status, code, public_message = 401, "UNAUTHENTICATED", "Authentication required."


class ForbiddenError(ChatError):
    http_status, code, public_message = 403, "FORBIDDEN", "This feature is not available for your plan."


class FeatureDisabledError(ChatError):
    http_status, code, public_message, retryable = 503, "FEATURE_DISABLED", "Chat is temporarily unavailable.", True


class NotFoundError(ChatError):
    """Also used for foreign sessions/messages: never 403, so existence is not an oracle."""
    http_status, code, public_message = 404, "NOT_FOUND", "Not found."


class DuplicateInFlightError(ChatError):
    http_status, code, public_message = 409, "DUPLICATE_IN_FLIGHT", "This message is already being answered."

    def __init__(self, request_id: str) -> None:
        super().__init__(extra={"request_id": request_id})


class SessionBusyError(ChatError):
    http_status, code, public_message = 409, "SESSION_BUSY", "Another answer is still being written in this conversation."


class InvalidInputError(ChatError):
    http_status, code = 422, "INVALID_INPUT"

    def __init__(self, message: str = "Invalid input.", *, field: Optional[str] = None) -> None:
        super().__init__(message, extra={"field": field} if field else None)
        self.public_message = message


class RateLimitedError(ChatError):
    http_status, code, public_message, retryable = 429, "RATE_LIMITED", "Too many requests. Please slow down.", True


class TooManyStreamsError(ChatError):
    http_status, code, public_message, retryable = 429, "TOO_MANY_STREAMS", "Too many active answers. Please wait for one to finish.", True


class QuotaExceededError(ChatError):
    http_status, code, public_message = 429, "QUOTA_EXCEEDED", "You have reached your usage limit."

    def __init__(self, kind: str, *, retry_after_s: Optional[int] = None) -> None:
        super().__init__(retry_after_s=retry_after_s, extra={"limit": kind})


class QuotaUnavailableError(ChatError):
    """Redis is down and the plan fails closed (free). Contract extension, documented in sse_protocol_v1.md."""
    http_status, code, public_message, retryable = 503, "QUOTA_UNAVAILABLE", "Usage accounting is temporarily unavailable.", True


class ModelUnavailableError(ChatError):
    http_status, code, public_message, retryable = 503, "MODEL_UNAVAILABLE", "The assistant is temporarily unavailable.", True


# ── In-stream (SSE `error` event) ─────────────────────────────────────────────

class GenerationFailure(ChatError):
    """Raised inside the stream phase; mapped to an SSE error event, never an HTTP status."""
    code = "INTERNAL"

    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.public_message = message
        self.retryable = retryable


class ProviderError(Exception):
    """Raised by a ChatStreamer. `kind` ∈ {rate_limit, server, timeout, client, filtered}."""

    def __init__(self, kind: str, message: str = "", *, retryable: bool = False) -> None:
        super().__init__(message or kind)
        self.kind = kind
        self.retryable = retryable

    @property
    def counts_for_breaker(self) -> bool:
        """Only server-side failures feed the breaker (a 400/safety block says nothing about provider health)."""
        return self.kind in {"rate_limit", "server", "timeout"}


class StreamCancelled(Exception):
    """Internal control flow: the request was cancelled (client gone / stall / shutdown)."""


class DependencyUnavailableError(ChatError):
    """A required backing store (Postgres for scope/filters) is down. Distinct from MODEL_UNAVAILABLE."""
    http_status, code, public_message, retryable = 503, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable.", True
