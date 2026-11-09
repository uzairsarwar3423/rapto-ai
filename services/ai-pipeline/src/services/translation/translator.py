"""
services/translation/translator.py
──────────────────────────────────
On-demand translation of ALREADY-GENERATED meeting content.

Design constraints (see the multilingual feature spec):
  • Reuses the existing AI client + task routing (TaskType.TRANSLATE → mini tier);
    no new model, no new provider.
  • Never touches the transcript: the input is the structured content only, so
    token usage is proportional to the summary, not to the meeting length.
  • Structure is owned by the caller: we receive a flat keyed list and return the
    same keys. A key the model drops is re-requested once, then reported in
    `missing_keys` so the caller keeps the original text (never blank content).
  • Batched by character budget with bounded concurrency so a long meeting does
    not become one giant call.
"""

from __future__ import annotations

import asyncio
import time
from typing import List

import structlog

from src.models.common import AICallResult, CostRecord, ModelTier, TaskType
from src.models.translate_models import (
    TranslateItem,
    TranslateRequest,
    TranslateResult,
    TranslationBatchResponse,
)
from src.services.ai_client_protocol import AIClientProtocol
from src.services.extraction.prompt_router import load_prompt
from src.services.language import language_name

log = structlog.get_logger(__name__)

TRANSLATION_PROMPT_FILE = "translation_system.txt"
BATCH_CHAR_BUDGET = 6000
BATCH_MAX_ITEMS = 60
BATCH_CONCURRENCY = 3


def _batches(items: List[TranslateItem]) -> List[List[TranslateItem]]:
    batches: List[List[TranslateItem]] = []
    current: List[TranslateItem] = []
    size = 0
    for item in items:
        cost = len(item.text) + len(item.key) + 16
        if current and (size + cost > BATCH_CHAR_BUDGET or len(current) >= BATCH_MAX_ITEMS):
            batches.append(current)
            current, size = [], 0
        current.append(item)
        size += cost
    if current:
        batches.append(current)
    return batches


def _user_prompt(source: str, target: str, batch: List[TranslateItem]) -> str:
    import json

    payload = json.dumps(
        [{"key": i.key, "text": i.text} for i in batch], ensure_ascii=False, indent=0
    )
    return (
        f"SOURCE LANGUAGE: {language_name(source)}\n"
        f"TARGET LANGUAGE: {language_name(target)}\n"
        f"ITEMS ({len(batch)}):\n"
        f"{payload}\n\n"
        "Translate every item. Return one translation per key."
    )


async def _translate_batch(
    client: AIClientProtocol,
    system_prompt: str,
    source: str,
    target: str,
    batch: List[TranslateItem],
) -> tuple[dict[str, str], AICallResult[TranslationBatchResponse]]:
    result = await client.generate_structured(
        task_type=TaskType.TRANSLATE,
        system_prompt=system_prompt,
        user_prompt=_user_prompt(source, target, batch),
        response_schema=TranslationBatchResponse,
    )
    wanted = {i.key for i in batch}
    # Only accept requested keys; first occurrence wins; ignore blanks the model
    # returned for non-blank sources (treated as missing → retried).
    source_text = {i.key: i.text for i in batch}
    out: dict[str, str] = {}
    for t in result.data.translations:
        if t.key in wanted and t.key not in out and (t.text.strip() or not source_text[t.key].strip()):
            out[t.key] = t.text
    return out, result


def _sum_costs(results: list[AICallResult]) -> CostRecord:
    ref = results[0].cost
    return CostRecord(
        input_tokens=sum(r.cost.input_tokens for r in results),
        output_tokens=sum(r.cost.output_tokens for r in results),
        model_tier=ref.model_tier,
        model_name=ref.model_name,
        estimated_cost_usd=sum(r.cost.estimated_cost_usd for r in results),
    )


async def translate(request: TranslateRequest, ai_client: AIClientProtocol) -> TranslateResult:
    start = time.monotonic()
    system_prompt = load_prompt(TRANSLATION_PROMPT_FILE).body

    translated: dict[str, str] = {}
    pending: List[TranslateItem] = []
    for item in request.items:
        if item.text.strip():
            pending.append(item)
        else:
            translated[item.key] = item.text  # empty stays empty, no model call

    calls: list[AICallResult] = []
    sem = asyncio.Semaphore(BATCH_CONCURRENCY)

    async def run(batch: List[TranslateItem]) -> dict[str, str]:
        async with sem:
            out, call = await _translate_batch(
                ai_client, system_prompt, request.source_language, request.target_language, batch
            )
            calls.append(call)
            return out

    if pending:
        results = await asyncio.gather(*(run(b) for b in _batches(pending)), return_exceptions=True)
        for res in results:
            if isinstance(res, BaseException):
                log.warning(
                    "translate_batch_failed",
                    meeting_id=request.meeting_id,
                    error_type=type(res).__name__,
                    error=str(res)[:200],
                )
                continue
            else:
                translated.update(res)

        # One corrective pass over everything still missing (dropped keys and
        # failed batches), in smaller batches.
        missing = [i for i in pending if i.key not in translated]
        if missing:
            retry_results = await asyncio.gather(*(run(b) for b in _batches(missing)), return_exceptions=True)
            for res in retry_results:
                if not isinstance(res, BaseException):
                    translated.update(res)

        if not calls:
            # Every call failed — surface the failure so the API reports an error
            # rather than caching an empty "translation".
            first_exc = next((r for r in results if isinstance(r, BaseException)), None)
            raise first_exc or RuntimeError("translation produced no output")

    ordered = [
        TranslateItem(key=i.key, text=translated[i.key])
        for i in request.items
        if i.key in translated
    ]
    missing_keys = [i.key for i in request.items if i.key not in translated]

    cost = _sum_costs(calls) if calls else CostRecord(
        input_tokens=0, output_tokens=0, model_tier=ModelTier.MINI, model_name="n/a", estimated_cost_usd=0.0
    )
    model_name = cost.model_name
    elapsed = (time.monotonic() - start) * 1000
    log.info(
        "translate_complete",
        meeting_id=request.meeting_id,
        source=request.source_language,
        target=request.target_language,
        items=len(request.items),
        missing=len(missing_keys),
        calls=len(calls),
        cost_usd=cost.estimated_cost_usd,
        processing_time_ms=round(elapsed, 1),
    )
    return TranslateResult(
        meeting_id=request.meeting_id,
        source_language=request.source_language,
        target_language=request.target_language,
        items=ordered,
        missing_keys=missing_keys,
        model=model_name,
        total_cost=cost,
        processing_time_ms=elapsed,
    )
