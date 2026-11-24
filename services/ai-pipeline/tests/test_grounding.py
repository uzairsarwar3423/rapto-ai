"""Evidence grounding, unassigned action items, confidence floor and summary parsing."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest

from src.models.cleanup_models import CleanedTranscriptTurn, ParticipantInfo
from src.models.common import AICallResult, CostRecord, ModelTier, TaskType
from src.models.extraction_models import (
    ActionItemsResponse,
    BlockersResponse,
    CommitmentsResponse,
    DecisionsResponse,
    ExtractedActionItem,
    ExtractedCommitment,
    ExtractedDecision,
    ExtractionResultWithMeta,
    ExtractRequest,
    RisksResponse,
    StructuredSummary,
)
from src.services.extraction import extractor
from src.services.extraction.action_item_parser import parse_action_item
from src.services.extraction.commitment_parser import parse_commitment
from src.services.extraction.deduplicator import deduplicate_commitments_and_action_items
from src.services.extraction.grounding import (
    MISATTRIBUTED_OWNER_PENALTY,
    UNVERIFIED_EVIDENCE_PENALTY,
    GroundingTurn,
    TranscriptIndex,
    ground_item,
    names_match,
)

TURNS = [
    ("Sara Khan", "Ahmed, can you review the payment integration PR?", 12.0),
    ("Ahmed Hassan", "Sure, I'll get to it before EOD.", 15.5),
    ("Sara Khan", "We have to rotate the staging API keys before the audit.", 40.0),
    ("Ali Raza", "Agreed, that has to happen. Okay, final call: we're going with Stripe.", 44.0),
]
INDEX = TranscriptIndex(GroundingTurn(speaker=s, text=t, start_time=ts) for s, t, ts in TURNS)


# ── TranscriptIndex.find ──────────────────────────────────────────────────────

def test_verbatim_quote_is_verified_with_speaker_and_timestamp():
    m = INDEX.find("I'll get to it before EOD")
    assert (m.verified, m.speaker, m.start_time) == (True, "Ahmed Hassan", 15.5)


def test_small_wording_drift_is_tolerated_but_paraphrase_is_not():
    # cleanup/ASR drift: punctuation, casing, one dropped word
    assert INDEX.find("we have to rotate the staging API keys before audit").verified
    # a paraphrase that never occurs in the meeting
    assert not INDEX.find("Sara will rotate all production credentials next week").verified


def test_missing_or_trivial_quote_is_unverified():
    assert not INDEX.find(None).verified
    assert not INDEX.find("   ").verified
    assert not INDEX.find("Stripe-ish").verified  # one-word non-exact


def test_quote_spanning_two_turns_is_verified():
    assert INDEX.find("Sure, I'll get to it before EOD. We have to rotate the staging API keys").verified


def test_names_match_first_name_and_case():
    assert names_match("ahmed", "Ahmed Hassan")
    assert not names_match("Ahmed", "Sara Khan")
    assert not names_match(None, "Sara")


# ── ground_item ───────────────────────────────────────────────────────────────

def _commitment(owner: str, quote: str | None, conf: float = 0.9):
    return parse_commitment(ExtractedCommitment(text="review the payment PR", owner_name=owner,
                                                confidence=conf, evidence_quote=quote))


def test_verified_commitment_keeps_confidence_and_gets_provenance():
    c = ground_item(_commitment("Ahmed Hassan", "Sure, I'll get to it before EOD."), INDEX,
                    owner_field="owner_name", owner_must_be_speaker=True)
    assert c.confidence == 0.9
    assert (c.evidence_verified, c.evidence_speaker, c.evidence_start_time) == (True, "Ahmed Hassan", 15.5)


def test_unverified_evidence_lowers_confidence():
    c = ground_item(_commitment("Ahmed Hassan", "I will rewrite the billing service"), INDEX,
                    owner_field="owner_name", owner_must_be_speaker=True)
    assert c.evidence_verified is False
    assert c.confidence == pytest.approx(0.9 * UNVERIFIED_EVIDENCE_PENALTY)


def test_commitment_quoting_someone_else_is_dropped_as_misattributed():
    # Sara's request is not Ahmed's promise — the item falls under the confidence floor.
    c = ground_item(_commitment("Ahmed Hassan", "Ahmed, can you review the payment integration PR?"), INDEX,
                    owner_field="owner_name", owner_must_be_speaker=True)
    assert c.evidence_verified is True
    assert c.confidence == pytest.approx(0.9 * MISATTRIBUTED_OWNER_PENALTY) == 0.0


def _action(assignee: str | None, quote: str | None = "We have to rotate the staging API keys before the audit."):
    return parse_action_item(ExtractedActionItem(text="Rotate the staging API keys", assignee_name=assignee,
                                                 priority="MEDIUM", confidence=0.8, evidence_quote=quote))


def test_invented_assignee_is_cleared_known_assignees_are_kept():
    participants = ("Sara Khan", "Ahmed Hassan", "Ali Raza", "Dana Lee")
    invented = ground_item(_action("Jordan Smith"), INDEX, owner_field="assignee_name",
                           participant_names=participants, clear_unknown_owner=True)
    assert invented.assignee_name is None
    participant = ground_item(_action("Dana"), INDEX, owner_field="assignee_name",
                              participant_names=participants, clear_unknown_owner=True)
    assert participant.assignee_name == "Dana"  # a listed participant, even if silent
    spoken = ground_item(_action("Ahmed"), INDEX, owner_field="assignee_name",
                         participant_names=(), clear_unknown_owner=True)
    assert spoken.assignee_name == "Ahmed"


# ── Unassigned action items through the contract ──────────────────────────────

@pytest.mark.parametrize("raw", [None, "", "  ", "null", "Unassigned", "unknown"])
def test_action_item_accepts_no_assignee(raw):
    item = parse_action_item(ExtractedActionItem(text="Rotate the staging API keys", assignee_name=raw,
                                                 priority="MEDIUM", confidence=0.7))
    assert item.assignee_name is None
    assert item.dedup_key.startswith("unassigned::")


def test_deduplicator_handles_unassigned_items():
    commitment = parse_commitment(ExtractedCommitment(text="rotate the staging API keys", owner_name="Ali Raza",
                                                      confidence=0.9))
    covered = _action(None)
    unrelated = parse_action_item(ExtractedActionItem(text="Update the onboarding docs", assignee_name=None,
                                                      priority="LOW", confidence=0.7))
    # "I'll"-style text with no owner must stay an action item (a commitment needs an owner)
    no_owner_promise = parse_action_item(ExtractedActionItem(text="I'll check the logs", assignee_name=None,
                                                             priority="LOW", confidence=0.7))
    comms, actions = deduplicate_commitments_and_action_items([commitment], [covered, unrelated, no_owner_promise])
    assert [c.text for c in comms] == ["rotate the staging API keys"]
    assert [a.text for a in actions] == ["Update the onboarding docs", "I'll check the logs"]


def test_unaccepted_request_does_not_become_a_commitment_and_its_action_item_survives():
    idx = TranscriptIndex([GroundingTurn("Lena Weber", "Tom, please send the cloud invoice breakdown to finance by Friday.", 30.0)])
    commitment = ground_item(
        parse_commitment(ExtractedCommitment(text="send the cloud invoice breakdown to finance", owner_name="Tom Becker",
                                             confidence=0.9, evidence_quote="Tom, please send the cloud invoice breakdown to finance by Friday.")),
        idx, owner_field="owner_name", owner_must_be_speaker=True)
    action = ground_item(
        parse_action_item(ExtractedActionItem(text="Send the cloud invoice breakdown to finance", assignee_name="Tom Becker",
                                              priority="MEDIUM", confidence=0.9,
                                              evidence_quote="Tom, please send the cloud invoice breakdown to finance by Friday.")),
        idx, owner_field="assignee_name", participant_names=("Tom Becker", "Lena Weber"), clear_unknown_owner=True)
    assert commitment.confidence == 0.0
    assert action.confidence == 0.9 and action.assignee_name == "Tom Becker"


# ── Extractor integration ─────────────────────────────────────────────────────

class _Client:
    provider = "openai"

    def __init__(self, responses: dict[TaskType, Any]):
        self.responses = responses

    def _result(self, task_type, data):
        return AICallResult(
            data=data,
            cost=CostRecord(input_tokens=10, output_tokens=5, model_tier=ModelTier.MINI,
                            model_name="m", estimated_cost_usd=0.0),
            latency_ms=1.0, retry_count=0, task_type=task_type, model_name="m", provider_used="openai",
        )

    async def generate_structured(self, task_type, system_prompt, user_prompt, response_schema):
        default = {TaskType.EXTRACT_BLOCKERS: BlockersResponse(), TaskType.EXTRACT_RISKS: RisksResponse()}
        return self._result(task_type, self.responses.get(task_type) or default.get(task_type) or response_schema())

    async def generate_text(self, task_type, system_prompt, user_prompt):
        return self._result(task_type, '```json\n{"overview": "The team agreed to go with Stripe."}\n```')

    async def embed(self, texts):  # pragma: no cover
        raise NotImplementedError


def _request() -> ExtractRequest:
    return ExtractRequest(
        meeting_id="m1", team_id="t1",
        meeting_date=datetime(2026, 6, 9, 14, 0, tzinfo=timezone.utc),
        meeting_title="Payments sync", meeting_duration_seconds=900, team_timezone="UTC",
        participants=[ParticipantInfo(name=n, email=None, user_id=None, speaker_tag=n) for n in
                      ("Sara Khan", "Ahmed Hassan", "Ali Raza")],
        cleaned_transcript=[
            CleanedTranscriptTurn(turn_id=f"t{i}", speaker_name=s, start_time=ts, end_time=ts + 3,
                                  cleaned_text=t, original_text=t)
            for i, (s, t, ts) in enumerate(TURNS)
        ],
    )


@pytest.fixture
def no_gate(test_settings, monkeypatch):
    settings = test_settings.model_copy(update={"confidence_gate_enabled": False})
    monkeypatch.setattr(extractor, "get_settings", lambda: settings)


async def test_extract_grounds_items_drops_fabrications_and_keeps_unassigned(no_gate):
    client = _Client({
        TaskType.EXTRACT_COMMITMENTS: CommitmentsResponse(commitments=[
            ExtractedCommitment(text="review the payment integration PR", owner_name="Ahmed Hassan",
                                due_date_raw="before EOD", confidence=0.93,
                                evidence_quote="Sure, I'll get to it before EOD."),
            # fabricated: never said; weak confidence → below the floor once penalised
            ExtractedCommitment(text="migrate the database", owner_name="Ali Raza", confidence=0.45,
                                evidence_quote="I'll migrate the database this weekend"),
        ]),
        TaskType.EXTRACT_ACTION_ITEMS: ActionItemsResponse(action_items=[
            ExtractedActionItem(text="Rotate the staging API keys before the audit", assignee_name=None,
                                priority="MEDIUM", confidence=0.72,
                                evidence_quote="We have to rotate the staging API keys before the audit."),
        ]),
        TaskType.EXTRACT_DECISIONS: DecisionsResponse(decisions=[
            ExtractedDecision(text="Use Stripe for payments", made_by="Ali Raza", confidence=0.9,
                              evidence_quote="Okay, final call: we're going with Stripe."),
        ]),
    })

    result = await extractor.extract(_request(), client)

    assert isinstance(result, ExtractionResultWithMeta)
    assert [c.text for c in result.commitments] == ["review the payment integration PR"]
    assert result.commitments[0].evidence_start_time == 15.5
    assert [(a.text, a.assignee_name) for a in result.action_items] == [
        ("Rotate the staging API keys before the audit", None)
    ]
    assert result.decisions[0].evidence_verified is True
    assert result.decisions[0].evidence_speaker == "Ali Raza"
    # summary arrived fenced — parsed, not dumped into the overview as raw text
    assert result.summary.overview == "The team agreed to go with Stripe."


# ── StructuredSummary.from_raw ────────────────────────────────────────────────

def test_summary_parses_fenced_and_wrapped_json():
    assert StructuredSummary.from_raw('```json\n{"overview": "A"}\n```').overview == "A"
    assert StructuredSummary.from_raw('Here is the summary:\n{"overview": "B"}').overview == "B"


def test_malformed_summary_json_is_not_shown_as_prose():
    assert StructuredSummary.from_raw('{"overview": "cut off mid-').overview == ""


def test_plain_prose_summary_still_becomes_the_overview():
    assert StructuredSummary.from_raw("The team synced on the release.").overview == "The team synced on the release."
