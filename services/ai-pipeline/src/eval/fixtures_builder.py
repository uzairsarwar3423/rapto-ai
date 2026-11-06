"""
eval/fixtures_builder.py
─────────────────────────
CLI to grow the golden dataset from real meetings.

Writes a fixture PAIR into src/eval/golden_dataset/:
  <name>_cleaned.json   — the cleaned transcript (rich format), names
                          pseudonymised by default
  <name>_expected.json  — DRAFT expectations ("draft": true). When a service
                          URL is given they are pre-filled from the current
                          pipeline's output; otherwise they are empty.

Drafts are skipped by run_all_evals until a human reviews every expectation,
fixes what the model got wrong, adds what it missed, and sets "draft": false.

SOURCES:
  --meeting-id <id>   Latest MongoDB `transcripts` document for that meeting
                      (uses normalized_transcript; MONGODB_URL env or --mongo-url)
  --from-file <path>  A JSON file: list of CleanedTranscriptTurn, or an object
                      with "cleaned_transcript" / "normalized_transcript"

PRIVACY:
  Fixtures are committed to git. By default every speaker name is replaced
  with a stable pseudonym ("Participant A", …) in speaker fields AND in the
  spoken text (full name and first name). Pass --keep-names only for
  transcripts you are allowed to store in the repository.

USAGE:
  python -m src.eval.fixtures_builder --meeting-id <id> --name standup_03 \\
      --meeting-type standup --service-url http://localhost:8001
  python -m src.eval.fixtures_builder --from-file transcript.json --name retro_02
"""

from __future__ import annotations

import argparse
import json
import os
import re
import string
import sys
from pathlib import Path
from typing import Any, Optional

from src.eval.eval_io import GOLDEN_DATASET_DIR, Fixture, run_http
from src.eval.eval_schema import EvalCase

_FIXTURE_NAME = re.compile(r"^[a-z0-9][a-z0-9_]{1,60}$")
_TURN_FIELDS = (
    "turn_id", "cleaned_text", "original_text", "speaker_name",
    "start_time", "end_time", "filler_words_removed",
)


# ─── Sources ──────────────────────────────────────────────────────────────────


def turns_from_document(doc: Any) -> list[dict[str, Any]]:
    if isinstance(doc, list):
        turns = doc
    elif isinstance(doc, dict):
        turns = doc.get("cleaned_transcript") or doc.get("normalized_transcript") or []
    else:
        turns = []
    if not turns:
        raise ValueError("no transcript turns found in source")
    cleaned: list[dict[str, Any]] = []
    for index, turn in enumerate(turns):
        text = turn.get("cleaned_text") or turn.get("text") or ""
        speaker = turn.get("speaker_name") or turn.get("speaker_tag") or turn.get("speaker") or "Unknown Speaker"
        cleaned.append({
            "turn_id": str(turn.get("turn_id") or turn.get("id") or f"turn-{index}"),
            "cleaned_text": text,
            "original_text": turn.get("original_text") or text or " ",
            "speaker_name": speaker,
            "start_time": float(turn.get("start_time") or turn.get("start_timestamp") or 0.0),
            "end_time": float(turn.get("end_time") or turn.get("end_timestamp") or 0.0),
            "filler_words_removed": int(turn.get("filler_words_removed") or 0),
        })
    return cleaned


def load_from_mongo(meeting_id: str, mongo_url: str, database: str) -> list[dict[str, Any]]:
    from pymongo import MongoClient  # installed with motor

    with MongoClient(mongo_url, serverSelectionTimeoutMS=5000) as client:
        doc = client[database]["transcripts"].find_one(
            {"meeting_id": meeting_id}, sort=[("created_at", -1)]
        )
    if doc is None:
        raise LookupError(f"no transcript document for meeting_id={meeting_id} in {database}.transcripts")
    if doc.get("cleanup_successful") is False:
        print("  [WARN] cleanup failed for this meeting — normalized_transcript is the RAW transcript")
    return turns_from_document(doc)


# ─── Pseudonymisation ─────────────────────────────────────────────────────────


