# Day 28 — Meetings List Page Build Plan
## URL-Synced Filters · Dense Table-Like List · Cursor Pagination · Keyboard Navigation
> Senior Frontend Architecture Edition · Linear/Jira-grade Dense Data Screen
> Stack: Next.js 14 (App Router, RSC) · TypeScript strict · Tailwind · shadcn/ui · TanStack Query
> Document: DAY28-MEETINGS-LIST-001 | Version 1.0

---

## 0. Why This Day Is the Template for the Rest of the Sprint

Day 26 built the shell. Day 27 proved the streaming model. Day 28 builds the **first dense data list** — and this exact pattern (URL-synced filters → server-seeded initial fetch → client-owned cursor pagination → keyboard-navigable dense rows) gets copy-pasted with new field names on Day 33 (Commitments) and Day 36 (Action Items). Every architectural decision made today is made *once*, carefully, specifically so those two days are mechanical, not exploratory.

**Definition of done:** a meetings list that loads with zero flash on a filtered deep-link, where every filter change is a shareable URL, where the keyboard alone can filter, navigate, and open any row, and where scrolling through 200+ meetings never feels like "a webpage" — it feels like an application.

---

## 1. Typography Application (no new tokens — pure discipline check)

```
ELEMENT                           TOKEN                          FAMILY
─────────────────────────────────────────────────────────────────────────────
"Meetings" page title              text-base-heading (15px/600)   font-heading (Jakarta)
Filter bar labels ("Status")        text-xs (12px)                  font-sans (Inter)
MeetingListHeader column labels     text-2xs (11px) uppercase       font-sans (Inter), muted,
                                     tracking-wide                   500 weight — table-header feel
MeetingListRow title                text-sm (13px)                  font-sans (Inter)
MeetingListRow meta (time/count)    text-xs (12px) tabular-nums      font-sans (Inter)
MeetingEmptyState headline          text-base-heading (15px/600)    font-heading (Jakarta) — the ONE
                                                                      other place Jakarta appears
                                                                      beyond PageHeader, because an
                                                                      empty state IS effectively a
                                                                      mini page-title moment
FilterPill text                     text-2xs (11px)                 font-sans (Inter)
```

**The one discipline decision worth naming explicitly:** `MeetingListHeader`'s column labels (`STATUS`, `TITLE`, `PLATFORM`, `SCHEDULED`, `PARTICIPANTS`) are set in `uppercase tracking-wide text-2xs font-medium text-muted-foreground` — this is a deliberate, *new application* of the existing `text-2xs` token (not a new size) with `letter-spacing` added via Tailwind's `tracking-wide` utility. Small caps headers at 11px with wide tracking is exactly how Linear's table headers read as "structural metadata" rather than "more content" — the eye learns to skip them on every subsequent visit, which is precisely the goal for a header row that exists to orient, not to be read every time.

---

## 2. The Filter Architecture (the core problem of the day)

### 2.1 Why URL state, not component state — explained from first principles

A `useState` filter lives and dies with the component. The moment a user refreshes, bookmarks, shares a link with a teammate ("hey check the meetings that failed last week"), or hits the browser back button after opening a meeting, component state loses. URL state is **the only state model that survives all four of those events for free**, because the browser itself persists it.

```
THE CONTRACT (locked today, reused Day 33/36):

  URL is the single source of truth for filter state.
  Component state NEVER independently tracks "what filter is active" —
  it only tracks ephemeral UI state (is this popover open, what's typed
  in the search box before debounce commits it to the URL).

  Read path:  searchParams → useMeetingFilters() → typed filter object → useMeetings(filters)
  Write path: user interaction → useMeetingFilters().setStatus([...]) → router.push(new URL)
                                → searchParams change → useMeetings refetches automatically
                                  (TanStack Query key includes the filter object)
```

### 2.2 `useMeetingFilters.ts` — the typed contract

