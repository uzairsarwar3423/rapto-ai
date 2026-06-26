# Vocaply — Day 36 Deep Build Plan
## Action Items: Full Team-Wide Module (List · Bulk Ops · Priority · Jira Sync)
> Senior Frontend Architect Edition | Industry-Grade | Scalable to 100K+ rows per team
> Typography: Inter (UI/body) + Plus Jakarta Sans (headings/display)
> Document: DAY-36-DEEP-PLAN | Version 1.0

---

## 0. Why Today Is a Pivot Point, Not "Just Another List"

Meetings (Day 28) and Commitments (Day 33) taught the codebase how to paginate, filter, and optimistically mutate **one row at a time**. Action Items is where the product has to prove it can handle **N rows at once** — this is the day bulk operations, multi-cache-patch mutations, and a sticky system-chrome bar enter Vocaply for the first time. Every micro-decision below exists to make this screen feel like Linear's issue list, not a CRUD table with checkboxes bolted on.

If a senior engineer opened this screen cold, it should read as: dense, predictable, fast under the fingers, silent until you ask it to speak (no toasts for things you already see happen on screen).

---

## 1. Typography System (locked for today, reference for all future days)

```
FONT FAMILIES
  --font-display: "Plus Jakarta Sans", "Inter", -apple-system, sans-serif;
  --font-body:    "Inter", -apple-system, sans-serif;
  --font-mono:    "JetBrains Mono", "SF Mono", monospace;

USAGE RULES
  Plus Jakarta Sans  → ONLY: page titles (PageHeader), section headers (BulkBar count,
                        Sheet titles), the large number in stat tiles. Never body text,
                        never table cells. It exists to give 3–4 moments of visual weight
                        per screen — overusing it flattens the hierarchy it's meant to create.

  Inter              → everything else: table rows, labels, buttons, badges, form fields,
                        menu items, tooltips, filter pills, empty-state copy.
                        Inter's tabular numerals (font-feature-settings: "tnum" 1) are
                        turned on globally for any numeric column (due dates relative
                        counts, "{N} selected").

  JetBrains Mono      → IDs (act_xxx), <Kbd> glyphs, the Idempotency-Key debug chip in dev
                        tools only — never user-facing copy.

WEIGHT SCALE (both families, only these four weights ship — no 300/800/900)
  400 (regular)  → body, table cells, menu items
  500 (medium)   → labels, active nav state, badge text
  600 (semibold) → PageHeader title, Sheet title, BulkBar count, stat-tile number
  700            → reserved, unused today (kept out to avoid heavy/loud headings)

SIZE TOKENS (Tailwind scale mapped — reused verbatim from Days 26–35)
  text-[13px]  leading-[20px]  → table rows, body, form inputs        (Inter 400)
  text-[12px]  leading-[16px]  → badges, filter pills, meta text       (Inter 500)
  text-[14px]  leading-[20px]  → Sheet titles, BulkBar count           (Jakarta 600)
  text-[15px]  leading-[22px]  → PageHeader title only                 (Jakarta 600)
  text-[11px]  leading-[14px]  → Kbd glyphs, micro-labels              (Inter 500, uppercase, tracking-wide)
```

**Micro-intention:** Plus Jakarta Sans has a slightly geometric, friendlier curve than Inter at display sizes — it's what stops the dense data screens from feeling cold/spreadsheet-like, *without* introducing any color or illustration. Two fonts, used with this much restraint, is itself a density technique: the eye learns in seconds "Jakarta = structure, Inter = data," and stops having to work to parse the hierarchy.

```css
/* globals.css — additions for Day 36 (if not already present from Day 2) */
@font-face { font-family: "Inter"; font-display: optional; ... }
@font-face { font-family: "Plus Jakarta Sans"; font-display: optional; ... }

.tabular { font-feature-settings: "tnum" 1, "cv05" 1; } /* tnum = aligned numerals */
```
`font-display: optional` (not `swap`) is deliberate — on a dense data screen, a layout shift from font-swap is worse than a half-second of system-font fallback. This is a performance micro-intention, not just a typography one.

