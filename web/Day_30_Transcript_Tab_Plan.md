# Day 30 — Meeting Transcript Tab
## Industry-Grade, Virtualized, Production-Ready Build Plan
> Senior Frontend Architecture Edition | Next.js 14 · React · TanStack Virtual
> Fonts: **Inter** (UI/body) + **Plus Jakarta Sans** (headings/display)
> Document: DAY-30-FE-PLAN | Version 1.0

---

## 1. Why This Day Is Hard (and Why It Matters)

A transcript is the single heaviest data-rendering surface in the whole app — 500 to 1500+ DOM rows of text, rendered inside a tab that a user might flip into and out of a dozen times per session. Get this wrong and you get:

- Janky scroll (dropped frames, layout thrash)
- Memory bloat (thousands of mounted nodes)
- Search that feels "laggy" because every keystroke triggers a network call
- A flash-of-wrong-content (FOWC) when meetings aren't processed yet

Get it right and it becomes the **reference implementation** for every future dense-list surface in the product (Commitments, Action Items, Notifications feed, Audit log). That's the actual ROI of today: we're not just shipping a transcript viewer, we're shipping `VirtualList.tsx` — a platform primitive.

---

## 2. Design Tokens & Typography System

```
FONT ROLES
─────────────────────────────────────────────────────────────────
Plus Jakarta Sans  → Display / Headings / Tab labels / Empty-state titles
                      Weight: 600 (semibold) for headings, 500 for tab labels
Inter               → Body text / transcript turns / search input / metadata
                      Weight: 400 body, 500 speaker names, 600 match counters
                      Inter is chosen for transcript BODY specifically because
                      its tabular numerals + high x-height keep mm:ss timestamps
                      and dense paragraphs legible at 13–14px for long reading.

next/font/google or self-hosted (perf):
  Inter:            400, 500, 600  (variable font preferred → next/font/local)
  Plus Jakarta Sans: 500, 600, 700

CSS variables (globals.css):
  --font-sans:    'Inter', system-ui, sans-serif;        /* body */
  --font-display: 'Plus Jakarta Sans', 'Inter', sans-serif; /* headings */

Tailwind config:
  fontFamily: {
    sans:    ['var(--font-sans)'],
    display: ['var(--font-display)'],
  }
```

### Type Scale for This Screen

| Element | Font | Size | Weight | Line-height | Color token |
|---|---|---|---|---|---|
| Tab label "Transcript" | display | 14px | 500 | 1.2 | `text-foreground` |
| Empty state title | display | 18px | 600 | 1.3 | `text-foreground` |
| Empty state body | sans | 14px | 400 | 1.5 | `text-muted-foreground` |
| Speaker name | sans | 13px | 600 | 1.3 | `text-foreground` |
| Timestamp (mm:ss) | sans (tabular-nums) | 11px | 500 | 1 | `text-muted-foreground` |
| Turn body text | sans | 14px | 400 | 1.6 | `text-foreground/90` |
| Search input | sans | 14px | 400 | 1 | `text-foreground` |
| Match counter "3 of 47" | sans (tabular-nums) | 12px | 600 | 1 | `text-muted-foreground` |
| "External participant" badge | sans | 11px | 500 | 1 | `text-muted-foreground` |

`tabular-nums` is non-negotiable on timestamps and match counters — without it, digits shift width as they change and the UI visibly jitters during search cycling.

---

## 3. File & Component Structure

```
app/(dashboard)/meetings/[meetingId]/transcript/
├── page.tsx                          ← RSC: gate on meeting.status, fetch transcript
└── loading.tsx                       ← Skeleton matching real row height (no CLS)

features/meetings/components/TranscriptViewer/
├── TranscriptViewer.tsx              ← Orchestrator: state, virtualization, search wiring
├── TranscriptTurn.tsx                ← Single row (memoized)
├── TranscriptSearch.tsx              ← Sticky search bar
├── TranscriptSearchHighlight.tsx     ← Substring highlight span
├── TranscriptSpeakerFilter.tsx       ← Dropdown filter
├── TranscriptEmptyState.tsx          ← Not-yet-processed guard
├── TranscriptJumpToTime.tsx          ← Scroll-to-index trigger from MeetingTimeline
├── TranscriptToolbar.tsx             ← Wraps Search + SpeakerFilter + turn count
└── useTranscriptSearch.ts            ← Hook: instant local match + debounced server search

features/meetings/hooks/
├── useTranscript.ts                  ← TanStack Query: fetch transcript by meetingId
└── useTranscriptScroll.ts            ← Imperative scroll-to-index controller (ref-based)

shared/components/data-display/
└── VirtualList.tsx                   ← GENERIC reusable virtualizer (zero transcript code)
```

**Hard rule:** `VirtualList.tsx` must compile and be useful with zero knowledge of "transcripts," "speakers," or "turns." It only knows `items`, `estimateSize`, `renderItem`, `overscan`. This is what makes it a platform primitive instead of throwaway code.

---

