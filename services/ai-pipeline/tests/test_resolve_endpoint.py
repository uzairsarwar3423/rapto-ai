"""
tests/test_resolve_endpoint.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — /resolve Route-Level Tests
Day 55 | Principal Engineer Edition

Tests cover the HTTP contract of POST /api/v1/resolve:
  - HTTP status mapping (200, 206, 500)
  - X-Resolve-Partial header correctness
  - Auth failure (401)
  - Request validation failure (422)
  - Response schema validates against ResolveResponse
  - request_id in response is populated

ALL tests use mocked pipeline orchestrator — these are route-level tests,
not integration tests. They verify the HTTP contract, not business logic.
Uses the conftest.py `client` (httpx.AsyncClient) and `auth_headers` fixtures.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from src.models.common import CostRecord, ModelTier
from src.models.exceptions import ResolverInvariantError
from src.models.resolution_models import (
    PartialResolutionFailure,
    PipelineResult,
    ResolvePipelineStats,
)


# ─── Shared Helpers ───────────────────────────────────────────────────────────

def _base_resolve_payload() -> dict:
    return {
        "meeting_id": "meeting_test_route_01",
        "team_id": "team_test_01",
        "meeting_date": "2026-06-15T09:00:00Z",
        "team_timezone": "UTC",
        "new_commitments": [],
        "historical_commitments": [],
    }


def _make_zero_cost_record() -> CostRecord:
    return CostRecord(
        input_tokens=0,
        output_tokens=0,
        model_tier=ModelTier.MINI,
        model_name="gpt-4.1-mini",
        estimated_cost_usd=0.0,
    )


def _make_pipeline_stats(
    detection_calls_made: int = 0,
    detection_calls_failed: int = 0,
    stage1_blocks: int = 0,
) -> ResolvePipelineStats:
    return ResolvePipelineStats(
        new_commitments_count=0,
        resolved_count=0,
        not_resolved_references_count=0,
        unchanged_count=0,
        detection_calls_made=detection_calls_made,
        detection_calls_succeeded=detection_calls_made - detection_calls_failed,
        detection_calls_failed=detection_calls_failed,
        total_detection_cost=_make_zero_cost_record(),
        resolver_time_ms=5.0,
        detector_time_ms=0.0,
        total_pipeline_time_ms=10.0,
        stage1_blocks=stage1_blocks,
        below_threshold_conservatives=0,
    )


def _make_pipeline_result(
    partial_failure: PartialResolutionFailure | None = None,
) -> PipelineResult:
    return PipelineResult(
        meeting_id="meeting_test_route_01",
        team_id="team_test_01",
        new_commitments=[],
        resolved_updates=[],
        not_resolved_references=[],
        unchanged_commitments=[],
        partial_failure=partial_failure,
        stats=_make_pipeline_stats(),
    )


def _make_partial_failure() -> PartialResolutionFailure:
    return PartialResolutionFailure(
        total_matched=3,
        detection_succeeded=2,
        detection_failed=1,
        failed_historical_ids=["hist_failed_01"],
        partial_result=None,
    )


# ─── Test: HTTP 200 Full Success ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_200_full_success(client, auth_headers):
    """Full success → HTTP 200, success=True, partial=False, X-Resolve-Partial: false."""
    pipeline_result = _make_pipeline_result(partial_failure=None)

    with patch(
        "src.api.routes.resolve.run_resolution_pipeline",
        new_callable=AsyncMock,
        return_value=pipeline_result,
    ):
        response = await client.post(
            "/api/v1/resolve",
            json=_base_resolve_payload(),
            headers=auth_headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["partial"] is False
    assert body["result"] is not None
    assert body["error"] is None
    assert response.headers.get("X-Resolve-Partial") == "false"


# ─── Test: HTTP 206 Partial Success ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_206_partial_success(client, auth_headers):
    """Partial failure → HTTP 206, partial=True, X-Resolve-Partial: true, X-Resolve-Failed-Ids set."""
    partial = _make_partial_failure()
    pipeline_result = _make_pipeline_result(partial_failure=partial)

    with patch(
        "src.api.routes.resolve.run_resolution_pipeline",
        new_callable=AsyncMock,
        return_value=pipeline_result,
    ):
        response = await client.post(
            "/api/v1/resolve",
            json=_base_resolve_payload(),
            headers=auth_headers,
        )

    assert response.status_code == 206
    body = response.json()
    assert body["success"] is True
    assert body["partial"] is True
    assert body["result"] is not None
    assert response.headers.get("X-Resolve-Partial") == "true"
    assert "hist_failed_01" in response.headers.get("X-Resolve-Failed-Ids", "")


# ─── Test: HTTP 500 ResolverInvariantError ────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_500_invariant_error(client, auth_headers):
    """ResolverInvariantError → HTTP 500, success=False, non_retryable=True."""
    with patch(
        "src.api.routes.resolve.run_resolution_pipeline",
        new_callable=AsyncMock,
        side_effect=ResolverInvariantError("Deliberate invariant violation in test"),
    ):
        response = await client.post(
            "/api/v1/resolve",
            json=_base_resolve_payload(),
            headers=auth_headers,
        )

    assert response.status_code == 500
    body = response.json()
    assert body["success"] is False
    assert body["partial"] is False
    assert body["result"] is None
    assert body["error"] is not None
    assert body["error"]["non_retryable"] is True
    assert body["error"]["error_code"] == "RESOLVER_INVARIANT_ERROR"


# ─── Test: HTTP 401 Missing Auth ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_401_missing_auth(client):
    """No X-Internal-Service-Key header → HTTP 401."""
    response = await client.post(
        "/api/v1/resolve",
        json=_base_resolve_payload(),
        # No auth headers
    )
    assert response.status_code == 401


# ─── Test: HTTP 401 Invalid Auth ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_401_invalid_auth(client):
    """Wrong X-Internal-Service-Key → HTTP 401."""
    response = await client.post(
        "/api/v1/resolve",
        json=_base_resolve_payload(),
        headers={"X-Internal-Service-Key": "wrong-secret"},
    )
    assert response.status_code == 401


# ─── Test: HTTP 422 Invalid Body ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_422_invalid_body(client, auth_headers):
    """Missing required field (team_timezone) → HTTP 422."""
    bad_payload = _base_resolve_payload()
    del bad_payload["team_timezone"]

    with patch(
        "src.api.routes.resolve.run_resolution_pipeline",
        new_callable=AsyncMock,
    ) as mock_pipeline:
        response = await client.post(
            "/api/v1/resolve",
            json=bad_payload,
            headers=auth_headers,
        )

    assert response.status_code == 422
    mock_pipeline.assert_not_called()


# ─── Test: HTTP 422 Empty meeting_id ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_422_empty_meeting_id(client, auth_headers):
    """Empty string meeting_id (min_length=1) → HTTP 422."""
    bad_payload = _base_resolve_payload()
    bad_payload["meeting_id"] = ""

    response = await client.post(
        "/api/v1/resolve",
        json=bad_payload,
        headers=auth_headers,
    )
    assert response.status_code == 422


# ─── Test: Response Schema Completeness ───────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_response_schema_complete(client, auth_headers):
    """HTTP 200 response body has all required ResolveResponse fields."""
    pipeline_result = _make_pipeline_result()

    with patch(
        "src.api.routes.resolve.run_resolution_pipeline",
        new_callable=AsyncMock,
        return_value=pipeline_result,
    ):
        response = await client.post(
            "/api/v1/resolve",
            json=_base_resolve_payload(),
            headers=auth_headers,
        )

    assert response.status_code == 200
    body = response.json()

    # Required top-level fields
    assert "success" in body
    assert "partial" in body
    assert "request_id" in body
    assert "result" in body

    # result should have all four commitment lists
    result = body["result"]
    assert "new_commitments" in result
    assert "resolved_updates" in result
    assert "not_resolved_references" in result
    assert "unchanged_commitments" in result
    assert "stats" in result

    # Stats should be complete
    stats = result["stats"]
    assert "detection_calls_made" in stats
    assert "stage1_blocks" in stats
    assert "total_pipeline_time_ms" in stats


# ─── Test: Request ID Populated ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_request_id_in_response(client, auth_headers):
    """request_id in response is populated (from middleware ContextVar)."""
    pipeline_result = _make_pipeline_result()

    with patch(
        "src.api.routes.resolve.run_resolution_pipeline",
        new_callable=AsyncMock,
        return_value=pipeline_result,
    ):
        response = await client.post(
            "/api/v1/resolve",
            json=_base_resolve_payload(),
            headers={**auth_headers, "X-Request-ID": "test-req-id-12345"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["request_id"] is not None
    assert len(body["request_id"]) > 0
