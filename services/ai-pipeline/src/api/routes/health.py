"""
api/routes/health.py
─────────────────────
Liveness (/health) and readiness (/ready) endpoints.

PRINCIPAL DESIGN:

/health (liveness):
  - Returns 200 immediately, no await, no dependency checks.
  - WHY: Orchestrators (K8s, ECS) use liveness failures to KILL AND RESTART
    the container. A liveness check that depends on Mongo/Redis/Gemini would
    cause restart-loop death spirals during a transient downstream outage.
    Liveness/readiness separation exists to prevent exactly this.

/ready (readiness):
  - Protected by verify_internal_service_key (reveals dependency health detail).
  - Calls ping() on each dependency — bounded timeout, never a full query.
  - Returns 200 if all pass, 503 with per-dependency breakdown if any fail.
  - The breakdown is what lets an on-call engineer immediately see WHICH
    dependency is down without grepping logs.
  - Gemini reachability: uses a models-list call (cheapest viable check)
    rather than a full generation call (would cost money on every probe).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from src.api.deps import MongoDep, RedisDep, verify_internal_service_key
from src.config.logging import get_logger
from src.config.settings import get_settings
import openai

log = get_logger(__name__)

router = APIRouter(tags=["health"])


# ─── Liveness ─────────────────────────────────────────────────────────────────


@router.get(
    "/health",
    summary="Liveness probe",
    description=(
        "Returns 200 immediately. No dependency checks. "
        "Used by orchestrators to determine if the process is alive. "
        "EXEMPT from internal auth — orchestrators have no knowledge of service keys."
    ),
)
async def health() -> dict:
    """GET /health — liveness probe."""
    return {"status": "ok"}


# ─── Readiness ────────────────────────────────────────────────────────────────


@router.get(
    "/ready",
    summary="Readiness probe",
    description=(
        "Returns 200 if all dependencies (MongoDB, Redis, AI API) are reachable. "
        "Returns 503 with per-dependency breakdown if any fail. "
        "Protected by X-Internal-Service-Key."
    ),
    dependencies=[Depends(verify_internal_service_key)],
)
async def ready(mongo: MongoDep, redis: RedisDep) -> JSONResponse:
    """GET /ready — readiness probe with dependency checks."""
    settings = get_settings()

    # Run dependency pings concurrently
    import asyncio

    mongo_ok, redis_ok, ai_ok = await asyncio.gather(
        mongo.ping(),
        redis.ping(),
        _check_openai_reachability(settings.openai_api_key.get_secret_value(), settings.openai_gpt41_mini_model_name, settings.openai_org_id),
        return_exceptions=False,
    )

    checks = {
        "mongodb": bool(mongo_ok),
        "redis": bool(redis_ok),
        "ai": bool(ai_ok),
    }

    all_healthy = all(checks.values())

    if all_healthy:
        log.debug("readiness_check_passed", checks=checks)
        return JSONResponse(
            status_code=200,
            content={"status": "ready", "checks": checks},
        )
    else:
        log.warning("readiness_check_failed", checks=checks)
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "checks": checks},
        )


async def _check_openai_reachability(api_key: str, model_name: str, org_id: str | None) -> bool:
    """Verify OpenAI API key validity via cheapest possible call.

    Hits OpenAI's models.retrieve endpoint — validates key + network reachability.
    """
    try:
        kwargs = {
            "api_key": api_key,
            "timeout": 5.0,
        }
        if org_id:
            kwargs["organization"] = org_id

        client = openai.AsyncOpenAI(**kwargs)
        await client.models.retrieve(model_name)
        return True
    except Exception:
        log.warning("openai_reachability_check_failed")
        return False