```ts
// features/meetings/hooks/useMeetingFilters.ts
'use client'

export interface MeetingFilters {
  status?: MeetingStatus[]
  platform?: PlatformType
  from?: string   // ISO date
  to?: string
  search?: string
}

export function useMeetingFilters() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const filters: MeetingFilters = useMemo(() => ({
    status:   searchParams.get('status')?.split(',') as MeetingStatus[] | undefined,
    platform: searchParams.get('platform') as PlatformType | undefined,
    from:     searchParams.get('from') ?? undefined,
    to:       searchParams.get('to') ?? undefined,
    search:   searchParams.get('search') ?? undefined,
  }), [searchParams])

  const setFilters = useCallback((patch: Partial<MeetingFilters>) => {
    const next = new URLSearchParams(searchParams.toString())
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined || (Array.isArray(value) && value.length === 0)) {
        next.delete(key)
      } else {
        next.set(key, Array.isArray(value) ? value.join(',') : String(value))
      }
    })
    // scroll: false — filter changes must NEVER jump the viewport to the top;
    // this single option is what makes filtering feel instant rather than jarring
    router.push(`${pathname}?${next.toString()}`, { scroll: false })
  }, [searchParams, router, pathname])

  const clearAll = useCallback(() => router.push(pathname, { scroll: false }), [router, pathname])

  return { filters, setFilters, clearAll }
}
```
**Why `{ scroll: false }` is called out specifically:** Next.js's default `router.push` behavior scrolls to top on navigation — correct for page-to-page nav, *wrong* for "I unchecked one status filter on a list I'm scrolled halfway down." Missing this one option is the single most common bug in URL-state filter implementations, and it's exactly the kind of detail that makes an app feel professionally built versus assembled from a tutorial.

### 2.3 Server-seeded initial fetch (no loading flash on deep link)

```tsx
// app/(dashboard)/meetings/page.tsx
export default async function MeetingsPage({
  searchParams,
}: { searchParams: { status?: string; platform?: string; from?: string; to?: string; search?: string } }) {

  const filters = parseSearchParams(searchParams)   // same shape as useMeetingFilters' output
  const initialPage = await getMeetings(filters)    // server-side first page, cookie-forwarded auth

  return (
    <PageContainer>
      <PageHeader title="Meetings" actions={<AddMeetingTrigger />} />
      <MeetingFilters />
      <MeetingList initialData={initialPage} initialFilters={filters} />
    </PageContainer>
  )
}
```
This is the same principle Day 27 established for widgets, applied to a paginated list: the **first screen of data is server-rendered and arrives with the HTML**, so a deep-linked filtered URL (`/meetings?status=FAILED`) shows correct, filtered results the instant the page paints — zero loading skeleton flash for the common case of "user clicked a link." `MeetingList` then hydrates as a Client Component and takes over for *all subsequent* interaction (filter changes, load-more, refetch), using `initialData` to seed TanStack Query's cache so it doesn't even re-fetch what the server already sent.

```tsx
// MeetingList.tsx
export function MeetingList({ initialData, initialFilters }: Props) {
  const { filters } = useMeetingFilters()   // URL is now the live source — initialFilters only seeds the very first render
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useMeetings(filters, { initialData })
  ...
}
```

---

## 3. Microinteraction & UX Pattern Catalogue (the actual craft of the day)

This section is the heart of "industry-level" — the specific, named interaction decisions that separate this from a generic CRUD table.

### 3.1 Debounced search — feel instant, cost nothing

```ts
// MeetingFilters.tsx search input
const [localSearch, setLocalSearch] = useState(filters.search ?? '')
const debouncedSearch = useDebounce(localSearch, 300)

useEffect(() => {
  if (debouncedSearch !== (filters.search ?? '')) {
    setFilters({ search: debouncedSearch || undefined })
  }
}, [debouncedSearch])
```
**Microinteraction detail:** the input's *displayed* value (`localSearch`) updates on every keystroke (zero lag typing feel), but the URL — and therefore the network request — only updates 300ms after the user stops typing. This two-tier state (local for feel, debounced for cost) is the standard professional pattern; a naive implementation wires the input directly to `setFilters` and fires a request per keystroke, which is both wasteful and, at scale, can cause out-of-order response race conditions (TanStack Query's query-key-based cancellation handles this correctly here, but it's better to never generate the storm in the first place).