---

## 2. File Manifest (exact, in build order)

```
apps/web/src/
│
├── app/(dashboard)/action-items/
│   ├── page.tsx                                  [1] RSC entry
│   ├── loading.tsx                               [2]
│   ├── error.tsx                                 [3]
│   └── [actionItemId]/
│       ├── page.tsx                              [13] Detail RSC entry
│       └── loading.tsx                           [14]
│
├── features/action-items/
│   ├── components/
│   │   ├── ActionItemList/
│   │   │   ├── ActionItemList.tsx                [5]
│   │   │   ├── ActionItemListHeader.tsx          [6]
│   │   │   └── ActionItemListSkeleton.tsx        [4]  (already exists Day 31 — extend, not fork)
│   │   ├── ActionItemFilters.tsx                 [9]
│   │   ├── ActionItemBulkBar.tsx                 [7]
│   │   ├── ActionItemBulkPriorityMenu.tsx        [8a]
│   │   ├── ActionItemBulkAssigneeMenu.tsx        [8b]
│   │   ├── SyncToJiraButton.tsx                  [10]
│   │   ├── SyncStatusBadge.tsx                   [11]
│   │   ├── ActionItemEmptyState.tsx              [12]
│   │   └── ActionItemDetailHeader.tsx            [15]
│   │
│   ├── hooks/
│   │   ├── useActionItems.ts                     [A]
│   │   ├── useActionItemFilters.ts                [B]
│   │   ├── useBulkUpdateActionItems.ts            [C]
│   │   ├── useSyncToJira.ts                       [D]
│   │   └── useSelection.ts                        [E]  (generic — lives in shared/, see below)
│   │
│   ├── api/
│   │   ├── action-items.queries.ts                [F]
│   │   └── action-items.mutations.ts              [G]
│   │
│   └── types/
│       └── action-items.types.ts                  [H]
│
├── shared/
│   ├── components/data-display/DataTable/
│   │   ├── DataTableSelectAllCheckbox.tsx          [16]
│   │   └── DataTableRowCheckbox.tsx                [17]
│   ├── components/feedback/
│   │   └── BulkActionBar.tsx                       [18]  generic shell, ActionItemBulkBar wraps it
│   └── hooks/
│       └── useSelection.ts                         [E]  generic — single canonical location
│
└── lib/cache/
    └── query-keys.ts                               [MOD] add actionItems.* key factory entries
```

**Build order matters.** Hooks `A–E` and shared primitives `16–18` are built *before* any component that consumes them — this is non-negotiable on a day this composition-heavy, otherwise components get written against an imagined API that drifts from the real hook signature.

---

## 3. Data & State Architecture

### 3.1 Query key factory (extends `lib/cache/query-keys.ts`)

```typescript
actionItems: {
  all:    (teamId: string) => ['teams', teamId, 'action-items'] as const,
  list:   (teamId: string, filters: ActionItemFilters) =>
            [...actionItems.all(teamId), 'list', filters] as const,
  detail: (teamId: string, id: string) =>
            [...actionItems.all(teamId), id] as const,
}
```
Same factory shape as Commitments/Meetings — **zero new pattern**, just a new branch. This consistency is what lets `useBulkUpdateActionItems` reuse the exact `setQueriesData` strategy already proven on Day 35.

### 3.2 `useSelection.ts` — the generic primitive (built first, `shared/hooks/`)

```typescript
interface UseSelectionReturn<T extends string> {
  selectedIds: Set<T>
  isSelected: (id: T) => boolean
  toggle: (id: T) => void
  toggleRange: (ids: T[]) => void      // Shift+click range select
  toggleAll: (allIds: T[]) => void     // header checkbox
  clear: () => void
  selectionState: 'none' | 'some' | 'all'  // drives tri-state checkbox
}

function useSelection<T extends string>(totalVisibleIds: T[]): UseSelectionReturn<T>
```

