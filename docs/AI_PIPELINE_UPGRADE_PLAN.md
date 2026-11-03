# AI Pipeline — Upgrade Implementation Plan

> **Scope**: `services/ai-pipeline` + `services/api` integration
> **Author role**: Senior AI Engineer + Senior Prompt Engineer + Backend Engineer
> **Created**: 2026-09-27

---

## Table of Contents

1. [Architecture: Before vs. After](#1-architecture-before-vs-after)
2. [Complete File Map](#2-complete-file-map)
3. [Phase 1 — Prompt Overhaul (Day 1–3)](#3-phase-1--prompt-overhaul-day-13)
4. [Phase 2 — LiteLLM + Claude Fallback (Day 4–7)](#4-phase-2--litellm--claude-fallback-day-47)
5. [Phase 3 — LangSmith Tracing (Day 8–9)](#5-phase-3--langsmith-tracing-day-89)
6. [Phase 4 — deepeval + Eval Framework (Day 10–14)](#6-phase-4--deepeval--eval-framework-day-1014)
7. [Phase 5 — Schema Enrichments (Day 15–16)](#7-phase-5--schema-enrichments-day-1516)
8. [Phase 6 — Dependencies & Tooling (Day 17)](#8-phase-6--dependencies--tooling-day-17)
9. [End-to-End Integration Flow](#9-end-to-end-integration-flow)
10. [Eval CI/CD Gate](#10-eval-cicd-gate)
11. [Execution Timeline](#11-execution-timeline)
12. [Risk Register](#12-risk-register)

---

## 1. Architecture: Before vs. After

### Before (Current State)

```
extraction_user.txt (12 lines, generic)
    ↓
extractor.py
    ↓
OpenAI only (gpt-4.1-mini, no fallback)
    ↓
eval/run_extraction_eval.py (commitments only, no per-prompt metrics)
    ↓
No tracing, no quality gates
```

### After (Target State)

```
extraction_user.txt v2 (meeting_type, team_context, speaker_match, continuation)
    ↓
prompt_router.py  →  selects correct template by meeting type
    ↓
extractor.py v2
    ↓
litellm_client.py  →  OpenAI primary (gpt-4.1-mini)
                   →  Claude 3.5 Sonnet fallback (confidence < 0.60)
    ↓
confidence_gate.py  →  merges primary + fallback results
    ↓
langsmith_tracer.py  →  per-prompt, per-model, per-version dashboards
    ↓
deepeval + ragas  →  all 6 extractors, precision/recall/F1
    ↓
ci_gate.py  →  blocks prompt bumps on F1 regression > 3%
```

---

## 2. Complete File Map

```
services/ai-pipeline/
├── src/
│   ├── config/
│   │   ├── settings.py                           MODIFY  — add litellm + langsmith + claude settings
│   │   ├── model_routing.py                      MODIFY  — add confidence-gated fallback logic
│   │   ├── extraction_config.py                  MODIFY  — add CONFIDENCE_GATE_THRESHOLD
│   │   └── litellm_config.py                     NEW ⭐  — litellm router config
│   │
│   ├── prompts/
│   │   ├── extraction_user.txt                   MODIFY  — complete overhaul v2
│   │   ├── extraction_user_standup.txt           NEW ⭐  — standup-specific user template
│   │   ├── extraction_user_retrospective.txt     NEW ⭐  — retro-specific user template
│   │   ├── date_parse_system.txt                 MODIFY  — add 5 worked examples
│   │   ├── action_items_system.txt               MODIFY  — v3.1 context-aware priority
│   │   ├── decisions_system.txt                  MODIFY  — v3.1 reversible + dissent fields
│   │   ├── blockers_system.txt                   MODIFY  — v3.1 escalation_flag
│   │   ├── risks_system.txt                      MODIFY  — v3.1 probability + mitigation
│   │   └── commitment_system.txt                 MODIFY  — v3.1 implicit commitment examples
│   │
│   ├── services/
│   │   ├── openai_client.py                      MODIFY  — instructor integration wired in
│   │   ├── litellm_client.py                     NEW ⭐  — litellm-backed AI client (same interface)
│   │   ├── tracing/
│   │   │   ├── __init__.py                       NEW ⭐
│   │   │   ├── langsmith_tracer.py               NEW ⭐  — LangSmith run tracking
│   │   │   └── trace_context.py                  NEW ⭐  — per-request trace context (ContextVar)
│   │   └── extraction/
│   │       ├── extractor.py                      MODIFY  — meeting_type routing + confidence gate
│   │       ├── prompt_router.py                  NEW ⭐  — selects prompt variant by meeting type
│   │       └── confidence_gate.py                NEW ⭐  — triggers Claude fallback on low confidence
│   │
│   ├── models/
│   │   ├── extraction_models.py                  MODIFY  — reversible, probability, escalation fields
│   │   └── eval_models.py                        NEW ⭐  — EvalCase for all 6 extractors
│   │
│   └── eval/
│       ├── run_extraction_eval.py                MODIFY  — extend to all 6 extractors
│       ├── run_all_evals.py                      NEW ⭐  — master eval runner
│       ├── eval_schema.py                        MODIFY  — add EvalExpectedRisk, Decision, Blocker
│       ├── metrics.py                            NEW ⭐  — precision/recall/F1 + calibration
│       ├── matchers.py                           NEW ⭐  — per-extractor match functions
│       ├── fixtures_builder.py                   NEW ⭐  — CLI to generate fixture pairs from live data
│       ├── deepeval_harness.py                   NEW ⭐  — deepeval faithfulness/hallucination
│       ├── ragas_harness.py                      NEW ⭐  — ragas summary quality evaluation
│       ├── ci_gate.py                            NEW ⭐  — blocks prompt bump if F1 regresses > 3%
│       └── golden_dataset/
│           ├── standup_01_expected.json          MODIFY  — extend to all 6 extractors
│           ├── standup_02_expected.json          MODIFY  — extend to all 6 extractors
│           ├── planning_01_cleaned.json          NEW ⭐  — planning meeting fixture
│           ├── planning_01_expected.json         NEW ⭐
│           ├── retrospective_01_cleaned.json     NEW ⭐  — retro meeting fixture
│           └── retrospective_01_expected.json    NEW ⭐
│
├── requirements.txt / pyproject.toml            MODIFY  — add litellm, instructor, langsmith, deepeval, ragas
└── .env.example                                 MODIFY  — add LANGSMITH_API_KEY, ANTHROPIC_API_KEY

services/api/src/
├── services/
│   └── ai-pipeline/
│       └── ai-pipeline.types.ts                 MODIFY  — meeting_type, team_context + new entity fields
└── queues/
    └── workers/
        └── extract.worker.ts                    MODIFY  — pass meeting_type + new DB fields
```

---

## 3. Phase 1 — Prompt Overhaul (Day 1–3)

> **Risk**: Low | **Cost**: Zero | **Impact**: Improves all 6 extractors simultaneously

### 3.1 `extraction_user.txt` → Complete Overhaul (v2)

**File**: `src/prompts/extraction_user.txt`
**Builds**: The primary context injection layer for all 6 parallel extractors.

**New content (replace entire file):**

```
# prompt_version: extraction-user-v2.0
# Temperature: N/A (user prompt, no temperature setting)
# Purpose: Shared user turn for all 6 parallel extractors.
#          Injected with meeting context, participant list, and meeting type.
# Changed from v1: added meeting_type, meeting_weekday, meeting_duration_minutes,
#                  participant_count, is_continuation block, team_context block,
#                  meeting-type-specific hints, speaker matching rule.

MEETING: {{ meeting_title }}
TYPE: {{ meeting_type }}
{# standup | planning | retrospective | design_review | 1on1 | all_hands | general #}
DATE: {{ meeting_date_iso }} ({{ meeting_weekday }})
DURATION: {{ meeting_duration_minutes }} minutes
TEAM TIMEZONE: {{ team_timezone }}

PARTICIPANTS ({{ participant_count }} people):
{{ participants }}
{# Format: "- Full Name (email) [EXTERNAL if not a team member]" #}

{% if team_context -%}
TEAM CONTEXT:
{{ team_context }}
{% endif %}

{% if is_continuation -%}
⚠️  SECTION {{ chunk_number }} OF {{ total_chunks }}: This is a continuation of the meeting.
    Prior sections may contain commitments, decisions, or action items not repeated here.
    Do NOT re-extract items clearly belonging to earlier sections.
{% endif %}

{% if meeting_type == "standup" -%}
📋 STANDUP NOTE: Focus on blockers (high priority), commitments ("I'll do X"),
   and action items assigned today. Formal decisions are rare in standups —
   only extract if clearly decided, not just discussed.
{% elif meeting_type == "retrospective" -%}
📋 RETRO NOTE: Focus on decisions (process changes agreed by the team) and
   action items (improvements to implement next sprint). Blockers here are
   often historical — extract only if discussed as ongoing or currently active.
{% elif meeting_type == "planning" -%}
📋 PLANNING NOTE: Focus on decisions (what we're building this sprint),
   commitments (who owns which work), and risks (feasibility or scope concerns).
{% elif meeting_type == "1on1" -%}
📋 1ON1 NOTE: Focus on commitments (development goals, manager actions) and
   action items. Decisions in 1on1s are often personal/career — extract only
   if they affect the team or project.
{% endif %}

SPEAKER MATCHING RULE:
Transcript speakers may use shortened names (e.g., "Ahmed" = "Ahmed Hassan",
"Sara" = "Sara Khan"). Match by first name unless two participants share a
first name — in that case, use surname or contextual clues to disambiguate.
If still ambiguous, use the name exactly as spoken in the transcript.

--- TRANSCRIPT START ---
{{ transcript_content }}
--- TRANSCRIPT END ---

Apply your specialized extraction task to the transcript above.
```

**Code changes in `extractor.py`** — update Jinja2 render call to inject new variables:

```python
user_prompt = _USER_PROMPT_TPL.render(
    meeting_title=request.meeting_title,
    meeting_type=getattr(request, "meeting_type", "general") or "general",
    meeting_date_iso=request.meeting_date.date().isoformat(),
    meeting_weekday=request.meeting_date.strftime("%A"),
    meeting_duration_minutes=int((request.meeting_duration_seconds or 1800) / 60),
    team_timezone=request.team_timezone,
    participants=_format_participants(request.participants),
    participant_count=len(request.participants),
    team_context=getattr(request, "team_context", None),
    is_continuation=chunk_index > 0,
    chunk_number=chunk_index + 1,
    total_chunks=total_chunks,
    transcript_content=chunk_text,
)
```

---

### 3.2 New: `extraction_user_standup.txt`

**Builds**: Standup-specific extraction template (blocker-first, yesterday/today/blockers format).

Key differences from generic:
- Priority order: **blockers > action items > commitments** (standups are blocker-first)
- Decisions deprioritized — extract only if explicitly and formally decided
- Explicit handling of "yesterday / today / blockers" three-column format
- Lower confidence threshold for blockers (standup blockers are often stated casually)

---

### 3.3 New: `extraction_user_retrospective.txt`

**Builds**: Retrospective-specific extraction template.

Key differences:
- Distinguishes historical blockers ("what slowed us down") from active blockers
- Decisions = process changes agreed by team (high priority in retros)
- Action items = experiments or improvements to try next sprint
- Risks in retros = systemic issues that might recur

---

### 3.4 `date_parse_system.txt` — Add 5 Worked Examples

**Builds**: Eliminates the most common date resolution failures with zero model change.

Add the following section below the existing resolution rules:

```
══════════════════════════════════════════════════════
WORKED EXAMPLES
══════════════════════════════════════════════════════

EXAMPLE 1 — Relative weekday, "next Thursday":
  Expression : "next Thursday"
  Meeting    : 2026-06-09 (Tuesday)
  Timezone   : America/New_York
  → resolved_date: "2026-06-18"    confidence: 0.95    is_ambiguous: false
  REASON: "next Thursday" = Thursday of NEXT week, not the coming Thursday (June 11).

EXAMPLE 2 — Same-week, "this Friday":
  Expression : "this Friday"
  Meeting    : 2026-06-09 (Tuesday, 10:30 local)
  Timezone   : America/New_York
  → resolved_date: "2026-06-12"    confidence: 0.90    is_ambiguous: false
  REASON: "this Friday" = nearest upcoming Friday within the same week (June 12).

EXAMPLE 3 — Absolute date, past-year rollover:
  Expression : "by March 15th"
  Meeting    : 2026-06-09
  → resolved_date: "2027-03-15"    confidence: 0.85    is_ambiguous: false
  REASON: March 15 already passed in 2026 → resolve to 2027.

EXAMPLE 4 — Sprint-relative (unresolvable without sprint data):
  Expression : "end of sprint"
  Meeting    : 2026-06-09
  → resolved_date: null    confidence: 0.0    is_sprint_relative: true
  REASON: No sprint calendar provided — cannot resolve to a calendar date.

EXAMPLE 5 — Vague / unresolvable:
  Expression : "soon" or "at some point"
  Meeting    : 2026-06-09
  → resolved_date: null    confidence: 0.0    is_ambiguous: true
  REASON: No temporal anchor. Do not guess.

OUTPUT SCHEMA (return ONLY this JSON object, no preamble):
{
  "resolved_date":     "YYYY-MM-DD or null",
  "confidence":        0.00,
  "is_ambiguous":      false,
  "is_sprint_relative": false
}
```

---

### 3.5 Schema Enrichments — 3 Prompt Updates

**`decisions_system.txt` → v3.1** — add to OUTPUT SCHEMA:
```json
{
  "text":           "clear, standalone decision statement",
  "made_by":        "name of decision-maker, or null if unanimous/unknown",
  "decision_type":  "TECHNICAL | PROCESS | TIMELINE | SCOPE | RESOURCE | PRIORITY | VENDOR | POLICY | OTHER",
  "confidence":     0.00,
  "reversible":     true,
  "dissent":        "Name disagreed, said X — or null if no dissent mentioned"
}
```

**`blockers_system.txt` → v3.1** — add to OUTPUT SCHEMA:
```json
{
  "text":                    "clear blocker statement",
  "blocked_work":            "what work is blocked",
  "affected_name":           "name or null",
  "blocking_party":          "external person/team/system or null",
  "severity":                "CRITICAL | HIGH | MEDIUM | LOW",
  "confidence":              0.00,
  "escalation_flag":         false,
  "estimated_unblock_date":  "verbatim temporal phrase from transcript, or null"
}
```
> Add instruction: `Set escalation_flag: true if the speaker mentions this has been blocked for multiple days/sprints, or that it was previously reported.`

**`risks_system.txt` → v3.1** — add to OUTPUT SCHEMA:
```json
{
  "text":                 "clear risk statement",
  "description":          "brief elaboration",
  "category":             "TIMELINE | TECHNICAL | RESOURCE | EXTERNAL | SECURITY | QUALITY | BUSINESS",
  "raised_by":            "name or null",
  "impact":               "potential impact description",
  "trigger_condition":    "what event would cause the risk to materialise",
  "confidence":           0.00,
  "probability":          "LOW | MEDIUM | HIGH",
  "mitigation_mentioned": "any mitigation suggested by the speaker, or null"
}
```

**`commitment_system.txt` → v3.1** — add under WORKED EXAMPLES:
```
EXAMPLE 6 — Implicit commitment (no explicit "I will"):
  "Leave it with me"
  → text: "Handle [topic discussed]", owner_name: [speaker], confidence: 0.75
  REASON: "Leave it with me" is a strong ownership signal in English professional context.

EXAMPLE 7 — Implicit commitment via topic handoff:
  "Ahmed, can you take point on this?"  Ahmed: "Yeah, absolutely."
  → text: "Take point on [topic]", owner_name: Ahmed, confidence: 0.85
```

---

## 4. Phase 2 — LiteLLM + Claude Fallback (Day 4–7)

> **Risk**: Medium | **Impact**: Better accuracy on ambiguous, hedged language

### 4.1 New File: `src/config/litellm_config.py`

**Builds**: Centralized litellm router configuration. Single place to swap models.

```python
"""
config/litellm_config.py
─────────────────────────
LiteLLM router configuration for model-agnostic AI calls.

WHY LITELLM:
  - Single SDK for OpenAI, Anthropic, Gemini — one-line model swaps
  - Built-in fallback routing: if primary fails → auto-retry on secondary
  - Unified cost tracking across providers via completion_cost()
  - A/B traffic splitting for prompt version experiments

FALLBACK STRATEGY:
  Primary:  OpenAI gpt-4.1-mini (cheap, fast, structured output)
  Fallback: Anthropic Claude 3.5 Sonnet (better nuance on ambiguous language)
  Trigger:  confidence_gate detects avg confidence < CONFIDENCE_GATE_THRESHOLD
"""

from src.config.settings import get_settings


def build_litellm_model_list() -> list[dict]:
    """Build litellm router model list from validated settings."""
    settings = get_settings()
    models = [
        {
            "model_name": "mini-tier",
            "litellm_params": {
                "model": f"openai/{settings.openai_gpt41_mini_model_name}",
                "api_key": settings.openai_api_key.get_secret_value(),
                "organization": settings.openai_org_id,
            },
        },
    ]
    # Claude fallback — only add if ANTHROPIC_API_KEY is configured
    if settings.anthropic_api_key:
        models.append({
            "model_name": "mini-tier",  # Same logical name — litellm routes as fallback
            "litellm_params": {
                "model": "anthropic/claude-3-5-sonnet-20241022",
                "api_key": settings.anthropic_api_key.get_secret_value(),
            },
        })
    models.append({
        "model_name": "full-tier",
        "litellm_params": {
            "model": f"openai/{settings.openai_gpt41_model_name}",
            "api_key": settings.openai_api_key.get_secret_value(),
        },
    })
    return models


# Router-level settings
LITELLM_FALLBACK_ENABLED: bool = True
LITELLM_MAX_FALLBACKS: int = 1
LITELLM_ROUTING_STRATEGY: str = "least-busy"  # or "latency-based"
```

---

### 4.2 New File: `src/services/litellm_client.py`

**Builds**: Drop-in replacement for `openai_client.py` using litellm + instructor.

**Same public interface as `OpenAIClient`:**
- `generate_structured(task_type, system_prompt, user_prompt, response_schema)` → `AICallResult[T]`
- `generate_text(task_type, system_prompt, user_prompt)` → `AICallResult[str]`
- `embed(texts)` → `AICallResult[list[list[float]]]`

**Key implementation details:**

```python
import instructor
import litellm
from litellm import Router

# Patch litellm with instructor for Pydantic structured output
_instructor_client = instructor.from_litellm(litellm.completion)

# litellm Router — handles primary/fallback automatically
_router = Router(
    model_list=build_litellm_model_list(),
    num_retries=3,
    fallbacks=[{"mini-tier": ["mini-tier"]}],  # same name = tries next provider
    allowed_fails=2,
)

# Usage inside generate_structured():
response, completion = _instructor_client.chat.completions.create_with_completion(
    model="mini-tier",             # Router resolves to OpenAI or Claude
    response_model=response_schema,  # Pydantic model — instructor handles schema
    max_retries=2,                 # instructor auto-retries on validation failure
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_prompt},
    ],
)

# Cost tracking via litellm
cost_usd = litellm.completion_cost(completion_response=completion)
```

**New field on `AICallResult`**: `provider_used: str` — records `"openai"` or `"anthropic"` for tracing.

---

### 4.3 New File: `src/services/extraction/confidence_gate.py`

**Builds**: Detects low-confidence extraction results + orchestrates Claude fallback.

```python
"""
services/extraction/confidence_gate.py
────────────────────────────────────────
Confidence gate for the extraction pipeline.

WHEN FALLBACK IS TRIGGERED:
  1. Aggregate confidence across all extracted items in a chunk < THRESHOLD (0.60)
  2. Any single extractor returns ALL items below 0.55 confidence

MERGE STRATEGY:
  For each item type (commitments, action_items, decisions, blockers, risks):
    - Compare primary avg confidence vs. fallback avg confidence
    - Take whichever version has HIGHER average confidence
    - Apply similarity dedup to avoid duplicates between primary and fallback

COST IMPACT ESTIMATE:
  ~10-15% of production chunks trigger fallback.
  Net extra cost: ~$0.002/meeting (Claude 3.5 Sonnet pricing).
"""

CONFIDENCE_GATE_THRESHOLD: float = 0.60
LOW_ITEM_CONFIDENCE_THRESHOLD: float = 0.55


class ConfidenceGate:
    def should_retry_with_fallback(
        self, chunk_result: ChunkExtractionResult
    ) -> bool:
        """
        Returns True if the chunk should be re-processed with the fallback model.
        
        Checks:
          1. Aggregate confidence < CONFIDENCE_GATE_THRESHOLD
          2. Any extractor produced ALL items below LOW_ITEM_CONFIDENCE_THRESHOLD
        """
        ...

    def merge_primary_and_fallback(
        self,
        primary: ChunkExtractionResult,
        fallback: ChunkExtractionResult,
    ) -> ChunkExtractionResult:
        """
        Merges primary (OpenAI) and fallback (Claude) results.
        Per item type: takes whichever version has higher avg confidence.
        Runs similarity dedup to prevent duplicate items from both sources.
        """
        ...
```

**Integration in `extractor.py` → `_extract_one_chunk()`:**

```python
# After primary extraction (existing code):
chunk_result = await _run_primary_extraction(chunk, request)

# NEW: Confidence gate check
if settings.confidence_gate_enabled and _gate.should_retry_with_fallback(chunk_result):
    log.info("confidence_gate_triggered", chunk_index=chunk.index, avg_confidence=...)
    fallback_result = await _run_fallback_extraction(chunk, request)
    chunk_result = _gate.merge_primary_and_fallback(chunk_result, fallback_result)

return chunk_result
```

---

### 4.4 New File: `src/services/extraction/prompt_router.py`

**Builds**: Selects + renders the correct Jinja2 user prompt template by `meeting_type`.

```python
class PromptRouter:
    """
    Routes ExtractRequest to the appropriate user prompt template.
    
    ROUTING TABLE:
      standup        → extraction_user_standup.txt
      retrospective  → extraction_user_retrospective.txt
      planning       → extraction_user.txt (generic + planning annotation)
      design_review  → extraction_user.txt (generic)
      1on1           → extraction_user.txt (generic, participant_count=2)
      all_hands      → extraction_user.txt (generic, large scale)
      general / None → extraction_user.txt (generic)
    
    RENDER CONTEXT (all v2 variables):
      meeting_type, meeting_title, meeting_date_iso, meeting_weekday,
      meeting_duration_minutes, team_timezone, participants, participant_count,
      is_continuation, chunk_number, total_chunks, team_context, transcript_content
    """
    
    def render_user_prompt(
        self,
        request: ExtractRequest,
        chunk_text: str,
        chunk_index: int,
        total_chunks: int,
    ) -> str:
        template = self._select_template(request.meeting_type)
        return template.render(self._build_context(request, chunk_text, chunk_index, total_chunks))
    
    def _select_template(self, meeting_type: str | None) -> jinja2.Template:
        ...
    
    def _format_participants(self, participants: list[ParticipantInfo]) -> str:
        """Format participants as: '- Full Name (email) [EXTERNAL]'"""
        ...
```

---

### 4.5 Modify `src/config/settings.py`

Add the following settings:

```python
# ── Anthropic (Claude fallback) ──────────────────────────────────────────────
# Optional. If not set, Claude fallback is disabled even if CONFIDENCE_GATE_ENABLED=true.
anthropic_api_key: SecretStr | None = None
anthropic_claude_model_name: str = "claude-3-5-sonnet-20241022"

# ── LangSmith Observability ───────────────────────────────────────────────────
# Optional. Set LANGSMITH_TRACING_ENABLED=true in staging/production.
langsmith_api_key: SecretStr | None = None
langsmith_project_name: str = "rapto-ai-pipeline"
langsmith_tracing_enabled: bool = False  # Default OFF — zero overhead in dev

# ── Confidence Gating ─────────────────────────────────────────────────────────
# Gate threshold: chunks with avg confidence below this trigger Claude fallback.
confidence_gate_threshold: float = Field(default=0.60, ge=0.0, le=1.0)
confidence_gate_enabled: bool = True
```

---

### 4.6 Modify `.env.example`

```bash
# ── Anthropic (Claude fallback — optional but recommended for production) ──────
ANTHROPIC_API_KEY=sk-ant-api03-...

# ── LangSmith (prompt observability — optional) ──────────────────────────────
LANGSMITH_API_KEY=ls__...
LANGSMITH_PROJECT_NAME=rapto-ai-pipeline
LANGSMITH_TRACING_ENABLED=false     # Set true in staging/production

# ── Confidence Gate ───────────────────────────────────────────────────────────
CONFIDENCE_GATE_THRESHOLD=0.60
CONFIDENCE_GATE_ENABLED=true
```

---

## 5. Phase 3 — LangSmith Tracing (Day 8–9)

> **Risk**: Low | **Impact**: Full observability on per-prompt quality over time

### 5.1 New File: `src/services/tracing/__init__.py`

```python
from .langsmith_tracer import LangSmithTracer, get_tracer
from .trace_context import TraceContext, current_trace_context

__all__ = ["LangSmithTracer", "get_tracer", "TraceContext", "current_trace_context"]
```

---

### 5.2 New File: `src/services/tracing/langsmith_tracer.py`

**Builds**: Per-call LangSmith run tracking. No-op when `LANGSMITH_TRACING_ENABLED=false`.

**Records per AI call:**
- `prompt_version` (from prompt header `# prompt_version: X`)
- `task_type` (EXTRACT_COMMITMENTS, EXTRACT_DECISIONS, etc.)
- `model_name` + `provider_used` (openai / anthropic)
- `input_tokens` + `output_tokens` + `cost_usd`
- `latency_ms`
- Avg `confidence_score` of extracted items (as metadata)
- `fallback_triggered: bool`

**Groups runs by:**
- `meeting_id` → one parent trace per meeting, child runs per chunk × task
- `prompt_version` → compare v3.0 vs. v3.1 quality side-by-side in LangSmith UI

```python
class LangSmithTracer:
    """LangSmith run tracking for every AI call in the pipeline."""
    
    def __init__(self, enabled: bool, api_key: str | None, project: str): ...
    
    def start_run(
        self,
        name: str,
        inputs: dict,
        metadata: dict,
        parent_run_id: str | None = None,
    ) -> str | None:
        """Start a LangSmith run. Returns run_id or None if disabled."""
        ...
    
    def end_run(
        self,
        run_id: str | None,
        outputs: dict,
        error: str | None = None,
    ) -> None: ...
    
    def log_feedback(
        self,
        run_id: str,
        key: str,        # e.g., "precision", "recall", "user_thumbs_up"
        score: float,    # 0.0–1.0
        comment: str | None = None,
    ) -> None:
        """Log evaluation feedback to a run — used by the eval harness after golden dataset eval."""
        ...


@lru_cache(maxsize=1)
def get_tracer() -> LangSmithTracer:
    settings = get_settings()
    return LangSmithTracer(
        enabled=settings.langsmith_tracing_enabled,
        api_key=settings.langsmith_api_key.get_secret_value() if settings.langsmith_api_key else None,
        project=settings.langsmith_project_name,
    )
```

---

### 5.3 New File: `src/services/tracing/trace_context.py`

**Builds**: Asyncio-safe trace context propagation (groups all runs from one meeting into one trace).

```python
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Optional

@dataclass
class TraceContext:
    meeting_id: str
    team_id: str
    prompt_version: str
    chunk_index: int
    parent_run_id: Optional[str] = None  # LangSmith parent run ID for this meeting


# ContextVar is asyncio-safe — each coroutine gets its own copy
current_trace_context: ContextVar[Optional[TraceContext]] = ContextVar(
    "current_trace_context", default=None
)
```

---

## 6. Phase 4 — deepeval + Eval Framework (Day 10–14)

> **Risk**: Low | **Impact**: Quantified quality gates — know exactly when prompts regress

### 6.1 New File: `src/eval/metrics.py`

**Builds**: Pure-function precision/recall/F1 + confidence calibration metrics.

```python
"""
eval/metrics.py
────────────────
Pure functions — no I/O, no side effects.
All inputs/outputs are Python primitives (easily unit-testable).

FUNCTIONS:
  precision(tp, fp) → float
  recall(tp, fn) → float
  f1(precision, recall) → float
  
  calibration_error(
    confidences: list[float],   # model-assigned confidence scores
    outcomes: list[bool],       # True = item was actually correct
  ) → float
    Measures if confidence is well-calibrated.
    Items scored 0.9 confidence should be correct 90% of the time.
    Lower = better calibration.
  
  compute_extraction_metrics(
    expected: list[dict],
    extracted: list[dict],
    matcher: Callable[[dict, dict], bool],
  ) → ExtractionMetrics
    Generic metric computation for any extractor type.
    Applies matcher pairwise to identify TP/FP/FN.

DATACLASS: ExtractionMetrics
  precision: float
  recall: float
  f1: float
  tp: int
  fp: int
  fn: int
  calibration_error: float
  items_extracted: int
  items_expected: int
"""
```

---

### 6.2 New File: `src/eval/matchers.py`

**Builds**: Per-extractor match functions (what counts as a "correct" extraction for each type).

```python
"""
eval/matchers.py
─────────────────
All matchers return True if the extracted item satisfies ALL active criteria.
Criteria are optional — unset criteria are skipped (not failed).

match_commitment(expected: EvalExpectedCommitment, extracted: dict) → bool
  Criteria: text_contains ∈ extracted.text (case-insensitive)
            AND owner_name_contains ∈ extracted.owner_name (case-insensitive)
            AND extracted.confidence >= confidence_min (if set)

match_action_item(expected: EvalExpectedActionItem, extracted: dict) → bool
  Criteria: text_contains + assignee_name_contains + priority (exact, if set)

match_decision(expected: EvalExpectedDecision, extracted: dict) → bool
  Criteria: text_contains + decision_type (exact, if set) + confidence_min (if set)

match_blocker(expected: EvalExpectedBlocker, extracted: dict) → bool
  Criteria: text_contains + blocked_work_contains (if set) + severity (exact, if set)

match_risk(expected: EvalExpectedRisk, extracted: dict) → bool
  Criteria: text_contains + category (exact, if set)
            + trigger_condition_contains (if set) + probability (exact, if set)

match_summary_section(expected: EvalExpectedSummary, extracted: dict) → bool
  Criteria: key_phrase_in_overview ∈ extracted.overview (if set)
            + all required_topics present in topics_discussed (if set)
"""
```

---

### 6.3 New File: `src/eval/deepeval_harness.py`

**Builds**: deepeval faithfulness + hallucination scoring for all 6 extractors.

```python
"""
eval/deepeval_harness.py
─────────────────────────
Uses deepeval to score extraction results on:

  1. FaithfulnessMetric  — are extracted items grounded in the transcript?
     Threshold: >= 0.85
     Fails if: extracted item contains names, tasks, or facts not in transcript.
  
  2. HallucinationMetric — detects fabricated content
     Threshold: <= 0.10
  
  3. AnswerRelevancyMetric — is the extraction on-topic?
     Threshold: >= 0.80

HOW IT WORKS:
  For each (expected_item, extracted_item) pair:
    1. Construct deepeval LLMTestCase:
         input = transcript chunk text
         actual_output = extracted item JSON string
         expected_output = expected item text
         retrieval_context = [transcript chunk]  (for faithfulness)
    2. Run deepeval.evaluate(test_cases, metrics)
    3. Aggregate scores per extractor type

USAGE:
  python -m eval.deepeval_harness --fixture standup_01 --extractor commitments
  python -m eval.deepeval_harness --all     # Run all fixtures, all extractors
"""
```

---

### 6.4 New File: `src/eval/ragas_harness.py`

**Builds**: ragas context recall + faithfulness for the summary extractor.

```python
"""
eval/ragas_harness.py
──────────────────────
Uses ragas to evaluate the SUMMARY extractor specifically.
ragas is designed for RAG/summarisation tasks — more suitable for
summary evaluation than deepeval's classification-oriented metrics.

METRICS:
  context_recall   — does the summary cover the key meeting points?
                     Threshold: >= 0.82
  faithfulness     — is the summary grounded in the transcript?
                     Threshold: >= 0.88
  answer_similarity — does the summary resemble the expected summary?
                     Threshold: >= 0.75

USAGE:
  python -m eval.ragas_harness --fixture standup_01
  python -m eval.ragas_harness --all
"""
```

---

### 6.5 New File: `src/eval/run_all_evals.py`

**Builds**: Master eval runner — all 6 extractors, all fixtures, formatted PASS/FAIL output.

```
PHASE 5 ACCURACY TARGETS:
  Commitments:   Precision ≥ 91%   Recall ≥ 87%   F1 ≥ 89%
  Action Items:  Precision ≥ 88%   Recall ≥ 84%   F1 ≥ 86%
  Decisions:     Precision ≥ 90%   Recall ≥ 85%   F1 ≥ 87%
  Blockers:      Precision ≥ 88%   Recall ≥ 83%   F1 ≥ 85%
  Risks:         Precision ≥ 85%   Recall ≥ 80%   F1 ≥ 82%
  Summary CR:    ≥ 82% (ragas context recall)

USAGE:
  # All extractors, all fixtures
  python -m eval.run_all_evals --service-url http://localhost:8001
  
  # Specific extractor
  python -m eval.run_all_evals --extractor commitments
  
  # With deepeval LLM-as-judge scoring (slower, costs ~$0.10/run)
  python -m eval.run_all_evals --with-deepeval
  
  # Without deepeval (fast, for CI)
  python -m eval.run_all_evals --no-deepeval

OUTPUT:
  stdout   → colored per-extractor table + PASS/FAIL verdict per target
  File     → eval/results/all_evals_{timestamp}.json  (permanent record)
  File     → eval/results/latest.json  (overwritten each run, used by ci_gate.py)
```

---

### 6.6 New File: `src/eval/ci_gate.py`

**Builds**: CI/CD gate — blocks prompt version bumps on F1 regression > 3%.

```python
"""
eval/ci_gate.py
────────────────
Compares current eval results against the last known-good baseline.
Fails with exit code 1 if ANY extractor's F1 drops more than 3% from baseline.

ALGORITHM:
  1. Load eval/results/latest.json       (current run — just completed)
  2. Load eval/results/baseline.json     (last passing run)
  3. For each extractor:
       if current_f1 < (baseline_f1 - 0.03):
         FAIL — print regression report
  4. If all pass → copy latest.json → baseline.json (promote baseline)

USAGE:
  # Always run AFTER run_all_evals.py
  python -m eval.run_all_evals && python -m eval.ci_gate

  Exit code 0 = pass (safe to merge/deploy)
  Exit code 1 = fail (regression detected — fix prompt before proceeding)
"""
```

---

### 6.7 Modified: `src/eval/eval_schema.py`

Add expected item types for all extractors:

```python
class EvalExpectedDecision(BaseModel):
    text_contains: str
    decision_type: Optional[DecisionType] = None
    confidence_min: Optional[float] = None
    reversible: Optional[bool] = None          # v3.1 field

class EvalExpectedBlocker(BaseModel):
    text_contains: str
    blocked_work_contains: Optional[str] = None
    severity: Optional[SeverityLevel] = None
    escalation_expected: Optional[bool] = None  # v3.1 field

class EvalExpectedRisk(BaseModel):
    text_contains: str
    category: Optional[RiskCategory] = None
    trigger_condition_contains: Optional[str] = None
    probability: Optional[Literal["LOW", "MEDIUM", "HIGH"]] = None  # v3.1 field

class EvalExpectedSummary(BaseModel):
    key_phrase_in_overview: Optional[str] = None
    required_topics: Optional[list[str]] = None
    min_key_takeaways: Optional[int] = None

class EvalCase(BaseModel):
    meeting_id: str
    meeting_type: str = "general"              # NEW — for prompt routing in eval
    description: str
    expected_commitments: List[EvalExpectedCommitment] = []
    expected_action_items: List[EvalExpectedActionItem] = []
    expected_decisions: List[EvalExpectedDecision] = []    # NEW
    expected_blockers: List[EvalExpectedBlocker] = []      # NEW
    expected_risks: List[EvalExpectedRisk] = []            # NEW
    expected_summary: Optional[EvalExpectedSummary] = None  # NEW
    expected_commitment_count: int = 0
    expected_zero_commitments: bool = False
```

---

### 6.8 New Golden Dataset Fixtures

**Extend `standup_01_expected.json`** — add all 6 extractor expectations:
```json
{
  "meeting_type": "standup",
  "description": "3-person daily standup with one blocker and two action items",
  "expected_commitments": [
    {"text_contains": "submit the PR", "owner_name_contains": "Ahmed", "confidence_min": 0.80}
  ],
  "expected_action_items": [
    {"text_contains": "review the design specs", "assignee_name_contains": "Sara", "priority": "HIGH"}
  ],
  "expected_decisions": [],
  "expected_blockers": [
    {"text_contains": "waiting on API access", "severity": "HIGH"}
  ],
  "expected_risks": [],
  "expected_summary": {
    "key_phrase_in_overview": "standup",
    "required_topics": ["blockers", "API access"]
  },
  "expected_zero_commitments": false,
  "expected_commitment_count": 2
}
```

**New `planning_01_cleaned.json`** — 45-minute sprint planning transcript:
- 5 commitments, 8 action items, 3 decisions, 1 blocker, 2 risks
- `meeting_type: "planning"` in the expected file

**New `retrospective_01_cleaned.json`** — 30-minute retrospective:
- 2 commitments, 5 action items, 4 decisions (process changes), 0 blockers, 1 risk
- `meeting_type: "retrospective"` in the expected file

---

## 7. Phase 5 — Schema Enrichments (Day 15–16)

> **Risk**: Medium (requires Prisma migration) | Deploy in two steps — Python first, DB second

### 7.1 Modify `src/models/extraction_models.py`

**`ExtractedDecision`** — add:
```python
reversible: bool = Field(default=True, description="Is this decision easily reversible?")
dissent: Optional[str] = Field(default=None, max_length=500,
    description="Any dissenting voice mentioned (e.g. 'Ahmed disagreed, said X'). Null if unanimous.")
```

**`ExtractedBlocker`** — add:
```python
escalation_flag: bool = Field(default=False,
    description="True if speaker mentions this has been blocked for multiple days/sprints.")
estimated_unblock_date: Optional[str] = Field(default=None, max_length=200,
    description="Verbatim temporal phrase for when it might unblock (e.g. 'after the vendor call Friday').")
```

**`ExtractedRisk`** — add:
```python
probability: Literal["LOW", "MEDIUM", "HIGH"] = Field(default="MEDIUM",
    description="Estimated likelihood the risk will materialise.")
mitigation_mentioned: Optional[str] = Field(default=None, max_length=500,
    description="Any mitigation strategy mentioned by the speaker. Null if none suggested.")
```

**`ExtractRequest`** — add:
```python
meeting_type: Optional[str] = Field(
    default="general",
    description="standup | planning | retrospective | design_review | 1on1 | all_hands | general"
)
team_context: Optional[str] = Field(
    default=None,
    max_length=500,
    description="Optional brief team context to inject into prompts (e.g. 'Backend team, sprint 23')."
)
```

---

### 7.2 Modify `services/api/src/services/ai-pipeline/ai-pipeline.types.ts`

**`ExtractRequest`** — add:
```typescript
/** Optional meeting type for prompt routing and context injection */
meeting_type?: 'standup' | 'planning' | 'retrospective' | 'design_review' | '1on1' | 'all_hands' | 'general';
/** Optional brief team context injected into extraction prompts (max 500 chars) */
team_context?: string | null;
```

**`ParsedDecision`** — add:
```typescript
/** Is this decision easily reversible? */
reversible: boolean;
/** Any dissenting voice mentioned, or null if unanimous */
dissent: string | null;
```

**`ParsedBlocker`** — add:
```typescript
/** True if this blocker has been reported across multiple meetings */
escalation_flag: boolean;
/** Verbatim temporal phrase for estimated unblock, or null */
estimated_unblock_date: string | null;
```

**`ParsedRisk`** — add:
```typescript
/** Estimated probability of the risk materialising */
probability: 'LOW' | 'MEDIUM' | 'HIGH';
/** Speaker-suggested mitigation, or null */
mitigation_mentioned: string | null;
```

---

### 7.3 Modify `services/api/src/queues/workers/extract.worker.ts`

**`aiPayload` construction** — add new fields:
```typescript
const aiPayload: ExtractRequest = {
  // ... existing fields unchanged ...
  meeting_type: (meeting as any).meetingType ?? 'general',
  team_context:  (teamSettings.ai_context as string) ?? null,
}
```

**Decision DB write** — add:
```typescript
data: result.decisions.map((d) => ({
  // ... existing fields ...
  reversible:  d.reversible ?? true,
  dissent:     d.dissent ?? null,
}))
```

**Blocker DB write** — add:
```typescript
data: result.blockers.map((b) => ({
  // ... existing fields ...
  escalationFlag:        b.escalation_flag ?? false,
  estimatedUnblockDate:  b.estimated_unblock_date ?? null,
}))
```

**Risk DB write** — add:
```typescript
data: result.risks.map((r) => ({
  // ... existing fields ...
  probability:         r.probability ?? 'MEDIUM',
  mitigationMentioned: r.mitigation_mentioned ?? null,
}))
```

> **Note**: A Prisma migration is required to add these columns to the database.
> Deploy Python changes first (new fields are optional with defaults).
> Run `prisma migrate dev --name add-enriched-extraction-fields` separately.

---

## 8. Phase 6 — Dependencies & Tooling (Day 17)

### 8.1 `requirements.txt` additions

```
# LLM orchestration
litellm>=1.40.0
instructor>=1.3.0
anthropic>=0.26.0

# Observability
langsmith>=0.1.90

# Evaluation
deepeval>=0.21.0
ragas>=0.1.10

# Already present — confirm pinned version
tiktoken>=0.7.0
httpx>=0.27.0     # used by deepeval eval harness
```

---

### 8.2 `Makefile` additions

```makefile
# ── Evaluation ──────────────────────────────────────────────────────────────
eval-all:
	python -m eval.run_all_evals --service-url http://localhost:8001

eval-commitments:
	python -m eval.run_all_evals --extractor commitments

eval-decisions:
	python -m eval.run_all_evals --extractor decisions

eval-blockers:
	python -m eval.run_all_evals --extractor blockers

eval-risks:
	python -m eval.run_all_evals --extractor risks

eval-summary:
	python -m eval.ragas_harness --all

eval-deepeval:
	python -m eval.deepeval_harness --all

# ── CI Gate ──────────────────────────────────────────────────────────────────
eval-ci:
	python -m eval.run_all_evals --no-deepeval && python -m eval.ci_gate

# ── Tracing ───────────────────────────────────────────────────────────────────
tracing-enable:
	@echo "Set LANGSMITH_TRACING_ENABLED=true in .env to enable"

# ── Fixture Generation ────────────────────────────────────────────────────────
build-fixture:
	@echo "Usage: python -m eval.fixtures_builder --meeting-id <id> --service-url <url>"
	python -m eval.fixtures_builder $(ARGS)
```

---

## 9. End-to-End Integration Flow

```
extract.worker.ts
  │  ExtractRequest { meeting_type, team_context, ... }
  ▼
POST /api/v1/extract
  │
  ▼
extractor.py.extract()
  │
  ├─ prompt_router.py.render_user_prompt()
  │    Selects: extraction_user_standup.txt  (for standup)
  │          or extraction_user.txt v2       (for general)
  │    Injects: meeting_type, participants, speaker_match_rule, ...
  │
  ├─ For each chunk (parallel, semaphore-bounded):
  │    ├─ litellm_client.generate_structured(CommitmentsResponse)
  │    │    → OpenAI gpt-4.1-mini (primary)
  │    │    → langsmith_tracer.start_run(task=commitments, model=gpt-4.1-mini)
  │    │    → [on fallback] Claude 3.5 Sonnet
  │    │    → langsmith_tracer.end_run(confidence_scores, cost, latency)
  │    │
  │    ├─ confidence_gate.should_retry_with_fallback(chunk_result)?
  │    │    YES → litellm_client (Claude)
  │    │         → confidence_gate.merge_primary_and_fallback()
  │    │
  │    └─ Returns ChunkExtractionResult
  │
  ├─ _merge_chunk_results()  [existing dedup logic]
  └─ ExtractionResultWithMeta { new fields: reversible, probability, ... }
  │
  ▼
extract.worker.ts writes to PostgreSQL
  commitments, action_items, decisions (+ reversible, dissent),
  blockers (+ escalation_flag), risks (+ probability, mitigation_mentioned)
```

---

## 10. Eval CI/CD Gate

```
Developer edits any prompt file
        │
        ▼
git commit + push
        │
        ▼
CI detects changed prompt files
        │
        ▼
python -m eval.run_all_evals
  (against staging service, no deepeval — fast)
        │
        ▼
All F1 targets met AND no regression > 3%?
    │                    │
   YES                   NO
    │                    │
    ▼                    ▼
python -m eval.ci_gate   Block merge
  promote baseline        Print failing extractor
    │                     + F1 delta report
    ▼
Allow merge / deploy
```

---

## 11. Execution Timeline

| Phase | What | Days | Risk | Priority |
|-------|------|------|------|----------|
| **1.1** | `extraction_user.txt` v2 overhaul | 1 | 🟢 Low | 🔴 P0 |
| **1.2–1.3** | Standup + retro user templates | 1 | 🟢 Low | 🟡 P1 |
| **1.4** | `date_parse_system.txt` — 5 examples | 0.5 | 🟢 Low | 🔴 P0 |
| **1.5** | Schema enrichments (3 prompts v3.1) | 0.5 | 🟢 Low | 🟡 P1 |
| **2.1–2.2** | `litellm_config.py` + `litellm_client.py` | 2 | 🟡 Medium | 🟡 P1 |
| **2.3** | `confidence_gate.py` | 1 | 🟡 Medium | 🟡 P1 |
| **2.4** | `prompt_router.py` | 1 | 🟢 Low | 🟡 P1 |
| **2.5–2.6** | `settings.py` + `.env.example` | 0.5 | 🟢 Low | 🟢 P2 |
| **3.1–3.3** | LangSmith tracing module (3 files) | 2 | 🟢 Low | 🟡 P1 |
| **4.1–4.8** | deepeval + ragas + golden fixtures + ci_gate | 5 | 🟢 Low | 🔴 P0 |
| **5.1–5.3** | Pydantic + TypeScript schema enrichments | 2 | 🟡 Medium | 🟡 P1 |
| **6.1–6.2** | Dependencies + Makefile | 1 | 🟢 Low | 🟢 P2 |
| **TOTAL** | | **~17 days** | | |

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Claude API latency adds > 2s per meeting | Medium | Medium | Confidence gate triggers on ~10–15% of chunks only; async — doesn't block |
| litellm routes to Claude always (misconfiguration) | Low | High | Set `CONFIDENCE_GATE_ENABLED=false` to bypass; always visible in LangSmith |
| Schema enrichments break DB without migration | Medium | High | Deploy new Python fields first (all optional with defaults); run Prisma migration separately |
| deepeval LLM-as-judge cost too high in CI | Medium | Low | `--no-deepeval` flag in CI; full deepeval only in pre-release smoke test |
| Golden dataset too small (4 fixtures) | High | Medium | `fixtures_builder.py` enables rapid fixture generation from real production meetings |
| LangSmith sends PII to external servers | Medium | High | Set `hide_inputs=True` in LangSmith client config; log metadata only, not transcript content |
| instructor library conflicts with existing openai SDK usage | Low | Medium | instructor wraps around litellm, not the existing openai_client.py — no conflict |
| `*_examples.txt` files still dead code post-implementation | Low | Low | Explicitly delete or wire into system prompts as appendices in Phase 1 |
