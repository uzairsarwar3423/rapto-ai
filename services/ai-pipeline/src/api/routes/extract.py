from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
import structlog
import time

from src.api.deps import AIDep, verify_internal_service_key
from src.config.logging import request_id_var
from src.models.extraction_models import (
    ExtractRequest,
    ExtractResponse,
    PartialExtractionFailure,
    ExtractionResultWithMeta
)
from src.services.extraction.extractor import extract

log = structlog.get_logger(__name__)

router = APIRouter(tags=["extraction"])

@router.post(
    "/extract",
    response_model=ExtractResponse,
    dependencies=[Depends(verify_internal_service_key)]
)
async def extract_meeting(
    payload: ExtractRequest,
    ai_client: AIDep,
    request: Request,
    response: Response
) -> ExtractResponse:
    """Run extraction pipeline on a cleaned transcript."""
    
    request_id = request_id_var.get() or "unknown"
    start_time = time.monotonic()
    
    # Do NOT log the full transcript at INFO.
    log.info(
        "extraction_route_called",
        meeting_id=payload.meeting_id,
        team_id=payload.team_id,
        cleaned_turns=len(payload.cleaned_transcript),
        participants_count=len(payload.participants)
    )
    
    result = await extract(payload, ai_client)
    
    route_processing_time_ms = (time.monotonic() - start_time) * 1000
    log.info(
        "extraction_route_completed",
        meeting_id=payload.meeting_id,
        team_id=payload.team_id,
        route_processing_time_ms=round(route_processing_time_ms, 2)
    )
    
    if isinstance(result, ExtractionResultWithMeta):
        return ExtractResponse(
            success=True,
            request_id=request_id,
            result=result
        )
    elif isinstance(result, PartialExtractionFailure):
        if result.partial_result is not None:
            # Partial Content
            response.status_code = 206
            response.headers["X-Extraction-Partial"] = "true"
            return ExtractResponse(
                success=False,
                request_id=request_id,
                result=result
            )
        else:
            # Unprocessable Entity
            response.status_code = 422
            return ExtractResponse(
                success=False,
                request_id=request_id,
                result=result
            )
