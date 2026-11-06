"""
services/chat/llm.py
────────────────────
The streaming answer-model boundary.

`ChatStreamer` is a Protocol so the orchestrator never imports a provider SDK. Only OpenAI is implemented
(the project's provider today); the plan's Gemini client (assumption A1) would be a second implementation of
the same Protocol — the system prompt travels in the provider's SYSTEM channel, usage arrives as metadata,
and provider failures are normalized to `ProviderError(kind, retryable)`.

Also here: a provider circuit breaker that only counts SERVER-SIDE failures (5xx / 429 / timeouts) and has a
MINIMUM-THROUGHPUT rule (a 20-call window is meaningless at low traffic: 1 failure in 2 calls is not an outage).
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass
from typing import AsyncIterator, Callable, Optional, Protocol

import structlog

from src.config.chat_config import ChatSettings
from src.config.model_routing import resolve_model
from src.config.settings import Settings
from src.models.common import TaskType
from src.rag.metrics import metrics
from src.services.chat.errors import ProviderError

log = structlog.get_logger(__name__)


@dataclass
class StreamDelta:
    text: str = ""
    finish_reason: Optional[str] = None          # normalized: stop | length | filtered
    usage: Optional[tuple[int, int]] = None      # (input_tokens, output_tokens), from provider metadata


class ChatStreamer(Protocol):
    def stream(self, *, system: str, user: str, max_tokens: int, temperature: float,
               model: Optional[str] = None) -> AsyncIterator[StreamDelta]: ...


_FINISH = {"stop": "stop", "length": "length", "content_filter": "filtered"}


def map_openai_error(exc: BaseException) -> ProviderError:
    import openai
    if isinstance(exc, openai.RateLimitError):
        return ProviderError("rate_limit", "provider rate limited", retryable=True)
    if isinstance(exc, (openai.APITimeoutError, openai.APIConnectionError)):
        return ProviderError("timeout", "provider timeout/connection", retryable=True)
    if isinstance(exc, openai.APIStatusError):
        if exc.status_code >= 500:
            return ProviderError("server", f"provider {exc.status_code}", retryable=True)
        if "content_filter" in str(getattr(exc, "code", "") or "") or "content_filter" in str(exc).lower():
            return ProviderError("filtered", "blocked by provider safety", retryable=False)
        return ProviderError("client", f"provider rejected request ({exc.status_code})", retryable=False)
    return ProviderError("server", type(exc).__name__, retryable=False)


class OpenAIChatStreamer:
    def __init__(self, app_settings: Settings, chat_settings: ChatSettings) -> None:
        from openai import AsyncOpenAI
        kwargs: dict = {"api_key": app_settings.openai_api_key.get_secret_value(),
                        "timeout": chat_settings.chat_total_timeout_s, "max_retries": 0}   # retries are OURS (first-token only)
        if app_settings.openai_org_id:
            kwargs["organization"] = app_settings.openai_org_id
        self._client = AsyncOpenAI(**kwargs)
        self._settings = app_settings
        self._chat = chat_settings

    def model_name(self) -> str:
        return self._chat.chat_answer_model or resolve_model(TaskType.CHAT_ANSWER, self._settings)[0]

    async def stream(self, *, system: str, user: str, max_tokens: int, temperature: float,
                     model: Optional[str] = None) -> AsyncIterator[StreamDelta]:
        name = model or self.model_name()
        try:
            resp = await self._client.chat.completions.create(
                model=name, messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                stream=True, stream_options={"include_usage": True}, max_tokens=max_tokens, temperature=temperature)
        except Exception as exc:  # noqa: BLE001
            raise map_openai_error(exc) from exc
        try:
            async for chunk in resp:
                if getattr(chunk, "usage", None):
                    yield StreamDelta(usage=(chunk.usage.prompt_tokens, chunk.usage.completion_tokens))
                for choice in chunk.choices or []:
                    text = getattr(choice.delta, "content", None) or ""
                    finish = _FINISH.get(choice.finish_reason or "", None) if choice.finish_reason else None
                    if text or finish:
                        yield StreamDelta(text=text, finish_reason=finish)
        except ProviderError:
            raise
        except Exception as exc:  # noqa: BLE001 — mid-stream failure
            raise map_openai_error(exc) from exc
        finally:
            try:
                await resp.close()
            except Exception:  # noqa: BLE001
                pass


# ─── circuit breaker ──────────────────────────────────────────────────────────

class ProviderBreaker:
    """closed → open (failure ratio over a window, with a MINIMUM number of calls) → half-open after a
    cool-down (ONE trial) → closed/open. Only counts_for_breaker failures are recorded as failures."""

    def __init__(self, settings: ChatSettings, clock: Callable[[], float] = time.monotonic) -> None:
        self._min = settings.chat_breaker_min_calls
        self._ratio = settings.chat_breaker_failure_ratio
        self._window = settings.chat_breaker_window_s
        self._open_s = settings.chat_breaker_open_s
        self._clock = clock
        self._calls: deque[tuple[float, bool]] = deque()
        self._opened_at: Optional[float] = None
        self._trial = False

    def _trim(self) -> None:
        cutoff = self._clock() - self._window
        while self._calls and self._calls[0][0] < cutoff:
            self._calls.popleft()

    @property
    def state(self) -> str:
        if self._opened_at is None:
            return "closed"
        return "half_open" if self._clock() - self._opened_at >= self._open_s else "open"

    @property
    def is_open(self) -> bool:
        """Non-consuming check for preflight fast-fail (allow() would burn the half-open trial)."""
        return self.state == "open"

    def allow(self) -> bool:
        s = self.state
        if s == "closed":
            return True
        if s == "half_open" and not self._trial:
            self._trial = True
            return True
        return False

    def record(self, ok: bool) -> None:
        now = self._clock()
        if self.state == "half_open" or self._trial:
            self._trial = False
            if ok:
                self._opened_at = None
                self._calls.clear()
            else:
                self._opened_at = now
            metrics.set_gauge("chat_breaker_open", 0.0 if self._opened_at is None else 1.0)
            return
        self._calls.append((now, ok))
        self._trim()
        n = len(self._calls)
        if n >= self._min and self._opened_at is None:
            failures = sum(1 for _, good in self._calls if not good)
            if failures / n >= self._ratio:
                self._opened_at = now
                metrics.inc("chat_breaker_opened_total")
                log.error("chat_breaker_opened", calls=n, failures=failures)
        metrics.set_gauge("chat_breaker_open", 0.0 if self._opened_at is None else 1.0)
