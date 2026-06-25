# Vocaply — Day 33 Deep Build Plan
## Commitments Tracker: List, Filters, Status Tabs (Segmented Navigation)
> Senior Frontend Architecture Edition — Segmented Control Mechanics, URL-State Patterns, Density-at-Scale
> Continues from Day 32 (Add Meeting + Realtime). Today: the team-wide tracker — Vocaply's actual core screen.

---

## 0. Typography Carried Forward (no new rules — applied to today's new surfaces)

```
--font-sans:    "Inter"              → tab labels, filter pill text, table header, row text,
                                        owner names, empty-state body, OverdueAlert copy
--font-display: "Plus Jakarta Sans"  → PageHeader title ("Commitments") ONLY — the segmented
                                        tabs, filter bar, and list are all functional chrome,
                                        not editorial, so display font stops at the page title,
                                        identical discipline to Day 32's form
--font-mono:    "JetBrains Mono"     → tab count badges ("(7)"), confidence-bucket labels in
                                        the Select ("≥0.7"), due-date text, tabular-nums on
                                        every numeric value so counts don't jitter on filter change

NEW RULE TODAY: SegmentedTabs labels use font-sans font-medium text-sm for the ACTIVE tab,
                font-sans font-normal text-sm text-muted-foreground for inactive tabs — weight
                shift (not color-block shift) is what communicates "selected," consistent with
                the badge-urgency-via-weight technique established Day 31.
```

---

## 1. Why Today Is the Most Important UI Day So Far

Every prior day (26–32) built *infrastructure* — shell, dashboard, meetings list, detail, transcript, forms, realtime. Today builds the screen the product is actually *for*. Commitments are Vocaply's differentiator (per the platform's own positioning docs: "no competitor connects 'Ahmed promised X' to 'Ahmed finished X'"), so this tracker has to feel meaningfully faster and denser than a generic CRUD list — it's the screen a manager opens every single morning. The single new interaction pattern introduced today — **status as a segmented control rather than a checkbox filter** — exists because status here isn't "one filter among many," it's the primary mental model users navigate by (Linear's "Todo / In Progress / Done" tabs are the direct reference point, not Jira's sidebar-of-filters approach).

---

## 2. Files to Create — Full Tree

```
app/(dashboard)/commitments/
  page.tsx
  loading.tsx
  error.tsx

features/commitments/components/
  CommitmentTracker/
    CommitmentTracker.tsx
    CommitmentTrackerSkeleton.tsx
  CommitmentStatusTabs.tsx
  CommitmentFilters.tsx
  CommitmentFilters/
    OwnerFilterPopover.tsx
    DateRangeFilterPopover.tsx
    ConfidenceFilterSelect.tsx
  CommitmentList/
    CommitmentList.tsx
    CommitmentListHeader.tsx
  CommitmentEmptyState.tsx
  OverdueAlert.tsx

features/commitments/hooks/
  useCommitments.ts
  useCommitmentFilters.ts
  useCommitmentCounts.ts

shared/components/data-display/
  SegmentedTabs.tsx
  SegmentedTabsItem.tsx                ← split out for the count-badge micro-interaction (see §4.1)

shared/lib/cache/
  query-keys.ts                        ← EXTEND: commitments.counts(teamId), commitments.list(teamId, filters)
```

---

## 3. Component Contracts

```ts
// SegmentedTabs.tsx — fully generic, zero commitments knowledge
interface SegmentedTabsProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  items: { value: T; label: string; count?: number }[]
  className?: string
}
// Internally: a single <div role="tablist"> of <button role="tab"> elements — NOT shadcn's
// underline-style Tabs component re-skinned; built from scratch on plain buttons because the
// segmented "pill group with one active fill" look has no clean shadcn primitive to extend
// without fighting its default underline/indicator-line assumptions.

// CommitmentStatusTabs.tsx — thin domain wrapper around SegmentedTabs
interface CommitmentStatusTabsProps {
  activeStatus: CommitmentStatusFilter   // 'ALL' | CommitmentStatus
  counts: Record<CommitmentStatusFilter, number> | undefined  // undefined while loading
  onChange: (status: CommitmentStatusFilter) => void
}

// useCommitmentFilters.ts — single source of truth for ALL filter state, URL-synced
interface CommitmentFiltersState {
  status: CommitmentStatusFilter
  ownerIds: string[]
  from?: string
  to?: string
  confidenceMin?: 0.5 | 0.7 | 0.9
}
function useCommitmentFilters(): {
  filters: CommitmentFiltersState
  setStatus: (s: CommitmentStatusFilter) => void
  setOwnerIds: (ids: string[]) => void
  setDateRange: (from?: string, to?: string) => void
  setConfidenceMin: (v?: number) => void
  clearFilter: (key: keyof CommitmentFiltersState) => void   // powers FilterPill's × button
  activeFilterCount: number   // drives a "Clear all" link's visibility
}
```

