"""Extractor v2: prompt routing, confidence-gated Claude fallback, result metadata."""

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
    ExtractedCommitment,
    ExtractedDecision,
    ExtractedRisk,
    ExtractionResultWithMeta,
    ExtractRequest,
    MeetingType,
    RisksResponse,
)
from src.services.extraction import extractor

_EMPTY = {
    TaskType.EXTRACT_COMMITMENTS: lambda: CommitmentsResponse(),
    TaskType.EXTRACT_ACTION_ITEMS: lambda: ActionItemsResponse(),
    TaskType.EXTRACT_DECISIONS: lambda: DecisionsResponse(),
    TaskType.EXTRACT_BLOCKERS: lambda: BlockersResponse(),
    TaskType.EXTRACT_RISKS: lambda: RisksResponse(),
}


class FakeClient:
    """Implements AIClientProtocol with scripted responses per task."""

    def __init__(self, provider: str, responses: dict[TaskType, Any] | None = None) -> None:
        self.provider = provider
        self.responses = responses or {}
        self.calls: list[dict[str, Any]] = []

    def _result(self, task_type: TaskType, data: Any) -> AICallResult[Any]:
        return AICallResult(
            data=data,
            cost=CostRecord(input_tokens=100, output_tokens=20, model_tier=ModelTier.MINI,
                            model_name=f"{self.provider}-model", estimated_cost_usd=0.001),
            latency_ms=1.0, retry_count=0, task_type=task_type,
            model_name=f"{self.provider}-model", provider_used=self.provider,
        )

    async def generate_structured(self, task_type, system_prompt, user_prompt, response_schema):
        self.calls.append({"task_type": task_type, "user_prompt": user_prompt, "system_prompt": system_prompt})
        scripted = self.responses.get(task_type)
        if isinstance(scripted, Exception):
            raise scripted
        return self._result(task_type, scripted if scripted is not None else _EMPTY[task_type]())

    async def generate_text(self, task_type, system_prompt, user_prompt):
        self.calls.append({"task_type": task_type, "user_prompt": user_prompt})
        return self._result(task_type, '{"overview": "Team synced on the release."}')

    async def embed(self, texts):  # pragma: no cover — unused
        raise NotImplementedError

    def tasks(self) -> list[TaskType]:
        return [c["task_type"] for c in self.calls]


@pytest.fixture
def gate_settings(test_settings, monkeypatch):
    settings = test_settings.model_copy(update={"confidence_gate_enabled": True})
    monkeypatch.setattr(extractor, "get_settings", lambda: settings)
    return settings


def _request(title: str = "Weekly Sync", **overrides: Any) -> ExtractRequest:
    data = dict(
        meeting_id="m1", team_id="t1",
        meeting_date=datetime(2026, 6, 9, 14, 0, tzinfo=timezone.utc),
        meeting_title=title, meeting_duration_seconds=900, team_timezone="UTC",
        participants=[ParticipantInfo(name="Alice", email="a@x.io", user_id="u1", speaker_tag="S1")],
        cleaned_transcript=[
            CleanedTranscriptTurn(turn_id="t1", speaker_name="Alice", start_time=0.0, end_time=3.0,
                                  cleaned_text="I think the deadline might slip.",
                                  original_text="I think the deadline might slip."),
        ],
    )
    data.update(overrides)
    return ExtractRequest(**data)


LOW_RISK = RisksResponse(risks=[ExtractedRisk(text="deadline might slip", confidence=0.40)])
HIGH_RISK = RisksResponse(risks=[ExtractedRisk(text="deadline might slip", confidence=0.88, probability="HIGH")])


async def test_low_confidence_extractor_is_rerun_on_fallback_only(gate_settings):
    primary = FakeClient("openai", {TaskType.EXTRACT_RISKS: LOW_RISK})
    fallback = FakeClient("anthropic", {TaskType.EXTRACT_RISKS: HIGH_RISK})

    result = await extractor.extract(_request(), primary, fallback_client=fallback)

    assert isinstance(result, ExtractionResultWithMeta)
    assert fallback.tasks() == [TaskType.EXTRACT_RISKS]          # one extra call, not five
    assert [r.confidence for r in result.risks] == [0.88]
    assert result.risks[0].probability.value == "HIGH"
    assert result.fallback_chunks == 1
    assert result.providers_used == ["anthropic", "openai"]
    # fallback used the SAME rendered user prompt as the primary
    primary_risk_prompt = next(c["user_prompt"] for c in primary.calls if c["task_type"] == TaskType.EXTRACT_RISKS)
    assert fallback.calls[0]["user_prompt"] == primary_risk_prompt
    # cost includes the fallback call
    assert result.total_cost.estimated_cost_usd == pytest.approx(0.001 * 7)


