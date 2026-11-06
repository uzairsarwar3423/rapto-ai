"""
services/chat/date_ranges.py
────────────────────────────
Deterministic natural-language DATE RANGE resolver in the TEAM's timezone.

The model never resolves relative dates: the rewriter only copies the user's raw phrase
("last week") and this module turns it into [from, to]. Day 51's `date_parser` resolves deadline
INSTANTS ("by Friday") with an LLM fallback — a different problem — so ranges live here.

CONVENTIONS (echoed to the UI in the `status` detail so a misread is visible and correctable):
  * weeks are CALENDAR weeks starting MONDAY ("last week" = the previous Mon–Sun)
  * "last <weekday>" = the most recent such weekday strictly BEFORE today
  * "last N days/weeks/months" are ROLLING windows ending today, inclusive
  * a bare month name means the most recent such month not in the future
  * "last quarter"/"this quarter" are calendar quarters
"""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Callable, Optional

CONVENTION = "calendar weeks start Monday; rolling windows end today"

_MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}
_MONTHS.update({m.lower(): i for i, m in enumerate(calendar.month_abbr) if m})
_MONTHS["sept"] = 9
_WEEKDAYS = {d.lower(): i for i, d in enumerate(calendar.day_name)}
_WEEKDAYS.update({d.lower(): i for i, d in enumerate(calendar.day_abbr)})
_NUMWORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
             "eight": 8, "nine": 9, "ten": 10, "fourteen": 14, "thirty": 30, "sixty": 60, "ninety": 90}
_MAX_ROLLING_DAYS = 3 * 366


@dataclass(frozen=True)
class DateRange:
    date_from: date
    date_to: date
    label: str                    # the phrase that matched, lower-cased
    convention: str = CONVENTION

    def as_detail(self) -> dict[str, str]:
        return {"from": self.date_from.isoformat(), "to": self.date_to.isoformat(), "label": self.label,
                "convention": self.convention}