**Micro-intentions baked into this hook:**
- `toggleRange` implements Shift+click the way every serious table (Gmail, Linear, Notion DB) does: remembers the *last clicked* row index, selects the contiguous range between last-click and current-click. This is a 6-line addition that disproportionately signals "this is a real tool."
- State lives in a `Set`, not an array — `isSelected` is O(1), critical once a team has 500+ action items and the row component re-renders on every scroll-virtualization recycle.
- The hook is **page-scoped, not global** — selection resets on filter change or unmount, never silently persists across an unrelated navigation (a classic bug class in cheaper table implementations).
- Returns `selectionState` pre-computed (not left for the consumer to derive) — `DataTableSelectAllCheckbox` becomes a 3-line pure-render component because the hook already did the none/some/all math.

### 3.3 `useActionItems.ts`

```typescript
function useActionItems(filters: ActionItemFilters, cursor?: string) {
  return useQuery({
    queryKey: queryKeys.actionItems.list(teamId, filters),
    queryFn: () => actionItemsApi.list(filters, cursor),
    placeholderData: keepPreviousData,   // critical: see §4.1
    ...cacheConfig.actionItems,           // staleTime 15s — matches Commitments tier
  })
}
```
`placeholderData: keepPreviousData` is the single most important line for perceived performance today — without it, every filter change or page-advance blanks the table to a skeleton for a beat. With it, the *previous* rows stay rendered (slightly dimmed via a `data-fetching` attribute, not a full skeleton swap) while the next page streams in. This is the difference between "feels instant" and "feels like a CRUD app."

### 3.4 `useBulkUpdateActionItems.ts` — the centerpiece mutation

```typescript
function useBulkUpdateActionItems() {
  return useMutation({
    mutationFn: (payload: { ids: string[]; patch: Partial<ActionItemPatch> }) =>
      actionItemsApi.bulkUpdate(payload),

    onMutate: async ({ ids, patch }) => {
      const idSet = new Set(ids)
      const snapshot = queryClient.getQueriesData({ queryKey: queryKeys.actionItems.all(teamId) })

      // SINGLE pass — one setQueriesData call patches every matching cache entry,
      // across every active query (list page 1, page 2, detail views, meeting-scoped tab)
      queryClient.setQueriesData(
        { queryKey: queryKeys.actionItems.all(teamId) },
        (old: ActionItemPage | undefined) => {
          if (!old) return old
          return {
            ...old,
            items: old.items.map(item =>
              idSet.has(item.id) ? { ...item, ...patch } : item
            ),
          }
        }
      )
      return { snapshot }
    },

    onError: (_err, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data))
      toast.error(`Couldn't update ${ids.length} item${ids.length > 1 ? 's' : ''}`)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actionItems.all(teamId) })
    },
  })
}
```

**Why one `setQueriesData` call and not a loop calling `setQueryData` per row:** a loop triggers one React re-render *per query key touched* (list page, every open detail tab, the meeting-scoped tab from Day 31) — with 40 selected rows spread across a paginated list, that's potentially dozens of synchronous re-renders in one tick. `setQueriesData` with a predicate touches every matching cache entry but React still only commits **once** per affected component, because the underlying cache writes are batched before the next render flush. This is the literal mechanism behind the Day-36 checklist item "patches all selected rows in one re-render."

### 3.5 `useSyncToJira.ts` — idempotency as a first-class concern

```typescript
function useSyncToJira(actionItemId: string) {
  const idempotencyKeyRef = useRef<string | null>(null)

  return useMutation({
    mutationFn: () => {
      // Key generated ONCE per logical "attempt," reused across retries of the
      // SAME click — a fresh click (new intent) gets a fresh key.
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID()
      }
      return actionItemsApi.sync(actionItemId, {
        headers: { 'X-Idempotency-Key': idempotencyKeyRef.current },
      })
    },
    onSuccess: () => { idempotencyKeyRef.current = null },  // reset for next real click
    onError: (err: ApiError) => {
      if (err.code !== 'RATE_LIMITED') idempotencyKeyRef.current = null
      // RATE_LIMITED keeps the same key — a user-triggered retry after the cooldown
      // is still semantically "the same sync attempt," not a new one.
    },
  })
}
```
This nuance — **resetting the key on success/most errors but deliberately keeping it on a 429** — is the kind of detail that separates "idempotency theatre" (generate a UUID and forget about it) from a correct client-side contract with the backend's documented `X-Idempotency-Key` semantics.

---

## 4. Component-Level Patterns & Micro-Intentions

### 4.1 `ActionItemList.tsx`

```tsx
<div data-fetching={isFetching && !isPending ? '' : undefined}>
  <ActionItemListHeader
    selectionState={selection.selectionState}
    onToggleAll={() => selection.toggleAll(visibleIds)}
  />
  <VirtualList
    items={items}
    estimateSize={() => 36}
    renderItem={(item, index) => (
      <ActionItemRow
        key={item.id}
        item={item}
        selected={selection.isSelected(item.id)}
        onSelectToggle={(e) => {
          if (e.shiftKey) selection.toggleRange(idsBetween(lastIndex, index))
          else selection.toggle(item.id)
        }}
        onClick={() => router.push(`/action-items/${item.id}`)}
      />
    )}
  />
