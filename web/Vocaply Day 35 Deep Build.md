# Vocaply — Day 35 Deep Build Plan
## Mark Fulfilled / Defer / Cancel Sheets + Full Optimistic Updates
> Senior Frontend Architecture Edition — Permission-Computed Menus, Multi-Surface Cache Writes, Destructive-Action Grammar
> Continues from Day 34 (Score Gauge + Timeline + Detail Page). Today closes the Commitments module: this is the day the product becomes a tool you *act* on, not just *read*.

---

## 0. Typography Carried Forward (no new rules — applied to today's new surfaces)

```
--font-sans:    "Inter"              → Sheet body copy, confirmation text, note input labels,
                                        DropdownMenu items, button labels, toast messages
--font-display: "Plus Jakarta Sans"  → Sheet titles ONLY ("Mark as fulfilled", "Defer
                                        commitment", "Cancel commitment") — same discipline as
                                        Day 32's AddMeetingSheet; nothing else in any of today's
                                        three sheets gets display treatment
--font-mono:    "JetBrains Mono"     → the date input's selected value, the "↻ ×1" deferred-
                                        count indicator's number, Kbd hints in sheet footers

NOTHING NEW TODAY — this is the cleanest possible signal that the typography system is
correctly finished: a day built entirely from sheets, menus, and mutations introduces zero new
font usage, because every surface type (Sheet, DropdownMenu, button, toast) was already given
its font rule on Days 26–34. Reuse, not reinvention, is itself the deliverable.
```

---

## 1. Why Today Is "Invisible Engineering Day"

Every prior day in this sprint shipped something visually new (a shell, a form, a gauge, a timeline). Today ships almost nothing *visually* new — three small sheets that look like every other sheet, a dropdown menu that looks like every other dropdown menu. The actual work is **correctness under permission logic and cache consistency**, which is invisible until it's wrong. A user who marks a commitment fulfilled from the tracker list should see it update on the detail page they had open in another tab, the meeting-scoped tab it originated from, and the score gauge on their own profile — all without a single manual refresh, and all rolling back cleanly if the network call fails. This is the day the app proves it's a real product and not a collection of screens that happen to share a design system.

---

## 2. Files to Create — Full Tree

```
features/commitments/components/
  MarkFulfilledSheet.tsx
  DeferSheet.tsx
  CancelCommitmentSheet.tsx
  CommitmentActionsMenu.tsx
  CommitmentRowQuickActions.tsx
  commitment-actions.permissions.ts    ← NEW: pure function, the single source of truth for
                                          "what actions are visible for this status+role"

features/commitments/hooks/
  useMarkFulfilled.ts
  useDeferCommitment.ts
  useCancelCommitment.ts
  useCommitmentMutationCache.ts        ← NEW: shared helper wrapping the multi-surface
                                          setQueriesData pattern, used by all three mutations

shared/lib/cache/
  query-keys.ts                        ← EXTEND: a matcher pattern so setQueriesData can target
                                          every cache entry containing a given commitment ID
                                          regardless of which filter/page it lives under
```

---

## 3. Component Contracts — Permission Logic First, UI Second

```ts
// commitment-actions.permissions.ts — pure, framework-agnostic, unit-testable without React
type CommitmentAction = 'MARK_FULFILLED' | 'DEFER' | 'CANCEL' | 'VIEW_HISTORY'

export function getAvailableActions(
  status: CommitmentStatus,
  currentUserRole: UserRole,
  currentUserId: string,
  ownerId: string
): CommitmentAction[] {
  // PENDING    → MARK_FULFILLED, DEFER, and CANCEL only if (role >= MANAGER || currentUserId === ownerId)
  // DEFERRED   → MARK_FULFILLED, and CANCEL under the same ownership/role rule
  // FULFILLED  → VIEW_HISTORY only
  // MISSED     → VIEW_HISTORY only
  // CANCELLED  → VIEW_HISTORY only
}

// CommitmentActionsMenu.tsx — the ONLY component that calls getAvailableActions for the
// detail-page kebab menu
interface CommitmentActionsMenuProps {
  commitment: Commitment
  onAction: (action: CommitmentAction) => void   // parent owns which Sheet opens
}

// CommitmentRowQuickActions.tsx — calls the SAME function, never re-derives its own subset
interface CommitmentRowQuickActionsProps {
  commitment: Commitment
  visible: boolean              // driven by row hover OR row focus-within, see §5.5
  onAction: (action: CommitmentAction) => void
}

// useCommitmentMutationCache.ts — the shared multi-surface write helper
function useCommitmentMutationCache() {
  return {
    patchCommitment: (id: string, patch: Partial<Commitment>) => void
    // internally: queryClient.setQueriesData with a predicate that matches ANY cached query
    // whose data is shaped as "a list/detail containing a commitment with this id" —
    // ONE function, called once per mutation, rather than three hand-written setQueryData
    // calls per mutation hook (tracker list key, detail key, meeting-scoped key)
    snapshotCommitment: (id: string) => CommitmentSnapshot  // for rollback
    restoreCommitment: (snapshot: CommitmentSnapshot) => void
  }
}
```