### 3.2 The `FilterPill` removal pattern — direct manipulation over modal editing

```tsx
// FilterPill.tsx
export function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border
                      bg-surface px-2 py-0.5 text-2xs text-foreground">
      {label}
      <button onClick={onRemove} aria-label={`Remove filter: ${label}`}
              className="rounded-full p-0.5 hover:bg-surface-hover transition-colors duration-120">
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  )
}
```
Active filters render as a horizontal row of these pills directly under the filter bar (e.g., `Status: Pending, Missed ×` · `Platform: Zoom ×`). This is **direct manipulation** — the filter's current state is always visible as objects in space the user can individually delete, rather than requiring them to re-open the popover, find the checkbox, and uncheck it. This single pattern is why Linear/Notion filter bars feel "live" instead of "configured."

### 3.3 Multi-select Status Popover — checkbox list with live count

```tsx
// MeetingFiltersPopover.tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
      <ListFilter className="h-3 w-3" />
      Status
      {filters.status?.length ? <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-2xs">{filters.status.length}</Badge> : null}
    </Button>
  </PopoverTrigger>
  <PopoverContent align="start" className="w-56 p-1.5">
    {STATUS_OPTIONS.map((opt) => (
      <label key={opt.value}
             className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm
                        hover:bg-surface-hover cursor-pointer transition-colors duration-120">
        <Checkbox
          checked={filters.status?.includes(opt.value) ?? false}
          onCheckedChange={(checked) => toggleStatus(opt.value, checked)}
        />
        <StatusDot status={opt.value} />
        {opt.label}
      </label>
    ))}
  </PopoverContent>
</Popover>
```
**Microinteraction detail — the trigger button shows a live count badge** (`Status [3]`) the instant a selection is made, *before* the popover even closes. This gives immediate feedback that the click registered, without forcing the user to close the popover to "see" the result — critical for multi-select UIs where users often want to check 2–3 boxes in one session before moving on.

### 3.4 Keyboard-navigable list — the signature "feels like an app" interaction

```ts
// shared/hooks/useFocusListNavigation.ts (scaffolded Day 26, implemented fully today)
export function useFocusListNavigation<T>({
  items, onOpen,
}: { items: T[]; onOpen: (item: T) => void }) {
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ignore when focus is inside an input/textarea — search box typing
      // must never accidentally move the list selection
      if (isTypingTarget(document.activeElement)) return

      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, items.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && activeIndex >= 0) { onOpen(items[activeIndex]) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [items, activeIndex, onOpen])

  // Auto-scroll the active row into view when it moves out of viewport —
  // without this, arrow-key navigation through a long list silently
  // moves selection below the fold with no visual feedback at all
  useEffect(() => {
    if (activeIndex < 0) return
    containerRef.current?.querySelector(`[data-row-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return { activeIndex, setActiveIndex, containerRef }
}
```

```tsx
// MeetingListRow.tsx — consumes activeIndex for a visible focus ring
<li data-row-index={index}>
  <Link
    href={`/meetings/${meeting.id}`}
    onMouseEnter={() => setActiveIndex(index)}   // mouse hover ALSO syncs keyboard focus —
                                                   // critical: without this, moving the mouse
                                                   // after using arrow keys leaves a "ghost"
                                                   // highlighted row that doesn't match where
                                                   // the mouse actually is, which feels broken
    className={cn(
      'flex h-9 items-center gap-3 border-b border-border px-3 text-sm',
      'hover:bg-surface-hover transition-colors duration-120',
      activeIndex === index && 'bg-surface-hover ring-1 ring-inset ring-[--ring]/30'
    )}
  >
    ...
  </Link>
