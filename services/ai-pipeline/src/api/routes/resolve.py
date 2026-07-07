"""
api/routes/resolve.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — POST /api/v1/resolve Route Handler
Day 55 | Principal Backend Engineer Edition

NODE.JS INTEGRATION CONTRACT:
  Endpoint:  POST /api/v1/resolve
  Auth:      X-Internal-Service-Key header (same secret as /extract)
  Request:   Content-Type: application/json, body: ResolveRequest
  Response:  Content-Type: application/json, body: ResolveResponse

  RESPONSE STATUS CODES (documented for the Node.js backend team):

  HTTP 200 — Full success. All detection calls succeeded.
    Headers: X-Resolve-Partial: false
    Body: ResolveResponse { success: true, partial: false, result: PipelineResult }
    Action: INSERT new_commitments, UPDATE resolved_updates to FULFILLED,
            UPDATE not_resolved_references last_referenced_at.

  HTTP 206 — Partial success. Some detection calls failed (OpenAI issue).
    Headers: X-Resolve-Partial: true
             X-Resolve-Failed-Ids: <comma-separated historical commitment IDs>
    Body: ResolveResponse { success: true, partial: true, result: PipelineResult }
    Action: Same as 200 for the succeeded results. Schedule a retry job for
            the IDs in X-Resolve-Failed-Ids to re-attempt detection.
    WHY 206: The service delivered partial but usable results. Treating as 500
             would prevent Node.js from using the succeeded data. Treating as 200
             would hide the failure from monitoring.

  HTTP 401 — Missing or invalid X-Internal-Service-Key.
    Retry: No — this is a configuration error, not a transient failure.

  HTTP 422 — Request validation failure (Pydantic) OR total OpenAI failure.
    Body: ResolveResponse { success: false, partial: false, error: ErrorEnvelopePayload }
    Retry (OpenAI total failure): Yes — schedule retry after backoff.
    Retry (Pydantic validation): No — the request itself is malformed.

  HTTP 500 — ResolverInvariantError (internal code bug, not a data issue).
    Body: ResolveResponse { success: false, partial: false, error: { non_retryable: true } }
    Retry: NEVER — retrying will produce the same invariant violation.
    Action: Alert the on-call team. This requires a code fix.

ROUTE-LEVEL RESPONSIBILITIES (thin handler pattern):
  This handler does FOUR things only:
    1. Extract request_id from the middleware ContextVar
    2. Call run_resolution_pipeline(request, ai_client)
    3. Map the PipelineResult to the correct HTTP status + response body
    4. Log the single operational log event for dashboards

  It does NOT:
    - Call the resolver directly
    - Call the detector directly
    - Aggregate costs
    - Handle partial failures
  All of that is owned by resolver_pipeline.py (Decision 1).
"""

from __future__ import annotations

import time
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Request, Response

from src.api.deps import AIDep, verify_internal_service_key
from src.config.logging import request_id_var
from src.models.exceptions import ResolverInvariantError
from src.models.resolution_models import (
    ErrorEnvelopePayload,
    PipelineResult,
    ResolveRequest,
    ResolveResponse,
)
from src.services.resolution.resolver_pipeline import run_resolution_pipeline

log: structlog.BoundLogger = structlog.get_logger(__name__)

router = APIRouter(tags=["resolution"])


