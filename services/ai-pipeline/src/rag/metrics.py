"""
rag/metrics.py
───────────────
Tiny dependency-free metrics registry (counters + histograms) rendered in the
Prometheus text format by the authenticated GET /api/v1/embeddings/metrics.

Why not prometheus_client: no metrics stack exists in this service yet, and a
second /metrics scrape surface would need its own auth. If the platform adopts
OpenTelemetry later, only this module changes — call sites use inc()/observe().

LABEL RULES (§9): never team_id or other high-cardinality labels.
"""

from __future__ import annotations

import threading
from collections import defaultdict
from typing import Iterable

_LATENCY_BUCKETS = (0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0)

LabelKey = tuple[tuple[str, str], ...]


def _key(labels: dict[str, str] | None) -> LabelKey:
    return tuple(sorted((labels or {}).items()))


def _fmt(name: str, key: LabelKey, extra: tuple[tuple[str, str], ...] = ()) -> str:
    pairs = (*key, *extra)
    if not pairs:
        return name
    inner = ",".join(f'{k}="{str(v).replace(chr(34), chr(39))}"' for k, v in pairs)
    return f"{name}{{{inner}}}"


class Registry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: dict[str, dict[LabelKey, float]] = defaultdict(lambda: defaultdict(float))
        self._hist: dict[str, dict[LabelKey, list[float]]] = defaultdict(dict)
        self._gauges: dict[str, dict[LabelKey, float]] = defaultdict(lambda: defaultdict(float))

    def inc(self, name: str, value: float = 1.0, **labels: str) -> None:
        with self._lock:
            self._counters[name][_key(labels)] += value

    def set_gauge(self, name: str, value: float, **labels: str) -> None:
        with self._lock:
            self._gauges[name][_key(labels)] = value

    def observe(self, name: str, value: float, **labels: str) -> None:
        with self._lock:
            series = self._hist[name].setdefault(
                _key(labels), [0.0] * (len(_LATENCY_BUCKETS) + 2)   # buckets…, +Inf, sum
            )
            for i, bound in enumerate(_LATENCY_BUCKETS):
                if value <= bound:
                    series[i] += 1
            series[len(_LATENCY_BUCKETS)] += 1        # +Inf == count
            series[len(_LATENCY_BUCKETS) + 1] += value

    def counter_value(self, name: str, **labels: str) -> float:
        with self._lock:
            return self._counters[name].get(_key(labels), 0.0)

    def reset(self) -> None:
        with self._lock:
            self._counters.clear()
            self._hist.clear()
            self._gauges.clear()

    def render(self) -> str:
        lines: list[str] = []
        with self._lock:
            for name in sorted(self._counters):
                lines.append(f"# TYPE {name} counter")
                lines += [f"{_fmt(name, k)} {v}" for k, v in sorted(self._counters[name].items())]
            for name in sorted(self._gauges):
                lines.append(f"# TYPE {name} gauge")
                lines += [f"{_fmt(name, k)} {v}" for k, v in sorted(self._gauges[name].items())]
            for name in sorted(self._hist):
                lines.append(f"# TYPE {name} histogram")
                for k, s in sorted(self._hist[name].items()):
                    for i, bound in enumerate(_LATENCY_BUCKETS):
                        lines.append(f"{_fmt(name + '_bucket', k, (('le', str(bound)),))} {s[i]}")
                    n = len(_LATENCY_BUCKETS)
                    lines.append(f"{_fmt(name + '_bucket', k, (('le', '+Inf'),))} {s[n]}")
                    lines.append(f"{_fmt(name + '_sum', k)} {s[n + 1]}")
                    lines.append(f"{_fmt(name + '_count', k)} {s[n]}")
        return "\n".join(lines) + "\n"


metrics = Registry()


def inc_all(name: str, items: Iterable[tuple[str, float]], label: str = "outcome") -> None:
    for outcome, value in items:
        if value:
            metrics.inc(name, value, **{label: outcome})
