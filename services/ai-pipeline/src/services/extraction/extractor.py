from __future__ import annotations
import asyncio
import time
from pathlib import Path
from typing import List, Optional

import structlog

from src.models.common import TaskType, CostRecord
from src.models.chunk_models import TranscriptContent, ChunkingStrategy, TextChunk
from src.models.extraction_models import (
    ExtractRequest,
    ChunkExtractionResult,
    SummaryScopeType,
    ExtractionResultWithMeta,
    PartialExtractionFailure,
    ExtractionResponse
)
from src.services.openai_client import OpenAIClient
from src.services.chunker import chunk_content
from src.services.tokenization import estimate_token_count
from src.config.extraction_config import (
    EXTRACTION_CHUNK_MAX_TOKENS,
    EXTRACTION_CHUNK_OVERLAP_TURNS,
    EXTRACTOR_CHUNK_CONCURRENCY,
    EXTRACTION_PROMPT_CACHE
)

from src.services.extraction.commitment_parser import parse_commitment
from src.services.extraction.action_item_parser import parse_action_item
from src.services.extraction.decision_parser import parse_decision
from src.services.extraction.blocker_parser import parse_blocker
from src.models.exceptions import AIPipelineError

log = structlog.get_logger(__name__)

class PromptLoadError(AIPipelineError):
    pass

PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"

try:
    _SYSTEM_PROMPT_TPL = (PROMPTS_DIR / "extraction_system.txt").read_text(encoding="utf-8")
    _USER_PROMPT_TPL = (PROMPTS_DIR / "extraction_user.txt").read_text(encoding="utf-8")
    _COMMITMENT_EXAMPLES = (PROMPTS_DIR / "commitment_examples.txt").read_text(encoding="utf-8")
    _ACTION_ITEM_EXAMPLES = (PROMPTS_DIR / "action_item_examples.txt").read_text(encoding="utf-8")
    
    # Read version tag from first line of system prompt
    _first_line = _SYSTEM_PROMPT_TPL.split('\n')[0]
    _PROMPT_VERSION = _first_line.strip() if _first_line.startswith("v") else "extraction-v1.0"
    
    _ASSEMBLED_SYSTEM_PROMPT = (
        _SYSTEM_PROMPT_TPL +
        "\n\n--------------------------------------------------------------------------------\n"
        "COMMITMENT EXAMPLES\n"
        "--------------------------------------------------------------------------------\n" +
        _COMMITMENT_EXAMPLES +
        "\n\n--------------------------------------------------------------------------------\n"
        "ACTION ITEM EXAMPLES\n"
        "--------------------------------------------------------------------------------\n" +
        _ACTION_ITEM_EXAMPLES
    )
    if EXTRACTION_PROMPT_CACHE:
        log.info("extraction_prompt_assembled", tokens=estimate_token_count(_ASSEMBLED_SYSTEM_PROMPT), version=_PROMPT_VERSION)
except Exception as e:
    raise PromptLoadError(f"Failed to load extraction prompts: {e}")