</li>
```
**The mouse/keyboard sync detail above is the single highest-craft microinteraction in today's build.** Most homegrown keyboard-nav implementations get arrow keys working and stop there — but the moment a real user moves their mouse over a *different* row while a keyboard-selected row is still highlighted, the UI lies about where focus is. Syncing `onMouseEnter` back into the same `activeIndex` state that `ArrowDown`/`ArrowUp` control means there is only ever **one** truth about which row is "active," regardless of input method — exactly how Linear's issue list behaves, and exactly the detail most clones miss.

### 3.5 Row click target — full-row, not text-only

```
ANTI-PATTERN:  <li className="px-3 py-2"><Link>Title</Link><span>Platform</span>...</li>
               (only the <Link>-wrapped title text is clickable — clicking the
               platform badge or empty row padding does nothing)

CORRECT:       <li><Link className="flex items-center ... w-full h-9">{everything}</Link></li>
               (the ENTIRE row, including all padding, is the single <a> tag —
               every pixel of the 36px-tall row is clickable)
```
This is re-stated explicitly because it is the literal definition of the project's "every item clickable" principle, and it is trivially easy to get subtly wrong by wrapping only the title in a `Link` and leaving the rest of the row as plain `<span>`s — visually identical, functionally half-broken.

### 3.6 Pulsing live-status indicator on `RECORDING` rows

```tsx
// Inside MeetingListRow, status column
<StatusDot status={meeting.status} />  // reuses Day 27's StatusDot — RECORDING already
                                          // carries animate-pulse from that shared map
```
No new code needed today — this is a direct payoff of Day 27's `StatusDot` being built as a shared primitive rather than re-implemented per-feature. Worth calling out as proof the cross-cutting investment from Day 27 is already compounding by Day 28.

---

## 4. File Structure (final, build order annotated)

```
app/(dashboard)/meetings/
  page.tsx                          ← 7. Assembly — server filter parse + initial fetch
  loading.tsx                       ← 8. Skeleton matching MeetingList structure
  error.tsx                         ← 9. Route-level error boundary (same pattern as Day 27)

features/meetings/
  components/
    MeetingStatusBadge.tsx          ← 1. Leaf component, built first (depends on nothing)
    MeetingPlatformIcon.tsx         ← 1. Leaf component, built first
    MeetingEmptyState.tsx           ← 2. Built early — defines the "zero results" contract
    MeetingFiltersPopover.tsx       ← 3. Status multi-select Popover
    MeetingFilters.tsx              ← 4. Composes Popover + platform Dropdown + search + FilterPills
    MeetingList/
      MeetingListHeader.tsx         ← 5. Static column header row
      MeetingListRow.tsx            ← 5. Single dense row — the most-reused pattern this week
      MeetingListSkeleton.tsx       ← 6. Built to match Row exactly (Day 27 discipline repeated)
      MeetingList.tsx               ← 6. Client orchestrator: filters + query + keyboard nav + pagination
    AddMeetingModal.tsx             ← stub only — Sheet shell, no form logic (real Day 32)
  hooks/
    useMeetingFilters.ts            ← Built BEFORE MeetingList — the contract everything else consumes
    useMeetings.ts                  ← Built BEFORE MeetingList — cursor query wrapper
  api/
    meetings.queries.ts             ← Typed fetch functions, server- AND client-callable variants

shared/components/data-display/
  CursorPagination.tsx              ← Generic "Load N more" trigger, reused Day 33/36
  FilterPill.tsx                    ← Generic removable chip, reused Day 33/36
```

### Build order rationale
1. **Status/platform leaf components first** — `MeetingListRow` cannot be written without them existing.
2. **`MeetingEmptyState` early** — forces an explicit decision about the zero-results contract before the list component is built around assuming data exists.
3. **Filters before the list** — `MeetingList` is *defined* by what filters it accepts; building the list first would mean guessing the filter shape and refactoring.
4. **Hooks (`useMeetingFilters`, `useMeetings`) before any component that consumes them** — same discipline as Day 27's "skeleton before widget": the contract is written and stabilized before the UI that depends on it.
5. **Skeleton built to match the real row, not before it this time** — unlike Day 27's widgets (which had fixed, predictable shapes), a list row's final padding/column layout is genuinely easier to get right by building the real row first today, then mirroring it — the *opposite* order of Day 27, and that's fine: the discipline is "skeleton must pixel-match," not "skeleton must always be built first." The principle matters more than the literal sequence.

---

## 5. `meetings.queries.ts` — cursor-aware fetch layer

```ts
import 'server-only'   // re-asserted per Day 27's pattern — guards against client leakage