**Why `SegmentedTabs` is generic over `T extends string` instead of hardcoded to commitment statuses:** Day 36's Action Items module needs an identical visual/interaction pattern (`All / Open / Completed`), and a future Analytics filter set needs the same shape for time-grain selection (`Week / Month / Quarter`). Writing the generic version today — even though only one caller exists — means tomorrow's callers cost zero new component code, only a new `items` array.

---

## 4. Micro-Interactions — Specified Per Element

### 4.1 SegmentedTabs — the active-state transition (the day's signature interaction)
```
VISUAL MODEL: a single continuous track (rounded-md container, var(--surface) background,
              1px border) containing N buttons. The ACTIVE button gets a solid background
              (var(--background), i.e. "lifted" relative to the track) + a subtle 1px border —
              it looks like a raised pill sitting inside a recessed track, the exact visual
              grammar of macOS segmented controls and Linear's own status switcher.

TRANSITION:   When switching tabs, the "lifted" background does NOT instantly jump from the
              old active button to the new one — it ANIMATES across via a single absolutely-
              positioned <span> element (the "thumb") that translates its X position and width
              to match the newly-active button's bounding box, 160ms ease-out (measured via
              getBoundingClientRect on each item, recalculated on resize). This is the ONE
              transform-based animation this week with more than a 2–4px travel distance,
              justified because it's the page's primary navigation control and deserves a
              moment of visible continuity — users should perceive "the selection moved from
              here to there," not "this tab vanished, that one appeared."
              Implementation note: respects prefers-reduced-motion — under that setting, the
              thumb snaps instantly with zero transition, no exceptions.

COUNT BADGE:  the "(7)" inside each SegmentedTabsItem renders in font-mono text-xs, color
              tied to active/inactive state identically to the label (weight/color shift, never
              a filled circle badge — keeping the segmented control's silhouette clean, no
              competing visual elements inside an already-dense control). When a count CHANGES
              (e.g. marking a commitment fulfilled moves it out of Pending's count), the new
              number does NOT animate/count-up — it swaps instantly, because count-up animations
              on small integer deltas (7→6) read as gimmicky rather than informative; the
              meaningful feedback already happened on the row itself (Day 35's optimistic flip)
HOVER:        inactive tabs get a barely-there background tint (var(--hover) at half the normal
              row-hover opacity) on mouse hover only — kept extremely subtle so it never competes
              visually with the active-tab "lifted" treatment
KEYBOARD:     Left/Right arrow keys move focus + selection between tabs when the tablist has
              focus (native ARIA tablist pattern — automatic activation on arrow press, not
              requiring a separate Enter), Home/End jump to first/last tab
```

### 4.2 Owner FilterPopover — avatar-based multi-select
```
TRIGGER:      a small button "Owner" (+ count badge if ≥1 selected, e.g. "Owner (2)") — text-sm,
              outline style matching Day 28's status-filter trigger exactly for grammar consistency
OPEN:         Popover, 100ms fade + 4px slide (the platform-standard popover entrance, unchanged)
LIST ROWS:    each team member: Checkbox + 20px Avatar + name, 32px row height (slightly denser
              than the 36px commitment rows, since this is a compact picker, not a primary list)
SELECT:       clicking anywhere on the row (not just the checkbox) toggles it — same whole-row-
              click-target principle as every list in the app, applied even inside a small popover
SEARCH:       if team size >8, an inline text input appears at the top of the popover (auto-
              focused on open) filtering the list client-side as-you-type — no debounce needed
              since this is an in-memory filter over an already-fetched, small team-member array
FOOTER:       "Apply" is NOT a separate button — selections apply live as checkboxes toggle
              (consistent with the URL-synced filter philosophy: there's no "draft" filter state
              to confirm, every checkbox click immediately updates the URL and refetches)
```