</div>
```
```css
[data-fetching] { opacity: 0.55; transition: opacity 120ms ease-out; pointer-events: none; }
```
**Micro-intention:** rather than a full-screen skeleton on every paginate/filter, the *existing* rows dim to 55% opacity and become briefly non-interactive — same motion budget as everywhere else (opacity only, 120ms), but it reads as "the table is thinking," not "the table forgot what it was showing you." This is `keepPreviousData` (§3.3) made visible.

### 4.2 `ActionItemListHeader.tsx`

```tsx
<div className="grid grid-cols-[36px_1fr_140px_120px_100px_32px] h-9 border-b
                bg-muted/30 text-[12px] font-medium text-muted-foreground">
  <DataTableSelectAllCheckbox state={selectionState} onClick={onToggleAll} />
  <span>Title</span>
  <span>Assignee</span>
  <span>Priority</span>
  <span className="tabular text-right">Due</span>
  <span />
</div>
```
Grid-template-columns is **fixed**, not `auto`/`fr`-everywhere — every row in the list and the header share the exact same column template (a shared CSS custom property or Tailwind arbitrary value reused verbatim in `ActionItemRow`). This is how Linear/Notion-style tables avoid the "header doesn't quite line up with rows" tell of a less careful build. `bg-muted/30` (not a hard border-heavy header) keeps the header feeling like part of the same surface, not a separate UI chrome element.

### 4.3 `DataTableSelectAllCheckbox.tsx` — generic, 3 states, zero logic

```tsx
function DataTableSelectAllCheckbox({ state, onClick }: {
  state: 'none' | 'some' | 'all'
  onClick: () => void
}) {
  return (
    <Checkbox
      checked={state === 'all' ? true : state === 'some' ? 'indeterminate' : false}
      onCheckedChange={onClick}
      aria-label="Select all rows"
      className="ml-3"
    />
  )
}
```
shadcn's `Checkbox` already supports Radix's indeterminate visual (a dash glyph instead of a check) — **no custom SVG needed**, just wiring the `state` prop through. This is "use the primitive correctly" over "build something custom," which is itself a scalability technique: every future table (Commitments tracker retrofit, Analytics export table Day 81) gets tri-state selection for free.

### 4.4 `ActionItemBulkBar.tsx` — the day's signature interaction

```tsx
<BulkActionBar visible={selection.selectionState !== 'none'}>
  <span className="font-jakarta font-semibold text-[14px] tabular">
    {selection.selectedIds.size} selected
  </span>
  <Separator orientation="vertical" className="h-4" />
  <Button variant="ghost" size="sm" onClick={handleMarkComplete}>
    Mark complete
  </Button>
  <ActionItemBulkPriorityMenu onSelect={handlePriorityChange} />
  <ActionItemBulkAssigneeMenu onSelect={handleAssigneeChange} />
  <Separator orientation="vertical" className="h-4" />
  <Button variant="ghost" size="sm" onClick={selection.clear}>
    Clear <Kbd>Esc</Kbd>
  </Button>