## 4. Component-by-Component Plan

### 4.1 `VirtualList.tsx` (the platform investment)

```tsx
interface VirtualListProps<T> {
  items: T[]
  estimateSize: (index: number) => number
  renderItem: (item: T, index: number) => React.ReactNode
  overscan?: number
  scrollRef?: React.RefObject<HTMLDivElement>   // exposed for imperative scrollToIndex
  getItemKey?: (item: T, index: number) => string | number
}
```

- Wraps `@tanstack/react-virtual`'s `useVirtualizer`.
- Exposes the virtualizer instance via a forwarded ref or callback so parents (TranscriptViewer) can call `scrollToIndex(i, { align: 'center', behavior: 'smooth' })`.
- `getItemKey` defaults to array index but accepts a stable key (turn id) to prevent remount flicker when the filtered array shrinks/grows.
- Absolute-positioned inner divs (`transform: translateY()`), never `top` (translateY is GPU-composited, avoids layout recalculation on every scroll frame).

**Microinteraction:** scroll container uses `scroll-behavior: smooth` only for *programmatic* jumps (search/jump-to-time), never for natural wheel/touch scroll — smooth-scrolling natural input feels sluggish and fights the user's hand.

### 4.2 `TranscriptTurn.tsx`

- `React.memo` with a custom comparator: only re-renders if `turn.id`, `isHighlighted`, or `searchQuery` (for highlight re-render) changes — NOT on every parent re-render during scroll.
- Layout: `Avatar (24px)` — `flex-col` block with `speaker name + timestamp` on one line, body text below, full width, no max-width chat-bubble constraint (reads like a document/transcript, not iMessage).
- Unresolved speaker (confidence < 0.8 per backend spec): avatar renders as a neutral dashed-ring placeholder + label "External participant" in muted tone — **never** guesses or silently mismatches a name. This is a trust-builder microinteraction: showing uncertainty honestly beats a confident wrong guess.
- Hover state: subtle `bg-muted/40` row tint + a ghost "copy turn" icon button fades in (opacity 0→100, 120ms) at the row's right edge — small affordance, doesn't fight scanning.

### 4.3 `TranscriptSearch.tsx` + `useTranscriptSearch.ts`

This is the **microinteraction-dense** part of the day.

```
INTERACTION DESIGN:
  Keystroke → instant client-side substring scan (≤150ms perceived latency, zero network)
            → updates match count immediately: "3 of 47" feel live, no spinner
  150ms debounce → if query.length >= 2, fire backend Atlas-Search call
            → server result silently reconciles/supersedes the local match list
              (handles fuzzy/stemmed matches the client can't compute, e.g.
               "finished" matching "finish")
  Enter      → jump to next match (wraps to first after last)
  Shift+Enter→ jump to previous match (wraps to last after first)
  Esc        → clear query, return focus to scroll container
  Cmd/Ctrl+F inside the panel → focuses search input (intercepted, doesn't open
               browser find) — power-user affordance matching the rest of the
               app's Cmd+K culture
```

- Sticky positioning: `sticky top-0 z-10` directly under the meeting tab bar, with a 1px bottom border that only appears once the list has scrolled under it (`box-shadow` driven by an `IntersectionObserver` sentinel, not a permanent border) — this is the same "scroll-aware elevation" pattern used in the dashboard Topbar.
- Match count uses `tabular-nums` and a **fade-not-jump** number transition (old count fades out 80ms, new fades in 80ms) — prevents the layout-jitter described in §2.
- Prev/next chevrons are disabled (not hidden) at 0 matches — disabled state communicates "feature exists, nothing to act on" rather than the UI rearranging itself.

### 4.4 `TranscriptSearchHighlight.tsx`

- Pure function component: splits turn text on the match substring (case-insensitive), wraps matched spans in `<mark>` styled with `bg-amber-200/40 text-foreground rounded-[2px] px-0.5` — **explicitly NOT** bright marker-yellow (per spec), stays inside the neutral/brand palette so it reads as "found" not "alarm."
- The **currently active** match (the one the viewer scrolled to) gets a stronger ring (`ring-1 ring-primary/50`) distinct from the other dimmer highlighted matches — this answers "where am I in my search" at a glance, a pattern borrowed from VS Code's find-in-file.

### 4.5 `TranscriptSpeakerFilter.tsx`

- `DropdownMenu` (shadcn, reused) listing every participant with their turn count badge: "Ahmed Hassan (42)" — the count itself is a microinteraction; it previews impact before you click, so filtering never feels like a gamble.
- Selecting a speaker filters the in-memory array (transcripts are fetched whole, never paginated, per existing data design) — filtering is instant, no loading state needed, which is itself the right UX: don't show a spinner for client-side work.
- Active filter renders as a dismissible `Badge` next to the search bar ("Ahmed Hassan ×") so the filtered state is never invisible/forgotten.

### 4.6 `TranscriptEmptyState.tsx`

