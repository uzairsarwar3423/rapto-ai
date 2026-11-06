"""
services/ai_client_protocol.py
──────────────────────────────
Structural interface shared by every AI client in the pipeline.

OpenAIClient, LiteLLMClient and TracedAIClient all satisfy this Protocol, so
callers (extractor, cleanup, resolution, date parser) can be handed any of
them without code changes. It is a typing.Protocol — no inheritance needed.
"""

from __future__ import annotations

from typing import Protocol, TypeVar, runtime_checkable

from pydantic import BaseModel

from src.models.common import AICallResult, TaskType

T = TypeVar("T", bound=BaseModel)


@runtime_checkable
class AIClientProtocol(Protocol):
    async def generate_structured(
        self,
        task_type: TaskType,
        system_prompt: str,
        user_prompt: str,
        response_schema: type[T],
    ) -> AICallResult[T]: ...

    async def generate_text(
        self,
        task_type: TaskType,
        system_prompt: str,
        user_prompt: str,
    ) -> AICallResult[str]: ...

    async def embed(self, texts: list[str]) -> AICallResult[list[list[float]]]: ...