</BulkActionBar>
```

```tsx
// shared/components/feedback/BulkActionBar.tsx — generic shell
function BulkActionBar({ visible, children }: { visible: boolean; children: ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-40",
        "flex items-center gap-2 h-10 px-3 rounded-lg",
        "bg-zinc-900 text-zinc-50 shadow-lg shadow-black/20", // one shade darker = "system chrome"
        "transition-all duration-140 ease-out",
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-2 pointer-events-none"
      )}
    >
      {children}
    </div>
  )
}
```

**Micro-intentions:**
- **`zinc-900` background regardless of light/dark theme** — this is deliberate inversion. The bulk bar is the one surface in the app allowed to break the page's own theme, because it needs to read instantly as "floating system control," the same visual trick Linear, Vercel's dashboard, and Notion's selection bar all use. It's the single intentional exception to "neutral grays everywhere," used exactly once.
- **Centered, floating, not full-width** — a full-width bar reads as a banner/notification; a centered pill reads as a contextual tool, reinforcing "this appeared because of what you just did," not "the system is telling you something."
- `role="toolbar"` + the bar receiving focus management (first action button auto-focuses when it appears, Esc returns focus to the row that was selected) — accessibility isn't bolted on after, it's the reason the component exists as `role="toolbar"` rather than a generic `div`.
- The bar **unmounts its children on `visible=false` after the transition**, not just visually hides them — verified via `onTransitionEnd` → conditional render — so a screen reader never announces hidden, dismissed bulk actions as still present.

### 4.5 `ActionItemBulkAssigneeMenu.tsx` — searchable Popover, keyboard-first

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="ghost" size="sm">Assignee <ChevronDown className="size-3" /></Button>
  </PopoverTrigger>
  <PopoverContent className="w-56 p-0" align="start">
    <Command>
      <CommandInput placeholder="Assign to…" autoFocus />
      <CommandList>
        <CommandEmpty>No members found.</CommandEmpty>
        {members.map(m => (
          <CommandItem key={m.id} value={m.name} onSelect={() => onSelect(m.id)}>
            <Avatar className="size-5 mr-2"><AvatarImage src={m.avatarUrl} /></Avatar>
            {m.name}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```
Using `Command` (the same primitive that powers ⌘K) **inside a Popover** rather than a plain scrollable list is the micro-decision that gives this menu fuzzy-search and full ↑/↓/Enter navigation for free, with zero custom keyboard-handling code — Vocaply's "Command is the spine" principle isn't just the global palette, it's the *pattern* reused anywhere a searchable list-of-people/items appears.

### 4.6 `SyncToJiraButton.tsx` + `SyncStatusBadge.tsx` — honest async states