### 4.3 ConfidenceFilterSelect — bucket presets, not a slider
```
A plain shadcn Select with three options (≥0.5 obvious-only is the default unselected state,
≥0.7, ≥0.9) — deliberately NOT a range slider component this early, because a slider implies
continuous precision the underlying data/product doesn't need yet (the backend already buckets
confidence into qualitative tiers in its own scoring rubric), and a slider control is harder to
keyboard-operate precisely than a Select's native arrow-key option cycling. "Predictable > fancy"
applied directly: three labeled buckets beat a slippery slider handle.
```

### 4.4 FilterPill removal — the × micro-interaction
```
Reused verbatim from Day 28, but today exercised across THREE different filter types (owner,
date, confidence) simultaneously — the visual contract must hold regardless of filter type:
each pill is text-xs, rounded-sm, border, with a small × icon (12px) at the trailing edge.
Hover on the × specifically: background tint appears ONLY behind the × glyph (a tiny 16x16
hit-target highlight), not the whole pill — so users can see precisely what they're about to
remove without the entire pill appearing "armed." Click removes that single filter, URL updates,
list refetches — no confirmation needed (filters are trivially reversible, unlike the destructive
actions from Day 31/35 which DO require confirmation).
```

### 4.5 "Clear all" — appears only when earned
```
A small text-link (same grammar as "View all →") appears immediately to the right of the
FilterPill row, but ONLY when activeFilterCount >= 2 — a single active filter doesn't need a
"clear all" escape hatch (removing the one pill IS clearing all), so the link's appearance
threshold is intentional, not "show whenever any filter exists." Entrance: opacity 0→1, 120ms,
no slide (it's a small inline text element, not worth a translateY per Day 31's "motion
proportional to visual weight" rule).
```

### 4.6 OverdueAlert — sticky strip mechanics
```
POSITION:    sticky, top: 0 relative to the scrollable content area (NOT the page/viewport —
             it scrolls away with the Topbar reference frame intact, sitting just below
             CommitmentFilters, above CommitmentListHeader)
APPEARANCE:  height 0→auto transition (160ms, same justified-height-transition exception as
             Day 32's PlanLimitBanner — both are rare, important, state-driven appearances)
CONTENT:     text-sm, single line: a small dot (text-foreground, not red) + "3 commitments are
             overdue" + "View →" link (jumps tab via the SAME setStatus('MISSED') call the
             SegmentedTabs itself uses — literally calling the same state setter, not a separate
             navigation path, guaranteeing the alert and the tab control can never disagree
             about what "View" means)
DISMISSAL:   no manual dismiss (×) — the alert is purely derived from data state (overdue count
             > 0 AND current tab === 'ALL'), so it disappears automatically and correctly the
             moment either condition becomes false; adding a manual dismiss would create a
             confusing state ("I dismissed it but there are still 3 overdue") that contradicts
             the data, so it's deliberately omitted
```

### 4.7 CommitmentListHeader — sticky column header
```
Sticky directly above the list rows (top offset = OverdueAlert's height when present, 0
otherwise — computed via a CSS custom property updated in a layout effect, not hardcoded,
since the alert's presence is conditional). Column labels: Status / Text / Owner / Due / Meeting
— text-xs font-medium text-muted-foreground, uppercase tracking-wide (the ONE place uppercase
+ letter-spacing is used in the whole app, reserved exclusively for table/list column headers,
a convention borrowed directly from Linear/Notion's table headers to visually demote header
labels below row content without needing a heavier visual treatment).
NO sort-click affordance on headers today (per the spec's explicit decision to encode the
single accountability-first order as the only order) — headers are labels, not buttons, this
week; cursor stays default (not pointer) on the header row specifically, an intentional signal
that these aren't interactive yet.
```

