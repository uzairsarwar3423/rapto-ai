"""
services/tracing/langsmith_tracer.py
─────────────────────────────────────
LangSmith run tracking for every AI call in the pipeline.

DESIGN RULES:
  1. No-op when LANGSMITH_TRACING_ENABLED=false (the default) or no API key —
     every method returns immediately; zero network, zero overhead.
  2. Never on the critical path: every LangSmith interaction is wrapped so a
     tracing failure can only produce a warning log, never a failed extraction.
     The LangSmith client batches and ships runs on a background thread.
  3. PII: transcripts and model outputs are NOT sent unless
     LANGSMITH_LOG_PAYLOADS=true. By default a run carries metadata only
     (prompt_version, task, model, provider, tokens, cost, latency, confidence,
     fallback flag).

GROUPING (what the LangSmith UI shows):
  meeting run  (chain, one per /extract call, metadata: meeting_id, team_id, …)
   └── <task_type> runs (llm, one per AI call: per chunk × extractor, fallback
       re-extractions, meta-summary, date parsing)
  Filter / group by metadata.prompt_version, metadata.model_name,
  metadata.provider_used, metadata.fallback_triggered to compare versions.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Optional

import structlog

from src.config.settings import get_settings

log = structlog.get_logger(__name__)


class LangSmithTracer:
    """Thin, failure-proof wrapper over langsmith's RunTree API."""

    def __init__(
        self,
        enabled: bool,
        api_key: Optional[str],
        project: str,
        endpoint: Optional[str] = None,
        log_payloads: bool = False,
    ) -> None:
        self.project = project
        self.log_payloads = log_payloads
        self._client: Any = None
        self._warned = False
        self.enabled = False

        if not enabled:
            return
        if not api_key:
            log.warning("langsmith_tracing_disabled_missing_api_key")
            return
        try:
            from langsmith import Client

            kwargs: dict[str, Any] = {"api_key": api_key}
            if endpoint:
                kwargs["api_url"] = endpoint
            self._client = Client(**kwargs)
            self.enabled = True
            log.info("langsmith_tracing_enabled", project=project, log_payloads=log_payloads)
        except Exception as exc:  # noqa: BLE001 — tracing must never break startup
            log.warning("langsmith_tracing_init_failed", error=str(exc)[:200])

    # ── Runs ──────────────────────────────────────────────────────────────────

    def start_run(
        self,
        name: str,
        inputs: dict[str, Any],
        metadata: dict[str, Any],
        parent_run: Any = None,
        run_type: str = "chain",
        tags: Optional[list[str]] = None,
    ) -> Any:
        """Start a run. Returns an opaque run handle (RunTree) or None if disabled."""
        if not self.enabled:
            return None
        try:
            if parent_run is not None:
                run = parent_run.create_child(
                    name=name,
                    run_type=run_type,
                    inputs=inputs,
                    extra={"metadata": metadata},
                    tags=tags or [],
                )
            else:
                from langsmith.run_trees import RunTree

                run = RunTree(
                    name=name,
                    run_type=run_type,
                    inputs=inputs,
                    extra={"metadata": metadata},
                    tags=tags or [],
                    project_name=self.project,
                    ls_client=self._client,
                )
            run.post()
            return run
        except Exception as exc:  # noqa: BLE001
            self._warn("langsmith_start_run_failed", exc)
            return None

    def end_run(
        self,
        run: Any,
        outputs: Optional[dict[str, Any]] = None,
        error: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        if run is None or not self.enabled:
            return
        try:
            if metadata:
                run.extra.setdefault("metadata", {}).update(metadata)
            run.end(outputs=outputs or {}, error=error)
            run.patch()
        except Exception as exc:  # noqa: BLE001
            self._warn("langsmith_end_run_failed", exc)

    def log_feedback(
        self,
        run_id: Optional[str],
        key: str,
        score: float,
        comment: Optional[str] = None,
    ) -> None:
        """Attach evaluation feedback (precision, recall, thumbs-up…) to a run."""
        if not self.enabled or not run_id:
            return
        try:
            self._client.create_feedback(run_id, key, score=score, comment=comment)
        except Exception as exc:  # noqa: BLE001
            self._warn("langsmith_feedback_failed", exc)

    def flush(self) -> None:
        if not self.enabled:
            return
        try:
            flush = getattr(self._client, "flush", None)
            if callable(flush):
                flush()
        except Exception as exc:  # noqa: BLE001
            self._warn("langsmith_flush_failed", exc)

    def _warn(self, event: str, exc: Exception) -> None:
        # Log the first failure loudly, the rest at debug — a LangSmith outage
        # must not flood the service logs.
        if not self._warned:
            log.warning(event, error_type=type(exc).__name__, error=str(exc)[:200])
            self._warned = True
        else:
            log.debug(event, error_type=type(exc).__name__)


@lru_cache(maxsize=1)
def get_tracer() -> LangSmithTracer:
    settings = get_settings()
    return LangSmithTracer(
        enabled=settings.langsmith_tracing_enabled,
        api_key=(
            settings.langsmith_api_key.get_secret_value() if settings.langsmith_api_key else None
        ),
        project=settings.langsmith_project_name,
        endpoint=settings.langsmith_endpoint,
        log_payloads=settings.langsmith_log_payloads,
    )