- Triggered when `meeting.status !== 'DONE'` or `mongoTranscriptId` is null — **never** attempt the fetch in that case (no console error flash, no failed network request in DevTools).
- Display-font heading: "Transcript will appear once processing completes" + a small animated dot-pulse next to a `RECORDING`/`PROCESSING` status badge if applicable, reusing `StatusDot.tsx` from shared components — consistent with how bot status is shown elsewhere.
- If `status === 'FAILED'`: distinct copy + a "Retry processing" affordance (ADMIN-only), not the same passive message — failure and "still working" must never look identical to the user.

### 4.7 `TranscriptJumpToTime.tsx`

- Exposes an imperative `jumpToTime(seconds: number)` that binary-searches the turns array for the closest `start_time`, calls `virtualizer.scrollToIndex`, and triggers a 600ms "flash" highlight (background pulses once) on the landed row — gives clear visual confirmation of *where* you landed, since a virtualized jump with no feedback feels like nothing happened.
- Wired from `MeetingTimeline` (Day 29) via a shared callback prop passed down through `MeetingDetail`, never via global state — keeps the feature boundary intact (no cross-feature store coupling).

---

## 5. Performance Engineering Checklist

```
[ ] Only visible rows + overscan(8) are mounted — verified via React DevTools
    Profiler showing constant mounted-node count regardless of scroll position
[ ] translateY() positioning, not top/margin — verified zero layout thrashing
    in Chrome Performance tab during fast scroll
[ ] TranscriptTurn wrapped in memo with custom comparator — verified via
    "why did you render" / React DevTools highlight-updates
[ ] Search match computation runs on a single pass per keystroke, O(n) over
    turns array, never O(n²) (no re-scanning per render)
[ ] Avatars use next/image with a fixed 24x24 box — no CLS from late-loading images
[ ] Scroll container uses content-visibility: auto as a defense-in-depth layer
    underneath virtualization (helps if overscan is ever misconfigured)
[ ] Debounce timer cleared on unmount (no setState-after-unmount warning)
[ ] Speaker filter + search composed without double-filtering the full array
    twice per keystroke — single combined predicate function
```

---

## 6. Accessibility & Keyboard Map

| Key | Action |
|---|---|
| `/` or `Cmd/Ctrl+F` (while tab focused) | Focus search input |
| `Enter` | Next match |
| `Shift+Enter` | Previous match |
| `Esc` | Clear search, blur input |
| `↑` / `↓` (list focused) | Move focus one turn at a time, `aria-activedescendant` pattern |
| Screen reader | Each turn: `role="article"`, `aria-label="{speaker}, {timestamp}: {text}"`; search region: `aria-live="polite"` announces "3 of 47 matches" on change |

---

## 7. Micro-Interaction Inventory (Summary Table)

| Moment | Micro-interaction | Purpose |
|---|---|---|
| Typing in search | Instant local count, debounced server reconcile | Feels instant, stays accurate |
| Match found | Smooth scrollToIndex + active-match ring | Spatial confidence |
| Match count changes | Fade-out/fade-in digits (no jump) | No layout jitter |
| Row hover | Tint + ghost copy icon fade-in | Discoverable, not noisy |
| Unresolved speaker | Honest "External participant" badge | Trust over false confidence |
| Speaker filter applied | Dismissible badge chip | Filtered state never invisible |
| Jump-to-time | One-shot background flash on landed row | Confirms the jump worked |
| Search bar scroll-under | Shadow fades in via IntersectionObserver | Elevation only when needed |
| Empty/Failed state | Distinct copy + icon per state | Never conflate "waiting" with "broken" |

---

## 8. shadcn/ui Primitives Reused (No New Chrome Today)

```
ScrollArea     → consistent scrollbar styling, replaces native browser scrollbar
DropdownMenu   → speaker filter
Badge          → active filter chip, "External participant" label
Tooltip        → disabled-button explanations (e.g., 0 matches)
```

No new primitives are installed — today's complexity is virtualization engineering and interaction polish, not new design-system surface area.

---

## 9. End-of-Day Definition of Done

```
[ ] 500+ turn transcript scrolls at 60fps, bounded DOM node count (DevTools-verified)
[ ] Search: live local feedback + debounced server reconciliation working together
[ ] Enter/Shift+Enter cycles matches with wraparound; Esc clears cleanly
[ ] Active match visually distinct from other matches
[ ] Speaker filter narrows list without breaking virtualization math
[ ] Unresolved speakers always rendered distinctly, never misattributed
[ ] Empty/Processing/Failed states are visually distinct, zero failed-fetch flashes
[ ] Jump-to-time from MeetingTimeline lands correctly with flash feedback
[ ] VirtualList.tsx contains zero transcript-specific code (verified reusable)
[ ] Full keyboard map + screen reader labels verified
[ ] Inter (body) + Plus Jakarta Sans (headings) applied per token table in §2
```

---

*Document: DAY-30-FE-PLAN | Vocaply | Meeting Transcript Tab*
*Senior Frontend Architecture Edition | Virtualized · Accessible · Reusable*