@router.post(
    "/resolve",
    response_model=ResolveResponse,
    dependencies=[Depends(verify_internal_service_key)],
    summary="Run the full resolution pipeline for a meeting",
    description=(
        "Accepts new commitments from /extract and historical open commitments "
        "from PostgreSQL. Returns classified commitment outcomes: new to insert, "
        "resolved to mark FULFILLED, references to update last_referenced_at, "
        "and unchanged historical commitments. Third and final Phase 4 endpoint."
    ),
)
async def resolve_commitments(
    payload: ResolveRequest,
    ai_client: AIDep,
    request: Request,
    response: Response,
) -> ResolveResponse:
    """POST /api/v1/resolve — Commitment resolution pipeline.

    Thin route handler. All business logic lives in resolver_pipeline.run_resolution_pipeline().
    This handler's only responsibility is HTTP status mapping and operational logging.
    """
    request_id: str = request_id_var.get() or "unknown"
    route_start = time.monotonic()

    # ── Minimal structured log at route entry (no transcript data at INFO) ─────
    log.info(
        "resolve_request_received",
        meeting_id=payload.meeting_id,
        team_id=payload.team_id,
        new_commitments_count=len(payload.new_commitments),
        historical_commitments_count=len(payload.historical_commitments),
        request_id=request_id,
    )

    # ── Delegate entirely to the pipeline orchestrator ─────────────────────────
    try:
        pipeline_result: PipelineResult = await run_resolution_pipeline(
            request=payload,
            openai_client=ai_client,
        )

    except ResolverInvariantError as exc:
        # ── HTTP 500: Internal code bug — NON-RETRYABLE ───────────────────────
        # This is a ResolverInvariantError: the pipeline's accounting invariant
        # was violated. This is ALWAYS a code bug, never a data issue.
        # non_retryable=True: retrying will produce the same invariant violation.
        # The Node.js side must alert, not retry.
        route_time_ms = (time.monotonic() - route_start) * 1000.0
        log.error(
            "resolve_invariant_error",
            meeting_id=payload.meeting_id,
            team_id=payload.team_id,
            error=str(exc),
            route_time_ms=round(route_time_ms, 2),
            request_id=request_id,
        )
        response.status_code = 500
        return ResolveResponse(
            success=False,
            partial=False,
            request_id=request_id,
            result=None,
            error=ErrorEnvelopePayload(
                error_code="RESOLVER_INVARIANT_ERROR",
                message=(
                    "Resolution pipeline invariant violation. This is an internal "
                    "service error. Do not retry — alert the engineering team."
                ),
                non_retryable=True,
                details={"original_error": str(exc)[:500]},
            ),
        )

    # ── Map pipeline outcome to HTTP status ────────────────────────────────────
    route_time_ms = (time.monotonic() - route_start) * 1000.0
    partial_failure = pipeline_result.partial_failure

    if partial_failure is not None:
        # ── HTTP 206: Partial success ─────────────────────────────────────────
        # Some detection calls failed; the partial data is still usable.
        # Node.js should use the partial result AND retry for failed_historical_ids.
        response.status_code = 206
        response.headers["X-Resolve-Partial"] = "true"
        if partial_failure.failed_historical_ids:
            response.headers["X-Resolve-Failed-Ids"] = ",".join(
                partial_failure.failed_historical_ids
            )
        http_status_code = 206
    else:
        # ── HTTP 200: Full success ────────────────────────────────────────────
        response.headers["X-Resolve-Partial"] = "false"
        http_status_code = 200

    # ── Single operational log event per meeting (the dashboard's data source) ─
    # This is the primary signal for production dashboards. Every metric that
    # matters operationally is in this one structured log line.
    log.info(
        "resolve_request_complete",
        meeting_id=payload.meeting_id,
        team_id=payload.team_id,
        http_status=http_status_code,
        new_count=pipeline_result.stats.new_commitments_count,
        resolved_count=pipeline_result.stats.resolved_count,
        not_resolved_refs=pipeline_result.stats.not_resolved_references_count,
        unchanged_count=pipeline_result.stats.unchanged_count,
        detection_calls_made=pipeline_result.stats.detection_calls_made,
        detection_calls_failed=pipeline_result.stats.detection_calls_failed,
        stage1_blocks=pipeline_result.stats.stage1_blocks,
        detection_cost_usd=pipeline_result.stats.total_detection_cost.estimated_cost_usd,
        resolver_time_ms=pipeline_result.stats.resolver_time_ms,
        detector_time_ms=pipeline_result.stats.detector_time_ms,
        total_pipeline_time_ms=pipeline_result.stats.total_pipeline_time_ms,
        route_time_ms=round(route_time_ms, 2),
        has_partial_failure=partial_failure is not None,
        request_id=request_id,
    )

    return ResolveResponse(
        success=True,
        partial=partial_failure is not None,
        request_id=request_id,
        result=pipeline_result,
        error=None,
    )