export async function getMeetings(filters: MeetingFilters, cursor?: string) {
  return serverApiClient.get<CursorPage<MeetingSummary>>('/meetings', {
    params: {
      status: filters.status?.join(','),
      platform: filters.platform,
      from: filters.from,
      to: filters.to,
      search: filters.search,
      cursor,
      limit: 30,
    },
  })
}
```

```ts
// useMeetings.ts — Client-side, calls a parallel client-callable wrapper (no 'server-only' import)
export function useMeetings(filters: MeetingFilters, opts?: { initialData?: CursorPage<MeetingSummary> }) {
  return useInfiniteQuery({
    queryKey: queryKeys.meetings.list(teamId, filters),
    queryFn: ({ pageParam }) => fetchMeetingsClient(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    initialData: opts?.initialData
      ? { pages: [opts.initialData], pageParams: [undefined] }
      : undefined,
    staleTime: 30_000,
  })
}
```
**Why `useInfiniteQuery` and not a manual `useState` cursor tracker:** TanStack Query's infinite query primitive already solves cache merging across pages, de-duplicates in-flight requests, and exposes `hasNextPage`/`isFetchingNextPage` as derived booleans — reimplementing this by hand (a common anti-pattern) means re-solving cache invalidation-on-filter-change from scratch, badly. Note the `queryKey` includes `filters` — **changing any filter automatically creates a new query identity**, which means TanStack Query transparently discards the old paginated cache and starts a fresh cursor chain. This single line is what makes "filter changes reset pagination correctly" work with zero manual reset logic.

---

## 6. `CursorPagination.tsx` — generic, reused twice more this week

```tsx
export function CursorPagination({
  hasNextPage, isFetchingNextPage, onLoadMore,
}: { hasNextPage: boolean; isFetchingNextPage: boolean; onLoadMore: () => void }) {
  if (!hasNextPage) return null
  return (
    <div className="flex justify-center border-t border-border py-3">
      <button
        onClick={onLoadMore}
        disabled={isFetchingNextPage}
        className="text-xs text-muted-foreground hover:text-foreground
                   transition-colors duration-120 disabled:opacity-50"
      >
        {isFetchingNextPage ? 'Loading…' : 'Load 20 more'}
      </button>
    </div>
  )
}
```
**Scroll-position preservation detail:** because this is a text button appended at the *bottom* of an already-rendered list (not a full-page replace, not a "page 2" navigation), clicking it via `fetchNextPage()` appends new rows below the current scroll position — the user's place in the list is mechanically preserved by construction, no manual `scrollTo` bookkeeping required. This is the React Query infinite-query pattern working exactly as intended.

---

## 7. `MeetingEmptyState.tsx`

```tsx
export function MeetingEmptyState({ hasActiveFilters, onClearFilters }: Props) {
  if (hasActiveFilters) {
    return (
      <EmptyState
        icon={SearchX}
        title="No meetings match your filters"
        subtitle="Try removing a filter or adjusting your search."
        action={<Button size="sm" variant="outline" onClick={onClearFilters}>Clear filters</Button>}
      />
    )
  }
  return (
    <EmptyState
      icon={Video}
      title="No meetings yet"
      subtitle="Connect a calendar or add a meeting URL to get started."
      action={<Button size="sm" onClick={openAddMeetingSheet}>Add meeting</Button>}
    />
  )
}
```
**The two-state empty-state branch is the key UX decision here:** "you have zero meetings ever" and "you have meetings, but your *filters* hide all of them" are different problems requiring different recovery actions (add a meeting vs. clear filters) — collapsing them into one generic "No results" message, as most implementations do, leaves a filtered-to-zero user with no obvious next step. This directly satisfies the End-of-Day Checklist item "empty state shown only when filtered result is truly empty (not loading)" — and specifically improves on it by also being *correct about why* it's empty.

---

## 8. `MeetingListHeader.tsx` and `MeetingListRow.tsx` — the dense list itself

```tsx
// MeetingListHeader.tsx
export function MeetingListHeader() {
  return (
    <div className="flex h-8 items-center gap-3 border-b border-border px-3
                     text-2xs font-medium uppercase tracking-wide text-muted-foreground">
      <span className="w-3" />                          {/* status dot column, no label needed */}
      <span className="flex-1">Title</span>
      <span className="w-20 hidden sm:block">Platform</span>
      <span className="w-16 text-right">Scheduled</span>
      <span className="w-10 text-right hidden md:block">People</span>
      <span className="w-4" />                          {/* chevron column */}
    </div>
  )
}
```

```tsx
// MeetingListRow.tsx
export function MeetingListRow({ meeting, index, isActive, onHover }: Props) {
  return (
    <li data-row-index={index}>
      <Link
        href={`/meetings/${meeting.id}`}
        onMouseEnter={() => onHover(index)}
        className={cn(
          'flex h-9 items-center gap-3 border-b border-border px-3 text-sm',
          'hover:bg-surface-hover transition-colors duration-120',
          isActive && 'bg-surface-hover'
        )}
      >
        <StatusDot status={meeting.status} />
        <span className="flex-1 truncate flex items-center gap-1.5">
          <MeetingPlatformIcon platform={meeting.platform} className="h-3 w-3 shrink-0 sm:hidden" />
          {meeting.title}
        </span>
        <span className="w-20 hidden sm:flex items-center gap-1.5">
          <MeetingPlatformIcon platform={meeting.platform} className="h-3 w-3 shrink-0" />
          <span className="text-xs text-muted-foreground truncate">{PLATFORM_LABELS[meeting.platform]}</span>
        </span>
        <RelativeTime date={meeting.scheduledAt} className="w-16 text-right text-xs shrink-0" />
        <span className="w-10 text-right text-xs text-muted-foreground tabular-nums hidden md:block">
          {meeting.participantCount}
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
      </Link>
    </li>
  )
}
```
**Responsive column hiding detail:** Platform and Participant-count columns collapse (`hidden sm:block` / `hidden md:block`) before the row breaks layout on narrow viewports — but the platform *icon* re-appears inline next to the title on small screens so that information is never fully lost, just relocated. This is a deliberate "degrade gracefully, don't just delete data" responsive strategy, distinct from Day 27's "good enough, polish later" stance on the dashboard grid — appropriate here because a dense *list* breaking visually is far more jarring to a user than a *card grid* simply stacking.

---

## 9. `MeetingStatusBadge.tsx` / `MeetingPlatformIcon.tsx`

```tsx
const STATUS_BADGE_MAP: Record<MeetingStatus, { label: string; className: string }> = {
  SCHEDULED:    { label: 'Scheduled',  className: 'text-muted-foreground border-border' },
  BOT_JOINING:  { label: 'Joining',    className: 'text-[--warning] border-[--warning]/30' },
  RECORDING:    { label: 'Recording', className: 'text-[--danger] border-[--danger]/30' },
  PROCESSING:   { label: 'Processing', className: 'text-[--warning] border-[--warning]/30' },
  DONE:         { label: 'Done',       className: 'text-[--success] border-[--success]/30' },
  FAILED:       { label: 'Failed',     className: 'text-[--danger] border-[--danger]/30' },
  CANCELLED:    { label: 'Cancelled', className: 'text-muted-foreground/60 border-border line-through' },
}

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  const { label, className } = STATUS_BADGE_MAP[status]
  return <Badge variant="outline" className={cn('text-2xs', className)}>{label}</Badge>
}
```
Note: per the spec, this badge is used *contextually* (e.g., inside `MeetingDetailHeader` on Day 29) — within the dense list row itself today, the lighter-weight `StatusDot` is preferred over the full `Badge` to keep the 36px row from feeling crowded. Both components share the exact same color-to-status mapping (kept as one constant, imported by both) so the dot in the list and the badge on the detail page never visually disagree about what "RECORDING" looks like.

```tsx
const PLATFORM_ICON_MAP: Record<PlatformType, LucideIcon> = {
  ZOOM: Video, GOOGLE_MEET: Video, TEAMS: Video, WEBEX: Video, MANUAL: FileText,
}
// Today: generic icons with distinct labels (PLATFORM_LABELS) — real per-platform
// SVG logos (Zoom/Meet/Teams brand marks) are a polish item, not core to the
// information architecture, and are pulled from public/icons/ if/when added
// without requiring any change to this component's API.
```

---

## 10. Performance & Loading Discipline

```
loading.tsx — full-route skeleton:
  Mirrors PageHeader + MeetingFilters bar (skeleton pills) + MeetingListHeader
  (real, static — it has no data) + 8 MeetingListSkeleton rows. This fires only
  on hard navigation, exactly per the Day 27-established loading.tsx vs Suspense
  distinction — there are no nested Suspense boundaries needed here since the
  whole list is one cohesive unit, not independent widgets.
