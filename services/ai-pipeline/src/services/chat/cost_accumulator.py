"""
services/chat/cost_accumulator.py
─────────────────────────────────
Request-scoped cost ledger across EVERY stage (rewrite, intent, query embedding,
re-rank, generation, hydration is free). It is the single source for the quota
commit, the `usage` event and the Postgres ledger rows — so "cost recorded ==
sum of provider-reported usage" holds by construction (plan §1.3).

Cancelled streams never receive provider usage metadata, so the generation entry is
then an ESTIMATE (`estimated=True`) corrected by the nightly reconciliation.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Optional

from src.config.model_routing import compute_cost
from src.models.common import CostRecord, ModelTier


@dataclass(frozen=True)
class StageCost:
    stage: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    estimated: bool = False


@dataclass
class CostAccumulator:
    entries: list[StageCost] = field(default_factory=list)

    def add(self, stage: str, *, provider: str, model: str, input_tokens: int, output_tokens: int,
            cost_usd: float, estimated: bool = False) -> StageCost:
        entry = StageCost(stage, provider, model, max(0, int(input_tokens)), max(0, int(output_tokens)),
                          max(0.0, float(cost_usd)), estimated)
        self.entries.append(entry)
        return entry

    def add_record(self, stage: str, record: Optional[CostRecord], *, provider: str = "openai",
                   estimated: bool = False) -> None:
        if record is None:
            return
        self.add(stage, provider=provider, model=record.model_name, input_tokens=record.input_tokens,
                 output_tokens=record.output_tokens, cost_usd=record.estimated_cost_usd, estimated=estimated)

    def add_usage(self, stage: str, *, model: str, tier: ModelTier, input_tokens: int, output_tokens: int,
                  provider: str = "openai", estimated: bool = False) -> StageCost:
        return self.add(stage, provider=provider, model=model, input_tokens=input_tokens,
                        output_tokens=output_tokens, cost_usd=compute_cost(input_tokens, output_tokens, tier),
                        estimated=estimated)

    @property
    def total_cost_usd(self) -> float:
        return round(sum(e.cost_usd for e in self.entries), 8)

    @property
    def input_tokens(self) -> int:
        return sum(e.input_tokens for e in self.entries)

    @property
    def output_tokens(self) -> int:
        return sum(e.output_tokens for e in self.entries)

    @property
    def any_estimated(self) -> bool:
        return any(e.estimated for e in self.entries)

    def generation_tokens(self) -> tuple[int, int]:
        """(input, output) of the answer model only — what the `usage` event reports to the user."""
        gen = [e for e in self.entries if e.stage == "generate"]
        return sum(e.input_tokens for e in gen), sum(e.output_tokens for e in gen)

    def by_stage(self) -> dict[str, float]:
        out: dict[str, float] = {}
        for e in self.entries:
            out[e.stage] = round(out.get(e.stage, 0.0) + e.cost_usd, 8)
        return out

    def rows(self) -> list[dict[str, object]]:
        return [asdict(e) for e in self.entries]
