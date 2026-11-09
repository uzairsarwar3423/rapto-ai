"""
services/extraction/prompt_router.py
─────────────────────────────────────
Prompt loading, versioning and meeting-type routing for the extraction pipeline.

ROUTING TABLE (user prompt template by meeting type):
  standup        → extraction_user_standup.txt
  retrospective  → extraction_user_retrospective.txt
  planning       → extraction_user.txt (generic + planning annotation)
  design_review  → extraction_user.txt (generic + design review annotation)
  1on1           → extraction_user.txt (generic + 1on1 annotation)
  all_hands      → extraction_user.txt (generic + all-hands annotation)
  general / None → extraction_user.txt (generic)

MEETING TYPE RESOLUTION:
  1. request.meeting_type when the caller supplies one
  2. otherwise inferred from meeting_title (keyword rules below)
  3. otherwise "general"

SAFETY:
  Templates are rendered with Jinja2 StrictUndefined (a missing variable is a
  hard error, never a silently empty slot). User-controlled values (title,
  transcript, team_context) are passed as *values* — Jinja2 never re-parses
  them, so "{{ ... }}" inside a transcript is inert text.

VERSIONING:
  Every prompt file starts with "# prompt_version: <id>". Header comment lines
  are stripped from user templates before rendering (system prompts are sent
  as-is, as before). PROMPT_BUNDLE_VERSION fingerprints the full prompt set so
  any prompt edit produces a new version string in results and traces.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import jinja2
import pytz

from src.models.cleanup_models import ParticipantInfo
from src.models.common import TaskType
from src.models.exceptions import AIPipelineError
from src.models.extraction_models import ExtractRequest, MeetingType
from src.services.language import LanguageDetection, detect_language, language_directive

PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"

# Major version of the extraction prompt bundle. Bump when the *structure* of
# the pipeline's prompting changes; content edits are captured by the hash.
EXTRACTION_BUNDLE_MAJOR = "extraction-v4.2"

_VERSION_RE = re.compile(r"^#\s*prompt_version:\s*(\S+)")


class PromptLoadError(AIPipelineError):
    pass


@dataclass(frozen=True)
class LoadedPrompt:
    filename: str
    text: str        # full file content (system prompts are sent verbatim)
    body: str        # content with the leading "#" header block removed
    version: str


def _strip_header(text: str) -> str:
    lines = text.splitlines(keepends=True)
    index = 0
    while index < len(lines) and (lines[index].startswith("#") or not lines[index].strip()):
        index += 1
    return "".join(lines[index:])


@lru_cache(maxsize=None)
def load_prompt(filename: str) -> LoadedPrompt:
    path = PROMPTS_DIR / filename
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise PromptLoadError(f"Failed to load prompt {filename}: {exc}") from exc
    match = _VERSION_RE.match(text)
    version = match.group(1) if match else f"{path.stem}-unversioned"
    return LoadedPrompt(filename=filename, text=text, body=_strip_header(text), version=version)


# ─── System prompts ───────────────────────────────────────────────────────────

SYSTEM_PROMPT_FILES: dict[TaskType, str] = {
    TaskType.EXTRACT_COMMITMENTS: "commitment_system.txt",
    TaskType.EXTRACT_ACTION_ITEMS: "action_items_system.txt",
    TaskType.EXTRACT_DECISIONS: "decisions_system.txt",
    TaskType.EXTRACT_BLOCKERS: "blockers_system.txt",
    TaskType.EXTRACT_RISKS: "risks_system.txt",
    TaskType.SUMMARY: "summary_system.txt",
}

USER_TEMPLATE_FILES: dict[MeetingType, str] = {
    MeetingType.STANDUP: "extraction_user_standup.txt",
    MeetingType.RETROSPECTIVE: "extraction_user_retrospective.txt",
}
GENERIC_USER_TEMPLATE = "extraction_user.txt"


LANGUAGE_RULES_FILE = "language_rules.txt"


def system_prompt(task_type: TaskType) -> str:
    """Task system prompt + the shared multilingual rules block (one source of truth)."""
    base = load_prompt(SYSTEM_PROMPT_FILES[task_type]).text
    rules = load_prompt(LANGUAGE_RULES_FILE).body
    return f"{base.rstrip()}\n\n{rules.strip()}\n"


def prompt_versions() -> dict[str, str]:
    """{logical prompt name: version} for every prompt in the extraction bundle."""
    versions = {
        task.value: load_prompt(name).version for task, name in SYSTEM_PROMPT_FILES.items()
    }
    versions["language_rules"] = load_prompt(LANGUAGE_RULES_FILE).version
    versions["user_generic"] = load_prompt(GENERIC_USER_TEMPLATE).version
    for meeting_type, name in USER_TEMPLATE_FILES.items():
        versions[f"user_{meeting_type.value}"] = load_prompt(name).version
    return versions


@lru_cache(maxsize=1)
def prompt_bundle_version() -> str:
    """e.g. 'extraction-v4.1+3f9a1c2e' — changes whenever any prompt changes."""
    names = sorted(
        {*SYSTEM_PROMPT_FILES.values(), LANGUAGE_RULES_FILE, GENERIC_USER_TEMPLATE, *USER_TEMPLATE_FILES.values()}
    )
    digest = hashlib.sha256()
    for name in names:
        digest.update(name.encode())
        digest.update(load_prompt(name).text.encode("utf-8"))
    return f"{EXTRACTION_BUNDLE_MAJOR}+{digest.hexdigest()[:8]}"


# ─── Meeting type inference ───────────────────────────────────────────────────

# Ordered: first match wins. Retro/planning before standup so "Sprint planning
# sync" is not a standup; 1on1 patterns are anchored to avoid "1:10pm".
_TITLE_RULES: tuple[tuple[re.Pattern[str], MeetingType], ...] = (
    (re.compile(r"\bretro(spective)?s?\b", re.I), MeetingType.RETROSPECTIVE),
    (re.compile(r"\b(sprint\s+)?planning\b|\bgrooming\b|\brefinement\b|\bkick-?off\b", re.I),
     MeetingType.PLANNING),
    (re.compile(r"\bstand[\s-]?ups?\b|\bdaily\s+(scrum|sync|huddle)\b|\bdaily\b|\bscrum\b", re.I),
     MeetingType.STANDUP),
    (re.compile(r"\b(design|architecture|tech(nical)?|rfc|code)\s+review\b|\bdesign\s+crit", re.I),
     MeetingType.DESIGN_REVIEW),
    (re.compile(r"\b1\s*:\s*1\b(?!\s*\d)|\b1\s*-?\s*on\s*-?\s*1\b|\bone[\s-]on[\s-]one\b", re.I),
     MeetingType.ONE_ON_ONE),
    (re.compile(r"\ball[\s-]?hands\b|\btown\s*hall\b|\bcompany\s+(meeting|update)\b", re.I),
     MeetingType.ALL_HANDS),
)


def infer_meeting_type(title: str | None) -> MeetingType:
    if title:
        for pattern, meeting_type in _TITLE_RULES:
            if pattern.search(title):
                return meeting_type
    return MeetingType.GENERAL


def resolve_meeting_type(request: ExtractRequest) -> MeetingType:
    return request.meeting_type or infer_meeting_type(request.meeting_title)


# ─── Router ───────────────────────────────────────────────────────────────────


class PromptRouter:
    """Selects + renders the user prompt template for an ExtractRequest chunk."""

    def __init__(self) -> None:
        self._env = jinja2.Environment(
            undefined=jinja2.StrictUndefined,
            autoescape=False,  # plain-text prompts, not HTML
            trim_blocks=True,
            lstrip_blocks=True,
            keep_trailing_newline=False,
        )
        self._templates: dict[str, jinja2.Template] = {}

    def template_name_for(self, meeting_type: MeetingType) -> str:
        return USER_TEMPLATE_FILES.get(meeting_type, GENERIC_USER_TEMPLATE)

    def user_prompt_version(self, meeting_type: MeetingType) -> str:
        return load_prompt(self.template_name_for(meeting_type)).version

    def render_user_prompt(
        self,
        request: ExtractRequest,
        chunk_text: str,
        chunk_index: int,
        total_chunks: int,
        meeting_type: MeetingType | None = None,
        language: LanguageDetection | None = None,
    ) -> str:
        meeting_type = meeting_type or resolve_meeting_type(request)
        template = self._select_template(meeting_type)
        return template.render(
            **self._build_context(request, chunk_text, chunk_index, total_chunks, meeting_type, language)
        ).strip() + "\n"

    def _select_template(self, meeting_type: MeetingType) -> jinja2.Template:
        name = self.template_name_for(meeting_type)
        template = self._templates.get(name)
        if template is None:
            try:
                template = self._env.from_string(load_prompt(name).body)
            except jinja2.TemplateError as exc:
                raise PromptLoadError(f"Invalid prompt template {name}: {exc}") from exc
            self._templates[name] = template
        return template

    def _build_context(
        self,
        request: ExtractRequest,
        chunk_text: str,
        chunk_index: int,
        total_chunks: int,
        meeting_type: MeetingType,
        language: LanguageDetection | None = None,
    ) -> dict[str, object]:
        local_dt = _to_local(request.meeting_date, request.team_timezone)
        minutes = int((request.meeting_duration_seconds or 0) // 60)
        return {
            "meeting_title": request.meeting_title,
            "meeting_type": meeting_type.value,
            "meeting_date_iso": local_dt.date().isoformat(),
            "meeting_weekday": local_dt.strftime("%A"),
            "meeting_duration_label": f"{minutes} minutes" if minutes > 0 else "unknown",
            "team_timezone": request.team_timezone,
            "participants": self._format_participants(request.participants),
            "participant_count": len(request.participants),
            "team_context": request.team_context or "",
            "is_continuation": chunk_index > 0,
            "chunk_number": chunk_index + 1,
            "total_chunks": max(total_chunks, chunk_index + 1),
            "transcript_content": chunk_text,
            "language_directive": language_directive(language or detect_language("")),
        }

    @staticmethod
    def _format_participants(participants: list[ParticipantInfo]) -> str:
        """'- Full Name (email) [EXTERNAL]' — EXTERNAL when not a platform user."""
        lines = []
        for p in participants:
            line = f"- {p.name}"
            if p.email:
                line += f" ({p.email})"
            if not p.user_id:
                line += " [EXTERNAL]"
            lines.append(line)
        return "\n".join(lines) if lines else "- (participant list unavailable)"


def _to_local(meeting_date: datetime, tz_name: str) -> datetime:
    aware = meeting_date if meeting_date.tzinfo else meeting_date.replace(tzinfo=timezone.utc)
    try:
        return aware.astimezone(pytz.timezone(tz_name))
    except pytz.UnknownTimeZoneError:
        return aware.astimezone(timezone.utc)
