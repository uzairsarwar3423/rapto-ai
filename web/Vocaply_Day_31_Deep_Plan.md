# Vocaply — Day 31 Deep Build Plan
## Meeting Detail: Action Items Tab + Commitments Tab
> Senior Frontend Architecture Edition — Micro-interactions, Typography, Motion Physics, Component Contracts
> Continues from Day 30 (Transcript Tab). Same shell. Same primitives. Today: two new tabs, one reusable row primitive, the app's first optimistic mutation.

---

## 0. Typography System Locked Today (applies app-wide from this point forward)

```
FONT STACK:
  --font-sans:     "Inter", system-ui, sans-serif         ← UI chrome: labels, badges, buttons,
                                                              nav, table headers, metadata, kbd hints
  --font-display:  "Plus Jakarta Sans", "Inter", sans-serif  ← Headings only: PageHeader title,
                                                              Sheet titles, empty-state headline,
                                                              section labels ("Action Items", "Commitments")
  --font-mono:     "JetBrains Mono", "Geist Mono", monospace ← IDs, kbd shortcuts, confidence scores,
                                                              timestamps in transcript/timeline

WHY TWO FAMILIES, NOT ONE:
  Inter is engineered for UI density at small sizes (13–14px) — tight, neutral, no personality,
  exactly what a workspace tool needs for body/label text (this is what Linear, Notion's app shell,
  and Vercel dashboard all converge on).
  Plus Jakarta Sans is used ONLY for headings/titles — it has slightly more geometric character
  and warmth at 15–20px, giving the product a tiny bit of identity at the *page-title* level
  without ever touching density-critical UI text. This is the only place "personality" is allowed.
  Body text in Plus Jakarta Sans would feel slow to scan; headings in pure Inter would feel
  characterless. Split by job, not by preference.

SIZE SCALE (rem, 1rem = 16px base):
  text-xs    11px / 16px line-height   → badges, kbd, micro-labels, confidence %, timestamps
  text-sm    13px / 20px line-height   → DEFAULT UI text — row text, body, table cells, nav
  text-base  14px / 22px line-height   → emphasized row text (e.g. unread, primary column)
  text-lg    15px / 24px line-height   → PageHeader title, Sheet title (font-display, font-semibold)
  text-xl    18px / 28px line-height   → reserved for empty-state headline only (font-display)

WEIGHT RULES:
  font-display headings: 600 (semibold) — never 700/bold, never 400
  font-sans labels/active state: 500 (medium)
  font-sans body/default: 400 (regular)
  font-mono: 400 always, letter-spacing -0.01em (mono fonts run slightly wide by default)

TABULAR NUMBERS:
  Every numeric column (due dates, confidence %, counts) gets `font-variant-numeric: tabular-nums`
  so digits don't jitter/reflow when values change during optimistic updates — this single CSS
  rule is what makes the checkbox-toggle counter update (Day 31) feel stable instead of jumpy.
```

