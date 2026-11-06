# Chat analytics — metrics dictionary

Every analytics tool's definition below is **copied into the prompt source** (`definition:` line) together with an
`as of` timestamp in the team's timezone, so an answer states what was counted. Definitions are code
(`src/services/chat/analytics_tools.py`); this file is the human-readable copy and is checked against the tool list in CI.

Common rules: all dates are compared as **calendar dates in the team's timezone** (due dates are stored in UTC); every tool
reads only the `rag.v_chat_*` views (tenant predicate + column allow-list); an owner filter is a list of **resolved user ids**
(names are resolved against the roster first; an unknown name disables the tool instead of answering for everyone);
`limit` ≤ 50; statement timeout 2 s; at most 50 rows are formatted.

| tool | definition |
|---|---|
| `count_commitments` | Counts commitments. **open** = status is not `FULFILLED` or `CANCELLED`. **overdue** = open AND the due date's calendar date in the team timezone is *before today*. **completed** = `FULFILLED`. **all** = every status. Optional owner and due-date-range filters. |
| `list_overdue_commitments` | The overdue commitments (definition above), oldest due first. |
| `commitment_completion_rate` | `FULFILLED` ÷ all non-cancelled commitments **whose due date falls in the range** (no range = all with a due date). Commitments without a due date are excluded. *(Confirm with product: the original spec said completed ÷ (completed + open + overdue); overdue ⊂ open, so this is the same quantity, stated without double counting.)* |
| `top_owners_by_open_commitments` | People ranked by number of open commitments, most first (ties by name). |
| `meeting_count` | Meetings (excluding `CANCELLED`, `FAILED`) whose `scheduledAt` falls in the range, by team-timezone calendar date. |
| `find_commitments` | Commitments by owner and/or text (`ILIKE`, wildcards escaped), newest first. Current status is read live. |

**Overdue boundary example (Asia/Karachi, UTC+5), today = 2026-11-06:** due `2026-11-05T18:59Z` (= Nov 5, 23:59 PKT) is
overdue; due `2026-11-05T19:01Z` (= Nov 6, 00:01 PKT) is **not**. In UTC both would be Nov 5 and both overdue — which is
why the timezone comes from the signed claims, never a default. Pinned by `test_overdue_boundary_at_karachi_midnight_differs_from_utc`.

**Zero is an answer.** `count: 0` is a valid, citable result and never becomes the "nothing found" message.
