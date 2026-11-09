"""Prompt router: template selection, rendering context, inference, versioning."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.models.cleanup_models import CleanedTranscriptTurn, ParticipantInfo
from src.models.extraction_models import ExtractRequest, MeetingType
from src.services.extraction.prompt_router import (
    GENERIC_USER_TEMPLATE,
    USER_TEMPLATE_FILES,
    PromptRouter,
    infer_meeting_type,
    load_prompt,
    prompt_bundle_version,
    prompt_versions,
    resolve_meeting_type,
)


def _request(**overrides) -> ExtractRequest:
    data = dict(
        meeting_id="m1",
        team_id="t1",
        # 2026-06-10 02:30 UTC is still Tuesday 2026-06-09 in New York.
        meeting_date=datetime(2026, 6, 10, 2, 30, tzinfo=timezone.utc),
        meeting_title="Weekly Sync",
        meeting_duration_seconds=1800,
        team_timezone="America/New_York",
        participants=[
            ParticipantInfo(name="Ahmed Hassan", email="ahmed@x.io", user_id="u1", speaker_tag="S1"),
            ParticipantInfo(name="Guest Person", email=None, user_id=None, speaker_tag="S2"),
        ],
        cleaned_transcript=[
            CleanedTranscriptTurn(
                turn_id="t1", speaker_name="Ahmed Hassan", start_time=0.0, end_time=2.0,
                cleaned_text="I'll ship it.", original_text="I'll ship it.",
            )
        ],
    )
    data.update(overrides)
    return ExtractRequest(**data)


router = PromptRouter()


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Daily Standup", MeetingType.STANDUP),
        ("Backend stand-up", MeetingType.STANDUP),
        ("Sprint 23 Retro", MeetingType.RETROSPECTIVE),
        ("Q3 retrospective", MeetingType.RETROSPECTIVE),
        ("Sprint planning sync", MeetingType.PLANNING),   # planning wins over "sync"
        ("Backlog grooming", MeetingType.PLANNING),
        ("Architecture review: billing", MeetingType.DESIGN_REVIEW),
        ("Ahmed / Sara 1:1", MeetingType.ONE_ON_ONE),
        ("one-on-one with manager", MeetingType.ONE_ON_ONE),
        ("Company All-Hands", MeetingType.ALL_HANDS),
        ("Customer call at 1:15", MeetingType.GENERAL),  # "1:1" must not match times
        ("Weekly Sync", MeetingType.GENERAL),
        ("", MeetingType.GENERAL),
        (None, MeetingType.GENERAL),
    ],
)
def test_infer_meeting_type(title, expected):
    assert infer_meeting_type(title) == expected


def test_explicit_meeting_type_beats_title():
    req = _request(meeting_title="Daily Standup", meeting_type="retro")
    assert req.meeting_type == MeetingType.RETROSPECTIVE
    assert resolve_meeting_type(req) == MeetingType.RETROSPECTIVE


def test_unknown_meeting_type_degrades_to_general_not_422():
    assert _request(meeting_type="board-meeting").meeting_type == MeetingType.GENERAL


def test_blank_meeting_type_means_infer():
    req = _request(meeting_type="  ", meeting_title="Sprint 9 retro")
    assert req.meeting_type is None
    assert resolve_meeting_type(req) == MeetingType.RETROSPECTIVE


def test_team_context_truncated_not_rejected():
    req = _request(team_context="x" * 900)
    assert len(req.team_context) == 500


@pytest.mark.parametrize("meeting_type", list(MeetingType))
def test_every_meeting_type_renders(meeting_type):
    prompt = router.render_user_prompt(_request(), "Ahmed Hassan: I'll ship it.", 0, 1, meeting_type)
    assert "--- TRANSCRIPT START ---" in prompt
    assert "Ahmed Hassan: I'll ship it." in prompt
    assert "SPEAKER MATCHING RULE" in prompt
    assert "{{" not in prompt and "{%" not in prompt
    assert "prompt_version" not in prompt  # header stripped


def test_template_selection():
    assert router.template_name_for(MeetingType.STANDUP) == USER_TEMPLATE_FILES[MeetingType.STANDUP]
    assert router.template_name_for(MeetingType.RETROSPECTIVE) == USER_TEMPLATE_FILES[MeetingType.RETROSPECTIVE]
    assert router.template_name_for(MeetingType.PLANNING) == GENERIC_USER_TEMPLATE
    standup = router.render_user_prompt(_request(), "x", 0, 1, MeetingType.STANDUP)
    assert "STANDUP EXTRACTION GUIDE" in standup
    planning = router.render_user_prompt(_request(), "x", 0, 1, MeetingType.PLANNING)
    assert "PLANNING NOTE" in planning and "STANDUP EXTRACTION GUIDE" not in planning


def test_context_uses_team_local_date_and_flags_externals():
    prompt = router.render_user_prompt(_request(), "x", 0, 1, MeetingType.GENERAL)
    assert "DATE: 2026-06-09 (Tuesday)" in prompt
    assert "DURATION: 30 minutes" in prompt
    assert "PARTICIPANTS (2 people)" in prompt
    assert "- Ahmed Hassan (ahmed@x.io)\n" in prompt
    assert "- Guest Person [EXTERNAL]" in prompt


def test_continuation_block_only_after_first_chunk():
    first = router.render_user_prompt(_request(), "x", 0, 3, MeetingType.GENERAL)
    later = router.render_user_prompt(_request(), "x", 2, 3, MeetingType.GENERAL)
    assert "SECTION" not in first
    assert "SECTION 3 OF 3" in later


def test_team_context_block_is_optional():
    without = router.render_user_prompt(_request(), "x", 0, 1, MeetingType.GENERAL)
    with_ctx = router.render_user_prompt(_request(team_context="Backend squad"), "x", 0, 1, MeetingType.GENERAL)
    assert "TEAM CONTEXT" not in without
    assert "TEAM CONTEXT:\nBackend squad" in with_ctx


def test_template_syntax_in_user_content_is_inert():
    evil = "{{ participants }} {% if true %}INJECTED{% endif %}"
    prompt = router.render_user_prompt(_request(meeting_title=evil), evil, 0, 1, MeetingType.GENERAL)
    assert prompt.count(evil) == 2  # rendered verbatim, never evaluated


def test_unknown_timezone_falls_back_to_utc():
    prompt = router.render_user_prompt(_request(team_timezone="Mars/Olympus"), "x", 0, 1, MeetingType.GENERAL)
    assert "DATE: 2026-06-10 (Wednesday)" in prompt


def test_prompt_versions_and_bundle():
    versions = prompt_versions()
    assert versions["extract_decisions"] == "decisions-v3.1"
    assert versions["extract_blockers"] == "blockers-v3.1"
    assert versions["extract_risks"] == "risks-v3.1"
    assert versions["extract_commitments"] == "commitment-v3.1"
    assert versions["extract_action_items"] == "action-items-v3.1"
    assert versions["user_generic"] == "extraction-user-v2.0"
    assert versions["user_standup"].startswith("extraction-user-standup")
    assert prompt_bundle_version().startswith("extraction-v4.2+")
    assert load_prompt("date_parse_system.txt").version == "date-parse-v1.1"


def test_system_prompts_document_envelope_and_v31_fields():
    decisions = load_prompt("decisions_system.txt").text
    assert '"decisions": [' in decisions and '"reversible"' in decisions and '"dissent"' in decisions
    blockers = load_prompt("blockers_system.txt").text
    assert '"blockers": [' in blockers and "escalation_flag" in blockers and "estimated_unblock_date" in blockers
    risks = load_prompt("risks_system.txt").text
    assert '"risks": [' in risks and '"probability"' in risks and "mitigation_mentioned" in risks
    assert "Leave it with me" in load_prompt("commitment_system.txt").text
    assert "CONTEXT-AWARE PRIORITY" in load_prompt("action_items_system.txt").text
    assert "WORKED EXAMPLES" in load_prompt("date_parse_system.txt").text