async def extract(request: ExtractRequest, ai_client: OpenAIClient) -> ExtractionResultWithMeta | PartialExtractionFailure:
    start_time = time.monotonic()
    
    if not request.participants:
        raise ValueError("Participant list cannot be empty")
        
    full_transcript_text = "\n".join(f"{t.speaker_name}: {t.cleaned_text}" for t in request.cleaned_transcript)
    total_transcript_tokens = estimate_token_count(full_transcript_text)
    
    chunks, chunk_meta = chunk_content(
        content=TranscriptContent(turns=request.cleaned_transcript),
        strategy=ChunkingStrategy.SPEAKER_TURN_GROUPED,
        max_tokens=EXTRACTION_CHUNK_MAX_TOKENS,
        overlap_units=EXTRACTION_CHUNK_OVERLAP_TURNS
    )
    
    log.info(
        "extraction_job_started",
        meeting_id=request.meeting_id,
        team_id=request.team_id,
        total_turns=len(request.cleaned_transcript),
        total_tokens_estimate=total_transcript_tokens,
        chunks_count=len(chunks)
    )
    
    extractor_semaphore = asyncio.Semaphore(EXTRACTOR_CHUNK_CONCURRENCY)
    
    async def _extract_one_chunk_safely(chunk: TextChunk) -> ChunkExtractionResult:
        async with extractor_semaphore:
            is_first = (chunk.chunk_index == 0)
            return await _extract_one_chunk(chunk, request, ai_client, is_first)
            
    chunk_coroutines = [_extract_one_chunk_safely(chunk) for chunk in chunks]
    # asyncio.gather preserves the order of arguments in the returned list
    chunk_results = await asyncio.gather(*chunk_coroutines, return_exceptions=False)
    
    merged_result = _merge_chunk_results(request, chunk_results, start_time)
    
    final_result = merged_result.partial_result if isinstance(merged_result, PartialExtractionFailure) else merged_result
    
    if final_result and final_result.commitments:
        from src.models.date_models import DateParseRequest
        from src.services.date_parser import batch_parse_dates
        
        date_requests = []
        commitments_to_enrich = []
        for c in final_result.commitments:
            if c.due_date_raw:
                date_requests.append(DateParseRequest(
                    raw_expression=c.due_date_raw,
                    meeting_datetime_utc=request.meeting_date,
                    team_timezone=request.team_timezone,
                    meeting_duration_minutes=int(request.meeting_duration_seconds / 60) if request.meeting_duration_seconds else None
                ))
                commitments_to_enrich.append(c)
                
        if date_requests:
            parse_results = await batch_parse_dates(date_requests, ai_client)
            for c, res in zip(commitments_to_enrich, parse_results):
                c.due_date_utc = res.resolved_datetime_utc
                c.due_date_resolution = res
                
    return merged_result

async def _extract_one_chunk(chunk: TextChunk, request: ExtractRequest, ai_client: OpenAIClient, is_first_chunk: bool) -> ChunkExtractionResult:
    participants_fmt = "\n".join(
        f"- {p.name} ({p.email})" + ("" if p.user_id else " [External]") 
        for p in request.participants
    )
    
    content_text = chunk.content
    if not is_first_chunk:
        content_text = "[Note: This is a continuation of the meeting. The preceding section may have contained additional context not reproduced here.]\n\n" + content_text
        
    user_prompt = _USER_PROMPT_TPL.replace("{{meeting_title}}", request.meeting_title)
    user_prompt = user_prompt.replace("{{meeting_date_iso}}", request.meeting_date.isoformat())
    user_prompt = user_prompt.replace("{{participants}}", participants_fmt)
    user_prompt = user_prompt.replace("{{transcript_content}}", content_text)
    
    try:
        call_result = await ai_client.generate_structured(
            task_type=TaskType.EXTRACTION,
            system_prompt=_ASSEMBLED_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_schema=ExtractionResponse
        )
        
        parsed_commitments = [parse_commitment(c) for c in call_result.data.commitments]
        parsed_action_items = [parse_action_item(a) for a in call_result.data.action_items]
        parsed_decisions = [parse_decision(d) for d in call_result.data.decisions]
        parsed_blockers = [parse_blocker(b) for b in call_result.data.blockers]
        
        return ChunkExtractionResult(
            chunk_id=f"chunk_{chunk.chunk_index}",
            chunk_index=chunk.chunk_index,
            succeeded=True,
            parsed_commitments=parsed_commitments,
            parsed_action_items=parsed_action_items,
            parsed_decisions=parsed_decisions,
            parsed_blockers=parsed_blockers,
            summary=call_result.data.summary,
            cost=call_result.cost,
            error=None,
            is_first_chunk=is_first_chunk
        )
    except Exception as exc:
        log.error(
            "chunk_extraction_failed",
            meeting_id=request.meeting_id,
            chunk_index=chunk.chunk_index,
            error_type=type(exc).__name__,
            error_detail=str(exc)
        )
        return ChunkExtractionResult(
            chunk_id=f"chunk_{chunk.chunk_index}",
            chunk_index=chunk.chunk_index,
            succeeded=False,
            is_first_chunk=is_first_chunk,
            error=str(exc)
        )