def pseudonymise(turns: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Replace speaker names (and their mentions in text) with stable pseudonyms."""
    speakers = list(dict.fromkeys(t["speaker_name"] for t in turns))
    labels = iter(f"Participant {c}" for c in string.ascii_uppercase * 4)
    mapping = {name: next(labels) for name in speakers}

    # Longest names first so "Sara Khan" is replaced before "Sara".
    replacements: list[tuple[re.Pattern[str], str]] = []
    for name, alias in mapping.items():
        variants = {name, name.split()[0]} if name.strip() else {name}
        for variant in sorted(variants, key=len, reverse=True):
            if len(variant) >= 3:
                replacements.append((re.compile(rf"\b{re.escape(variant)}\b", re.I), alias))
    replacements.sort(key=lambda r: -len(r[0].pattern))

    def scrub(text: str) -> str:
        for pattern, alias in replacements:
            text = pattern.sub(alias, text)
        return text

    out = []
    for turn in turns:
        new = dict(turn)
        new["speaker_name"] = mapping[turn["speaker_name"]]
        new["cleaned_text"] = scrub(turn["cleaned_text"])
        new["original_text"] = scrub(turn["original_text"]) or " "
        out.append(new)
    return out, mapping


# ─── Draft expectations ───────────────────────────────────────────────────────


def _phrase(text: str, words: int = 5) -> str:
    return " ".join(str(text).split()[:words])


def draft_expectations(result: Optional[dict[str, Any]]) -> dict[str, Any]:
    result = result or {}
    return {
        "expected_commitments": [
            {"owner_name_contains": c.get("owner_name", ""), "text_contains": _phrase(c.get("text", ""))}
            for c in result.get("commitments", [])
        ],
        "expected_action_items": [
            {"assignee_name_contains": a.get("assignee_name", ""), "text_contains": _phrase(a.get("text", ""))}
            for a in result.get("action_items", [])
        ],
        "expected_decisions": [{"text_contains": _phrase(d.get("text", ""))} for d in result.get("decisions", [])],
        "expected_blockers": [{"text_contains": _phrase(b.get("text", ""))} for b in result.get("blockers", [])],
        "expected_risks": [{"text_contains": _phrase(r.get("text", ""))} for r in result.get("risks", [])],
        "expected_commitment_count": len(result.get("commitments", [])),
    }


# ─── CLI ──────────────────────────────────────────────────────────────────────


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--meeting-id")
    source.add_argument("--from-file", type=Path)
    parser.add_argument("--name", required=True, help="Fixture id, e.g. standup_03")
    parser.add_argument("--meeting-type", default="general")
    parser.add_argument("--title", default=None)
    parser.add_argument("--mongo-url", default=os.getenv("MONGODB_URL"))
    parser.add_argument("--mongo-db", default=os.getenv("MONGODB_TRANSCRIPTS_DB", "rapto"))
    parser.add_argument("--service-url", default=None, help="Pre-fill draft expectations from /extract")
    parser.add_argument("--api-key", default=os.getenv("API_SHARED_SECRET", "dev-secret"))
    parser.add_argument("--keep-names", action="store_true", help="Do NOT pseudonymise names")
    parser.add_argument("--out-dir", type=Path, default=GOLDEN_DATASET_DIR)
    parser.add_argument("--force", action="store_true", help="Overwrite existing fixture files")
    args = parser.parse_args(argv)

    if not _FIXTURE_NAME.match(args.name):
        print("ERROR: --name must be lowercase letters, digits and underscores")
        return 2
    cleaned_path = args.out_dir / f"{args.name}_cleaned.json"
    expected_path = args.out_dir / f"{args.name}_expected.json"
    if not args.force and (cleaned_path.exists() or expected_path.exists()):
        print(f"ERROR: fixture {args.name} already exists (use --force to overwrite)")
        return 2

    try:
        if args.meeting_id:
            if not args.mongo_url:
                print("ERROR: --mongo-url or MONGODB_URL is required with --meeting-id")
                return 2
            turns = load_from_mongo(args.meeting_id, args.mongo_url, args.mongo_db)
        else:
            turns = turns_from_document(json.loads(args.from_file.read_text(encoding="utf-8")))
    except (LookupError, ValueError, OSError) as exc:
        print(f"ERROR: {exc}")
        return 1

    mapping: dict[str, str] = {}
    if not args.keep_names:
        turns, mapping = pseudonymise(turns)

    speakers = list(dict.fromkeys(t["speaker_name"] for t in turns))
    cleaned = {
        "meeting_id": args.name,
        "meeting_title": args.title or args.name.replace("_", " ").title(),
        "meeting_duration_seconds": max((t["end_time"] for t in turns), default=0.0) or 1800.0,
        "participants": speakers,
        "cleaned_transcript": [{k: t[k] for k in _TURN_FIELDS} for t in turns],
    }
    case = EvalCase(meeting_id=args.name, meeting_type=args.meeting_type, meeting_title=cleaned["meeting_title"])

    result = None
    if args.service_url:
        run = run_http(Fixture(args.name, cleaned, case), args.service_url, args.api_key)
        if run.result is None:
            print(f"  [WARN] extraction failed ({run.error}); writing empty draft expectations")
        result = run.result

    expected = {
        "meeting_id": args.name,
        "meeting_type": args.meeting_type,
        "meeting_title": cleaned["meeting_title"],
        "description": "DRAFT — describe what this fixture tests.",
        "draft": True,
        **draft_expectations(result),
        "expected_zero_commitments": False,
        "labelling_notes": [
            "DRAFT generated from model output: verify every item against the transcript, "
            "remove false positives, add misses, then set \"draft\": false.",
        ],
    }

    args.out_dir.mkdir(parents=True, exist_ok=True)
    cleaned_path.write_text(json.dumps(cleaned, indent=2, ensure_ascii=False), encoding="utf-8")
    expected_path.write_text(json.dumps(expected, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {cleaned_path}")
    print(f"Wrote {expected_path} (DRAFT)")
    if mapping:
        print(f"Pseudonymised {len(mapping)} speaker(s); the name map is NOT saved to disk.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
