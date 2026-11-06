"""
services/litellm_client.py
──────────────────────────
LiteLLM + instructor backed AI client — same public interface as OpenAIClient:

    generate_structured(task_type, system_prompt, user_prompt, response_schema) → AICallResult[T]
    generate_text(task_type, system_prompt, user_prompt)                       → AICallResult[str]
    embed(texts)                                                               → AICallResult[list[list[float]]]

TWO WAYS THIS CLIENT IS USED:
  1. As the process-wide backend (AI_CLIENT_BACKEND=litellm): OpenAI routes per
     tier, with *provider failover* to Claude when the primary keeps failing
     with retryable errors (429 / 5xx / timeouts) and Claude is configured.
  2. As the Claude-only fallback client (LiteLLMClient.claude_fallback()):
     used by services/extraction/confidence_gate.py to re-extract
     low-confidence chunks. No failover — it IS the fallback.

ERROR CONTRACT (identical to OpenAIClient so callers need no changes):
  AINonRetryableError        — 400/401/403/404, refusals, unexpected errors
  AISchemaValidationError    — output failed Pydantic validation after instructor re-asks
  AIRateLimitExhaustedError  — 429 after all retries (and failover, if any)
  AITimeoutError             — timeouts / 5xx after all retries (and failover, if any)
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, TypeVar

import structlog
from pydantic import BaseModel
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from src.config.litellm_config import (
    INSTRUCTOR_VALIDATION_RETRIES,
    PROVIDER_ANTHROPIC,
    LiteLLMRoute,
    claude_route,
    primary_route,
)
from src.config.logging import get_logger
from src.config.model_routing import (
    MODEL_TASK_TEMPERATURE_OVERRIDES,
    TASK_MODEL_MAP,
    compute_cost_for_model,
)
from src.config.settings import Settings, get_settings
from src.models.common import AICallResult, CostRecord, ModelTier, TaskType
from src.models.exceptions import (
    AINonRetryableError,
    AIRateLimitExhaustedError,
    AISchemaValidationError,
    AITimeoutError,
)

log: structlog.BoundLogger = get_logger(__name__)

T = TypeVar("T", bound=BaseModel)

_NON_RETRYABLE_STATUS = frozenset({400, 401, 403, 404, 422})


# ─── Error classification ─────────────────────────────────────────────────────


def _status_code(exc: BaseException) -> int:
    code = getattr(exc, "status_code", None)
    if isinstance(code, int):
        return code
    response = getattr(exc, "response", None)
    code = getattr(response, "status_code", None)
    return code if isinstance(code, int) else 0


def _root_api_error(exc: BaseException) -> BaseException:
    """Unwrap instructor / tenacity wrappers down to the provider exception."""
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if _status_code(current) or _is_timeout(current) or _is_connection_error(current):
            return current
        last_attempt = getattr(current, "last_attempt", None)
        nested = None
        if last_attempt is not None and hasattr(last_attempt, "exception"):
            try:
                nested = last_attempt.exception()
            except Exception:  # noqa: BLE001 — defensive unwrap only
                nested = None
        current = nested or current.__cause__ or current.__context__
    return exc


def _is_timeout(exc: BaseException) -> bool:
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return True
    name = type(exc).__name__.lower()
    return "timeout" in name


def _is_connection_error(exc: BaseException) -> bool:
    return "connection" in type(exc).__name__.lower()


def _is_rate_limit(exc: BaseException) -> bool:
    return _status_code(exc) == 429 or "ratelimit" in type(exc).__name__.lower()


def _is_retryable(exc: BaseException) -> bool:
    if _is_rate_limit(exc) or _is_timeout(exc) or _is_connection_error(exc):
        return True
    return _status_code(exc) >= 500


def _is_validation_failure(exc: BaseException) -> bool:
    """instructor raises InstructorRetryException once its re-asks are exhausted."""
    name = type(exc).__name__
    return name in {"InstructorRetryException", "ValidationError", "JSONDecodeError"}


class _RouteExhausted(Exception):
    """Internal: a route ran out of retries on a retryable error."""

    def __init__(self, root: BaseException, attempts: int) -> None:
        super().__init__(str(root))
        self.root = root
        self.attempts = attempts


# ─── Client ───────────────────────────────────────────────────────────────────


class LiteLLMClient:
    """Async LiteLLM client. One instance per role per process.

    Args:
        settings: Application settings.
        routes_override: Force every text/structured call through these routes
            (in order). Used to build the Claude-only fallback client.
        provider_failover: When True and Claude is configured, a primary route
            that exhausts its retries on retryable errors fails over to Claude.
        max_concurrent: Semaphore size for this client.
    """

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        routes_override: list[LiteLLMRoute] | None = None,
        provider_failover: bool = True,
        max_concurrent: int | None = None,
        role: str = "primary",
    ) -> None:
        import litellm  # local import: keeps module import cheap for tests

        self._litellm = litellm
        # Never let LiteLLM send request/response bodies to third-party callbacks
        # or print verbose payloads (transcripts are PII).
        litellm.suppress_debug_info = True
        litellm.drop_params = True

        self._settings = settings or get_settings()
        self._routes_override = routes_override
        self._fallback_route = claude_route(self._settings) if provider_failover else None
        self._role = role
        self._semaphore = asyncio.Semaphore(
            max_concurrent or self._settings.openai_max_concurrent_calls
        )
        self._instructor_clients: dict[str, Any] = {}

        log.info(
            "LiteLLMClient initialized",
            role=role,
            routes=[r.model for r in routes_override] if routes_override else "per-tier",
            failover_model=self._fallback_route.model if self._fallback_route else None,
        )

    # ── Factories ─────────────────────────────────────────────────────────────

    @classmethod
    def claude_fallback(cls, settings: Settings | None = None) -> LiteLLMClient | None:
        """Claude-only client for the confidence gate, or None if not configured."""
        settings = settings or get_settings()
        route = claude_route(settings)
        if route is None:
            return None
        return cls(
            settings,
            routes_override=[route],
            provider_failover=False,
            max_concurrent=settings.fallback_max_concurrent_calls,
            role="claude_fallback",
        )

    # ── Public interface ──────────────────────────────────────────────────────

    async def generate_structured(
        self,
        task_type: TaskType,
        system_prompt: str,
        user_prompt: str,
        response_schema: type[T],
    ) -> AICallResult[T]:
        start = time.monotonic()

        async def _call(route: LiteLLMRoute) -> tuple[T, Any]:
            client = self._instructor_for(route.instructor_mode)
            kwargs = self._request_kwargs(route, task_type)
            return await client.chat.completions.create_with_completion(
                model=route.model,
                response_model=response_schema,
                max_retries=INSTRUCTOR_VALIDATION_RETRIES,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                **kwargs,
            )

        async with self._semaphore:
            (parsed, completion), route, retries = await self._run_with_failover(
                task_type, _call
            )
        return self._build_result(parsed, completion, route, task_type, start, retries)

    async def generate_text(
        self,
        task_type: TaskType,
        system_prompt: str,
        user_prompt: str,
    ) -> AICallResult[str]:
        start = time.monotonic()

        async def _call(route: LiteLLMRoute) -> tuple[str, Any]:
            completion = await self._litellm.acompletion(
                model=route.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                **self._request_kwargs(route, task_type),
            )
            return (completion.choices[0].message.content or ""), completion

        async with self._semaphore:
            (text, completion), route, retries = await self._run_with_failover(
                task_type, _call
            )
        return self._build_result(text, completion, route, task_type, start, retries)

    async def embed(self, texts: list[str]) -> AICallResult[list[list[float]]]:
        start = time.monotonic()
        route = primary_route(ModelTier.EMBED, self._settings)

        async def _call(r: LiteLLMRoute) -> tuple[list[list[float]], Any]:
            response = await self._litellm.aembedding(
                model=r.model, input=texts, **r.completion_kwargs()
            )
            vectors = [list(item["embedding"]) for item in response.data]
            return vectors, response

        async with self._semaphore:
            (vectors, response), used, retries = await self._run_routes(
                TaskType.EMBEDDING, [route], _call
            )
        return self._build_result(vectors, response, used, TaskType.EMBEDDING, start, retries)

    # ── Routing / retry core ──────────────────────────────────────────────────

    def _routes_for(self, task_type: TaskType) -> list[LiteLLMRoute]:
        if self._routes_override:
            return list(self._routes_override)
        routes = [primary_route(TASK_MODEL_MAP[task_type], self._settings)]
        if self._fallback_route is not None:
            routes.append(self._fallback_route)
        return routes

    async def _run_with_failover(self, task_type: TaskType, call: Any) -> tuple[Any, LiteLLMRoute, int]:
        return await self._run_routes(task_type, self._routes_for(task_type), call)

    async def _run_routes(
        self,
        task_type: TaskType,
        routes: list[LiteLLMRoute],
        call: Any,
    ) -> tuple[Any, LiteLLMRoute, int]:
        """Try each route in order; move to the next only on retryable exhaustion."""
        total_attempts = 0
        last: _RouteExhausted | None = None
        for index, route in enumerate(routes):
            try:
                result, attempts = await self._run_route(task_type, route, call)
                total_attempts += attempts
                if index > 0:
                    log.warning(
                        "litellm_provider_failover_succeeded",
                        task_type=task_type.value,
                        failed_over_to=route.model,
                    )
                return result, route, total_attempts - 1
            except _RouteExhausted as exhausted:
                total_attempts += exhausted.attempts
                last = exhausted
                if index + 1 < len(routes):
                    log.warning(
                        "litellm_provider_failover",
                        task_type=task_type.value,
                        from_model=route.model,
                        to_model=routes[index + 1].model,
                        error_type=type(exhausted.root).__name__,
                    )

        assert last is not None
        tier = routes[-1].model_tier
        if _is_rate_limit(last.root):
            raise AIRateLimitExhaustedError(
                f"Rate limit exhausted after {total_attempts} attempts across {len(routes)} route(s)",
                task_type=task_type,
                model_tier=tier,
                attempt_count=total_attempts,
            ) from last.root
        raise AITimeoutError(
            f"AI call failed after {total_attempts} attempts across {len(routes)} route(s)",
            timeout_seconds=routes[-1].timeout_seconds,
            task_type=task_type,
            model_tier=tier,
            attempt_count=total_attempts,
        ) from last.root

    async def _run_route(
        self, task_type: TaskType, route: LiteLLMRoute, call: Any
    ) -> tuple[Any, int]:
        attempts = 0
        try:
            async for attempt in AsyncRetrying(
                wait=wait_exponential(multiplier=1.0, min=1, max=20),
                stop=stop_after_attempt(self._settings.openai_max_retries),
                retry=retry_if_exception(_is_retryable),
                reraise=False,
            ):
                with attempt:
                    attempts = attempt.retry_state.attempt_number
                    try:
                        return await call(route), attempts
                    except Exception as exc:  # noqa: BLE001 — classified below
                        raise self._classify(exc, task_type, route) from exc
        except RetryError as re:
            root = re.last_attempt.exception() if re.last_attempt else re
            raise _RouteExhausted(root or re, attempts) from re
        raise AssertionError("unreachable")  # pragma: no cover

    def _classify(self, exc: Exception, task_type: TaskType, route: LiteLLMRoute) -> Exception:
        """Map a provider/instructor exception to retryable root or a terminal error."""
        root = _root_api_error(exc)
        if _is_retryable(root):
            return root if isinstance(root, Exception) else exc
        status = _status_code(root)
        if status in _NON_RETRYABLE_STATUS:
            return AINonRetryableError(
                f"Non-retryable {route.provider} error: {root}",
                upstream_status_code=status,
                upstream_message=str(root)[:500],
                task_type=task_type,
                model_tier=route.model_tier,
            )
        if _is_validation_failure(exc):
            return AISchemaValidationError(
                "Structured output failed schema validation after instructor re-asks",
                raw_response=str(getattr(exc, "last_completion", ""))[:2000],
                validation_error=str(exc)[:1000],
                task_type=task_type,
                model_tier=route.model_tier,
                attempt_count=INSTRUCTOR_VALIDATION_RETRIES + 1,
            )
        return AINonRetryableError(
            f"Unexpected {route.provider} error: {exc}",
            upstream_status_code=status,
            upstream_message=str(exc)[:500],
            task_type=task_type,
            model_tier=route.model_tier,
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _instructor_for(self, mode_name: str) -> Any:
        client = self._instructor_clients.get(mode_name)
        if client is None:
            import instructor

            client = instructor.from_litellm(
                self._litellm.acompletion, mode=getattr(instructor.Mode, mode_name)
            )
            self._instructor_clients[mode_name] = client
        return client

    @staticmethod
    def _request_kwargs(route: LiteLLMRoute, task_type: TaskType) -> dict[str, Any]:
        kwargs = dict(route.completion_kwargs())
        temperature = MODEL_TASK_TEMPERATURE_OVERRIDES.get(task_type)
        if route.supports_temperature and temperature is not None:
            kwargs["temperature"] = temperature
        return kwargs

    def _build_result(
        self,
        data: Any,
        completion: Any,
        route: LiteLLMRoute,
        task_type: TaskType,
        start: float,
        retries: int,
    ) -> AICallResult[Any]:
        usage = getattr(completion, "usage", None)
        input_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        cost_usd = self._cost(completion, route, input_tokens, output_tokens)
        latency_ms = (time.monotonic() - start) * 1000

        log.info(
            "ai_call_success",
            client="litellm",
            role=self._role,
            provider=route.provider,
            task_type=task_type.value,
            model_name=route.model_name,
            latency_ms=round(latency_ms, 2),
            retry_count=max(retries, 0),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            estimated_cost_usd=cost_usd,
        )

        return AICallResult(
            data=data,
            cost=CostRecord(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model_tier=route.model_tier,
                model_name=route.model_name,
                estimated_cost_usd=cost_usd,
            ),
            latency_ms=latency_ms,
            retry_count=max(retries, 0),
            task_type=task_type,
            model_name=route.model_name,
            provider_used=route.provider,
        )

    def _cost(
        self, completion: Any, route: LiteLLMRoute, input_tokens: int, output_tokens: int
    ) -> float:
        # Our pricing table wins for Claude models it knows (LiteLLM's cost map
        # can lag new model releases); otherwise ask LiteLLM, then the tier table.
        bare_known = route.provider == PROVIDER_ANTHROPIC
        if not bare_known:
            try:
                cost = float(self._litellm.completion_cost(completion_response=completion) or 0.0)
                if cost > 0:
                    return cost
            except Exception:  # noqa: BLE001 — unknown model in LiteLLM's cost map
                pass
        return compute_cost_for_model(input_tokens, output_tokens, route.model_name, route.model_tier)
