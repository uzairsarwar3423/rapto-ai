"""Staging smoke run: N questions through the BFF (or the AI service directly), measuring time-to-first-event and TTFT.

    CHAT_SMOKE_URL=https://staging/chat/query CHAT_SMOKE_JWT=<service jwt> python scripts/chat_smoke.py [questions.json]

Gate (plan §1.3): time-to-first-event p95 < 300 ms; TTFT p50 <= 2.5 s and p95 <= 5 s. It also prints the event order of
every request so a buffering proxy (events arriving all at once at the end) is visible: `spread_ms` ~ 0 means BUFFERED.
Costs real model tokens; run on staging only. Exit code 1 if a gate fails.
"""

from __future__ import annotations

import asyncio
import json
import os
import statistics
import sys
import time
import uuid

import httpx

DEFAULT_QUESTIONS = [
    "What were the key decisions in our last meeting?", "Which commitments are overdue?", "Summarize last week's meetings.",
    "What did the team agree about the launch date?", "Who owns the most open commitments?",
    "What blockers were raised recently?", "How many meetings did we have last month?", "What is the status of our billing work?",
    "What risks were discussed in the last retro?", "Draft a short follow-up about open action items.",
]


async def one(client: httpx.AsyncClient, url: str, jwt: str, q: str) -> dict:
    t0 = time.monotonic()
    events: list[tuple[str, float]] = []
    async with client.stream("POST", url, headers={"Authorization": f"Bearer {jwt}"},
                             json={"message": q, "client_message_id": str(uuid.uuid4())}) as r:
        if r.status_code != 200:
            return {"q": q, "status": r.status_code, "error": (await r.aread()).decode()[:200]}
        name = ""
        async for line in r.aiter_lines():
            if line.startswith("event: "):
                name = line[7:]
                events.append((name, (time.monotonic() - t0) * 1000))
    first = events[0][1] if events else None
    ttft = next((t for n, t in events if n == "token"), None)
    return {"q": q, "status": 200, "first_event_ms": first, "ttft_ms": ttft, "order": [n for n, _ in events if n != "token"],
            "spread_ms": (events[-1][1] - events[0][1]) if events else 0, "final": events[-1][0] if events else None}


def pct(values: list[float], p: float) -> float:
    s = sorted(values)
    return s[min(len(s) - 1, int(round(p * (len(s) - 1))))]


async def main() -> int:
    url, jwt = os.environ["CHAT_SMOKE_URL"], os.environ["CHAT_SMOKE_JWT"]
    questions = json.loads(open(sys.argv[1], encoding="utf-8").read()) if len(sys.argv) > 1 else DEFAULT_QUESTIONS
    async with httpx.AsyncClient(timeout=60) as client:
        results = [await one(client, url, jwt, q) for q in questions]
    ok = [r for r in results if r["status"] == 200 and r["ttft_ms"] is not None]
    for r in results:
        print(json.dumps(r, ensure_ascii=False))
    if not ok:
        print("no successful answers")
        return 1
    fe, tt = [r["first_event_ms"] for r in ok], [r["ttft_ms"] for r in ok]
    report = {"first_event_p95_ms": pct(fe, 0.95), "ttft_p50_ms": statistics.median(tt), "ttft_p95_ms": pct(tt, 0.95),
              "buffered_suspects": [r["q"] for r in ok if r["spread_ms"] < 50]}
    print(json.dumps(report, indent=2))
    gates = report["first_event_p95_ms"] < 300 and report["ttft_p50_ms"] <= 2500 and report["ttft_p95_ms"] <= 5000
    return 0 if gates and not report["buffered_suspects"] else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