```tsx
function SyncToJiraButton({ actionItem }: { actionItem: ActionItem }) {
  const sync = useSyncToJira(actionItem.id)
  const [showNotConnected, setShowNotConnected] = useState(false)

  if (actionItem.jiraIssueId) {
    return <SyncStatusBadge status="synced" url={actionItem.jiraIssueUrl} />
  }

  return (
    <Popover open={showNotConnected} onOpenChange={setShowNotConnected}>
      <PopoverTrigger asChild>
        <Tooltip content="Sync to Jira">
          <Button
            variant="ghost" size="icon-sm"
            disabled={sync.isPending}
            onClick={() => sync.mutate(undefined, {
              onError: (e: ApiError) => {
                if (e.code === 'INTEGRATION_NOT_CONNECTED') setShowNotConnected(true)
              },
            })}
          >
            {sync.isPending
              ? <span className="text-[11px] text-muted-foreground">Syncing…</span>
              : <JiraIcon className="size-3.5" />}
          </Button>
        </Tooltip>
      </PopoverTrigger>
      <PopoverContent className="text-[13px] w-56">
        Jira isn't connected.{' '}
        <Link href="/settings/integrations" className="underline">
          Connect in Settings →
        </Link>
      </PopoverContent>
    </Popover>
  )
}
```
**Micro-intention — "no spinner animation, dimmed text instead":** a spinning icon implies indeterminate AI-style "thinking." Replacing the icon with the literal word `Syncing…` at reduced opacity is calmer, reads faster at a glance in a dense row, and matches the platform-wide "no shimmer" rule. The button is genuinely `disabled` during the mutation (not just visually) — this is what makes the idempotency contract *also* protected at the UI layer: even before the network round-trip, a second click physically cannot fire.

The 429 case (omitted above for brevity, same shape): `sync.isPending` stays derived from mutation state, but the button label switches to `Sync in progress…` and a `setTimeout`-driven local "cooldown" boolean keeps it disabled for a few seconds even after the request resolves with a 429 — preventing an immediate re-click that would just get rate-limited again.

### 4.7 `ActionItemDetailHeader.tsx` — click-to-edit, not always-editable

```tsx
function EditableText({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <button
        className="group flex items-center gap-1.5 text-left"
        onClick={() => setEditing(true)}
      >
        <span className="font-jakarta font-semibold text-[15px]">{value}</span>
        <Pencil className="size-3 opacity-0 group-hover:opacity-50 transition-opacity" />
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { onSave(draft); setEditing(false) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { onSave(draft); setEditing(false) }
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
      }}
      className="font-jakarta font-semibold text-[15px] bg-transparent border-b border-border outline-none w-full"
    />
  )
}
```
The pencil icon at `opacity-0` → `group-hover:opacity-50` is the exact same "reveal-on-intent" micro-pattern used for `CommitmentRowQuickActions` (Day 35) — consistency means a user who learned "hover reveals an edit affordance" on one screen doesn't have to relearn it here. Enter commits, Escape reverts to original value without saving — both expected terminal keys handled, no surprise "did my edit save?" moment.

---

## 5. Performance Engineering for Today

```
CONCERN                          TECHNIQUE
──────────────────────────────────────────────────────────────────────────
Large team, 500+ action items    VirtualList (already proven Day 26) — only
                                  ~15 DOM rows ever mounted regardless of
                                  result count
Bulk mutation re-render storm     Single setQueriesData pass (§3.4) — O(1)
                                  re-renders per affected component, not
                                  O(n) per selected row
Filter/page-change flash          keepPreviousData + opacity dim (§4.1)
                                  instead of skeleton-replace
Selection state at scale          Set<string> + memoized isSelected — O(1)
                                  lookup per row even at 1000+ rows
Idempotent network retries        Stable UUID per logical attempt (§3.5) —
                                  prevents duplicate Jira tickets without
                                  a server round-trip just to check
Bundle weight                     Command/Popover/Checkbox already shipped
                                  by Day 35 — zero new shadcn primitive
                                  added to the bundle today
Font loading                      font-display: optional — no CLS from
                                  Jakarta/Inter swap on a data-dense page
```

---

## 6. Accessibility & Keyboard Map (Day 36 additions)

