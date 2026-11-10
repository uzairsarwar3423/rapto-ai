"""
models/translate_models.py
──────────────────────────
Request / response contracts for POST /api/v1/translate.

The API flattens every translatable string of a meeting (summary fields, action
item and commitment text) into a keyed list. The pipeline translates the values
only — the keys, and therefore the structure, ownership and metadata that live in
the API database, are never touched by the model.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from src.models.common import CostRecord


class TranslateItem(BaseModel):
    key: str = Field(min_length=1, max_length=200)
    text: str = Field(max_length=8000)


class TranslateRequest(BaseModel):
    meeting_id: str
    team_id: str
    # "auto" = unknown / mixed-language source (transcripts): the model detects per item.
    source_language: str = Field(min_length=2, max_length=16)
    target_language: str = Field(min_length=2, max_length=16)
    # "summary": generated content (default, unchanged). "transcript": spoken turns.
    content_type: Literal["summary", "transcript"] = "summary"
    # Read-only background (title, summary, speaker) used to disambiguate terminology.
    # Never translated and never returned.
    context: Optional[str] = Field(default=None, max_length=6000)
    items: List[TranslateItem] = Field(min_length=1, max_length=400)

    @field_validator("items")
    @classmethod
    def unique_keys(cls, v: List[TranslateItem]) -> List[TranslateItem]:
        keys = [i.key for i in v]
        if len(keys) != len(set(keys)):
            raise ValueError("translate items must have unique keys")
        return v


class TranslateResult(BaseModel):
    meeting_id: str
    source_language: str
    target_language: str
    items: List[TranslateItem]
    # Keys the model failed to return even after the corrective pass; the caller
    # keeps the original text for these (never blank).
    missing_keys: List[str] = Field(default_factory=list)
    model: str
    total_cost: CostRecord
    processing_time_ms: float


class TranslateResponse(BaseModel):
    success: bool
    request_id: str
    result: TranslateResult


# ── Structured-output schema handed to the model ────────────────────────────


class TranslatedItem(BaseModel):
    key: str
    text: str


class TranslationBatchResponse(BaseModel):
    translations: List[TranslatedItem] = Field(default_factory=list)