### 4.8 List → empty-state transition
```
When a filter change results in zero rows, CommitmentEmptyState doesn't replace the list with
a jarring snap — the existing rows fade out (opacity 1→0, 100ms, fast because they're leaving)
and the empty state fades in immediately after (no overlap, sequential not simultaneous, since
crossfading a real list with placeholder empty-state text would look like a glitch). This
sequencing happens automatically via TanStack Query's `isFetching` + `data.length === 0` combo
already producing a brief blank frame — we just style that blank frame's transition deliberately
rather than leaving it to default instant swap.
```

### 4.9 Cursor pagination — "Load 20 more"
```
Reused verbatim from Day 28's CursorPagination component, but today's specific behavior note:
clicking it does NOT scroll the viewport at all — new rows append below the current scroll
position and the button itself shifts down with them, staying exactly where a thumb/cursor
already is for rapid repeated clicking. This is a deliberate non-decision (no smooth-scroll-to-
new-content effect) because auto-scrolling on pagination is a common anti-pattern that
disorients users mid-scan; doing nothing extra IS the correct behavior here.
```

---

## 5. URL State Shape (the contract every component reads/writes through)

```
/commitments?status=PENDING&ownerIds=usr_01,usr_02&from=2026-06-01&to=2026-06-30&confidenceMin=0.7

- status: defaults to 'ALL' when absent (not written to URL when ALL, keeping the default
  URL clean: /commitments with no query string at all in the common case)
- ownerIds: comma-joined, absent when empty
- from/to: ISO date strings, both required together or both absent (never one without the other)
- confidenceMin: numeric string, absent when at the default bucket

ALL reads/writes funnel through useCommitmentFilters — no component anywhere calls
useSearchParams/useRouter directly for this page, exactly mirroring Day 28's useMeetingFilters
discipline, now proven out a second time at a more complex (4-dimension) filter shape.
```

---

## 6. Data Flow

```
page.tsx (RSC)
  → reads searchParams, builds filters object server-side
  → fetches first page of commitments + counts in PARALLEL (Promise.all, no waterfall)
  → passes both as initialData into CommitmentTracker (client)

CommitmentTracker (client)
  → useCommitmentFilters() reads current URL state
  → useCommitments(filters) → cursor-paginated TanStack Query, key includes full filters object
    (query-keys.ts factory ensures filter-shape changes produce a genuinely new cache entry,
    never a stale collision between e.g. "Pending, no owner filter" and "Pending, owner=X")
  → useCommitmentCounts(teamId) → SEPARATE lightweight query, NOT derived from the list query —
    counts must reflect ALL commitments regardless of which status tab/filters are currently
    applied to the list (the tab badges show totals across all statuses simultaneously), so this
    is intentionally an independent aggregate endpoint call, cached 30s per the cache-config tier
    already defined for "frequently updated, cheap to refetch" data
```

---

## 7. Visual Spec — Exact Tokens

```
SEGMENTED TABS TRACK:
  height:        32px
  padding:       2px (track inset, so the "lifted" active pill has breathing room)
  border-radius: 8px (track), 6px (active thumb — slightly smaller radius nested inside,
                 standard nested-radius convention so the thumb doesn't visually clip the track)
  background:    var(--surface)
  border:        1px var(--border)

ACTIVE THUMB:
  background:    var(--background)
  border:        1px var(--border)
  no shadow      (a shadow here would be the one gradient-adjacent decoration this week —
                 explicitly avoided per "almost no gradients/no loud chrome" rule)

FILTER BAR:
  height:        40px row, gap-2 between filter triggers
  trigger style: outline button, text-sm, h-8, px-2.5 — visually lighter/smaller than primary
                 buttons elsewhere (filters are secondary actions, sized accordingly)

LIST HEADER:
  height:        32px (shorter than the 36px rows below it — headers are label rows, not data
                 rows, and the 4px difference subtly demotes it without needing extra styling)
  text:          text-xs font-medium uppercase tracking-wide text-muted-foreground

OVERDUE ALERT:
  background:    var(--surface)
  padding:       8px 16px
  border-bottom: 1px var(--border)
```

---

## 8. Accessibility Pass