```
KEY                  CONTEXT                         ACTION
─────────────────────────────────────────────────────────────────────
Space                Row focused                     Toggle row selection
Shift+Click          Row checkbox                    Range-select to last clicked
Cmd/Ctrl+A            List focused                    Select all visible rows
Esc                  Bulk bar visible                 Clear selection, focus returns to row
Enter                EditableText input               Commit edit
Esc                  EditableText input               Revert edit, exit edit mode
↑ / ↓                Assignee Command menu            Move highlight
Enter                Assignee Command menu            Apply to selection
Tab                  Bulk bar                         Cycles only bar's own controls
                                                       (focus-trapped while visible)
```
`role="toolbar"` on the bulk bar plus `aria-label="Select all rows"` on the header checkbox are the two ARIA additions that matter most today — everything else (Popover/Command/Checkbox accessibility) is inherited for free from Radix primitives already in use since Day 26.

---

## 7. Scalability Notes (why this survives 10x growth without a rewrite)

1. **`useSelection` is generic and type-parameterized** — Day 81's Analytics export table, or any future bulk-capable surface, imports the exact same hook. No "ActionItemSelection" special-case ever gets written.
2. **`BulkActionBar` is a content-agnostic shell** — `ActionItemBulkBar` is 100% composition; a future `CommitmentBulkBar` (if ever needed) would be a thin wrapper, not a fork.
3. **The bulk mutation pattern (`setQueriesData` predicate match) scales to any entity** — the same three lines of cache-patch logic work whether 1 row or 1,000 rows are selected; there is no per-row code path to optimize later.
4. **Column grid template is a single source of truth** — adding a column (e.g., a future "Linked Commitment" column) means editing the template string in exactly one shared constant, not hunting through header + row files separately.
5. **Idempotency key lifecycle is isolated inside the hook**, not leaked into the component — if the backend's idempotency contract ever changes (e.g., key format, header name), exactly one file changes.

---

## 8. End-of-Day Verification (engineering + design QA, combined)

```
ENGINEERING
[ ] useSelection: Shift+click range-select works across a virtualized (recycled) list
[ ] Bulk mutation profiled in React DevTools — confirmed single commit for 40-row update
[ ] keepPreviousData confirmed — no skeleton flash on filter change, only opacity dim
[ ] Idempotency key persists across a simulated retry, resets after success
[ ] Tri-state checkbox: none/some/all all visually distinct, indeterminate uses Radix dash glyph

DESIGN / TYPOGRAPHY
[ ] Plus Jakarta Sans appears ONLY on: PageHeader title, BulkBar count, Sheet titles,
    EditableText value — confirmed zero leakage into table rows/badges/menus
[ ] Inter tabular numerals confirmed aligned in "{N} selected" and due-date columns
[ ] BulkActionBar zinc-900 surface confirmed identical in light AND dark theme (intentional
    one-time exception to neutral-grays-everywhere, not an accidental dark-mode-only style)
[ ] No spinner animation anywhere on this screen — Syncing… is dimmed text only

ACCESSIBILITY
[ ] Bulk bar is keyboard-reachable, focus-trapped while open, returns focus on dismiss
[ ] Screen reader does not announce the bulk bar while visually hidden (post-transition unmount)
[ ] Select-all checkbox has correct aria-label and indeterminate state announced correctly

PRODUCT BEHAVIOR (carried from base spec — re-verified against today's deeper implementation)
[ ] Default sort: incomplete → priority desc → due date asc, no user-facing sort control
[ ] 422 (Jira not connected) → inline Popover with settings link, never a toast
[ ] 429 (throttled) → button shows cooldown state, auto-recovers without manual refresh
[ ] Detail page text is click-to-edit; Enter commits, Esc reverts
```

---

*Document: DAY-36-DEEP-PLAN | Vocaply | Action Items Module | Version 1.0*
*Typography: Plus Jakarta Sans (display) + Inter (body/UI) + JetBrains Mono (IDs/kbd)*
*Principal Frontend Architecture — Linear-grade density, zero AI-dashboard aesthetics*
