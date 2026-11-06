"""Tracing: no-op when disabled, metadata capture, meeting/chunk/fallback grouping."""

from __future__ import annotations

from typing import Any

import pytest

from src.models.common import TaskType
from src.models.extraction_models import DecisionsResponse, ExtractedDecision, ExtractedRisk, RisksResponse
from src.services.extraction import extractor
from src.services.tracing import (
    LangSmithTracer,
    TracedAIClient,
    confidence_summary,
    prompt_version_of,
)
from tests.test_extractor_v2 import FakeClient, _request


class RecordingTracer(LangSmithTracer):
    """Enabled tracer that records runs in memory instead of calling LangSmith."""

    def __init__(self) -> None:
        super().__init__(enabled=False, api_key=None, project="test")
        self.enabled = True
        self.runs: list[dict[str, Any]] = []

    def start_run(self, name, inputs, metadata, parent_run=None, run_type="chain", tags=None):
        run = {"id": f"run-{len(self.runs)}", "name": name, "inputs": inputs, "metadata": dict(metadata),
               "parent": parent_run["id"] if parent_run else None, "run_type": run_type}
        self.runs.append(run)
        return run

    def end_run(self, run, outputs=None, error=None, metadata=None):
        run.update(outputs=outputs, error=error)
        run["metadata"].update(metadata or {})


def test_disabled_tracer_is_noop():
    tracer = LangSmithTracer(enabled=False, api_key="k", project="p")
    assert tracer.start_run("x", {}, {}) is None
    tracer.end_run(None, {})
    tracer.log_feedback("id", "precision", 1.0)


def test_enabled_without_key_disables_itself():
    assert LangSmithTracer(enabled=True, api_key=None, project="p").enabled is False


def test_prompt_version_and_confidence_summary():
    assert prompt_version_of("# prompt_version: decisions-v3.1\nbody") == "decisions-v3.1"
    assert prompt_version_of("no header") == "unversioned"
    data = DecisionsResponse(decisions=[ExtractedDecision(text="a", confidence=0.9),
                                        ExtractedDecision(text="b", confidence=0.5)])
    assert confidence_summary(data) == (2, 0.7)
    assert confidence_summary("text") == (0, None)


async def test_traced_client_records_metadata_without_payloads():
    tracer = RecordingTracer()
    client = TracedAIClient(FakeClient("openai"), tracer)
    await client.generate_structured(TaskType.EXTRACT_DECISIONS, "# prompt_version: decisions-v3.1\n",
                                     "SECRET TRANSCRIPT", DecisionsResponse)
    run = tracer.runs[0]
    assert run["metadata"]["prompt_version"] == "decisions-v3.1"
    assert run["metadata"]["provider_used"] == "openai"
    assert run["metadata"]["input_tokens"] == 100
    assert "SECRET TRANSCRIPT" not in str(run)  # PII guard: no payloads by default


async def test_traced_client_records_errors():
    tracer = RecordingTracer()

    class Failing(FakeClient):
        async def generate_text(self, *a, **k):
            raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        await TracedAIClient(Failing("openai"), tracer).generate_text(TaskType.SUMMARY, "s", "u")
    assert "RuntimeError" in tracer.runs[0]["error"]


async def test_extraction_groups_runs_under_meeting_with_fallback_flag(test_settings, monkeypatch):
    tracer = RecordingTracer()
    monkeypatch.setattr(extractor, "get_tracer", lambda: tracer)
    monkeypatch.setattr(extractor, "get_settings",
                        lambda: test_settings.model_copy(update={"confidence_gate_enabled": True}))
    low = RisksResponse(risks=[ExtractedRisk(text="might slip", confidence=0.3)])
    high = RisksResponse(risks=[ExtractedRisk(text="might slip", confidence=0.9)])
    primary = TracedAIClient(FakeClient("openai", {TaskType.EXTRACT_RISKS: low}), tracer)
    fallback = TracedAIClient(FakeClient("anthropic", {TaskType.EXTRACT_RISKS: high}), tracer)

    await extractor.extract(_request(), primary, fallback_client=fallback)

    meeting = tracer.runs[0]
    assert meeting["name"] == "extract_meeting" and meeting["parent"] is None
    children = tracer.runs[1:]
    assert len(children) == 7  # 5 extractors + summary + 1 fallback
    assert all(c["parent"] == meeting["id"] for c in children)
    assert all(c["metadata"]["chunk_index"] == 0 for c in children)
    flagged = [c for c in children if c["metadata"]["fallback_triggered"]]
    assert [c["metadata"]["provider_used"] for c in flagged] == ["anthropic"]
    assert meeting["metadata"]["fallback_chunks"] == 1