```

```
METRIC                                       TARGET             NOTE
─────────────────────────────────────────────────────────────────────────────
Server-seeded first paint (deep link)         0 loading flash    verified by hard-
                                                                  reloading a filtered URL
Filter change → URL update → refetch          < 50ms perceived   TanStack Query cache-key
                                                                  swap, no full page reload
Search keystroke → debounced commit            300ms              matches useDebounce default
                                                                  used elsewhere in the app
Load more → append                             no scroll jump     verified manually by scrolling
                                                                  to bottom, clicking, confirming
                                                                  viewport position unchanged
Arrow-key navigation responsiveness            same frame          no debounce/throttle on
                                                                  keyboard nav — must feel instant
```

---

## 11. End-of-Day Checklist

```
URL & FILTER STATE
  [ ] All 5 filter dimensions (status, platform, from, to, search) round-trip through the URL
  [ ] Refreshing a filtered URL shows correct results with zero flash (server-seeded)
  [ ] Browser back/forward correctly restores previous filter state
  [ ] Filter changes never scroll the page to top ({ scroll: false } verified)

MICROINTERACTIONS
  [ ] Status popover trigger shows live count badge before popover closes
  [ ] FilterPill × removal updates URL and list instantly
  [ ] Search input never fires a request per keystroke (Network tab confirms debounce)
  [ ] Mouse hover and keyboard arrow-nav share the exact same activeIndex (no ghost highlight)
  [ ] Arrow-key navigation auto-scrolls active row into view when off-screen

