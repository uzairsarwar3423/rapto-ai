"""
eval/eval_io.py
────────────────
Fixture discovery, /extract payload construction, and extraction execution
shared by every eval harness (run_all_evals, deepeval_harness, ragas_harness).

FIXTURE FORMATS (`golden_dataset/<id>_cleaned.json`):
  Simple  — {"meeting_id", "participants": ["Alice", ...],
             "content": "Alice: line\\nBob: line"}
  Rich    — {"meeting_id", "meeting_title"?, "participants": [ParticipantInfo...],
             "cleaned_transcript": [CleanedTranscriptTurn...]}
             (what fixtures_builder.py writes from real meetings)

EXECUTION MODES:
  HTTP        — POST {service_url}/api/v1/extract (black-box, default)
  In-process  — call extractor.extract() directly with clients built from the
                environment (no running service needed; same code path)
"""

from __future__ import annotations

import json
import re
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from src.eval.eval_schema import EvalCase

GOLDEN_DATASET_DIR: Path = Path(__file__).parent / "golden_dataset"
RESULTS_DIR: Path = Path(__file__).parent / "results"

EVAL_MEETING_DATE = "2026-06-15T09:00:00Z"  # a Monday — keeps date resolution deterministic
EVAL_TEAM_ID = "eval-team-01"
DEFAULT_DURATION_SECONDS = 1800

_SPEAKER_LINE = re.compile(r"^\s*([^:\n]{1,60}?)\s*:\s+(.*)$")


@dataclass
class Fixture:
    fixture_id: str
    cleaned: dict[str, Any]
    case: EvalCase

    @property
    def transcript_text(self) -> str:
        if "content" in self.cleaned:
            return str(self.cleaned["content"])
        return "\n".join(
            f"{t.get('speaker_name', 'Unknown')}: {t.get('cleaned_text', '')}"
            for t in self.cleaned.get("cleaned_transcript", [])
        )


def load_fixtures(
    directory: Path = GOLDEN_DATASET_DIR,
    only: Optional[list[str]] = None,
    include_drafts: bool = False,
) -> list[Fixture]:
    """Load fixture pairs. Draft expectations are skipped unless named in `only`
    or include_drafts=True."""
    fixtures: list[Fixture] = []
    for cleaned_path in sorted(directory.glob("*_cleaned.json")):
        fixture_id = cleaned_path.stem.removesuffix("_cleaned")
        if only and fixture_id not in only:
            continue
        expected_path = directory / f"{fixture_id}_expected.json"
        if not expected_path.exists():
            continue
        cleaned = json.loads(cleaned_path.read_text(encoding="utf-8"))
        case = EvalCase.model_validate(json.loads(expected_path.read_text(encoding="utf-8")))
        if case.draft and not include_drafts and not only:
            print(f"  [SKIP] {fixture_id}: expectations are a DRAFT — review and set \"draft\": false")
            continue
        fixtures.append(Fixture(fixture_id=fixture_id, cleaned=cleaned, case=case))
    return fixtures


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "speaker"


def _participant(name: str) -> dict[str, Any]:
    slug = _slug(name)
    return {
        "user_id": f"eval-user-{slug}",
        "name": name,
        "email": f"{slug}@eval.local",
        "speaker_tag": name,
    }


def _turns_from_content(content: str) -> list[dict[str, Any]]:
    turns: list[dict[str, Any]] = []
    clock = 0.0
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = _SPEAKER_LINE.match(line)
        if match is None and turns:
            turns[-1]["cleaned_text"] += " " + line
            turns[-1]["original_text"] += " " + line
            continue
        speaker, text = (match.group(1), match.group(2)) if match else ("Unknown Speaker", line)
        duration = max(2.0, len(text.split()) / 2.5)  # ~150 wpm
        turns.append({
            "turn_id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{len(turns)}:{speaker}:{text}")),
            "cleaned_text": text,
            "original_text": text,
            "speaker_name": speaker,
            "speaker_user_id": f"eval-user-{_slug(speaker)}",
            "start_time": round(clock, 2),
            "end_time": round(clock + duration, 2),
            "filler_words_removed": 0,
        })
        clock += duration + 0.5
    return turns


