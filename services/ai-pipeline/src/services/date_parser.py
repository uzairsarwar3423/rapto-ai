import asyncio
import re
from datetime import datetime, timedelta
from typing import Optional
import pytz
from dateutil.relativedelta import relativedelta
from pathlib import Path
import structlog

from src.models.common import TaskType
from src.models.date_models import (
    DateParseRequest, DateParseResult, DateResolutionStatus,
    TemporalExpressionType, DateParseModelResponse
)
from src.config.date_config import (
    REGEX_PATTERNS, AMBIGUOUS_EXPRESSIONS, SPRINT_EXPRESSIONS,
    EOD_HOUR, EOD_MINUTE, NEXT_WEEKDAY_OFFSET_WEEKS,
    SAME_DAY_THRESHOLD_HOURS, WORKING_DAYS, MAX_ABSOLUTE_DATE_FUTURE_MONTHS
)
from src.services.openai_client import OpenAIClient
from src.models.exceptions import AIPipelineError

log = structlog.get_logger(__name__)

class PromptLoadError(AIPipelineError):
    pass

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
try:
    _DATE_PARSE_SYSTEM_PROMPT = (PROMPTS_DIR / "date_parse_system.txt").read_text(encoding="utf-8")
    _first_line = _DATE_PARSE_SYSTEM_PROMPT.split('\n')[0]
    DATE_PARSE_PROMPT_VERSION = _first_line.strip() if _first_line.startswith("# prompt_version:") else "date-parse-v1.0"
except Exception as e:
    raise PromptLoadError(f"Failed to load date parse prompt: {e}")

