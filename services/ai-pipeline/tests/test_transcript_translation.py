"""Transcript translation mode of POST /translate: dedicated prompt, read-only context, auto source."""

from __future__ import annotations

import json

import pytest

from src.models.common import TaskType
from src.models.translate_models import (
    TranslatedItem,
    TranslateItem,
    TranslateRequest,
    TranslationBatchResponse,
)
from src.services.translation import translate

from tests.test_extractor_v2 import FakeClient


class RecordingClient(FakeClient):
    def __init__(self):
        super().__init__("openai")
        self.system_prompts: list[str] = []
        self.user_prompts: list[str] = []

    async def generate_structured(self, task_type, system_prompt, user_prompt, response_schema):
        assert task_type == TaskType.TRANSLATE
        self.system_prompts.append(system_prompt)
        self.user_prompts.append(user_prompt)
        payload = json.loads(user_prompt.split("ITEMS (", 1)[1].split("):\n", 1)[1].rsplit("\n\nTranslate", 1)[0])
        out = [TranslatedItem(key=p["key"], text=f"EN:{p['text']}") for p in payload]
        return self._result(task_type, TranslationBatchResponse(translations=out))


def _req(**kw) -> TranslateRequest:
    base = dict(
        meeting_id="m1",
        team_id="t1",
        source_language="auto",
        target_language="en",
        content_type="transcript",
        context="Meeting title: Sprint sync\nEvery item below was spoken by: Ahmed",
        items=[TranslateItem(key="seg-1", text="ہمیں کل تک API integration complete کرنی ہے۔")],
    )
    base.update(kw)
    return TranslateRequest(**base)


async def test_transcript_mode_uses_the_transcript_prompt():
    client = RecordingClient()
    await translate(_req(), client)
    sp = client.system_prompts[0]
    assert "MEETING TRANSCRIPT" in sp and "BACKGROUND" in sp
    assert "TRANSLATION IS NOT SUMMARIZATION" in sp


async def test_summary_mode_is_unchanged_and_default():
    client = RecordingClient()
    req = _req(content_type="summary", context=None)
    assert TranslateRequest(
        meeting_id="m", team_id="t", source_language="ur", target_language="en",
        items=[TranslateItem(key="a", text="x")],
    ).content_type == "summary"
    await translate(req, client)
    assert "MEETING TRANSCRIPT" not in client.system_prompts[0]


async def test_context_is_background_only_and_never_an_item():
    client = RecordingClient()
    res = await translate(_req(), client)
    up = client.user_prompts[0]
    assert up.startswith("BACKGROUND (read-only, never translate or output):")
    assert "Sprint sync" in up
    # only the real segment comes back; the background never becomes an output item
    assert [i.key for i in res.items] == ["seg-1"]
    assert "auto-detect per item" in up


async def test_no_context_means_no_background_block():
    client = RecordingClient()
    await translate(_req(context=None), client)
    assert "BACKGROUND" not in client.user_prompts[0]


def test_context_length_is_bounded():
    with pytest.raises(ValueError):
        _req(context="x" * 6001)


def test_unknown_content_type_rejected():
    with pytest.raises(ValueError):
        _req(content_type="podcast")