def build_extract_payload(fixture: Fixture) -> dict[str, Any]:
    """Build a valid ExtractRequest JSON body from a fixture (either format)."""
    cleaned, case = fixture.cleaned, fixture.case

    if "cleaned_transcript" in cleaned:
        turns = cleaned["cleaned_transcript"]
    else:
        turns = _turns_from_content(cleaned.get("content", ""))

    raw_participants = cleaned.get("participants") or []
    participants = [
        p if isinstance(p, dict) else _participant(str(p)) for p in raw_participants
    ]
    known = {p["name"] for p in participants}
    for turn in turns:  # any speaker missing from the list (e.g. "All") is added
        name = turn.get("speaker_name")
        if name and name not in known:
            participants.append(_participant(name))
            known.add(name)

    duration = cleaned.get("meeting_duration_seconds")
    if not duration and turns:
        duration = max(float(turns[-1].get("end_time", 0.0)), 60.0)

    return {
        "meeting_id": cleaned.get("meeting_id", fixture.fixture_id),
        "team_id": EVAL_TEAM_ID,
        "meeting_title": (
            case.meeting_title
            or cleaned.get("meeting_title")
            or f"{fixture.fixture_id.replace('_', ' ').title()}"
        ),
        "meeting_date": cleaned.get("meeting_date", EVAL_MEETING_DATE),
        "meeting_duration_seconds": float(duration or DEFAULT_DURATION_SECONDS),
        "team_timezone": cleaned.get("team_timezone", "UTC"),
        "meeting_type": case.meeting_type,
        "team_context": cleaned.get("team_context"),
        "participants": participants,
        "cleaned_transcript": turns,
    }


# ─── Execution ────────────────────────────────────────────────────────────────


@dataclass
class ExtractionRun:
    fixture_id: str
    result: Optional[dict[str, Any]]      # ExtractionResultWithMeta as JSON (partial result on 206)
    http_status: Optional[int]
    latency_ms: float
    error: Optional[str] = None
    partial: bool = False


def _unwrap_result(body: dict[str, Any]) -> tuple[Optional[dict[str, Any]], bool]:
    result = body.get("result") if "result" in body else body
    if isinstance(result, dict) and "partial_result" in result:
        return result.get("partial_result"), True
    return result, False


def run_http(fixture: Fixture, service_url: str, api_key: str, timeout: float = 300.0,
             retries: int = 2) -> ExtractionRun:
    import httpx

    payload = build_extract_payload(fixture)
    started = time.monotonic()
    last_error: Optional[str] = None
    status: Optional[int] = None
    with httpx.Client(
        base_url=service_url.rstrip("/"),
        headers={"X-Internal-Service-Key": api_key},
        timeout=timeout,
    ) as client:
        for attempt in range(1, retries + 1):
            try:
                response = client.post("/api/v1/extract", json=payload)
                status = response.status_code
                if status in (200, 206):
                    result, partial = _unwrap_result(response.json())
                    return ExtractionRun(
                        fixture.fixture_id, result, status,
                        (time.monotonic() - started) * 1000, partial=partial or status == 206,
                    )
                last_error = f"HTTP {status}: {response.text[:300]}"
                if status < 500:
                    break  # 4xx will not fix itself on retry
            except httpx.HTTPError as exc:
                last_error = f"{type(exc).__name__}: {exc}"
            if attempt < retries:
                time.sleep(attempt)
    return ExtractionRun(fixture.fixture_id, None, status, (time.monotonic() - started) * 1000, last_error)


async def run_in_process(fixture: Fixture) -> ExtractionRun:
    """Run the real extraction pipeline in this process (needs service env vars)."""
    from src.api.main import build_ai_clients
    from src.config.settings import get_settings
    from src.models.extraction_models import ExtractRequest, PartialExtractionFailure
    from src.services.extraction.extractor import extract

    primary, fallback = _cached_clients(build_ai_clients, get_settings())
    request = ExtractRequest.model_validate(build_extract_payload(fixture))
    started = time.monotonic()
    try:
        outcome = await extract(request, primary, fallback_client=fallback)
    except Exception as exc:  # noqa: BLE001 — report, don't crash the eval run
        return ExtractionRun(fixture.fixture_id, None, None, (time.monotonic() - started) * 1000,
                             f"{type(exc).__name__}: {exc}")
    latency = (time.monotonic() - started) * 1000
    if isinstance(outcome, PartialExtractionFailure):
        result = outcome.partial_result.model_dump(mode="json") if outcome.partial_result else None
        return ExtractionRun(fixture.fixture_id, result, 206, latency,
                             None if result else outcome.error_summary, partial=True)
    return ExtractionRun(fixture.fixture_id, outcome.model_dump(mode="json"), 200, latency)


def run_all_in_process(fixtures: list[Fixture], concurrency: int = 2) -> dict[str, ExtractionRun]:
    """Run every fixture in ONE event loop.

    The AI clients hold async HTTP connection pools bound to the loop that
    first used them, so fixtures must not be spread over several asyncio.run()
    calls.
    """
    import asyncio

    async def _all() -> list[ExtractionRun]:
        semaphore = asyncio.Semaphore(max(1, concurrency))

        async def _one(fixture: Fixture) -> ExtractionRun:
            async with semaphore:
                return await run_in_process(fixture)

        return list(await asyncio.gather(*(_one(f) for f in fixtures)))

    try:
        return {run.fixture_id: run for run in asyncio.run(_all())}
    finally:
        _CLIENTS.clear()  # bound to the loop that just closed


_CLIENTS: dict[str, Any] = {}


def _cached_clients(factory: Any, settings: Any) -> tuple[Any, Any]:
    if "pair" not in _CLIENTS:
        _CLIENTS["pair"] = factory(settings)
    return _CLIENTS["pair"]