### Tailwind config additions today
```ts
// tailwind.config.ts — fontFamily block
fontFamily: {
  sans:    ['Inter', 'system-ui', 'sans-serif'],
  display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
  mono:    ['"JetBrains Mono"', '"Geist Mono"', 'monospace'],
}
```
Both fonts self-hosted via `next/font/google` (variable weight subset: Inter 400/500/600, Plus Jakarta Sans 600 only — we never need 700+ display weight, shipping fewer weights = smaller font payload, consistent with the "fast > beautiful" performance budget already set on Day 89's plan but front-loaded correctly here).

---

## 1. Why This Day Exists & Why It's Sequenced Here

Day 29 built the meeting detail **shell** (header + tabs that don't re-fetch). Day 30 proved the shell scales to the *heaviest* tab (virtualized transcript). Day 31 is deliberately the **lightest** tab content — small, scoped datasets (a single meeting's items, never hundreds) — which makes it the correct day to introduce the row primitive and the optimistic-mutation pattern *cheaply*, before those same primitives get stretched to team-wide scale on Days 33/36. Building complexity in this order (shell → heavy virtualization → light primitive+mutation → scaled-up reuse) means every later day is composition, not invention.

---

## 2. Files to Create — Full Tree

```
app/(dashboard)/meetings/[meetingId]/action-items/
  page.tsx
  loading.tsx

app/(dashboard)/meetings/[meetingId]/commitments/
  page.tsx
  loading.tsx

features/meetings/components/MeetingDetail/
  MeetingActionItemsTab.tsx
  MeetingCommitmentsTab.tsx
  MeetingDetailTabSection.tsx          ← NEW shared wrapper: header row + "View all" link + content slot

features/action-items/components/
  ActionItemRow.tsx
  ActionItemRowSkeleton.tsx
  ActionItemPriorityBadge.tsx
  ActionItemCompletedCheckbox.tsx
  ActionItemAssigneeAvatar.tsx
  ActionItemAssigneePopover.tsx        ← stub popover body (real assign logic Day 36)
  ActionItemEmptyState.tsx

features/commitments/components/
  CommitmentRow.tsx
  CommitmentRowSkeleton.tsx
  CommitmentStatusBadge.tsx
  CommitmentConfidenceDim.tsx          ← NEW tiny wrapper applying the opacity rule (see §6)
  CommitmentEmptyState.tsx

features/action-items/hooks/
  useMeetingActionItems.ts
  useToggleActionItemComplete.ts

features/commitments/hooks/
  useMeetingCommitments.ts

features/action-items/api/
  action-items.queries.ts
  action-items.mutations.ts

features/commitments/api/
  commitments.queries.ts               ← scaffold only, full contract Day 33

shared/lib/cache/
  query-keys.ts                        ← EXTEND: actionItems.byMeeting(), commitments.byMeeting()

shared/components/feedback/
  RowEmptyState.tsx                    ← NEW generic single-line empty-row primitive (reused by both tabs)
```

---

## 3. Component Contracts (props-first design, written before implementation)

Writing the prop signature before the JSX is what keeps the row reusable for Day 33/36 — if the contract is right today, nothing gets rewritten later, only extended.

```ts
// ActionItemRow.tsx
interface ActionItemRowProps {
  item: ActionItem
  showMeetingTitle?: boolean        // false today (scoped tab), true on Day 36's team-wide list
  density?: 'compact' | 'comfortable'  // 36px vs 44px — global density toggle hook reads from ui.store
  onToggleComplete: (id: string, completed: boolean) => void
  className?: string
}

// CommitmentRow.tsx
interface CommitmentRowProps {
  commitment: Commitment
  showMeetingTitle?: boolean
  showOwner?: boolean                // true on team-wide tracker, can be false on a "my commitments" filter later
  density?: 'compact' | 'comfortable'
  href: string                       // row is just a styled <Link>, no onClick navigation logic baked in
  className?: string
}
```

**Why `density` lives in props, not a CSS-only solution:** row height affects `estimateSize` math the moment these rows get dropped into `VirtualList` (Day 33+ at scale). Baking density as an explicit prop today means the virtualizer's size estimator can read the same source of truth later — no guessing row height from computed styles.

---

## 4. Micro-Interactions — Specified Per Element (this is the actual craft of the day)

### 4.1 Row hover (the single most-repeated interaction in the entire app)
```
Trigger:   mouseenter on row OR :focus-visible via keyboard Tab
Effect:    background-color transitions to var(--hover) — background + ~4% black/white overlay
Duration:  120ms ease-out
Cursor:    pointer (entire row, via the row being a single <Link>/<div role="button">)
NEVER:     border color change, scale, shadow — background-only, per neutral-color principle
Focus ring: 1px solid var(--ring), offset 2px, ONLY visible on :focus-visible (keyboard),
            never shown on mouse click (this distinction matters — mouse users don't need
            a ring, keyboard users absolutely do; use :focus-visible not :focus)
```

### 4.2 ActionItemCompletedCheckbox — the optimistic toggle, frame by frame
```
t=0ms     User clicks checkbox. event.stopPropagation() fires FIRST (prevents row nav).
t=0ms     Checkbox visually flips immediately (checked state is local optimistic state,
          driven by TanStack Query cache write, not a loading spinner).
t=0ms     Row text gets `line-through` + `text-muted-foreground` applied via a CSS class
          transition: 140ms ease-out on color + text-decoration-color (text-decoration-line
          itself can't transition, so we fade the decoration color from transparent → muted,
          giving the strikethrough a "draw-on" feel instead of an instant snap)
t=0ms     Checkbox itself: shadcn Checkbox's built-in check-mark SVG path draws in via its
          native data-state="checked" transition (140ms) — we do not override this, shadcn's
          default is already correct for our motion budget (opacity + tiny transform only)
t~200ms   Network responds. On success: nothing visibly changes (already correct). On error:
          checkbox flips back, strikethrough fades out (same 140ms reverse), AND a toast fires
          ("Couldn't update — try again") — the rollback uses the exact pre-mutation snapshot,
          never a hard refetch-and-flash
```
This is written as a literal timeline because optimistic UI lives or dies in these exact milliseconds — get the rollback transition wrong and it reads as a glitch instead of "the app recovering gracefully."

### 4.3 ActionItemPriorityBadge — hover reveal of detail
```
Default:    text badge, no fill (variant="outline"), e.g. "HIGH" in text-xs font-medium
Hover:      Tooltip (300ms open delay, matching Day 26's sidebar-tooltip delay for consistency)
            shows extracted detail: "Inferred from: 'this is urgent, need it by EOD'"
            — this is a trust-building micro-interaction: it shows the user WHY the AI
            picked this priority, without cluttering the row by default
```

### 4.4 ActionItemAssigneeAvatar → ActionItemAssigneePopover
```
Trigger:    click on avatar (stopPropagation, same row-nav-prevention rule as checkbox)
Open:       Popover, 100ms fade + 4px slide from the avatar's anchor point (not centered screen)
Content:    today = read-only "Assigned to {name}" + email, stub "Change assignee" button
            (disabled, tooltip "Coming soon" — Day 36 wires real reassignment)
Close:      click outside, Esc, or selecting (n/a today)
```

### 4.5 CommitmentConfidenceDim — the "AI wasn't sure" signal
```
Rule:       if commitment.confidenceScore < 0.7 → wrapping element gets opacity: 0.8
Transition: NONE on mount (this is a static state, not an interaction — applying a transition
            here would incorrectly imply something just changed)
Hover:      on row hover, dimmed rows return to opacity: 1 for the hover duration (120ms),
            so users can still read low-confidence text clearly while actively inspecting it —
            the dim is a passive scan-time signal, not a permanent readability tax
```

### 4.6 "View all →" link (MeetingDetailTabSection header)
```
Default:    text-sm text-muted-foreground, no underline
Hover:      underline appears (text-decoration-line transition is instant per 4.2's note,
            so we additionally nudge color from muted-foreground → foreground over 120ms,
            giving the hover state visible motion even though the underline itself snaps)
Arrow (→):  translates 2px to the right on hover, 120ms ease-out — the ONLY transform-based
            micro-interaction approved today, kept extremely subtle (2px, not 4–6px) because
            it's a tiny affordance hint, not a primary action
```

### 4.7 Tab content swap (Action Items ↔ Commitments ↔ Overview ↔ Transcript)
```
Because tabs are real routes (Day 29 decision), the "transition" is Next.js's own route
transition: NO custom fade/slide is added between tab content — adding one would fight
the browser's native back/forward feel and add perceived latency. The ONLY motion is the
per-tab Suspense fallback (Skeleton) appearing instantly with zero transition, then content
popping in with a single opacity 0→1, 140ms — consistent with the dashboard widget streaming
pattern from Day 27.
```

### 4.8 Empty state entrance
```
RowEmptyState / ActionItemEmptyState / CommitmentEmptyState: opacity 0 → 1, 160ms ease-out,
NO translateY (a single line of centered muted text doesn't need a slide-in — motion should
be proportional to the visual weight of what's appearing; over-animating a one-liner reads
as try-hard, violating "predictable > fancy")
```

---

## 5. State Management & Data Flow

```
Server (RSC) → page.tsx fetches scoped data (action items / commitments WHERE meetingId=X)
            → passed as `initialData` prop into client component
Client      → useMeetingActionItems(meetingId) / useMeetingCommitments(meetingId)
            → TanStack Query, key: queryKeys.actionItems.byMeeting(meetingId)
            → initialData hydrates instantly (zero loading flash on first paint)
            → staleTime: 30s (matches existing cache-config tier for "frequently updated" data)

Mutation    → useToggleActionItemComplete()
            → onMutate: queryClient.setQueryData(byMeeting key, optimistic flip)
                         ALSO writes through to queryKeys.actionItems.all(teamId) if that
                         cache entry exists (cross-cache consistency — same multi-surface
                         write pattern that Day 35 scales up for commitments)
            → onError:  rollback via the snapshot returned from onMutate
            → onSettled: invalidate byMeeting + all (cheap, scoped dataset, safe to refetch)
```

**Why write to multiple cache keys instead of one global invalidate:** an `invalidateQueries` alone would cause a refetch-triggered flash on the row a half-second after the optimistic flip already showed it correctly — defeats the purpose of optimism. Direct multi-key writes keep every surface visually correct *immediately*, with invalidation only as a background consistency check, not the primary update mechanism.

---

## 6. Visual Spec — Exact Tokens Per Element

```
ROW (ActionItemRow / CommitmentRow):
  height:        36px (compact) / 44px (comfortable)
  padding-x:     12px
  gap:           10px between sub-elements
  border-bottom: 1px solid var(--border)   ← rows form a list via borders, NOT individual cards
  font:          font-sans text-sm (13px) text-foreground

CHECKBOX:
  size:          16px (shadcn default, unscaled — do not enlarge, matches row density)

PRIORITY BADGE:
  variant:       outline, text-xs, px-1.5 py-0, rounded-sm (4px — NOT pill-rounded, workspace
                 tools use slightly-rounded rectangles for badges, not full pills, to feel
                 denser/more technical than a consumer app)
  color map:     LOW = text-muted-foreground / border-border
                 MEDIUM = text-foreground / border-border
                 HIGH = text-foreground / border-foreground/40  (slightly stronger border only)
                 URGENT = text-foreground / border-foreground/40 + font-medium (weight bump,
                          NOT a color or fill change — urgency is communicated via weight/contrast,
                          never via red, per neutral-color principle)

STATUS BADGE (Commitment):
  PENDING:    text-muted-foreground, border-border
  FULFILLED:  text-foreground, border-border  (NOT green — success is quiet here)
  MISSED:     text-foreground, border-foreground/40, font-medium (same weight-bump urgency
              technique as URGENT priority — consistent grammar across both badge types)
  DEFERRED:   text-muted-foreground, border-border, includes a small ↻ glyph prefix
  CANCELLED:  text-muted-foreground/60, border-border, line-through on the badge label itself

DUE DATE TEXT:
  default:       text-muted-foreground, font-mono text-xs, tabular-nums
  overdue:       text-foreground (NOT red) + a single small dot prefix in text-foreground —
                 urgency via contrast increase, not color, identical philosophy to badges above

AVATAR:
  size:          20px in dense rows (smaller than the 24px used in Transcript turns on Day 30,
                 because action item rows have more horizontal competition for space)
  fallback:      initials, font-display (the ONE place font-display appears outside headings —
                 initials benefit from the slightly warmer geometric letterforms at tiny size)
```

---

## 7. Files in Full — What Each One Actually Does

**`MeetingDetailTabSection.tsx`** (new shared wrapper, the day's key abstraction)
A thin layout component: `<header>` row with `font-display text-sm font-medium` label (left) + the "View all →" link (right, §4.6 micro-interaction) + a content `<div>` below. Both `MeetingActionItemsTab` and `MeetingCommitmentsTab` render *into* this wrapper rather than duplicating the header-row layout — one file owns that layout decision, period.

**`ActionItemEmptyState.tsx` / `CommitmentEmptyState.tsx`**
Both compose `RowEmptyState` (new generic primitive: centered, single muted line, optional sub-line) with feature-specific copy. No icon, no illustration — text only, per the existing platform-wide empty-state rule, but today it's promoted to a *shared* primitive so Day 33/36's fuller empty states (which DO get a CTA button) extend the same base component instead of forking it.

**`useMeetingActionItems.ts` / `useMeetingCommitments.ts`**
Thin TanStack Query wrappers. No filters, no pagination params (scoped dataset is always small — a single meeting rarely produces more than ~15 action items or commitments). This intentional simplicity is what makes Day 33/36's far more complex hooks (filters, cursor pagination, counts) feel like genuine *additions* rather than rewrites of this file.

---

## 8. Accessibility Pass (built in today, not bolted on later)

```
- Every row: role="link" via real <Link>, NOT a div with onClick — screen readers and
  Cmd+click-to-open-in-new-tab both work for free this way
- Checkbox: real <input type="checkbox"> under shadcn's hood — already has correct
  aria-checked semantics, we add aria-label="Mark '{item.text}' as complete"
- Priority/Status badges: aria-label includes the full word ("Priority: High"), not just
  the visual abbreviation, for screen-reader clarity
- Confidence dim (§4.5): purely visual — NEVER convey confidence via opacity alone for
  accessibility; a visually-hidden <span> additionally states "Low confidence extraction"
  on low-confidence rows, read by screen readers even though sighted users only see the dim
- Focus order: checkbox → row link → assignee avatar → badge (tab order matches visual
  left-to-right order exactly, no tabindex tricks)
```

---

## 9. Performance Notes

- Both tabs fetch via RSC `page.tsx` with `initialData` — **zero client-side loading spinner on first visit**, only on subsequent client-side filter/refetch (which doesn't exist yet today, arrives Day 33).
- `ActionItemRowSkeleton` / `CommitmentRowSkeleton` are pixel-matched to the real row's exact height (36/44px) and column proportions, so `loading.tsx` never causes a layout shift on hydration — same discipline as every prior day's skeleton work.
- No `VirtualList` needed today (datasets are small) — but `ActionItemRow`/`CommitmentRow` are built with zero assumptions about their parent container, so dropping them into a `VirtualList` on Day 33/36 requires no row-level changes, only a wrapping change at the list level.

---

## 10. End-of-Day Checklist

**Functional**
- [ ] Both tabs render scoped-only data (cross-meeting leak test: open two meetings, verify no item bleed)
- [ ] Checkbox toggle updates instantly, rolls back cleanly on simulated 500 error, toast fires correctly
- [ ] Checkbox + avatar clicks never trigger row navigation (`stopPropagation` verified via DevTools event log)
- [ ] "View all →" links resolve to correct routes even though destinations are partially stubbed
- [ ] Empty states render with zero console errors on a freshly-extracted meeting with no items

**Typography**
- [ ] `font-display` (Plus Jakarta Sans) appears ONLY on: tab section labels, Sheet/empty-state headlines, avatar initials — nowhere else
- [ ] All numeric values (due dates, counts) use `tabular-nums`, verified no digit jitter on toggle
- [ ] Font files load via `next/font`, zero FOUT/FOIT flash on first paint (network throttle test)

**Micro-interactions**
- [ ] Row hover background transition measured at ~120ms, no scale/shadow/border-color present anywhere
- [ ] Focus ring appears on Tab-key navigation, absent on mouse click (`:focus-visible` confirmed via DevTools)
- [ ] Strikethrough fade-in/out on checkbox toggle confirmed smooth at both 1x and reduced-motion settings
- [ ] Confidence-dim rows return to full opacity on hover, confirmed readable
- [ ] "View all →" arrow nudges exactly 2px on hover — measured, not eyeballed

**Accessibility**
- [ ] Screen reader announces checkbox state changes correctly (tested with VoiceOver/NVDA)
- [ ] Low-confidence visually-hidden label present and read correctly
- [ ] Full keyboard traversal of both tabs possible with zero mouse use

**Architecture / Reuse Readiness**
- [ ] `ActionItemRow`/`CommitmentRow` prop contracts confirmed sufficient for Day 33/36 (no anticipated breaking changes)
- [ ] `density` prop wired through but defaulted to `compact` — comfortable mode untested today, deferred to settings work
- [ ] `MeetingDetailTabSection` confirmed reusable shape (no action-items-specific logic leaked into it)

---

*Document: BUILD-PLAN-DAY-31-DEEP | Vocaply | Version 1.0*
*Track: Core Frontend Dashboard (Phase 3) | Typography + Micro-interaction Specification Edition*