async def test_no_fallback_client_means_primary_only(gate_settings):
    primary = FakeClient("openai", {TaskType.EXTRACT_RISKS: LOW_RISK})
    result = await extractor.extract(_request(), primary)
    assert [r.confidence for r in result.risks] == [0.40]
    assert result.fallback_chunks == 0 and result.providers_used == ["openai"]


async def test_gate_disabled_by_setting(test_settings, monkeypatch):
    settings = test_settings.model_copy(update={"confidence_gate_enabled": False})
    monkeypatch.setattr(extractor, "get_settings", lambda: settings)
    primary = FakeClient("openai", {TaskType.EXTRACT_RISKS: LOW_RISK})
    fallback = FakeClient("anthropic", {TaskType.EXTRACT_RISKS: HIGH_RISK})
    await extractor.extract(_request(), primary, fallback_client=fallback)
    assert fallback.calls == []


async def test_confident_chunk_never_calls_fallback(gate_settings):
    primary = FakeClient("openai", {
        TaskType.EXTRACT_DECISIONS: DecisionsResponse(decisions=[ExtractedDecision(text="ship friday", confidence=0.95)]),
    })
    fallback = FakeClient("anthropic")
    result = await extractor.extract(_request(), primary, fallback_client=fallback)
    assert fallback.calls == [] and result.fallback_chunks == 0


async def test_fallback_failure_keeps_primary_result(gate_settings):
    primary = FakeClient("openai", {TaskType.EXTRACT_RISKS: LOW_RISK})

    class Exploding(FakeClient):
        async def generate_structured(self, *args, **kwargs):
            raise RuntimeError("anthropic down")

    result = await extractor.extract(_request(), primary, fallback_client=Exploding("anthropic"))
    assert isinstance(result, ExtractionResultWithMeta)
    assert [r.confidence for r in result.risks] == [0.40]


async def test_failed_primary_extractor_recovered_by_fallback(gate_settings):
    commitments = CommitmentsResponse(commitments=[ExtractedCommitment(text="send the report", owner_name="Alice", confidence=0.9)])
    primary = FakeClient("openai", {TaskType.EXTRACT_COMMITMENTS: TimeoutError("primary timeout")})
    fallback = FakeClient("anthropic", {TaskType.EXTRACT_COMMITMENTS: commitments})
    result = await extractor.extract(_request(), primary, fallback_client=fallback)
    assert fallback.tasks() == [TaskType.EXTRACT_COMMITMENTS]
    assert [c.text for c in result.commitments] == ["send the report"]


async def test_meeting_type_inferred_and_routed(gate_settings):
    primary = FakeClient("openai")
    result = await extractor.extract(_request(title="Daily Standup"), primary)
    assert result.meeting_type == MeetingType.STANDUP
    prompts = {c["user_prompt"] for c in primary.calls}
    assert len(prompts) == 1  # every extractor + summary get the same user turn
    assert "STANDUP EXTRACTION GUIDE" in prompts.pop()


async def test_explicit_meeting_type_and_team_context_reach_prompt(gate_settings):
    primary = FakeClient("openai")
    await extractor.extract(
        _request(title="Daily Standup", meeting_type="retrospective", team_context="Mobile squad"),
        primary,
    )
    prompt = primary.calls[0]["user_prompt"]
    assert "RETROSPECTIVE EXTRACTION GUIDE" in prompt and "Mobile squad" in prompt


async def test_result_carries_prompt_versions(gate_settings):
    result = await extractor.extract(_request(), FakeClient("openai"))
    assert result.prompt_version.startswith("extraction-v4.2+")
    assert result.prompt_versions["extract_decisions"] == "decisions-v3.1"