```
- SegmentedTabs: role="tablist" on container, role="tab" + aria-selected on each button,
  arrow-key navigation per the native ARIA tabs pattern (NOT a custom keydown reimplementation
  — using the standard pattern means assistive tech already knows how to announce it correctly)
- Owner filter popover: checkboxes have real <label>, popover itself is aria-labelledby the
  trigger button's text ("Owner")
- OverdueAlert: role="status" (informational, not role="alert" — it's persistent ambient
  information about existing data, not a one-time urgent interruption)
- List header: NOT marked up as a <button>/interactive element anywhere (no sort yet), so no
  aria-sort or role override needed — plain <div role="row"> with text children is correct
  for this week's non-interactive header
- Empty state: heading-level text uses a real semantic element (e.g. <p> with appropriate
  visual weight, not a literal <h2>, since it's not a true document heading — avoids polluting
  the page's heading outline for screen-reader users navigating by headings)
```

---

## 9. Performance Notes

- `useCommitmentCounts` is deliberately decoupled from the main list query so switching tabs/filters never triggers a count refetch — counts stay stable and only refresh on their own 30s interval or after a mutation invalidates them (Day 35's optimistic mutations specifically target this cache key on settle).
- `SegmentedTabs`' thumb-position measurement (`getBoundingClientRect`) runs inside a `useLayoutEffect`, not `useEffect` — guarantees the thumb position is correct before the browser paints, preventing a one-frame flash of the thumb in its old position when switching tabs.
- The default sort (server-encoded, no client sort logic) means the list component does zero client-side array sorting — every row arrives from the API already in final display order, keeping `CommitmentList` a pure render-what-you're-given component.

---

## 10. End-of-Day Checklist

**Functional**
- [ ] Status tab counts match actual filtered results exactly (cross-check count badge vs. manual count of an unfiltered tab)
- [ ] Switching tabs updates URL; browser back button returns to the prior tab/filter combination correctly
- [ ] Owner filter + status tab compose correctly (AND logic, verified with 2+ filters simultaneously active)
- [ ] Default sort order matches spec exactly: Missed → Pending by due date ascending → rest by recency
- [ ] OverdueAlert hides itself the instant the active tab becomes 'MISSED'
- [ ] Empty state copy is genuinely per-status (verified all 5 status variants + the All-tab/new-team variant)
- [ ] List performance acceptable at 200+ rows (cursor pagination confirmed via DOM node count, never a full mount)

**Typography**
- [ ] font-display appears only on the page's "Commitments" PageHeader title
- [ ] All tab labels, filter text, headers in font-sans; counts and due dates in font-mono with tabular-nums
- [ ] Column header uppercase + tracking-wide style confirmed unique to this context (not bleeding into other text)

**Micro-interactions**
- [ ] SegmentedTabs thumb animates position+width smoothly between all 5 tab combinations, no flicker, no stale frame
- [ ] Thumb snaps instantly under prefers-reduced-motion, verified via OS setting toggle
- [ ] Count badge swaps instantly on data change, no count-up animation present
- [ ] FilterPill × hover highlight scoped to the icon only, not the full pill
- [ ] "Clear all" link appears only at 2+ active filters, confirmed at the 1-filter boundary
- [ ] OverdueAlert height-transition settles without content jump

**Accessibility**
- [ ] SegmentedTabs fully operable via arrow keys + Home/End, verified with screen reader announcing selection changes
- [ ] Owner popover checkboxes individually labeled and announced correctly
- [ ] OverdueAlert announced as status (not alert) by screen reader

**Architecture / Reuse Readiness**
- [ ] `SegmentedTabs` confirmed generic — zero commitment-specific strings/logic inside the primitive itself
- [ ] `useCommitmentFilters` confirmed to be the sole read/write path for URL state (grep for stray `useSearchParams` calls in this feature)
- [ ] `CommitmentRow` (from Day 31) required zero modifications to function correctly inside today's full cursor-paginated list

---

*Document: BUILD-PLAN-DAY-33-DEEP | Vocaply | Version 1.0*
*Track: Core Frontend Dashboard (Phase 3) | Segmented Navigation + Multi-Dimension Filter Specification Edition*