def _month_range(year: int, month: int) -> tuple[date, date]:
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def _quarter_start(d: date) -> date:
    return date(d.year, 3 * ((d.month - 1) // 3) + 1, 1)


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    idx = year * 12 + (month - 1) + delta
    return idx // 12, idx % 12 + 1


def _n(token: str) -> Optional[int]:
    token = token.lower()
    return int(token) if token.isdigit() else _NUMWORDS.get(token)


def _last_weekday(today: date, weekday: int) -> date:
    delta = (today.weekday() - weekday) % 7
    return today - timedelta(days=delta or 7)


Handler = Callable[[re.Match[str], date], Optional[tuple[date, date]]]


def _rolling(m: re.Match[str], today: date) -> Optional[tuple[date, date]]:
    n = _n(m.group("n"))
    if n is None or n <= 0:
        return None
    unit = m.group("unit").lower().rstrip("s")
    days = {"day": n, "week": n * 7, "month": n * 30, "year": n * 365}[unit]
    if days > _MAX_ROLLING_DAYS:
        return None
    return today - timedelta(days=days - 1), today


def _named_month(m: re.Match[str], today: date) -> Optional[tuple[date, date]]:
    month = _MONTHS.get(m.group("month").lower())
    if month is None:
        return None
    year = int(m.group("year")) if m.groupdict().get("year") else (today.year if month <= today.month else today.year - 1)
    return _month_range(year, month)


def _named_day(m: re.Match[str], today: date) -> Optional[tuple[date, date]]:
    month = _MONTHS.get(m.group("month").lower())
    if month is None:
        return None
    day = int(m.group("day"))
    year = int(m.group("year")) if m.groupdict().get("year") else (today.year if (month, day) <= (today.month, today.day) else today.year - 1)
    try:
        d = date(year, month, day)
    except ValueError:
        return None
    return d, d


def _iso(m: re.Match[str], today: date) -> Optional[tuple[date, date]]:
    try:
        d = date(int(m.group("y")), int(m.group("mo")), int(m.group("d")))
    except ValueError:
        return None
    return d, d


_MONTH_RE = r"(?P<month>january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)"
_NUM = r"(?P<n>\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|thirty|sixty|ninety)"

# Ordered most-specific first. (regex, handler)
_RULES: list[tuple[re.Pattern[str], Handler]] = [
    (re.compile(r"\b(?P<y>\d{4})-(?P<mo>\d{2})-(?P<d>\d{2})\b"), _iso),
    (re.compile(rf"\b(?:last|past|previous)\s+{_NUM}\s+(?P<unit>days?|weeks?|months?|years?)\b", re.I), _rolling),
    (re.compile(rf"\b{_MONTH_RE}\.?\s+(?P<day>\d{{1,2}})(?:st|nd|rd|th)?(?:,?\s+(?P<year>\d{{4}}))?\b", re.I), _named_day),
    (re.compile(rf"\b(?P<day>\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?{_MONTH_RE}\.?(?:,?\s+(?P<year>\d{{4}}))?\b", re.I), _named_day),
    (re.compile(rf"\b(?:in|during|for|of)\s+{_MONTH_RE}(?:\s+(?P<year>\d{{4}}))?\b", re.I), _named_month),
    (re.compile(r"\b(?:the\s+day\s+before\s+yesterday)\b", re.I), lambda m, t: (t - timedelta(days=2),) * 2),  # type: ignore[arg-type,return-value]
    (re.compile(r"\byesterday\b", re.I), lambda m, t: (t - timedelta(days=1),) * 2),  # type: ignore[arg-type,return-value]
    (re.compile(r"\btoday\b", re.I), lambda m, t: (t, t)),
    (re.compile(r"\b(?:last|previous)\s+(?P<wd>monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b", re.I),
     lambda m, t: (_last_weekday(t, _WEEKDAYS[m.group("wd").lower()]),) * 2),  # type: ignore[return-value]
    (re.compile(r"\blast\s+week\b", re.I), lambda m, t: (t - timedelta(days=t.weekday() + 7), t - timedelta(days=t.weekday() + 1))),
    (re.compile(r"\bthis\s+week\b", re.I), lambda m, t: (t - timedelta(days=t.weekday()), t)),
    (re.compile(r"\blast\s+month\b", re.I), lambda m, t: _month_range(*_shift_month(t.year, t.month, -1))),
    (re.compile(r"\bthis\s+month\b", re.I), lambda m, t: (date(t.year, t.month, 1), t)),
    (re.compile(r"\blast\s+quarter\b", re.I),
     lambda m, t: (_quarter_start(_quarter_start(t) - timedelta(days=1)), _quarter_start(t) - timedelta(days=1))),
    (re.compile(r"\bthis\s+quarter\b", re.I), lambda m, t: (_quarter_start(t), t)),
    (re.compile(r"\blast\s+year\b", re.I), lambda m, t: (date(t.year - 1, 1, 1), date(t.year - 1, 12, 31))),
    (re.compile(r"\bthis\s+year\b", re.I), lambda m, t: (date(t.year, 1, 1), t)),
]


def resolve(text: str, as_of: datetime) -> Optional[DateRange]:
    """Find the first recognizable date phrase in `text` and resolve it against `as_of` (team-local)."""
    if not text:
        return None
    today = as_of.date()
    best: Optional[tuple[int, DateRange]] = None
    for pattern, handler in _RULES:
        m = pattern.search(text)
        if not m:
            continue
        rng = handler(m, today)
        if rng is None:
            continue
        lo, hi = rng
        if lo > hi:
            continue
        cand = DateRange(lo, hi, " ".join(m.group(0).lower().split()))
        if best is None or m.start() < best[0]:
            best = (m.start(), cand)
    return best[1] if best else None


def intersect(a: tuple[date, date] | None, b: tuple[date, date] | None) -> tuple[Optional[tuple[date, date]], bool]:
    """UI scoping is the OUTER bound; an extracted range may only narrow it.
    Returns (range, empty). `empty=True` means the two ranges do not overlap (answer: explain, don't search)."""
    if a is None:
        return b, False
    if b is None:
        return a, False
    lo, hi = max(a[0], b[0]), min(a[1], b[1])
    if lo > hi:
        return None, True
    return (lo, hi), False
