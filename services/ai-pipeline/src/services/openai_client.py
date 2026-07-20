"""
services/openai_client.py
─────────────────────────
Core AI client — powered by native OpenAI API.

TRANSPORT CHANGE (Migration to GPT-4.1 Mini):
  Switched to OpenAI's native API. The public interface remains UNCHANGED —
  callers still use generate_structured(), generate_text(), embed().

RESPONSIBILITIES:
  (a) Construction   — single AsyncOpenAI client instance per process
  (b) generate_structured() — schema-first structured output with parse() + retry
  (c) generate_text()       — free-text generation with retry
  (d) embed()               — batch embedding
  (e) Timeout enforcement   — per-attempt timeout (inside tenacity loop)
  (f) Concurrency control   — process-local semaphore
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Generic, Type, TypeVar, cast

import structlog
from openai import AsyncOpenAI, APIStatusError, APITimeoutError, RateLimitError
from pydantic import BaseModel, ValidationError
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from src.config.logging import get_logger
from src.config.model_routing import compute_cost, resolve_model, MODEL_TASK_TEMPERATURE_OVERRIDES
from src.config.settings import Settings, get_settings
from src.models.common import CostRecord, AICallResult, ModelTier, TaskType
from src.models.exceptions import (
    AINonRetryableError,
    AIRateLimitExhaustedError,
    AIRefusalError,
    AISchemaValidationError,
    AITimeoutError,
)

log: structlog.BoundLogger = get_logger(__name__)

T = TypeVar("T", bound=BaseModel)


# ─── SDK Error Classification Helpers ─────────────────────────────────────────

def _is_rate_limit_error(exc: BaseException) -> bool:
    """True for 429 / rate-limit errors from OpenAI."""
    if isinstance(exc, RateLimitError):
        return True
    exc_str = str(exc).lower()
    return "429" in exc_str or "quota" in exc_str or "rate_limit" in exc_str or "resource_exhausted" in exc_str


def _is_server_error(exc: BaseException) -> bool:
    """True for 5xx server errors from OpenAI (retryable)."""
    if isinstance(exc, APIStatusError) and exc.status_code >= 500:
        return True
    exc_str = str(exc).lower()
    return any(code in exc_str for code in ("500", "503", "504", "server error", "internal"))


def _is_non_retryable_error(exc: BaseException) -> bool:
    """True for 400/401/403 — auth failures or bad requests (never retry)."""
    if isinstance(exc, APIStatusError) and exc.status_code in (400, 401, 403):
        return True
    exc_str = str(exc).lower()
    return any(
        code in exc_str
        for code in ("400", "401", "403", "invalid_argument", "permission_denied", "unauthenticated")
    )


def _extract_status_code(exc: BaseException) -> int:
    """Best-effort status code extraction."""
    if isinstance(exc, APIStatusError):
        return exc.status_code
    exc_str = str(exc)
    for code in (400, 401, 403, 404, 429, 500, 503, 504):
        if str(code) in exc_str:
            return code
    return 0


# ─── OpenAIClient ─────────────────────────────────────────────────────────────


class OpenAIClient:
    """Async AI client backed by OpenAI API — one instance per process.

    Args:
        settings: The application settings (injected for testability).
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

        kwargs: dict[str, Any] = {
            "api_key": self._settings.openai_api_key.get_secret_value(),
            "timeout": self._settings.openai_timeout_seconds,
        }
        if self._settings.openai_org_id:
            kwargs["organization"] = self._settings.openai_org_id

        # AsyncOpenAI client pointed at native OpenAI
        self._client = AsyncOpenAI(**kwargs)

        self._semaphore = asyncio.Semaphore(self._settings.openai_max_concurrent_calls)

        log.info(
            "OpenAIClient initialized",
            provider="openai",
            mini_model=self._settings.openai_gpt41_mini_model_name,
            full_model=self._settings.openai_gpt41_model_name,
            max_concurrent=self._settings.openai_max_concurrent_calls,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # (b) Structured Output Generation
    # ─────────────────────────────────────────────────────────────────────────

    async def generate_structured(
        self,
        task_type: TaskType,
        system_prompt: str,
        user_prompt: str,
        response_schema: type[T],
    ) -> AICallResult[T]:
        """Generate structured output validated against a Pydantic schema."""
        model_name, model_tier = resolve_model(task_type, self._settings)
        start_time = time.monotonic()

        async with self._semaphore:
            return await self._generate_structured_with_retry(
                task_type=task_type,
                model_name=model_name,
                model_tier=model_tier,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                response_schema=response_schema,
                start_time=start_time,
            )

    async def _generate_structured_with_retry(
        self,
        task_type: TaskType,
        model_name: str,
        model_tier: ModelTier,
        system_prompt: str,
        user_prompt: str,
        response_schema: type[T],
        start_time: float,
    ) -> AICallResult[T]:
        total_retry_count = 0
        last_exc: BaseException | None = None

        try:
            async for attempt in AsyncRetrying(
                wait=wait_exponential(multiplier=1.0, min=1, max=20),
                stop=stop_after_attempt(self._settings.openai_max_retries),
                retry=retry_if_exception(
                    lambda exc: not isinstance(exc, (AINonRetryableError, AISchemaValidationError))
                ),
                reraise=False,
            ):
                with attempt:
                    total_retry_count = attempt.retry_state.attempt_number - 1

                    try:
                        parsed_data, usage, raw_text = await self._call_openai_parsed(
                            model_name=model_name,
                            system_prompt=system_prompt,
                            user_prompt=user_prompt,
                            response_schema=response_schema,
                            task_type=task_type,
                        )
                    except Exception as exc:
                        if isinstance(exc, ValidationError):
                            # schema validation failure from native parsing
                            parsed_data, usage, raw_text = await self._corrective_schema_retry(
                                model_name=model_name,
                                system_prompt=system_prompt,
                                user_prompt=user_prompt,
                                raw_bad_response=getattr(exc, "raw_response", str(exc)),
                                response_schema=response_schema,
                                task_type=task_type,
                                model_tier=model_tier,
                                validation_error=exc,
                            )
                            total_retry_count += 1
                        elif _is_non_retryable_error(exc):
                            raise AINonRetryableError(
                                f"Non-retryable OpenAI error: {exc}",
                                upstream_status_code=_extract_status_code(exc),
                                upstream_message=str(exc),
                                task_type=task_type,
                                model_tier=model_tier,
                            ) from exc
                        elif _is_rate_limit_error(exc) or _is_server_error(exc):
                            last_exc = exc
                            raise
                        elif isinstance(exc, (asyncio.TimeoutError, APITimeoutError)):
                            last_exc = exc
                            raise
                        else:
                            raise AINonRetryableError(
                                f"Unexpected OpenAI error: {exc}",
                                upstream_status_code=0,
                                upstream_message=str(exc),
                                task_type=task_type,
                                model_tier=model_tier,
                            ) from exc

        except AINonRetryableError:
            raise
        except AISchemaValidationError:
            raise
        except RetryError as re:
            latency_ms = (time.monotonic() - start_time) * 1000
            root_cause = last_exc or re

            self._log_call(
                event="ai_call_failed",
                task_type=task_type,
                model_tier=model_tier,
                model_name=model_name,
                latency_ms=latency_ms,
                retry_count=total_retry_count,
                error=str(root_cause),
            )

            if root_cause and _is_rate_limit_error(root_cause):
                raise AIRateLimitExhaustedError(
                    f"OpenAI rate limit exhausted after {total_retry_count} retries",
                    task_type=task_type,
                    model_tier=model_tier,
                    attempt_count=total_retry_count,
                ) from re

            raise AITimeoutError(
                f"OpenAI call failed after {total_retry_count} retries",
                timeout_seconds=self._settings.openai_timeout_seconds,
                task_type=task_type,
                model_tier=model_tier,
                attempt_count=total_retry_count,
            ) from re

        except (asyncio.TimeoutError, APITimeoutError) as te:
            latency_ms = (time.monotonic() - start_time) * 1000
            self._log_call(
                event="ai_call_timeout",
                task_type=task_type,
                model_tier=model_tier,
                model_name=model_name,
                latency_ms=latency_ms,
                retry_count=total_retry_count,
                error=str(te),
            )
            raise AITimeoutError(
                "OpenAI call timed out",
                timeout_seconds=self._settings.openai_timeout_seconds,
                task_type=task_type,
                model_tier=model_tier,
                attempt_count=total_retry_count,
            ) from te

        latency_ms = (time.monotonic() - start_time) * 1000
        cost_record = self._build_cost_record(usage, model_tier, model_name)

        self._log_call(
            event="ai_call_success",
            task_type=task_type,
            model_tier=model_tier,
            model_name=model_name,
            latency_ms=latency_ms,
            retry_count=total_retry_count,
            input_tokens=cost_record.input_tokens,
            output_tokens=cost_record.output_tokens,
            total_tokens=cost_record.total_tokens,
            estimated_cost_usd=cost_record.estimated_cost_usd,
        )

        return AICallResult(
            data=parsed_data,
            cost=cost_record,
            latency_ms=latency_ms,
            retry_count=total_retry_count,
            task_type=task_type,
            model_name=model_name,
        )

    async def _corrective_schema_retry(
        self,
        model_name: str,
        system_prompt: str,
        user_prompt: str,
        raw_bad_response: str,
        response_schema: type[T],
        task_type: TaskType,
        model_tier: ModelTier,
        validation_error: ValidationError,
    ) -> tuple[T, dict[str, int], str]:
        """One corrective re-issue when structured output fails schema validation."""
        corrective_prompt = (
            f"{user_prompt}\n\n"
            "IMPORTANT: Your previous response did not match the required JSON schema. "
            f"Validation error: {validation_error}. "
            "Please respond with valid JSON that strictly matches the required schema. "
            "Do not include any text outside the JSON object."
        )

        log.warning(
            "ai_schema_mismatch_corrective_retry",
            task_type=task_type.value,
            model_name=model_name,
            validation_error=str(validation_error)[:200],
        )

        try:
            return await self._call_openai_parsed(
                model_name=model_name,
                system_prompt=system_prompt,
                user_prompt=corrective_prompt,
                response_schema=response_schema,
                task_type=task_type,
            )
        except ValidationError as ve2:
            raise AISchemaValidationError(
                "Structured output failed schema validation after corrective retry",
                raw_response=getattr(ve2, "raw_response", raw_bad_response),
                validation_error=str(ve2),
                task_type=task_type,
                model_tier=model_tier,
                attempt_count=2,
            ) from ve2

    # ─────────────────────────────────────────────────────────────────────────
    # (c) Free-Text Generation
    # ─────────────────────────────────────────────────────────────────────────

    async def generate_text(
        self,
        task_type: TaskType,
        system_prompt: str,
        user_prompt: str,
    ) -> AICallResult[str]:
        model_name, model_tier = resolve_model(task_type, self._settings)
        start_time = time.monotonic()

        async with self._semaphore:
            total_retry_count = 0
            last_exc: BaseException | None = None

            try:
                async for attempt in AsyncRetrying(
                    wait=wait_exponential(multiplier=1.0, min=1, max=20),
                    stop=stop_after_attempt(self._settings.openai_max_retries),
                    retry=retry_if_exception(
                        lambda exc: not isinstance(exc, AINonRetryableError)
                    ),
                    reraise=False,
                ):
                    with attempt:
                        total_retry_count = attempt.retry_state.attempt_number - 1
                        try:
                            raw_text, usage = await self._call_openai_text(
                                model_name=model_name,
                                system_prompt=system_prompt,
                                user_prompt=user_prompt,
                            )
                        except Exception as exc:
                            if _is_non_retryable_error(exc):
                                raise AINonRetryableError(
                                    f"Non-retryable OpenAI error: {exc}",
                                    upstream_status_code=_extract_status_code(exc),
                                    upstream_message=str(exc),
                                    task_type=task_type,
                                    model_tier=model_tier,
                                ) from exc
                            last_exc = exc
                            raise

            except AINonRetryableError:
                raise
            except RetryError as re:
                latency_ms = (time.monotonic() - start_time) * 1000
                self._log_call(
                    event="ai_text_call_failed",
                    task_type=task_type,
                    model_tier=model_tier,
                    model_name=model_name,
                    latency_ms=latency_ms,
                    retry_count=total_retry_count,
                    error=str(last_exc or re),
                )
                if last_exc and _is_rate_limit_error(last_exc):
                    raise AIRateLimitExhaustedError(
                        f"OpenAI rate limit exhausted after {total_retry_count} retries",
                        task_type=task_type,
                        model_tier=model_tier,
                        attempt_count=total_retry_count,
                    ) from re
                raise AITimeoutError(
                    "OpenAI text call failed after retries",
                    timeout_seconds=self._settings.openai_timeout_seconds,
                    task_type=task_type,
                    model_tier=model_tier,
                    attempt_count=total_retry_count,
                ) from re

        latency_ms = (time.monotonic() - start_time) * 1000
        cost_record = self._build_cost_record(usage, model_tier, model_name)

        self._log_call(
            event="ai_text_call_success",
            task_type=task_type,
            model_tier=model_tier,
            model_name=model_name,
            latency_ms=latency_ms,
            retry_count=total_retry_count,
            input_tokens=cost_record.input_tokens,
            output_tokens=cost_record.output_tokens,
            estimated_cost_usd=cost_record.estimated_cost_usd,
        )

        return AICallResult(
            data=raw_text,
            cost=cost_record,
            latency_ms=latency_ms,
            retry_count=total_retry_count,
            task_type=task_type,
            model_name=model_name,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # (d) Embedding Generation
    # ─────────────────────────────────────────────────────────────────────────

    async def embed(
        self,
        texts: list[str],
    ) -> AICallResult[list[list[float]]]:
        model_name, model_tier = resolve_model(TaskType.EMBEDDING, self._settings)
        start_time = time.monotonic()
        total_retry_count = 0
        last_exc: BaseException | None = None

        async with self._semaphore:
            try:
                async for attempt in AsyncRetrying(
                    wait=wait_exponential(multiplier=1.0, min=1, max=20),
                    stop=stop_after_attempt(self._settings.openai_max_retries),
                    retry=retry_if_exception(
                        lambda exc: not isinstance(exc, AINonRetryableError)
                    ),
                    reraise=False,
                ):
                    with attempt:
                        total_retry_count = attempt.retry_state.attempt_number - 1
                        try:
                            response = await self._client.embeddings.create(
                                model=model_name,
                                input=texts,
                            )
                        except Exception as exc:
                            if _is_non_retryable_error(exc):
                                raise AINonRetryableError(
                                    f"Embedding non-retryable error: {exc}",
                                    upstream_status_code=_extract_status_code(exc),
                                    upstream_message=str(exc),
                                    task_type=TaskType.EMBEDDING,
                                    model_tier=model_tier,
                                ) from exc
                            last_exc = exc
                            raise
            except AINonRetryableError:
                raise
            except RetryError as re:
                root = last_exc or re
                if root and _is_rate_limit_error(root):
                    raise AIRateLimitExhaustedError(
                        f"Embedding rate limit exhausted after {total_retry_count} retries",
                        task_type=TaskType.EMBEDDING,
                        model_tier=model_tier,
                        attempt_count=total_retry_count,
                    ) from re
                raise AITimeoutError(
                    "Embedding call failed after retries",
                    timeout_seconds=self._settings.openai_timeout_seconds,
                    task_type=TaskType.EMBEDDING,
                    model_tier=model_tier,
                    attempt_count=total_retry_count,
                ) from re

        embeddings = [list(e.embedding) for e in response.data]
        latency_ms = (time.monotonic() - start_time) * 1000

        usage_obj = response.usage
        input_tokens = usage_obj.prompt_tokens if usage_obj else sum(len(t.split()) for t in texts)

        cost_record = self._build_cost_record(
            {"input_token_count": input_tokens, "output_token_count": 0},
            model_tier,
            model_name,
        )

        self._log_call(
            event="ai_embed_success",
            task_type=TaskType.EMBEDDING,
            model_tier=model_tier,
            model_name=model_name,
            latency_ms=latency_ms,
            retry_count=0,
            text_count=len(texts),
            estimated_cost_usd=cost_record.estimated_cost_usd,
        )

        return AICallResult(
            data=embeddings,
            cost=cost_record,
            latency_ms=latency_ms,
            retry_count=0,
            task_type=TaskType.EMBEDDING,
            model_name=model_name,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Internal Helpers
    # ─────────────────────────────────────────────────────────────────────────

    async def _call_openai_parsed(
        self,
        model_name: str,
        system_prompt: str,
        user_prompt: str,
        response_schema: type[T],
        task_type: TaskType,
    ) -> tuple[T, dict[str, int], str]:
        messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        response = await self._client.beta.chat.completions.parse(
            model=model_name,
            messages=[
                # cache_control enables OpenAI prompt caching for long system prompts.
                # Repeated identical system prompts (same meeting, multiple chunks)
                # are served from cache — ~50% cost reduction on input tokens.
                {"role": "system", "content": [
                    {"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}
                ]},
                {"role": "user", "content": user_prompt},
            ],
            response_format=response_schema,
            temperature=MODEL_TASK_TEMPERATURE_OVERRIDES.get(task_type),
        )

        choice = response.choices[0]
        if choice.message.refusal:
            # FIX: Refusals are OpenAI policy decisions, not schema failures.
            # Raising ValidationError here was wrong — it triggered a costly
            # corrective retry. AINonRetryableError surfaces to the caller
            # correctly without retrying.
            raise AINonRetryableError(
                f"OpenAI refused the request: {choice.message.refusal[:200]}",
                upstream_status_code=200,  # HTTP 200 but logically a refusal
                upstream_message=choice.message.refusal,
                task_type=task_type,
                model_tier=ModelTier.MINI,  # placeholder — resolved by caller
            )

        if not choice.message.parsed:
            exc = ValidationError.from_exception_data("Parsing Failed", [])
            exc.raw_response = choice.message.content or ""
            raise exc

        raw_text = choice.message.content or ""
        parsed_data = choice.message.parsed

        usage_obj = response.usage
        usage: dict[str, int] = {
            "input_token_count": usage_obj.prompt_tokens if usage_obj else 0,
            "output_token_count": usage_obj.completion_tokens if usage_obj else 0,
        }

        return parsed_data, usage, raw_text

    async def _call_openai_text(
        self,
        model_name: str,
        system_prompt: str,
        user_prompt: str,
    ) -> tuple[str, dict[str, int]]:
        # Use cache_control on system prompt for cost reduction on repeated calls
        messages: list[dict] = [
            {"role": "system", "content": [
                {"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}
            ]},
            {"role": "user", "content": user_prompt},
        ]

        from openai.types.chat import ChatCompletion
        response = cast(ChatCompletion, await self._client.chat.completions.create(
            model=model_name,
            messages=messages,
        ))

        raw_text = response.choices[0].message.content or ""

        usage_obj = response.usage
        usage: dict[str, int] = {
            "input_token_count": usage_obj.prompt_tokens if usage_obj else 0,
            "output_token_count": usage_obj.completion_tokens if usage_obj else 0,
        }

        return raw_text, usage

    def _build_cost_record(
        self,
        usage: dict[str, int],
        model_tier: ModelTier,
        model_name: str,
    ) -> CostRecord:
        input_tokens = usage.get("input_token_count", 0)
        output_tokens = usage.get("output_token_count", 0)
        estimated_cost = compute_cost(input_tokens, output_tokens, model_tier)

        return CostRecord(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model_tier=model_tier,
            model_name=model_name,
            estimated_cost_usd=estimated_cost,
        )

    def _log_call(
        self,
        event: str,
        task_type: TaskType,
        model_tier: ModelTier,
        model_name: str,
        latency_ms: float,
        retry_count: int,
        **extra: Any,
    ) -> None:
        log.info(
            event,
            task_type=task_type.value,
            model_tier=model_tier.value,
            model_name=model_name,
            latency_ms=round(latency_ms, 2),
            retry_count=retry_count,
            **extra,
        )
