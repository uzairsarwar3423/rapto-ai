print("1")
from fastapi import APIRouter, Depends, Request, Response
print("2")
from fastapi.responses import JSONResponse
print("3")
import structlog
print("4")
import time
print("5")
from src.api.deps import AIDep, verify_internal_service_key
print("6")
from src.config.logging import request_id_var
print("7")
from src.models.extraction_models import ExtractRequest, ExtractResponse, PartialExtractionFailure, ExtractionResultWithMeta
print("8")
from src.services.extraction.extractor import extract
print("9")
log = structlog.get_logger(__name__)
print("10")
router = APIRouter(tags=["extraction"])
print("11")
@router.post("/extract", response_model=ExtractResponse, dependencies=[Depends(verify_internal_service_key)])
async def extract_meeting():
    pass
print("12")