DENSE LIST CORRECTNESS
  [ ] Every row's full width/height is clickable, not just the title text
  [ ] Status dot color matches MeetingStatusBadge color for the same status (shared map verified)
  [ ] Responsive column hiding degrades gracefully — platform icon never fully disappears
  [ ] RECORDING rows visibly pulse via shared StatusDot animation

PAGINATION
  [ ] "Load 20 more" appends without resetting scroll position
  [ ] Changing any filter resets the cursor chain (verified via Network tab — no stale cursor reused)
  [ ] hasNextPage correctly hides the load-more control on the last page

EMPTY STATES
  [ ] Zero-meetings-ever state shows "Add meeting" CTA
  [ ] Zero-matching-filters state shows "Clear filters" CTA (different copy, verified distinct)
  [ ] Empty state never flashes during a normal loading state (loading ≠ empty, checked explicitly)

TYPOGRAPHY
  [ ] Column headers render as uppercase tracking-wide text-2xs, visually distinct from row content
  [ ] No new font sizes added beyond what Day 26/27 already established
```

---

*Document: DAY28-MEETINGS-LIST-001 | Vocaply | Day 28 — Meetings List Page*
*The dense-list, URL-filter, keyboard-nav template that Commitments (Day 33) and Action Items (Day 36) clone directly.*
