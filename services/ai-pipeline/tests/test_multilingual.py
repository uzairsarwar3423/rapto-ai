"""Multilingual support: language detection, language-aware prompts, on-demand translation."""

from __future__ import annotations

from typing import Any

import pytest

from src.models.cleanup_models import CleanedTranscriptTurn, ParticipantInfo
from src.models.common import TaskType
from src.models.extraction_models import MeetingType
from src.models.translate_models import (
    TranslatedItem,
    TranslateItem,
    TranslateRequest,
    TranslationBatchResponse,
)
from src.services.extraction import extractor
from src.services.extraction.commitment_parser import normalize_text
from src.services.extraction.prompt_router import PromptRouter, system_prompt
from src.services.language import detect_language, language_directive
from src.services.translation import translate
from src.services.translation import translator as translator_mod

from tests.test_extractor_v2 import FakeClient, _request

URDU = "ہم نے طے کیا کہ اگلے ہفتے تک ڈیپلائمنٹ مکمل ہو جائے گا۔ میں رپورٹ بھیج دوں گا اور احمد ٹیسٹنگ دیکھے گا۔"
HINDI = "हमने तय किया कि अगले हफ्ते तक डिप्लॉयमेंट पूरा हो जाएगा। मैं रिपोर्ट भेज दूँगा और अहमद टेस्टिंग देखेगा।"
ENGLISH = "We agreed the deployment will be finished by next week. I will send the report and Ahmed will handle testing."
URDU_MIXED = "ہم sprint planning کے بعد API کی deployment شروع کریں گے اور QA کل تک میں مکمل کر دوں گا"
HINDI_MIXED = "हम sprint planning के बाद API की deployment शुरू करेंगे और QA कल तक मैं पूरा कर दूँगा"
ROMAN_URDU = "kal tak hum deployment kar denge aur main report bhej dunga phir QA nahi hoga yeh sab theek hai"
TECH_ENGLISH = "The Kubernetes ingress needs a TLS cert rotation before the Postgres failover drill on Thursday."


# ── 1-5, 8: detection ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "text,code",
    [
        (ENGLISH, "en"),
        (URDU, "ur"),
        (HINDI, "hi"),
        (URDU_MIXED, "ur"),
        (HINDI_MIXED, "hi"),
        (TECH_ENGLISH, "en"),
        (ROMAN_URDU, "ur"),
    ],
)
def test_detects_dominant_language(text, code):
    assert detect_language(text).code == code


def test_roman_urdu_is_flagged_romanized_and_not_english_or_hindi():
    d = detect_language(ROMAN_URDU)
    assert d.code == "ur" and d.romanized and d.script == "latin"
    assert "not in Latin letters" in language_directive(d)


def test_english_dominant_mixed_stays_english():
    text = "We reviewed the roadmap and the payments API and agreed on the rollout plan, کل ملتے ہیں"
    assert detect_language(text).code == "en"


def test_short_or_empty_transcripts_fall_back_to_english():
    assert detect_language("").code == "en"
    assert detect_language("ٹھیک ہے").code == "en"      # < min words → default, not a guess
    assert detect_language("12345 ... !!!").code == "en"


def test_urdu_script_never_detected_as_hindi_and_vice_versa():
    assert detect_language(URDU).script == "arabic"
    assert detect_language(HINDI).script == "devanagari"


# ── Prompt wiring ────────────────────────────────────────────────────────────


def test_directive_names_language_and_script():
    ur = language_directive(detect_language(URDU))
    hi = language_directive(detect_language(HINDI))
    en = language_directive(detect_language(ENGLISH))
    assert "Urdu" in ur and "Do NOT translate into English" in ur
    assert "Devanagari" in hi
    assert en.startswith("OUTPUT LANGUAGE: English")


def test_user_prompt_contains_directive_before_transcript():
    prompt = PromptRouter().render_user_prompt(
        _request(), "x", 0, 1, MeetingType.GENERAL, language=detect_language(URDU)
    )
    assert prompt.index("OUTPUT LANGUAGE: Urdu") < prompt.index("--- TRANSCRIPT START ---")


@pytest.mark.parametrize("mt", [MeetingType.GENERAL, MeetingType.STANDUP, MeetingType.RETROSPECTIVE])
def test_every_template_renders_language_directive(mt):
    prompt = PromptRouter().render_user_prompt(_request(), "x", 0, 1, mt, language=detect_language(HINDI))
    assert "OUTPUT LANGUAGE: Hindi" in prompt


def test_default_prompt_is_english_directive_for_backward_compat():
    prompt = PromptRouter().render_user_prompt(_request(), "x", 0, 1, MeetingType.GENERAL)
    assert "OUTPUT LANGUAGE: English" in prompt


@pytest.mark.parametrize(
    "task",
    [TaskType.SUMMARY, TaskType.EXTRACT_COMMITMENTS, TaskType.EXTRACT_ACTION_ITEMS,
     TaskType.EXTRACT_DECISIONS, TaskType.EXTRACT_BLOCKERS, TaskType.EXTRACT_RISKS],
)
def test_system_prompts_carry_multilingual_rules_and_json_contract(task):
    text = system_prompt(task)
    assert "MULTILINGUAL RULES" in text and "Devanagari" in text
    assert "Person names" in text            # names verbatim → owner matching keeps working