WEEKDAYS = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
MONTHS = {"january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12}

def _to_utc(local_dt: datetime, tz_str: str) -> datetime:
    tz = pytz.timezone(tz_str)
    try:
        localized = tz.localize(local_dt, is_dst=None)
    except pytz.AmbiguousTimeError:
        log.warning("dst_ambiguity_detected", local_dt=local_dt.isoformat(), tz=tz_str)
        localized = tz.localize(local_dt, is_dst=False)
    except pytz.NonExistentTimeError:
        localized = tz.localize(local_dt + timedelta(hours=1))
    return localized.astimezone(pytz.UTC)

def resolve_next_weekday(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[datetime, float, str]:
    target_day = WEEKDAYS[match.group(1).lower()]
    meet_day = local_dt.weekday()
    week_start = local_dt - timedelta(days=meet_day)
    next_week_monday = week_start + timedelta(weeks=NEXT_WEEKDAY_OFFSET_WEEKS)
    target_date = next_week_monday + timedelta(days=target_day)
    return target_date.replace(hour=EOD_HOUR, minute=EOD_MINUTE), 0.95, "next_weekday"

def resolve_this_weekday(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[datetime, float, str]:
    target_day = WEEKDAYS[match.group(1).lower()]
    meet_day = local_dt.weekday()
    days_ahead = (target_day - meet_day) % 7
    if days_ahead == 0:
        return _apply_same_day_rule(local_dt)
    target_date = local_dt + timedelta(days=days_ahead)
    return target_date.replace(hour=EOD_HOUR, minute=EOD_MINUTE), 0.95, "this_weekday"

def resolve_by_weekday(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[datetime, float, str]:
    target_day = WEEKDAYS[match.group(1).lower()]
    meet_day = local_dt.weekday()
    days_ahead = (target_day - meet_day) % 7
    if days_ahead == 0:
        dt, conf, note = _apply_same_day_rule(local_dt)
        return dt, 0.90, note
    target_date = local_dt + timedelta(days=days_ahead)
    return target_date.replace(hour=EOD_HOUR, minute=EOD_MINUTE), 0.90, "by_weekday"

def _apply_same_day_rule(local_dt: datetime) -> tuple[datetime, float, str]:
    hour_float = local_dt.hour + local_dt.minute / 60.0
    hours_left = max(0, EOD_HOUR - hour_float)
    if hours_left >= SAME_DAY_THRESHOLD_HOURS:
        return local_dt.replace(hour=EOD_HOUR, minute=EOD_MINUTE), 0.80, "same_day_rule_applied"
    target_date = local_dt + timedelta(weeks=1)
    return target_date.replace(hour=EOD_HOUR, minute=EOD_MINUTE), 0.80, "same_day_rule_shifted_next_week"

def resolve_end_of_week(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[datetime, float, str]:
    days_ahead = (4 - local_dt.weekday()) % 7
    if days_ahead == 0:
        return _apply_same_day_rule(local_dt)
    target_date = local_dt + timedelta(days=days_ahead)
    return target_date.replace(hour=EOD_HOUR, minute=EOD_MINUTE), 0.95, "end_of_week"

def resolve_end_of_month(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[datetime, float, str]:
    target_date = local_dt + relativedelta(day=31)
    return target_date.replace(hour=EOD_HOUR, minute=EOD_MINUTE), 0.95, "end_of_month"

def resolve_end_of_quarter(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[datetime, float, str]:
    q_month = ((local_dt.month - 1) // 3 + 1) * 3
    target_date = local_dt.replace(month=q_month) + relativedelta(day=31)
    return target_date.replace(hour=EOD_HOUR, minute=EOD_MINUTE), 0.95, "end_of_quarter"

def resolve_end_of_day(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[datetime, float, str]:
    return local_dt.replace(hour=EOD_HOUR, minute=EOD_MINUTE), 0.95, "end_of_day"

def resolve_noon(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[datetime, float, str]:
    return local_dt.replace(hour=12, minute=0), 0.95, "noon"

def resolve_5pm(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[datetime, float, str]:
    return local_dt.replace(hour=17, minute=0), 0.95, "5pm"

def _resolve_absolute_date_inner(month: int, day: int, local_dt: datetime) -> tuple[Optional[datetime], float, str]:
    year = local_dt.year
    try:
        target_date = datetime(year, month, day, EOD_HOUR, EOD_MINUTE)
    except ValueError:
        return None, 0.0, "invalid_calendar_date"
        
    if target_date < local_dt.replace(tzinfo=None):
        year += 1
        try:
            target_date = datetime(year, month, day, EOD_HOUR, EOD_MINUTE)
        except ValueError:
            return None, 0.0, "invalid_calendar_date"
        months_diff = (year - local_dt.year) * 12 + month - local_dt.month
        if months_diff > MAX_ABSOLUTE_DATE_FUTURE_MONTHS:
            return None, 0.0, "too_far_in_future"
        return target_date, 0.85, "shifted_to_next_year"
    return target_date, 0.95, "absolute_date"

def resolve_absolute_date_named(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[Optional[datetime], float, str]:
    month = MONTHS[match.group(1).lower()]
    day = int(match.group(2))
    return _resolve_absolute_date_inner(month, day, local_dt)

def resolve_absolute_date_named_inverse(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[Optional[datetime], float, str]:
    day = int(match.group(1))
    month = MONTHS[match.group(2).lower()]
    return _resolve_absolute_date_inner(month, day, local_dt)

def resolve_ordinal_date(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[Optional[datetime], float, str]:
    day = int(match.group(1))
    return _resolve_absolute_date_inner(local_dt.month, day, local_dt)

def resolve_tomorrow(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[datetime, float, str]:
    return (local_dt + timedelta(days=1)).replace(hour=EOD_HOUR, minute=EOD_MINUTE), 0.95, "tomorrow"

def resolve_in_n_days(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[datetime, float, str]:
    days = int(match.group(1))
    return (local_dt + timedelta(days=days)).replace(hour=EOD_HOUR, minute=EOD_MINUTE), 0.90, "in_n_days"

def resolve_in_n_business_days(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[datetime, float, str]:
    days_to_add = int(match.group(1))
    curr = local_dt
    while days_to_add > 0:
        curr += timedelta(days=1)
        if curr.weekday() in WORKING_DAYS:
            days_to_add -= 1
    return curr.replace(hour=EOD_HOUR, minute=EOD_MINUTE), 0.90, "in_n_business_days"

def resolve_after_meeting(match: re.Match, local_dt: datetime, _: str, req: DateParseRequest) -> tuple[datetime, float, str]:
    dur = req.meeting_duration_minutes
    if dur is None:
        return local_dt + timedelta(minutes=60), 0.60, "after_meeting_estimated"
    return local_dt + timedelta(minutes=dur), 0.80, "after_meeting_exact"

RESOLVERS = {
    "resolve_next_weekday": resolve_next_weekday,
    "resolve_this_weekday": resolve_this_weekday,
    "resolve_by_weekday": resolve_by_weekday,
    "resolve_end_of_week": resolve_end_of_week,
    "resolve_end_of_month": resolve_end_of_month,
    "resolve_end_of_quarter": resolve_end_of_quarter,
    "resolve_end_of_day": resolve_end_of_day,
    "resolve_noon": resolve_noon,
    "resolve_5pm": resolve_5pm,
    "resolve_absolute_date_named": resolve_absolute_date_named,
    "resolve_absolute_date_named_inverse": resolve_absolute_date_named_inverse,
    "resolve_ordinal_date": resolve_ordinal_date,
    "resolve_tomorrow": resolve_tomorrow,
    "resolve_in_n_days": resolve_in_n_days,
    "resolve_in_n_business_days": resolve_in_n_business_days,
    "resolve_after_meeting": resolve_after_meeting,
}

async def parse_date(request: DateParseRequest, openai_client: OpenAIClient) -> DateParseResult:
    raw = request.raw_expression
    normalized = raw.lower().strip()
    normalized = re.sub(r'[^\w\s]', ' ', normalized)
    normalized = ' '.join(normalized.split())
    
    if normalized in AMBIGUOUS_EXPRESSIONS:
        return DateParseResult(
            raw_expression=raw,
            status=DateResolutionStatus.AMBIGUOUS,
            expression_type=TemporalExpressionType.URGENCY_ONLY,
            resolved_datetime_utc=None,
            confidence=1.0,
            resolution_note=f"Layer 1: '{raw}' classified as AMBIGUOUS urgency expression",
            layer_used=1
        )
    if normalized in SPRINT_EXPRESSIONS:
        return DateParseResult(
            raw_expression=raw,
            status=DateResolutionStatus.SPRINT_RELATIVE,
            expression_type=TemporalExpressionType.SPRINT_MILESTONE,
            resolved_datetime_utc=None,
            confidence=1.0,
            resolution_note=f"Layer 1: '{raw}' classified as SPRINT_RELATIVE expression",
            layer_used=1
        )
        
    tz = pytz.timezone(request.team_timezone)
    local_dt = request.meeting_datetime_utc.astimezone(tz).replace(tzinfo=None)
    
    for entry in REGEX_PATTERNS:
        match = entry.pattern.match(normalized)
        if match:
            resolver = RESOLVERS[entry.resolver_name]
            target_dt_naive, conf, note = resolver(match, local_dt, normalized, request)
            if target_dt_naive is None:
                return DateParseResult(
                    raw_expression=raw,
                    status=DateResolutionStatus.UNRESOLVABLE,
                    expression_type=entry.expression_type,
                    resolved_datetime_utc=None,
                    confidence=0.0,
                    resolution_note=f"Layer 2 failed: {note}",
                    layer_used=2
                )
            utc_dt = _to_utc(target_dt_naive, request.team_timezone)
            return DateParseResult(
                raw_expression=raw,
                status=DateResolutionStatus.RESOLVED,
                expression_type=entry.expression_type,
                resolved_datetime_utc=utc_dt,
                confidence=conf,
                resolution_note=f"Layer 2: '{raw}' resolved as {note}",
                layer_used=2
            )
            
    weekday_name = local_dt.strftime("%A")
    meet_date_str = local_dt.strftime("%Y-%m-%d")
    meet_time_str = local_dt.strftime("%H:%M")
    
    user_prompt = (
        f"Expression: {raw}\n"
        f"Meeting date: {meet_date_str} ({weekday_name})\n"
        f"Team timezone: {request.team_timezone}\n"
        f"Local time at meeting: {meet_time_str}\n"
    )
    
    try:
        call_res = await openai_client.generate_structured(
            task_type=TaskType.DATE_PARSE,
            system_prompt=_DATE_PARSE_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_schema=DateParseModelResponse
        )
        model_res = call_res.data
        
        if model_res.is_ambiguous:
            return DateParseResult(
                raw_expression=raw,
                status=DateResolutionStatus.AMBIGUOUS,
                expression_type=TemporalExpressionType.URGENCY_ONLY,
                resolved_datetime_utc=None,
                confidence=1.0,
                resolution_note=f"Layer 3 (GPT-4.1 Mini): AMBIGUOUS ({model_res.resolution_note})",
                layer_used=3
            )
        if model_res.is_sprint_relative:
            return DateParseResult(
                raw_expression=raw,
                status=DateResolutionStatus.SPRINT_RELATIVE,
                expression_type=TemporalExpressionType.SPRINT_MILESTONE,
                resolved_datetime_utc=None,
                confidence=1.0,
                resolution_note=f"Layer 3 (GPT-4.1 Mini): SPRINT_RELATIVE ({model_res.resolution_note})",
                layer_used=3
            )
            
        if model_res.resolved_date:
            try:
                y, m, d = map(int, model_res.resolved_date.split("-"))
                target_naive = datetime(y, m, d, EOD_HOUR, EOD_MINUTE)
                if target_naive.date() < local_dt.date():
                    return DateParseResult(
                        raw_expression=raw,
                        status=DateResolutionStatus.UNRESOLVABLE,
                        expression_type=TemporalExpressionType.UNKNOWN,
                        resolved_datetime_utc=None,
                        confidence=0.0,
                        resolution_note=f"Layer 3: past date rejected",
                        layer_used=3
                    )
                utc_dt = _to_utc(target_naive, request.team_timezone)
                return DateParseResult(
                    raw_expression=raw,
                    status=DateResolutionStatus.RESOLVED,
                    expression_type=TemporalExpressionType.UNKNOWN,
                    resolved_datetime_utc=utc_dt,
                    confidence=min(0.90, model_res.confidence),
                    resolution_note=f"Layer 3 (GPT-4.1 Mini): resolved {model_res.resolution_note}",
                    layer_used=3
                )
            except ValueError:
                return DateParseResult(
                    raw_expression=raw,
                    status=DateResolutionStatus.UNRESOLVABLE,
                    expression_type=TemporalExpressionType.UNKNOWN,
                    resolved_datetime_utc=None,
                    confidence=0.0,
                    resolution_note=f"Layer 3: invalid date format",
                    layer_used=3
                )
                
        return DateParseResult(
            raw_expression=raw,
            status=DateResolutionStatus.UNRESOLVABLE,
            expression_type=TemporalExpressionType.UNKNOWN,
            resolved_datetime_utc=None,
            confidence=0.0,
            resolution_note=f"Layer 3: could not resolve",
            layer_used=3
        )
    except Exception as exc:
        log.error("layer_3_date_parse_failed", error=str(exc))
        return DateParseResult(
            raw_expression=raw,
            status=DateResolutionStatus.UNRESOLVABLE,
            expression_type=TemporalExpressionType.UNKNOWN,
            resolved_datetime_utc=None,
            confidence=0.0,
            resolution_note=f"Layer 3 error: {exc}",
            layer_used=3
        )

async def batch_parse_dates(requests: list[DateParseRequest], openai_client: OpenAIClient) -> list[DateParseResult]:
    tasks = []
    sem = asyncio.Semaphore(5)
    async def _do(req):
        async with sem:
            return await parse_date(req, openai_client)
    for r in requests:
        tasks.append(_do(r))
    return await asyncio.gather(*tasks)