def _merge_chunk_results(request: ExtractRequest, chunk_results: List[ChunkExtractionResult], start_time: float) -> ExtractionResultWithMeta | PartialExtractionFailure:
    succeeded_chunks = [r for r in chunk_results if r.succeeded]
    failed_chunks = [r for r in chunk_results if not r.succeeded]
    
    if not succeeded_chunks:
        return PartialExtractionFailure(
            meeting_id=request.meeting_id,
            team_id=request.team_id,
            succeeded_chunks=0,
            failed_chunks=len(chunk_results),
            total_chunks=len(chunk_results),
            partial_result=None,
            failed_chunk_indices=[r.chunk_index for r in failed_chunks],
            error_summary="All chunks failed"
        )
        
    # Commitments merge
    merged_commitments = {}
    for res in succeeded_chunks:
        for c in res.parsed_commitments or []:
            if c.dedup_key not in merged_commitments:
                merged_commitments[c.dedup_key] = (c, res.chunk_index)
            else:
                existing, existing_idx = merged_commitments[c.dedup_key]
                if c.confidence > existing.confidence:
                    merged_commitments[c.dedup_key] = (c, res.chunk_index)
                elif c.confidence == existing.confidence and res.chunk_index > existing_idx:
                    # Same dedup_key but legitimately different context? Keep later in meeting
                    log.debug("commitment_tie_break", dedup_key=c.dedup_key, winner_chunk=res.chunk_index)
                    merged_commitments[c.dedup_key] = (c, res.chunk_index)
                    
    final_commitments = [c for c, _ in merged_commitments.values()]
    
    # Action Items merge
    merged_action_items = {}
    for res in succeeded_chunks:
        for a in res.parsed_action_items or []:
            if a.dedup_key not in merged_action_items:
                merged_action_items[a.dedup_key] = a
            else:
                if a.confidence > merged_action_items[a.dedup_key].confidence:
                    merged_action_items[a.dedup_key] = a
    final_action_items = list(merged_action_items.values())
    
    # Decisions merge
    merged_decisions = {}
    for res in succeeded_chunks:
        for d in res.parsed_decisions or []:
            norm_text = d.text_normalized.strip()[:80]
            if norm_text not in merged_decisions or d.confidence > merged_decisions[norm_text].confidence:
                merged_decisions[norm_text] = d
    final_decisions = list(merged_decisions.values())
    
    # Blockers merge
    merged_blockers = {}
    for res in succeeded_chunks:
        for b in res.parsed_blockers or []:
            norm_text = b.text_normalized.strip()[:80]
            if norm_text not in merged_blockers or b.confidence > merged_blockers[norm_text].confidence:
                merged_blockers[norm_text] = b
    final_blockers = list(merged_blockers.values())
    
    # Summary
    first_success = next((r for r in succeeded_chunks), None)
    summary = first_success.summary if first_success else ""
    summary_scope = SummaryScopeType.FULL if len(chunk_results) == 1 else SummaryScopeType.PARTIAL_FIRST_CHUNK
    
    # Cost
    total_input = 0
    total_output = 0
    total_cost_usd = 0.0
    extraction_model = "unknown"
    
    for res in succeeded_chunks:
        if res.cost:
            total_input += res.cost.input_tokens
            total_output += res.cost.output_tokens
            total_cost_usd += res.cost.estimated_cost_usd
            extraction_model = res.cost.model_name
            
    total_cost = CostRecord(
        input_tokens=total_input,
        output_tokens=total_output,
        model_tier=succeeded_chunks[0].cost.model_tier if succeeded_chunks and succeeded_chunks[0].cost else None,
        model_name=extraction_model,
        estimated_cost_usd=total_cost_usd
    )
    
    per_chunk_costs = [r.cost if r.succeeded else None for r in chunk_results]
    
    processing_time_ms = (time.monotonic() - start_time) * 1000
    
    full_result = ExtractionResultWithMeta(
        meeting_id=request.meeting_id,
        team_id=request.team_id,
        commitments=final_commitments,
        action_items=final_action_items,
        decisions=final_decisions,
        blockers=final_blockers,
        summary=summary,
        summary_scope=summary_scope,
        extraction_model=extraction_model,
        prompt_version=_PROMPT_VERSION,
        chunks_total=len(chunk_results),
        chunks_succeeded=len(succeeded_chunks),
        total_cost=total_cost,
        per_chunk_costs=per_chunk_costs,
        processing_time_ms=processing_time_ms
    )
    
    if failed_chunks:
        return PartialExtractionFailure(
            meeting_id=request.meeting_id,
            team_id=request.team_id,
            succeeded_chunks=len(succeeded_chunks),
            failed_chunks=len(failed_chunks),
            total_chunks=len(chunk_results),
            partial_result=full_result,
            failed_chunk_indices=[r.chunk_index for r in failed_chunks],
            error_summary=f"{len(failed_chunks)} chunks failed"
        )
        
    return full_result