def test_dedup_normalizer_keeps_devanagari_and_urdu_marks():
    # Without the combining-mark fix both strings collapsed to near-identical stubs.
    a, b = normalize_text("रिपोर्ट भेजना"), normalize_text("रिपोर्ट बनाना")
    assert a != b and "ि" in a
    assert "ڈیپلائمنٹ" in normalize_text("ڈیپلائمنٹ مکمل")


# ── End to end through extract(): language reaches every extractor + result ──


def _urdu_request():
    return _request(
        cleaned_transcript=[
            CleanedTranscriptTurn(turn_id="t1", speaker_name="Alice", start_time=0.0, end_time=3.0,
                                  cleaned_text=URDU, original_text=URDU)
        ]
    )


async def test_extract_urdu_meeting_instructs_urdu_and_reports_language(test_settings, monkeypatch):
    monkeypatch.setattr(extractor, "get_settings", lambda: test_settings.model_copy(update={"confidence_gate_enabled": False}))
    client = FakeClient("openai")
    result = await extractor.extract(_urdu_request(), client)
    assert result.detected_language == "ur"
    assert client.calls and all("OUTPUT LANGUAGE: Urdu" in c["user_prompt"] for c in client.calls)
    assert all("MULTILINGUAL RULES" in c["system_prompt"] for c in client.calls if c["task_type"] != TaskType.SUMMARY or "system_prompt" in c)


async def test_extract_english_meeting_unchanged(test_settings, monkeypatch):
    monkeypatch.setattr(extractor, "get_settings", lambda: test_settings.model_copy(update={"confidence_gate_enabled": False}))
    client = FakeClient("openai")
    result = await extractor.extract(_request(), client)       # default fixture transcript is English
    assert result.detected_language == "en"
    assert all("OUTPUT LANGUAGE: English" in c["user_prompt"] for c in client.calls)


# ── Translation ──────────────────────────────────────────────────────────────


class TranslatingClient(FakeClient):
    """Echoes '<EN>' + original for every requested key, optionally dropping/failing."""

    def __init__(self, drop: set[str] | None = None, fail_first: int = 0, always_fail: bool = False):
        super().__init__("openai")
        self.drop = drop or set()
        self.fail_first = fail_first
        self.always_fail = always_fail
        self.batches: list[list[str]] = []

    async def generate_structured(self, task_type, system_prompt, user_prompt, response_schema):
        import json, re

        assert task_type == TaskType.TRANSLATE
        assert "TRANSLATION IS NOT SUMMARIZATION" in system_prompt
        if self.always_fail or self.fail_first > 0:
            self.fail_first -= 1
            raise RuntimeError("boom")
        payload = json.loads(user_prompt.split("ITEMS (", 1)[1].split("):\n", 1)[1].rsplit("\n\nTranslate", 1)[0])
        self.batches.append([p["key"] for p in payload])
        # first call drops keys in self.drop; the corrective pass returns them
        out = [TranslatedItem(key=p["key"], text=f"EN:{p['text']}") for p in payload
               if not (p["key"] in self.drop and len(self.batches) == 1)]
        return self._result(task_type, TranslationBatchResponse(translations=out))


def _treq(n: int = 3, text: str = "متن") -> TranslateRequest:
    return TranslateRequest(
        meeting_id="m1", team_id="t1", source_language="ur", target_language="en",
        items=[TranslateItem(key=f"k{i}", text=f"{text}{i}") for i in range(n)],
    )


async def test_translate_preserves_keys_and_order():
    res = await translate(_treq(3), TranslatingClient())
    assert [i.key for i in res.items] == ["k0", "k1", "k2"]
    assert res.items[0].text == "EN:متن0" and res.missing_keys == []


async def test_translate_empty_strings_not_sent_to_model():
    req = TranslateRequest(meeting_id="m", team_id="t", source_language="ur", target_language="en",
                           items=[TranslateItem(key="a", text=""), TranslateItem(key="b", text="شکریہ")])
    client = TranslatingClient()
    res = await translate(req, client)
    assert client.batches == [["b"]]
    assert {i.key: i.text for i in res.items}["a"] == ""


async def test_dropped_keys_are_retried_once():
    client = TranslatingClient(drop={"k1"})
    res = await translate(_treq(3), client)
    assert res.missing_keys == [] and len(client.batches) == 2 and client.batches[1] == ["k1"]


async def test_batch_failure_recovers_via_corrective_pass():
    res = await translate(_treq(2), TranslatingClient(fail_first=1))
    assert res.missing_keys == [] and len(res.items) == 2


async def test_total_failure_raises_instead_of_returning_empty_translation():
    with pytest.raises(RuntimeError):
        await translate(_treq(2), TranslatingClient(always_fail=True))


async def test_large_payload_is_batched(monkeypatch):
    monkeypatch.setattr(translator_mod, "BATCH_CHAR_BUDGET", 200)
    client = TranslatingClient()
    res = await translate(_treq(20, text="x" * 40), client)
    assert len(client.batches) > 1 and len(res.items) == 20


def test_duplicate_keys_rejected():
    with pytest.raises(ValueError):
        TranslateRequest(meeting_id="m", team_id="t", source_language="ur", target_language="en",
                         items=[TranslateItem(key="a", text="x"), TranslateItem(key="a", text="y")])
