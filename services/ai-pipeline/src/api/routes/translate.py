"""POST /api/v1/translate — translate already-generated meeting content (keyed strings)."""

import structlog
from fastapi import APIRouter, Depends

from src.api.deps import AIDep, verify_internal_service_key
from src.config.logging import request_id_var
from src.models.translate_models import TranslateRequest, TranslateResponse
from src.services.translation import translate

log = structlog.get_logger(__name__)

router = APIRouter(tags=["translation"])


@router.post(
    "/translate",
    response_model=TranslateResponse,
    dependencies=[Depends(verify_internal_service_key)],
)
async def translate_content(payload: TranslateRequest, ai_client: AIDep) -> TranslateResponse:
    # Never log item text (meeting content) — counts only.
    log.info(
        "translate_route_called",
        meeting_id=payload.meeting_id,
        team_id=payload.team_id,
        source=payload.source_language,
        target=payload.target_language,
        items=len(payload.items),
    )
    result = await translate(payload, ai_client)
    return TranslateResponse(
        success=True, request_id=request_id_var.get() or "unknown", result=result
    )
