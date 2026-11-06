"""
services/tracing/traced_client.py
──────────────────────────────────
Decorator that records every AI call made through any AIClientProtocol
implementation (OpenAIClient, LiteLLMClient) as a LangSmith run.

Wrapping at the client boundary means cleanup, extraction, date parsing and
resolution are all traced without touching their code. The meeting / chunk /
fallback context comes from services/tracing/trace_context.py.
"""

from __future__ import annotations

import re
import time
from typing import Any, Optional, TypeVar

from pydantic import BaseModel

from src.models.common import AICallResult, TaskType
from src.services.tracing.langsmith_tracer import LangSmithTracer
from src.services.tracing.trace_context import TraceContext, current_trace_context

T = TypeVar("T", bound=BaseModel)

_PROMPT_VERSION_RE = re.compile(r"^#\s*prompt_version:\s*(\S+)", re.MULTILINE)


def prompt_version_of(prompt: str) -> str:
    """Read the `# prompt_version: x` header from a prompt, or 'unversioned'."""
    match = _PROMPT_VERSION_RE.search(prompt[:500])
    return match.group(1) if match else "unversioned"


def confidence_summary(data: Any) -> tuple[int, Optional[float]]:
    """(item_count, mean_confidence) for a structured extraction response.

    Looks for list fields whose elements carry a `confidence` attribute, or a
    top-level `confidence` (single-object responses such as date parsing).
    """
    if not isinstance(data, BaseModel):
        return 0, None
    scores: list[float] = []
    for name in type(data).model_fields:
        value = getattr(data, name, None)
        if isinstance(value, list):
            scores.extend(
                float(item.confidence) for item in value if hasattr(item, "confidence")
            )
    if not scores and isinstance(getattr(data, "confidence", None), (int, float)):
        scores.append(float(data.confidence))  # type: ignore[attr-defined]
    if not scores:
        return 0, None
    return len(scores), round(sum(scores) / len(scores), 4)


class TracedAIClient:
    """Wraps an AI client; same interface, every call traced."""

    def __init__(self, inner: Any, tracer: LangSmithTracer) -> None:
        self._inner = inner
        self._tracer = tracer

    def __getattr__(self, name: str) -> Any:  # delegate anything not traced
        return getattr(self._inner, name)

    @property
    def inner(self) -> Any:
        return self._inner

    async def generate_structured(
        self,
        task_type: TaskType,
        system_prompt: str,
        user_prompt: str,
        response_schema: type[T],
    ) -> AICallResult[T]:
        return await self._traced(
            task_type,
            system_prompt,
            user_prompt,
            self._inner.generate_structured(
                task_type=task_type,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                response_schema=response_schema,
            ),
            schema_name=response_schema.__name__,
        )

    async def generate_text(
        self,
        task_type: TaskType,
        system_prompt: str,
        user_prompt: str,
    ) -> AICallResult[str]:
        return await self._traced(
            task_type,
            system_prompt,
            user_prompt,
            self._inner.generate_text(
                task_type=task_type, system_prompt=system_prompt, user_prompt=user_prompt
            ),
        )

    async def embed(self, texts: list[str]) -> AICallResult[list[list[float]]]:
        return await self._inner.embed(texts)  # embeddings are not prompt-versioned

    async def _traced(
        self,
        task_type: TaskType,
        system_prompt: str,
        user_prompt: str,
        call: Any,
        schema_name: Optional[str] = None,
    ) -> Any:
        if not self._tracer.enabled:
            return await call

        ctx: Optional[TraceContext] = current_trace_context.get()
        metadata: dict[str, Any] = {
            "task_type": task_type.value,
            "prompt_version": prompt_version_of(system_prompt),
            "user_prompt_version": prompt_version_of(user_prompt),
            "response_schema": schema_name,
            "fallback_triggered": bool(ctx and ctx.fallback_triggered),
        }
        if ctx is not None:
            metadata.update(
                meeting_id=ctx.meeting_id,
                team_id=ctx.team_id,
                chunk_index=ctx.chunk_index,
                meeting_type=ctx.meeting_type,
                pipeline_prompt_version=ctx.prompt_version,
            )
        inputs: dict[str, Any] = {
            "system_prompt_chars": len(system_prompt),
            "user_prompt_chars": len(user_prompt),
        }
        if self._tracer.log_payloads:
            inputs.update(system_prompt=system_prompt, user_prompt=user_prompt)

        run = self._tracer.start_run(
            name=task_type.value,
            inputs=inputs,
            metadata=metadata,
            parent_run=ctx.parent_run if ctx else None,
            run_type="llm",
            tags=[task_type.value, metadata["prompt_version"]],
        )
        started = time.monotonic()
        try:
            result: AICallResult[Any] = await call
        except Exception as exc:
            self._tracer.end_run(
                run,
                error=f"{type(exc).__name__}: {str(exc)[:500]}",
                metadata={"latency_ms": round((time.monotonic() - started) * 1000, 2)},
            )
            raise

        item_count, avg_conf = confidence_summary(result.data)
        outputs: dict[str, Any] = {"item_count": item_count, "avg_confidence": avg_conf}
        if self._tracer.log_payloads:
            data = result.data
            outputs["data"] = data.model_dump(mode="json") if isinstance(data, BaseModel) else data
        self._tracer.end_run(
            run,
            outputs=outputs,
            metadata={
                "model_name": result.model_name,
                "provider_used": result.provider_used,
                "input_tokens": result.cost.input_tokens,
                "output_tokens": result.cost.output_tokens,
                "cost_usd": result.cost.estimated_cost_usd,
                "latency_ms": round(result.latency_ms, 2),
                "retry_count": result.retry_count,
                "avg_confidence": avg_conf,
                "item_count": item_count,
            },
        )
        return result
