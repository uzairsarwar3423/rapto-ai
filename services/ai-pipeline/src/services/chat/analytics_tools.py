"""
services/chat/analytics_tools.py
────────────────────────────────
CLOSED-WHITELIST analytics (ADR-7): the model may only pick a tool name and fill a validated parameter
object. It never writes SQL. Each tool owns

  * a Pydantic parameter model (enums, `limit <= 50`, date bounds; extra fields forbidden),
  * a documented METRIC DEFINITION that is copied into the source text, so the answer says what was
    counted and as of when ("overdue = due date before today in the team timezone and not completed/cancelled"),
  * SQL that reads ONLY the migration-004 views (`rag.v_chat_*`: column allow-lists + tenant predicate),
    always with an explicit `team_id = $1` in addition to RLS,
  * a formatter producing a compact, citable `analytics` source.

A count of ZERO is a valid, citable result — it is not "no results".
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Callable, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.models.chat_models import IdStr
from src.models.rag_models import AccessScope

MAX_LIMIT = 50
CLOSED_STATES = ("FULFILLED", "CANCELLED")          # a commitment in these states is no longer "open"


class ToolParamError(ValueError):
    """Unknown tool or invalid parameters (the router then falls back to LOOKUP)."""


# ─── parameter models ─────────────────────────────────────────────────────────

class _P(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CountCommitmentsParams(_P):
    status: Literal["open", "overdue", "completed", "all"] = "open"
    owner_ids: list[IdStr] = Field(default_factory=list, max_length=10)
    date_from: Optional[date] = None
    date_to: Optional[date] = None


class ListOverdueParams(_P):
    owner_ids: list[IdStr] = Field(default_factory=list, max_length=10)
    limit: int = Field(default=20, ge=1, le=MAX_LIMIT)


class CompletionRateParams(_P):
    date_from: Optional[date] = None
    date_to: Optional[date] = None


class TopOwnersParams(_P):
    limit: int = Field(default=5, ge=1, le=MAX_LIMIT)


class MeetingCountParams(_P):
    date_from: Optional[date] = None
    date_to: Optional[date] = None


class FindCommitmentsParams(_P):
    owner_ids: list[IdStr] = Field(default_factory=list, max_length=10)
    text: Optional[str] = Field(default=None, max_length=120)
    limit: int = Field(default=10, ge=1, le=MAX_LIMIT)


# ─── SQL building (positional params numbered automatically) ──────────────────

class _Sql:
    def __init__(self) -> None:
        self.args: list[Any] = []

    def add(self, value: Any, cast: str) -> str:
        self.args.append(value)
        return f"${len(self.args)}::{cast}"


def _scope_clause(a: _Sql, scope: AccessScope, column: str) -> str:
    if scope.kind != "meetings":
        return "TRUE"
    return f"{column} = ANY({a.add(list(scope.meeting_ids or []), 'text[]')})"


def _date_clause(a: _Sql, column: str, tz: str, d_from: Optional[date], d_to: Optional[date]) -> str:
    if d_from is None and d_to is None:
        return "TRUE"                       # no bound → no bind parameters (an unused $n makes Postgres reject the query)
    parts = []
    tzp = a.add(tz, "text")
    if d_from is not None:
        parts.append(f"({column} AT TIME ZONE {tzp})::date >= {a.add(d_from, 'date')}")
    if d_to is not None:
        parts.append(f"({column} AT TIME ZONE {tzp})::date <= {a.add(d_to, 'date')}")
    return " AND ".join(parts)


def _owner_clause(a: _Sql, owner_ids: list[str]) -> str:
    return f"c.owner_id = ANY({a.add(owner_ids, 'text[]')})" if owner_ids else "TRUE"


def _status_clause(a: _Sql, status: str, tz: str, today: date) -> str:
    open_ = "c.status NOT IN ('FULFILLED','CANCELLED')"
    if status == "open":
        return open_
    if status == "completed":
        return "c.status = 'FULFILLED'"
    if status == "overdue":
        # "due before today in the TEAM timezone": the due date's LOCAL calendar date has fully passed.
        return (f"{open_} AND c.due_date IS NOT NULL AND "
                f"(c.due_date AT TIME ZONE {a.add(tz, 'text')})::date < {a.add(today, 'date')}")
    return "TRUE"


@dataclass(frozen=True)
class ToolContext:
    team_id: str
    tz: str
    today: date
    as_of: datetime
    scope: AccessScope


@dataclass(frozen=True)
class AnalyticsResult:
    tool: str
    params: dict[str, Any]
    as_of: str
    definition: str
    summary: str
    rows: list[dict[str, Any]]
    text: str                   # the compact body that becomes the prompt source

    @property
    def preview(self) -> str:
        return self.summary[:200]


def _json_params(p: BaseModel) -> dict[str, Any]:
    return json.loads(p.model_dump_json(exclude_defaults=False))


def _fmt_date(v: Any, tz_name: str) -> str:
    if v is None:
        return "none"
    if isinstance(v, datetime):
        import pytz
        return v.astimezone(pytz.timezone(tz_name)).date().isoformat()
    return str(v)


# ─── tools ────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ToolSpec:
    name: str
    definition: str
    model: type[BaseModel]
    build: Callable[[BaseModel, ToolContext], tuple[str, list[Any]]]
    fmt: Callable[[BaseModel, ToolContext, list[dict[str, Any]]], tuple[str, str]]   # (summary, body)
    max_rows: int = 50


def _asof(ctx: ToolContext) -> str:
    return ctx.as_of.strftime("%Y-%m-%d %H:%M ") + ctx.tz


def _b_count(p: CountCommitmentsParams, ctx: ToolContext) -> tuple[str, list[Any]]:  # type: ignore[override]
    a = _Sql()
    team = a.add(ctx.team_id, "text")
    where = [f"c.team_id = {team}", _status_clause(a, p.status, ctx.tz, ctx.today), _owner_clause(a, p.owner_ids),
             _date_clause(a, "c.due_date", ctx.tz, p.date_from, p.date_to), _scope_clause(a, ctx.scope, "c.meeting_id")]
    return f"SELECT count(*)::int AS n FROM rag.v_chat_commitments c WHERE {' AND '.join(where)}", a.args


def _f_count(p: CountCommitmentsParams, ctx: ToolContext, rows: list[dict[str, Any]]) -> tuple[str, str]:  # type: ignore[override]
    n = int(rows[0]["n"]) if rows else 0
    flt = [f"status={p.status}"]
    if p.owner_ids:
        flt.append(f"owners={len(p.owner_ids)} selected")
    if p.date_from or p.date_to:
        flt.append(f"due between {p.date_from or 'any'} and {p.date_to or 'any'}")
    return f"{n} commitments ({', '.join(flt)})", f"count: {n}\nfilters: {'; '.join(flt)}"


def _b_overdue(p: ListOverdueParams, ctx: ToolContext) -> tuple[str, list[Any]]:  # type: ignore[override]
    a = _Sql()
    team = a.add(ctx.team_id, "text")
    where = [f"c.team_id = {team}", _status_clause(a, "overdue", ctx.tz, ctx.today), _owner_clause(a, p.owner_ids),
             _scope_clause(a, ctx.scope, "c.meeting_id")]
    lim = a.add(p.limit, "int")
    return (f"SELECT c.id, c.text, c.owner_name, c.due_date, c.status, c.meeting_id FROM rag.v_chat_commitments c "
            f"WHERE {' AND '.join(where)} ORDER BY c.due_date ASC, c.id ASC LIMIT {lim}"), a.args


def _rows_body(rows: list[dict[str, Any]], tz: str, limit: int) -> str:
    lines = []
    for r in rows[:limit]:
        lines.append(f"- {r.get('text', '')} | owner: {r.get('owner_name') or 'unassigned'} | "
                     f"due: {_fmt_date(r.get('due_date'), tz)} | status: {r.get('status')}")
    return "\n".join(lines) if lines else "(none)"


def _f_overdue(p: ListOverdueParams, ctx: ToolContext, rows: list[dict[str, Any]]) -> tuple[str, str]:  # type: ignore[override]
    return (f"{len(rows)} overdue commitments listed (limit {p.limit})",
            f"rows returned: {len(rows)} (limit {p.limit}), oldest due first\n{_rows_body(rows, ctx.tz, p.limit)}")


def _b_rate(p: CompletionRateParams, ctx: ToolContext) -> tuple[str, list[Any]]:  # type: ignore[override]
    a = _Sql()
    team = a.add(ctx.team_id, "text")
    where = [f"c.team_id = {team}", "c.status <> 'CANCELLED'", "c.due_date IS NOT NULL",
             _date_clause(a, "c.due_date", ctx.tz, p.date_from, p.date_to), _scope_clause(a, ctx.scope, "c.meeting_id")]
    return ("SELECT count(*) FILTER (WHERE c.status = 'FULFILLED')::int AS completed, count(*)::int AS total "
            f"FROM rag.v_chat_commitments c WHERE {' AND '.join(where)}"), a.args


def _f_rate(p: CompletionRateParams, ctx: ToolContext, rows: list[dict[str, Any]]) -> tuple[str, str]:  # type: ignore[override]
    done, total = (int(rows[0]["completed"]), int(rows[0]["total"])) if rows else (0, 0)
    pct = f"{100.0 * done / total:.1f}%" if total else "n/a (no commitments were due in the range)"
    rng = f"{p.date_from or 'any'} to {p.date_to or 'any'}"
    return f"completion rate {pct}", f"completed: {done}\ntotal due in range: {total}\ncompletion rate: {pct}\ndue range: {rng}"


def _b_top(p: TopOwnersParams, ctx: ToolContext) -> tuple[str, list[Any]]:  # type: ignore[override]
    a = _Sql()
    team = a.add(ctx.team_id, "text")
    where = [f"c.team_id = {team}", _status_clause(a, "open", ctx.tz, ctx.today), "c.owner_id IS NOT NULL",
             _scope_clause(a, ctx.scope, "c.meeting_id")]
    lim = a.add(p.limit, "int")
    return (f"SELECT c.owner_id, max(c.owner_name) AS owner_name, count(*)::int AS open_count FROM rag.v_chat_commitments c "
            f"WHERE {' AND '.join(where)} GROUP BY c.owner_id ORDER BY open_count DESC, owner_name ASC LIMIT {lim}"), a.args


def _f_top(p: TopOwnersParams, ctx: ToolContext, rows: list[dict[str, Any]]) -> tuple[str, str]:  # type: ignore[override]
    body = "\n".join(f"{i}. {r['owner_name']} — {r['open_count']} open" for i, r in enumerate(rows, 1)) or "(nobody has open commitments)"
    return f"top {len(rows)} owners by open commitments", body


def _b_meetings(p: MeetingCountParams, ctx: ToolContext) -> tuple[str, list[Any]]:  # type: ignore[override]
    a = _Sql()
    team = a.add(ctx.team_id, "text")
    where = [f"m.team_id = {team}", "m.status NOT IN ('CANCELLED','FAILED')",
             _date_clause(a, "m.scheduled_at", ctx.tz, p.date_from, p.date_to), _scope_clause(a, ctx.scope, "m.id")]
    return f"SELECT count(*)::int AS n FROM rag.v_chat_meetings m WHERE {' AND '.join(where)}", a.args


def _f_meetings(p: MeetingCountParams, ctx: ToolContext, rows: list[dict[str, Any]]) -> tuple[str, str]:  # type: ignore[override]
    n = int(rows[0]["n"]) if rows else 0
    return f"{n} meetings", f"count: {n}\nrange: {p.date_from or 'any'} to {p.date_to or 'any'}"


def _b_find(p: FindCommitmentsParams, ctx: ToolContext) -> tuple[str, list[Any]]:  # type: ignore[override]
    a = _Sql()
    team = a.add(ctx.team_id, "text")
    where = [f"c.team_id = {team}", _owner_clause(a, p.owner_ids), _scope_clause(a, ctx.scope, "c.meeting_id")]
    if p.text:
        like = "%" + p.text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where.append(f"c.text ILIKE {a.add(like, 'text')}")
    lim = a.add(p.limit, "int")
    return (f"SELECT c.id, c.text, c.owner_name, c.due_date, c.status, c.meeting_id FROM rag.v_chat_commitments c "
            f"WHERE {' AND '.join(where)} ORDER BY c.created_at DESC, c.id ASC LIMIT {lim}"), a.args


def _f_find(p: FindCommitmentsParams, ctx: ToolContext, rows: list[dict[str, Any]]) -> tuple[str, str]:  # type: ignore[override]
    return f"{len(rows)} matching commitments", f"rows returned: {len(rows)} (limit {p.limit}), newest first\n{_rows_body(rows, ctx.tz, p.limit)}"


TOOLS: dict[str, ToolSpec] = {t.name: t for t in (
    ToolSpec("count_commitments",
             "Counts commitments. open = status is not completed (FULFILLED) or cancelled; overdue = open AND the due date's "
             "calendar date in the team timezone is before today; completed = FULFILLED. Optional owner and due-date filters.",
             CountCommitmentsParams, _b_count, _f_count),                                       # type: ignore[arg-type]
    ToolSpec("list_overdue_commitments",
             "Lists overdue commitments (open AND due date before today in the team timezone), oldest due first.",
             ListOverdueParams, _b_overdue, _f_overdue),                                        # type: ignore[arg-type]
    ToolSpec("commitment_completion_rate",
             "Completion rate = completed (FULFILLED) / all non-cancelled commitments whose due date falls in the range.",
             CompletionRateParams, _b_rate, _f_rate),                                           # type: ignore[arg-type]
    ToolSpec("top_owners_by_open_commitments",
             "Ranks people by number of open commitments (status not completed/cancelled), most first.",
             TopOwnersParams, _b_top, _f_top),                                                  # type: ignore[arg-type]
    ToolSpec("meeting_count",
             "Counts meetings (excluding cancelled/failed) scheduled within the range, by team-timezone calendar date.",
             MeetingCountParams, _b_meetings, _f_meetings),                                     # type: ignore[arg-type]
    ToolSpec("find_commitments",
             "Finds commitments by owner and/or text match, newest first. Current status is read live.",
             FindCommitmentsParams, _b_find, _f_find),                                          # type: ignore[arg-type]
)}


def validate_call(tool: str, params: dict[str, Any]) -> tuple[ToolSpec, BaseModel]:
    spec = TOOLS.get(tool)
    if spec is None:
        raise ToolParamError(f"unknown tool {tool!r}")
    try:
        return spec, spec.model.model_validate(params)
    except ValidationError as exc:
        raise ToolParamError(f"invalid parameters for {tool}: {exc.errors()[0]['loc']}") from None


def can_resolve(tool: str, params: dict[str, Any]) -> bool:
    try:
        validate_call(tool, params)
        return True
    except ToolParamError:
        return False


async def run_tool(store: Any, spec: ToolSpec, params: BaseModel, ctx: ToolContext, *, timeout_ms: int) -> AnalyticsResult:
    sql, args = spec.build(params, ctx)
    rows = await store.run_analytics(ctx.team_id, sql, args, timeout_ms)
    rows = rows[: spec.max_rows]
    summary, body = spec.fmt(params, ctx, rows)
    text = f"metric: {spec.name}\ndefinition: {spec.definition}\nas of: {_asof(ctx)}\n{body}"
    return AnalyticsResult(tool=spec.name, params=_json_params(params), as_of=ctx.as_of.isoformat(),
                           definition=spec.definition, summary=summary, rows=rows, text=text)
