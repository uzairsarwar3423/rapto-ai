import re
from typing import Callable, NamedTuple
from src.models.date_models import TemporalExpressionType

EOD_HOUR: int = 18
EOD_MINUTE: int = 0
NOON_HOUR: int = 12
MORNING_HOUR: int = 9

SAME_DAY_THRESHOLD_HOURS: int = 4
NEXT_WEEKDAY_OFFSET_WEEKS: int = 1
MAX_ABSOLUTE_DATE_FUTURE_MONTHS: int = 18

WORKING_DAYS: set[int] = {0, 1, 2, 3, 4}  # Mon-Fri (0-4)

AMBIGUOUS_EXPRESSIONS: frozenset[str] = frozenset([
    "asap", "a.s.a.p", "a.s.a.p.", "soon", "as soon as possible",
    "quickly", "right away", "immediately", "at the earliest",
    "at your earliest convenience", "when you can", "whenever possible",
    "urgently"
])

SPRINT_EXPRESSIONS: frozenset[str] = frozenset([
    "end of sprint", "end of the sprint", "before the sprint ends",
    "this sprint", "next sprint", "before the release", "before go-live",
    "before launch", "before the launch", "before the deadline"
])

class PatternEntry(NamedTuple):
    pattern: re.Pattern
    expression_type: TemporalExpressionType
    resolver_name: str
    confidence: float

REGEX_PATTERNS: list[PatternEntry] = [
    # RELATIVE_WEEKDAY
    PatternEntry(
        pattern=re.compile(r"^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$", re.IGNORECASE),
        expression_type=TemporalExpressionType.RELATIVE_WEEKDAY,
        resolver_name="resolve_next_weekday",
        confidence=0.95
    ),
    PatternEntry(
        pattern=re.compile(r"^this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$", re.IGNORECASE),
        expression_type=TemporalExpressionType.RELATIVE_WEEKDAY,
        resolver_name="resolve_this_weekday",
        confidence=0.95
    ),
    PatternEntry(
        pattern=re.compile(r"^(?:by|on|by next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$", re.IGNORECASE),
        expression_type=TemporalExpressionType.RELATIVE_WEEKDAY,
        resolver_name="resolve_by_weekday",
        confidence=0.90
    ),
    
    # RELATIVE_PERIOD
    PatternEntry(
        pattern=re.compile(r"^(?:by\s+)?(?:end of week|eow)$", re.IGNORECASE),
        expression_type=TemporalExpressionType.RELATIVE_PERIOD,
        resolver_name="resolve_end_of_week",
        confidence=0.95
    ),
    PatternEntry(
        pattern=re.compile(r"^(?:by\s+)?(?:end of month|eom)$", re.IGNORECASE),
        expression_type=TemporalExpressionType.RELATIVE_PERIOD,
        resolver_name="resolve_end_of_month",
        confidence=0.95
    ),
    PatternEntry(
        pattern=re.compile(r"^(?:by\s+)?(?:end of quarter|eoq)$", re.IGNORECASE),
        expression_type=TemporalExpressionType.RELATIVE_PERIOD,
        resolver_name="resolve_end_of_quarter",
        confidence=0.95
    ),
    PatternEntry(
        pattern=re.compile(r"^(?:by\s+)?(?:end of day|eod|today)$", re.IGNORECASE),
        expression_type=TemporalExpressionType.RELATIVE_PERIOD,
        resolver_name="resolve_end_of_day",
        confidence=0.95
    ),
    
    # RELATIVE_TIME
    PatternEntry(
        pattern=re.compile(r"^(?:by|before)\s+noon(?:time)?$", re.IGNORECASE),
        expression_type=TemporalExpressionType.RELATIVE_TIME,
        resolver_name="resolve_noon",
        confidence=0.95
    ),
    PatternEntry(
        pattern=re.compile(r"^(?:by|before)\s+5pm$", re.IGNORECASE),
        expression_type=TemporalExpressionType.RELATIVE_TIME,
        resolver_name="resolve_5pm",
        confidence=0.95
    ),

    # ABSOLUTE_DATE
    PatternEntry(
        pattern=re.compile(r"^by\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?$", re.IGNORECASE),
        expression_type=TemporalExpressionType.ABSOLUTE_DATE,
        resolver_name="resolve_absolute_date_named",
        confidence=0.95
    ),
    PatternEntry(
        pattern=re.compile(r"^by\s+(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)$", re.IGNORECASE),
        expression_type=TemporalExpressionType.ABSOLUTE_DATE,
        resolver_name="resolve_absolute_date_named_inverse",
        confidence=0.95
    ),

    # ORDINAL_DATE
    PatternEntry(
        pattern=re.compile(r"^by\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)$", re.IGNORECASE),
        expression_type=TemporalExpressionType.ORDINAL_DATE,
        resolver_name="resolve_ordinal_date",
        confidence=0.90
    ),

    # RELATIVE_OFFSET
    PatternEntry(
        pattern=re.compile(r"^tomorrow$", re.IGNORECASE),
        expression_type=TemporalExpressionType.RELATIVE_OFFSET,
        resolver_name="resolve_tomorrow",
        confidence=0.95
    ),
    PatternEntry(
        pattern=re.compile(r"^(?:in|within)\s+(\d+)\s+days?(?:\s+from\s+now)?$", re.IGNORECASE),
        expression_type=TemporalExpressionType.RELATIVE_OFFSET,
        resolver_name="resolve_in_n_days",
        confidence=0.90
    ),
    PatternEntry(
        pattern=re.compile(r"^(?:in|within)\s+(\d+)\s+(?:business|working)\s+days?$", re.IGNORECASE),
        expression_type=TemporalExpressionType.RELATIVE_OFFSET,
        resolver_name="resolve_in_n_business_days",
        confidence=0.90
    ),

    # MEETING_REFERENCE
    PatternEntry(
        pattern=re.compile(r"^(?:after|by end of)\s+(?:this\s+)?meeting$", re.IGNORECASE),
        expression_type=TemporalExpressionType.MEETING_REFERENCE,
        resolver_name="resolve_after_meeting",
        confidence=0.80
    )
]