**Why `getAvailableActions` is a standalone pure function and not inline logic inside `CommitmentActionsMenu`:** the spec explicitly requires `CommitmentRowQuickActions` to "read the same allowed-action computation rather than re-deriving its own rules." The only way to *guarantee* that — not just convention, but structurally impossible to violate — is for both components to import the literal same function. If this logic lived as a `useMemo` inside the menu component, the row's quick-actions would inevitably drift out of sync the first time someone edits one without remembering the other.

**Why `useCommitmentMutationCache` exists as a separate hook rather than repeating the pattern three times:** the spec calls for "a single `queryClient.setQueriesData` pattern... not three separate manual cache writes" — but it also needs that pattern reused identically by `useMarkFulfilled`, `useDeferCommitment`, and `useCancelCommitment`. Extracting it once means a bug fix to the cache-matching predicate (e.g., if a new surface like Day 37's `MemberRow` later needs to show commitment status too) happens in one file, not three.

---

## 4. Micro-Interactions — Specified Per Element

### 4.1 CommitmentActionsMenu — DropdownMenu content composition
```
TRIGGER:     kebab icon button (⋮), 28px hit target, ghost-variant (no border until hover)
OPEN:        standard shadcn DropdownMenu entrance (100ms fade + 4px slide from trigger,
             unchanged from every other dropdown this week — Day 26's TeamSwitcher, Day 28's
             platform filter, etc. — zero new entrance choreography invented today)
ITEM ORDER:  always rendered in a fixed canonical order (Mark fulfilled, Defer, Cancel, View
             history) regardless of which subset is currently available — i.e. if only
             [MARK_FULFILLED, CANCEL] are available, Cancel does NOT move up to second position
             just because Defer is hidden; item order staying fixed means a power user's muscle
             memory ("Cancel is always near the bottom") never breaks based on status
DESTRUCTIVE
ITEM STYLE:  "Cancel" item renders in text-foreground by default (NOT pre-emptively red just
             because it's destructive — color is reserved for the moment of actual confirmation
             inside the AlertDialog, not applied speculatively to a menu item someone might not
             even click) with a small Separator above it, visually grouping it apart from the
             two non-destructive actions (Mark fulfilled, Defer) without needing color to do
             that grouping work
TERMINAL
STATE:       when only VIEW_HISTORY is available, the menu still renders (never hides the
             trigger entirely — a user should always be able to confirm "yes, this is locked,"
             not wonder why the kebab vanished), but shows a single disabled-looking item
             "No actions available" is avoided in favor of literally just "View history" being
             the sole, fully-functional item — there's no dead-end state, only a smaller menu
```

### 4.2 MarkFulfilledSheet — the fastest possible confirm flow
```
SIZE:        ~320px wide (explicitly smaller than AddMeetingSheet's 480px from Day 32 — this
             sheet has one optional field, it should visually communicate "quick" the instant
             it opens, not borrow the full-form width of a multi-field creation flow)
ENTRANCE:    identical 180ms slide+fade from Day 32, BUT autofocus lands on the note <textarea>
             directly (not the Confirm button) — even though the note is optional, focusing the
             input immediately means a user who DOES want to add context can start typing with
             zero extra click, while a user who doesn't can just press Enter-on-button or click
             Confirm without the focused-but-empty textarea causing any friction
KEYBOARD:    Enter key, when focus is anywhere in the sheet EXCEPT inside the multi-line note
             textarea (where Enter should insert a newline, not submit), triggers Confirm —
             implemented via checking `document.activeElement` tag/role on the Enter keydown
             handler, a small but important detail that prevents "I pressed Enter to start a
             new line and accidentally submitted" — a classic textarea-in-a-form bug avoided
             deliberately rather than by accident
CONFIRM
BUTTON:      "Mark fulfilled" (not generic "Confirm") — every confirm button in this app names
             the actual action it performs, never a generic verb, so a user tabbing through
             multiple sheets in sequence (mark one fulfilled, defer another) never has to
             re-read the sheet title to know what the button in front of them does
CLOSE
TIMING:      sheet closes IMMEDIATELY on click (0ms wait for server response) — per spec,
             "no spinner-wait" — the row/badge update (via the optimistic cache write) is
             already visible the instant the sheet's exit animation begins, so by the time the
             180ms close animation finishes, the underlying list already shows the new state;
             the two animations (sheet closing, row updating) run concurrently, not sequentially
```

### 4.3 DeferSheet — date validation and the "↻" indicator
```
DATE FIELD:  single native <input type="date">, min attribute set to tomorrow's date (HTML's
             own min validation PLUS a duplicate Zod refinement client-side — belt and
             suspenders, since browser date-picker UIs vary and a user could theoretically type
             a past date directly into some browsers' text-entry fallback)
VALIDATION
TIMING:      unlike Day 32's form (onBlur-then-onChange), this single-field sheet validates
             on EVERY change immediately — there's only one required field, so the "don't
             interrupt a multi-field first pass" reasoning from Day 32 doesn't apply; submit
             button is disabled until a valid future date is present, full stop
ON SUCCESS:  the row gains a small "↻" glyph (12px, text-muted-foreground, font-mono for the
             accompanying "×1" count if deferredCount > 1) positioned immediately before the
             due-date text — this glyph's appearance uses the SAME entrance treatment as Day
             31's PlatformDetectBadge-adjacent elements: opacity 0→1 + translateY(2px)→0, 140ms,
             because it's new informational content arriving on the row, identical category of
             change to that badge, so it gets the identical motion treatment (consistency of
             "what kind of change gets what kind of animation" across unrelated features is
             itself a craft signal)
SUBSEQUENT
DEFERS:      if a commitment is deferred a second time, the "×1" instantly becomes "×2" — no
             animation on the COUNT changing (same instant-swap-not-count-up rule as Day 33's
             tab badges and Day 34's score number), only the glyph's very first appearance
             animates in; every value change after that is an instant swap
```

### 4.4 CancelCommitmentSheet — the two-step destructive flow, specified precisely
```
STEP 1 (Sheet):
  - note <textarea>, REQUIRED — submit button (label: "Continue") stays disabled (not just
    aria-disabled, fully unclickable) until the textarea has non-whitespace content, validated
    on every keystroke (trim().length > 0)
  - clicking "Continue" does NOT cancel the commitment yet — it closes THIS sheet and opens
    an AlertDialog (step 2), carrying the note text forward in local state between the two
STEP 2 (AlertDialog, reused exactly from Day 29's meeting-delete pattern):
  - title: "Cancel this commitment?"
  - body: restates the note back to the user in a quoted block ("Your note: '{note text}'")
    so they're confirming WITH the context they just typed visible, not confirming blind
  - two buttons: "Keep commitment" (default-focused, outline style) and "Cancel commitment"
    (destructive style — THIS is where the red/foreground-emphasis treatment is finally
    allowed to appear, at the literal last-possible moment before an irreversible action,
    never earlier in the flow)
  - "Keep commitment" is the DEFAULT-FOCUSED button on open (not "Cancel commitment") — the
    safe choice gets default keyboard focus on every destructive confirmation in this app,
    meaning an accidental Enter-key press always resolves to the SAFE outcome, never the
    destructive one; this is a non-negotiable platform-wide rule, re-verified here
TRANSITION
BETWEEN
SHEET→DIALOG: the Sheet's close and the AlertDialog's open are sequenced with a tiny 60ms gap
  (Sheet fully closes, THEN dialog opens) rather than overlapping — two competing overlay
  entrance/exit animations playing simultaneously would look chaotic; a brief, deliberate beat
  between them reads as "one step concluded, next step beginning," not as a UI glitch
```

### 4.5 CommitmentRowQuickActions — hover AND keyboard-focus reveal
```
VISIBILITY
TRIGGER:     `visible` prop is true when EITHER `row:hover` OR the row (or any descendant)
             currently has DOM focus — implemented via CSS `:hover` combined with a
             `:focus-within` selector on the row container, NOT a JS mouseenter-only handler;
             this single CSS-level decision is what makes the feature keyboard-reachable for
             free, satisfying the explicit checklist item without writing separate keyboard-
             specific reveal logic
APPEARANCE:  the two icon buttons (✓, ↻) fade in via opacity 0→1 over 100ms — faster than most
             of this week's 120–160ms standard, because this is a frequently-repeated,
             high-traffic micro-interaction (every row, every hover) where even 20–40ms of
             extra perceived latency compounds across a long scanning session; the fastest
             motion budget in the entire app is reserved for the most-repeated interaction
ICON SIZE:   16px, ghost buttons, 24px hit target (icon visually smaller than its clickable
             area — standard touch-target generosity even though this is primarily a desktop-
             dense-table context, since trackpad precision still benefits from a slightly
             larger hit zone than the glyph itself)
POSITION:    sit immediately before the existing chevron, never replacing or shifting it —
             the row's overall width/layout doesn't reflow when these appear; they occupy
             reserved, always-present (but invisible-until-triggered) space, so a row's
             rightmost edge never visually "jumps" between hovered and unhovered states
CLICK
BEHAVIOR:    stopPropagation (consistent with Day 31's checkbox/avatar click handling) +
             opens the relevant Sheet directly — crucially, the underlying CommitmentList's
             scroll position, active filters, and cursor-pagination state are UNTOUCHED,
             because opening a Sheet never unmounts the list behind it (this is the entire
             reason Sheets were chosen over full-page navigation for every action in this
             product, payoff realized concretely here)
```

### 4.6 Score gauge recalculation — the cross-component animation payoff
```
This is Day 34's `CommitmentScore` component receiving its `animateFrom` prop for the first
time in production use. Sequence:
  1. useMarkFulfilled's onSettled invalidates the owner's score query
  2. The score query refetches, resolves with a NEW score value
  3. Wherever CommitmentScore is currently mounted for that owner (today: the commitment
     detail page header chip), the component receives the new `score` prop
  4. Because the component was ALREADY mounted with a previous value (not a fresh mount),
     React's diffing naturally triggers the CSS transition declared on stroke-dashoffset
     (Day 34's 600ms cubic-bezier) — no `animateFrom` prop-passing trickery is actually needed
     for THIS case specifically, since a re-render with a changed prop on an already-mounted
     SVG element is precisely what CSS transitions are built to handle automatically
  5. The `animateFrom` prop (defined Day 34) remains reserved for a genuinely different future
     case: a gauge that MOUNTS fresh already needing to show an animation (e.g., a notification
     toast with a tiny embedded gauge that should sweep in) — confirmed today that the common
     "already-mounted, value changes" path needs zero special handling, validating yesterday's
     prop design without needing to exercise that specific prop today
```

---

## 5. Multi-Surface Cache Write — The Core Engineering of the Day

```
PROBLEM: a single PATCH /commitments/:id/status response needs to update the SAME commitment
         wherever it's currently cached:
           - queryKeys.commitments.list(teamId, filters)  — the Day 33 tracker, potentially
             MANY differently-filtered cache entries simultaneously (e.g. one cached page for
             status=PENDING, another for status=ALL, another for ownerIds=[X])
           - queryKeys.commitments.detail(commitmentId)   — Day 34's detail page
           - queryKeys.meetings.commitments(meetingId)     — Day 31's meeting-scoped tab

SOLUTION (useCommitmentMutationCache):
  patchCommitment(id, patch) internally calls:

    queryClient.setQueriesData(
      { predicate: (query) => queryContainsCommitment(query.queryKey, query.state.data, id) },
      (oldData) => deepPatchCommitmentInStructure(oldData, id, patch)
    )

  where `queryContainsCommitment` is a small helper recognizing the THREE known shapes commitment
  data can appear in (a flat array under `.items`/`.data`, a single object, or nested under a
  `.commitments` key on a meeting-scoped response) — written once, covering all three current
  call sites, and explicitly designed so a FOURTH future shape (e.g. Day 37's MemberRow showing
  a "latest commitment" preview) only requires adding one more case to this helper, not a new
  mutation hook
```

**Why a predicate-based `setQueriesData` instead of hand-listing every exact query key:** the tracker alone can have an unbounded number of distinct cached query-key combinations (every unique filter combination a user has visited this session creates its own cache entry). Hand-enumerating "also patch the PENDING-filtered cache, also the ALL cache, also the owner=X cache" is both incomplete (impossible to predict every combination) and brittle (breaks the moment Day 33's filter shape gains a new dimension). A predicate that inspects each cached query's *data shape* rather than its *key* is the only approach that scales correctly as the filter surface grows in later days.

---

## 6. Visual Spec — Exact Tokens (mostly inherited, two new additions)

```
QUICK-ACTION ICON BUTTONS:
  size:          24px hit target, 16px icon
  variant:       ghost (no border/background until hover, then var(--hover) per the
                 universal row-hover token)
  gap:           4px between the two icons, 8px gap before the existing chevron

"↻" DEFERRED INDICATOR:
  size:          12px glyph
  color:         text-muted-foreground
  count text:    font-mono text-xs text-muted-foreground, e.g. "↻ ×2"
  gap before:    6px from the due-date text it sits beside

DROPDOWN MENU DESTRUCTIVE SEPARATOR:
  margin:        4px vertical, full-width 1px var(--border) — standard shadcn Separator,
                 no custom styling needed
```

---

## 7. Accessibility Pass

```
- CommitmentActionsMenu: every item has a real accessible name matching its visible label
  exactly (no icon-only items without text) — DropdownMenu's native role="menuitem" handles
  the rest via shadcn's existing implementation
- MarkFulfilledSheet/DeferSheet: textarea/date input both have explicit <label>, sheet itself
  aria-labelledby the title
- CancelCommitmentSheet step 2 (AlertDialog): default focus on "Keep commitment" verified via
  keyboard testing, not just visual inspection — tabbing immediately after open should land
  focus exactly there, confirmed with a screen reader announcing the focused button's label
- CommitmentRowQuickActions: both icon buttons have aria-label ("Mark fulfilled", "Defer") since
  they're icon-only — and because they're keyboard-focusable via :focus-within visibility, a
  keyboard user tabbing through a row will land on them in the same left-to-right order as a
  sighted mouse user would click them (checkbox → row link → quick actions → chevron)
- Toast rollback messages: role="alert" (this IS an urgent, one-time interruption — a failed
  mutation the user needs to notice — unlike Day 33's OverdueAlert ambient role="status")
```

---

## 8. Performance Notes

- `getAvailableActions` is a pure function with a small fixed lookup table internally (status → base actions, then a role/ownership filter pass) — O(1) effectively, safe to call on every render of both the menu and the row's quick-actions with zero memoization needed.
- The predicate-based `setQueriesData` walk is bounded by "number of currently-cached commitment-shaped queries," which in practice is small (a handful of filter combinations a single session realistically visits) — not a performance concern at this scale, explicitly noted as something to revisit only if a future profiling pass on a power-user account with dozens of saved filter views ever flags it.
- Sheet-close and row-update running concurrently (§4.2) means there's zero artificial sequential delay anywhere in the fulfill/defer/cancel flows — the perceived speed of this day's interactions is bounded only by actual network latency, never by animation choreography waiting on itself.

---

## 9. End-of-Day Checklist

**Functional**
- [ ] Action menu items computed correctly per status × role combination — every transition pair from `getAvailableActions` manually tested (PENDING/owner, PENDING/non-owner-member, PENDING/manager, DEFERRED/owner, FULFILLED/any, MISSED/any, CANCELLED/any)
- [ ] Mark Fulfilled updates UI instantly in tracker list, detail page, AND meeting-scoped tab simultaneously (verified with all three open across browser tabs/panels at once)
- [ ] Simulated server failure rolls back optimistic update + shows error toast, no stuck "fulfilled" state anywhere it was optimistically applied
- [ ] Defer requires a future date, rejects past dates client-side before any network call fires
- [ ] Cancel requires a non-empty (trimmed) note and a second AlertDialog confirm step before the mutation fires
- [ ] Row quick-actions keyboard-reachable via Tab (confirmed through `:focus-within`, not hover-only)
- [ ] Score gauge animates smoothly on recalculation, no layout jump, confirmed via the detail page after a Mark Fulfilled action
- [ ] Sheets never lose the underlying list's scroll/filter/cursor-pagination state on close (scroll position measured before/after)

**Typography**
- [ ] Confirmed zero new font usage introduced today — every text element traced back to an existing Days 26–34 rule
- [ ] Sheet titles in font-display, all body/button/menu text in font-sans, all counts/dates in font-mono with tabular-nums

**Micro-interactions**
- [ ] MarkFulfilledSheet autofocuses the note field, Enter-to-submit correctly excluded while focus is inside the textarea
- [ ] DeferSheet's "↻" indicator animates in on first appearance only, instant-swaps on subsequent count increments
- [ ] CancelCommitmentSheet's step-1→step-2 transition shows the deliberate ~60ms gap, no overlapping overlay animations
- [ ] AlertDialog's safe button ("Keep commitment") receives default focus, verified by keyboard, not assumed
- [ ] Quick-action icons reveal at 100ms (faster than the app's general 120–160ms budget), confirmed measured not eyeballed
- [ ] DropdownMenu's destructive item styled neutrally until the AlertDialog stage — no premature red

**Accessibility**
- [ ] Every icon-only button (quick actions) has a correct aria-label
- [ ] Rollback toast uses role="alert"; ambient banners elsewhere continue using role="status"
- [ ] Full keyboard run-through: open detail page → tab to kebab → open menu → select Defer → fill sheet → submit, zero mouse used

**Architecture / Reuse Readiness**
- [ ] `getAvailableActions` confirmed as the ONLY source of action-visibility logic — grep confirms no duplicate permission logic inside `CommitmentRowQuickActions`
- [ ] `useCommitmentMutationCache`'s predicate helper confirmed to cover all three current commitment-data shapes (list/detail/meeting-scoped)
- [ ] All three mutation hooks (`useMarkFulfilled`, `useDeferCommitment`, `useCancelCommitment`) confirmed to share `useCommitmentMutationCache` rather than each implementing their own cache-write logic

---

## 10. Week Closeout — Days 31–35 Reuse Audit

```
PRIMITIVE                          BORN ON DAY   CONSUMED BY (THIS WEEK)
─────────────────────────────────────────────────────────────────────────────
ActionItemRow / CommitmentRow      31            33 (full tracker, unmodified)
Optimistic mutation pattern        31 (checkbox) 32 (form-adjacent), 35 (full sheets)
SegmentedTabs                      33            (ready for Day 36 Action Items, Analytics)
CommitmentScore + utils            34            35 (recalculation), (ready for Day 37/38)
CommitmentTimeline grammar         34 (mirrors 29) (ready for any future audit-trail need)
Two-step destructive flow          29 (meetings)  35 (cancel commitment) — third consumer
Socket cache-patchers              32             (ready for Day 39's full realtime pass)
getAvailableActions-style          35             pattern itself ready to template for
  permission-as-pure-function                     Action Items' own status×role rules (Day 36)
```

By end of Day 35, the Commitments module is feature-complete end-to-end: tracker → filters → segmented status nav → score → cross-meeting timeline → detail page → fulfill/defer/cancel, every mutation optimistic, every permission rule centralized, every visual pattern traced back to a single typography and motion system established on Day 26. Action Items (Day 36) now inherits a fully-proven template — row primitive, segmented tabs, optimistic mutations, permission-pure-functions — and becomes assembly work, not invention.

---

*Document: BUILD-PLAN-DAY-35-DEEP | Vocaply | Version 1.0*
*Track: Core Frontend Dashboard (Phase 3) | Optimistic Mutation + Permission-Logic Specification Edition*
