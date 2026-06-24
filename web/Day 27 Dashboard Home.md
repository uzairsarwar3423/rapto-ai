# Day 27 — Dashboard Home Build Plan
## Widgets · RSC Streaming · Activity Feed · The First Real Screen
> Senior Frontend Architecture Edition · Linear/Jira-grade Workspace Home
> Stack: Next.js 14 (App Router, RSC, Suspense) · TypeScript strict · Tailwind · shadcn/ui · TanStack Query
> Document: DAY27-DASHBOARD-001 | Version 1.0

---

## 0. Why This Day Is Different From Day 26

Day 26 built the *container* — chrome that never changes. Day 27 builds the first thing that lives *inside* it, and it is deliberately the hardest data-orchestration pattern in the entire Phase 3: **multiple independent async data sources rendering into one screen, none blocking the others.** Every later list/detail page (Meetings Day 28–30, Commitments Day 33–35) is a simpler version of what we solve today. If the streaming model is wrong today, it gets copy-pasted wrong four more times this week.

**Definition of done:** a dashboard that paints its shell instantly, where four independent widgets pop in as their own data resolves — and where slowing one widget down to 3 seconds (artificially, for testing) never delays the other three by a single millisecond.

---

## 1. Typography & Token Carry-Forward (no new decisions, only application)

Day 26 locked the system. Day 27's job is to *prove the system holds up* under real content density. No new tokens are introduced today — any urge to add a new font size or color is a signal the Day 26 scale was incomplete, and should be fixed at the source, not patched locally.

```
ELEMENT                          TOKEN APPLIED                FAMILY
─────────────────────────────────────────────────────────────────────────────
"Dashboard" page title           text-base-heading (15px)     font-heading (Plus Jakarta Sans 600)
Widget card header label         text-xs-medium (12px/500)    font-sans (Inter)
"View all →" link                text-xs (12px)                font-sans (Inter), muted-foreground
Commitment/meeting row text      text-sm (13px)                font-sans (Inter)
TeamPulse big number             text-2xl-heading (28px/700)  font-heading (Plus Jakarta Sans) — NEW, see §2
RelativeTime / timestamps         text-2xs (11px) tabular-nums  font-sans (Inter) — numeric stability
StatPill numbers                  text-xs (12px) tabular-nums   font-sans (Inter)
```

### 1.1 The one deliberate, justified addition: `text-2xl-heading`

The TeamPulse fulfillment-rate number is the single largest piece of text on the dashboard — it is the "headline metric" of the whole screen, the equivalent of Linear's cycle progress number. It earns a size outside the UI-chrome scale precisely *because* it is data, not chrome — same principle as why a stock ticker app lets the price be huge while everything around it stays tiny.

```
tailwind.config.ts (extend fontSize, additive to Day 26 scale):
  'text-2xl-heading': ['28px', { lineHeight: '32px', fontWeight: '700' }]
```
This is the *only* new scale token for the entire week. Used in exactly one place: `TeamPulseWidget`'s primary number. If a future widget wants a "big number" too, it reuses this token — it does not invent `text-3xl` next to it.

### 1.2 Numeric stability — `tabular-nums` as a hard rule

Every place a number can change on a live page (RelativeTime ticking, StatPill counts, the fulfillment percentage) gets `font-variant-numeric: tabular-nums` via a Tailwind utility (`tabular-nums` is built into Tailwind core). Without this, "72%" becoming "8%" on a stat refresh visibly *jitters* because proportional digits have different widths — a small detail, but it's exactly the kind of jitter that makes a dashboard feel cheap. Locked in as a rule today because `RelativeTime` (built today) is reused on every page for the rest of the sprint.

---

## 2. The RSC Streaming Architecture (the core engineering problem of the day)

### 2.1 The anti-pattern we are explicitly avoiding

```tsx
// ❌ NEVER DO THIS — the waterfall anti-pattern
export default async function DashboardPage() {
  const commitments = await getMyCommitments()   // 200ms
  const meetings     = await getUpcomingMeetings() // 150ms
  const pulse        = await getTeamPulse()        // 300ms
  const activity      = await getRecentActivity()   // 180ms
  // Total: 830ms before ANYTHING paints. This is the mistake every
  // junior RSC implementation makes — awaiting sequentially in one
  // async component turns four parallel-capable queries into a
  // single 830ms blocking waterfall.
  return <DashboardGrid commitments={commitments} meetings={meetings} ... />
}
```

### 2.2 The correct pattern — independent async Server Components

```tsx
// app/(dashboard)/dashboard/page.tsx
import { Suspense } from 'react'

export default function DashboardPage() {
  return (
    <PageContainer>
      <PageHeader title="Dashboard" actions={<QuickActionsRow />} />
      <DashboardGrid>
        <Suspense fallback={<MyCommitmentsWidgetSkeleton />}>
          <MyCommitmentsWidget />
        </Suspense>
        <Suspense fallback={<UpcomingMeetingsWidgetSkeleton />}>
          <UpcomingMeetingsWidget />
        </Suspense>
        <Suspense fallback={<TeamPulseWidgetSkeleton />}>
          <TeamPulseWidget />
        </Suspense>
        <Suspense fallback={<RecentActivityFeedSkeleton />}>
          <RecentActivityFeed />
        </Suspense>
      </DashboardGrid>
    </PageContainer>
  )
}
```

```tsx
// MyCommitmentsWidget.tsx — itself an async Server Component, fetches its OWN slice
export async function MyCommitmentsWidget() {
  const commitments = await getMyTopCommitments({ limit: 5 })
  // This await only blocks THIS component's Suspense boundary —
  // React's streaming SSR sends the shell + other widgets' HTML
  // immediately, then streams this widget's HTML in a separate
  // flush the instant its own promise resolves. No coordination
  // needed between widgets — that's the entire point of per-widget
  // Suspense boundaries over one top-level await.
  ...
}
```

**Why this matters at the architecture level, not just today:** this is the pattern every future RSC page in the product inherits. Meeting detail's three tabs (Day 29–31), the analytics dashboard (Day 81), the team health page (Day 37) — all of them are "N independent data slices into one shell." Getting the *mental model* right today (each Suspense boundary owns its own fetch, nothing awaits a sibling) is the actual deliverable, more than the four widgets themselves.

### 2.3 `loading.tsx` vs per-widget Suspense — when each fires

```
SCENARIO                                    WHAT THE USER SEES
─────────────────────────────────────────────────────────────────────────────
Hard navigation (typed URL, fresh tab)      loading.tsx full-grid skeleton, THEN
                                             real page replaces it once the page.tsx
                                             RSC tree starts streaming
Client-side nav (clicking sidebar link)     loading.tsx skeleton briefly (Next.js
                                             default behavior for the route segment),
                                             then individual widgets stream in
Already on /dashboard, soft refetch          loading.tsx does NOT re-fire — only
(e.g., revalidation)                        the specific widget's Suspense fallback
                                             shows, others stay mounted with stale data
                                             (React's streaming/transition semantics)
```
This distinction is documented explicitly in code comments inside `page.tsx` and `loading.tsx` today, because it is the single most common source of confusion for engineers joining mid-sprint: *"why did the whole page flash when I only changed one widget's query?"* — the answer is almost always "you're hitting the route-level `loading.tsx`, not a Suspense boundary."

---

## 3. File Structure (final, build order annotated)

```
app/(dashboard)/dashboard/
  page.tsx                          ← Assembly only — no data fetching itself
  loading.tsx                       ← Full-grid skeleton, structurally IDENTICAL to DashboardGrid
  error.tsx                         ← Client Component, "Something went wrong" + Retry button

features/dashboard/
  components/
    DashboardGrid.tsx                ← 1. Pure layout component, zero data knowledge
    StatPill.tsx                     ← 2. Smallest leaf, built first
    widgets/
      MyCommitmentsWidgetSkeleton.tsx        ← 3. Skeletons built BEFORE real widgets
      UpcomingMeetingsWidgetSkeleton.tsx        (forces exact-dimension discipline —
      TeamPulseWidgetSkeleton.tsx               you cannot guess a skeleton's height
      RecentActivityFeedSkeleton.tsx            after the real content already exists)
      MyCommitmentsWidget.tsx           ← 4. Real async Server Components
      UpcomingMeetingsWidget.tsx
      TeamPulseWidget.tsx
      RecentActivityFeed.tsx           ← 5. The one Client Component (interactivity future-proofed)
      ActivityFeedItem.tsx
    QuickActionsRow.tsx               ← 6. Client Component, two stub buttons
  hooks/
    useDashboardOverview.ts          ← 7. TanStack Query wrapper, used ONLY by RecentActivityFeed
                                          (the one widget that needs client-side refetch capability
                                          ahead of Day 39's WebSocket upgrade)
  api/
    dashboard.queries.ts             ← Typed server-fetch functions, called directly by RSC widgets
                                          AND wrapped by useDashboardOverview for the client widget
  index.ts

shared/components/data-display/
  RelativeTime.tsx                  ← Built FIRST of all shared pieces — five other
                                        components depend on it today alone
  StatusDot.tsx                     ← Built SECOND — used by MyCommitmentsWidget today,
                                        reused by Meetings/Commitments lists next week
```

### Build order rationale
1. **`RelativeTime` and `StatusDot` first** — these are cross-cutting primitives that five different components need; building the widgets before these exist would mean throwaway inline code.
2. **Skeletons before real widgets** — this is a deliberate process discipline, not arbitrary ordering. A skeleton built *after* the real component tends to silently drift from its actual dimensions over time. Building it first forces an explicit "this widget will be exactly this tall, this many rows" decision, which then constrains the real component to match — eliminating layout shift by construction rather than by after-the-fact CSS fixing.
3. **`DashboardGrid` before any widget** — the grid's column-span math must exist before widgets are slotted into it.
4. **`dashboard.queries.ts` before any widget body** — typed fetch functions are written and reviewed once, then every widget just calls them.

---

## 4. Component-by-Component Engineering Detail

### 4.1 `RelativeTime.tsx` — the most-reused component built this week

```tsx
// shared/components/data-display/RelativeTime.tsx
'use client'   // needs to re-render as time passes, so client-side

interface RelativeTimeProps {
  date: string | Date
  className?: string
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const [label, setLabel] = useState(() => formatRelative(date))

  useEffect(() => {
    // Re-compute every 60s — NOT every second. A dashboard timestamp
    // does not need second-level precision, and a 1s interval across
    // 20+ RelativeTime instances on one page (5 commitments + 3 meetings
    // + 10 activity rows) would be wasteful re-render churn for zero
    // perceivable benefit.
    const id = setInterval(() => setLabel(formatRelative(date)), 60_000)
    return () => clearInterval(id)
  }, [date])

  return (
    <time
      dateTime={new Date(date).toISOString()}
      title={new Date(date).toLocaleString()}   // full timestamp on hover — native tooltip
      className={cn('tabular-nums text-muted-foreground', className)}
    >
      {label}
    </time>
  )
}

// formatRelative: small pure function, NOT a heavy date library dependency
// (date-fns/formatDistanceToNowStrict is acceptable since it's already a
// likely transitive dep; avoid adding moment.js or a new package for this)
```
**Engineering note:** the `title` attribute giving the full timestamp on native hover is a one-line addition that pays for itself constantly — every time a user wonders "wait, when exactly was that," they get the answer for free without a custom tooltip component being mounted on every single row (which would be a real performance cost at scale: 20 `Tooltip` Radix instances vs. 20 native `title` attributes is not a close comparison).

### 4.2 `StatusDot.tsx`

```tsx
const STATUS_DOT_MAP: Record<string, string> = {
  PENDING:   'bg-muted-foreground',
  MISSED:    'bg-[--danger]',
  FULFILLED: 'bg-[--success]',
  DEFERRED:  'bg-[--warning]',
  SCHEDULED: 'bg-muted-foreground',
  BOT_JOINING: 'bg-[--warning] animate-pulse',
  RECORDING:   'bg-[--danger] animate-pulse',
  DONE:        'bg-[--success]',
}

export function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT_MAP[status])}
      aria-hidden
    />
  )
}
```
The `animate-pulse` for live states (`RECORDING`, `BOT_JOINING`) is the *only* sanctioned non-hover animation in the dashboard shell — it communicates "this is happening right now" in a way static color cannot, and it costs nothing (pure CSS, GPU-composited opacity animation, no JS).

### 4.3 `dashboard.queries.ts` — typed, server-callable fetch layer

```ts
// features/dashboard/api/dashboard.queries.ts
import 'server-only'   // hard guard — this file must never ship to the client bundle
import { serverApiClient } from '@/lib/api/server-client'

export async function getMyTopCommitments(opts: { limit: number }) {
  return serverApiClient.get<CommitmentSummary[]>('/commitments/my', {
    params: { limit: opts.limit, sortBy: 'status,dueDate' },
  })
}

export async function getUpcomingMeetings(opts: { limit: number }) {
  return serverApiClient.get<MeetingSummary[]>('/meetings', {
    params: { status: 'SCHEDULED,BOT_JOINING,RECORDING', limit: opts.limit, sortBy: 'scheduledAt', sortOrder: 'asc' },
  })
}

export async function getTeamPulse() {
  return serverApiClient.get<TeamPulseData>('/analytics/overview', { params: { compact: true } })
}

export async function getRecentActivity(opts: { limit: number }) {
  return serverApiClient.get<ActivityItem[]>('/analytics/activity', { params: { limit: opts.limit } })
}
```
The `import 'server-only'` directive is a small but critical guardrail: if any future engineer accidentally imports this file into a `'use client'` component, the build fails loudly instead of silently leaking a server-side API client (with cookie-forwarding credentials) into client JS.

### 4.4 `MyCommitmentsWidget.tsx`

```tsx
export async function MyCommitmentsWidget() {
  const commitments = await getMyTopCommitments({ limit: 5 })

  return (
    <Card className="col-span-6">
      <WidgetHeader title="My commitments" href="/commitments?owner=me" />
      {commitments.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No open commitments"
          subtitle="Commitments extracted from your meetings will show up here."
        />
      ) : (
        <ul className="divide-y divide-border">
          {commitments.map((c) => (
            <li key={c.id}>
              <Link
                href={`/commitments/${c.id}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm
                           hover:bg-surface-hover transition-colors duration-120"
              >
                <StatusDot status={c.status} />
                <span className="flex-1 truncate">{c.text}</span>
                {c.dueDate && <RelativeTime date={c.dueDate} className="text-2xs shrink-0" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
```
**Note on the self-avatar decision:** the original spec mentions an owner `Avatar` — for a "my commitments" widget showing only the current user's own items, an avatar of yourself on every row is visual noise with zero information value. Today's implementation deliberately *omits* the avatar here and reserves it for the future team-wide commitment list (Day 33), where the owner avatar actually disambiguates rows. This is the kind of restraint call that separates a dense-but-considered UI from a dense-but-cluttered one — every pixel justified by information value, not by "the design system has an Avatar component so let's use it."

### 4.5 `UpcomingMeetingsWidget.tsx`

```tsx
export async function UpcomingMeetingsWidget() {
  const meetings = await getUpcomingMeetings({ limit: 3 })

  return (
    <Card className="col-span-6">
      <WidgetHeader title="Upcoming meetings" href="/meetings" />
      {meetings.length === 0 ? (
        <EmptyState icon={Video} title="Nothing scheduled" subtitle="Connect a calendar to auto-detect meetings." />
      ) : (
        <ul className="divide-y divide-border">
          {meetings.map((m) => (
            <li key={m.id}>
              <Link href={`/meetings/${m.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors duration-120">
                <PlatformIcon platform={m.platform} className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{m.title}</span>
                <Badge variant="outline" className="shrink-0">{m.status}</Badge>
                <RelativeTime date={m.scheduledAt} className="text-2xs shrink-0 w-16 text-right" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
```

### 4.6 `WidgetHeader` — small shared internal component (not in the original file list, added for DRY)

```tsx
// features/dashboard/components/widgets/WidgetHeader.tsx
function WidgetHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <h2 className="text-xs font-medium text-foreground">{title}</h2>
      <Link href={href} className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-120">
        View all →
      </Link>
    </div>
  )
}
```
Four widgets need this exact header pattern; rather than duplicate the markup four times (and risk one drifting in padding by a pixel), it's extracted as a single internal helper today — a small but real example of "notice the duplication before it ships, not after."

### 4.7 `TeamPulseWidget.tsx`

```tsx
export async function TeamPulseWidget() {
  const pulse = await getTeamPulse()

  return (
    <Card className="col-span-4">
      <WidgetHeader title="Team pulse" href="/analytics" />
      <div className="flex items-center justify-between px-4 py-4">
        <div>
          <div className="text-2xl-heading font-heading tabular-nums text-foreground">
            {pulse.fulfillmentRate}%
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-2xs">
            <TrendIcon trend={pulse.trend} className="h-3 w-3" />
            <span className="text-muted-foreground capitalize">{pulse.trend}</span>
          </div>
        </div>
        <MiniSparkline points={pulse.last7DaysPoints} className="h-10 w-24" />
      </div>
    </Card>
  )
}

// TrendIcon: simple lucide ArrowUp/ArrowDown/Minus mapped from trend string,
// text-foreground colored (NOT green/red blocks) — color restraint per spec
```

`MiniSparkline` — hand-rolled, ~15 lines of raw SVG `<polyline>`, no charting library:
```tsx
function MiniSparkline({ points, className }: { points: number[]; className?: string }) {
  const max = Math.max(...points, 1)
  const w = 96, h = 32
  const path = points
    .map((p, i) => `${(i / (points.length - 1)) * w},${h - (p / max) * h}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden>
      <polyline points={path} fill="none" stroke="currentColor"
                strokeWidth="1.5" className="text-muted-foreground" />
    </svg>
  )
}
```
**Why hand-rolled instead of Recharts today:** Recharts is a real dependency with real bundle weight (~90kb+ even tree-shaken in practice) — pulling it in for a 96×32px decorative sparkline on the dashboard would be the wrong trade, especially since Day 34 is *already scheduled* to bring Recharts in properly for full Commitments charts. A 15-line inline SVG polyline is the correct-weight tool for "tiny trend indicator," and it ships zero extra JS.

### 4.8 `RecentActivityFeed.tsx` — the one Client Component, deliberately

```tsx
// 'use client' — the only widget marked client today, on purpose:
// it is explicitly future-proofed for Day 39's Socket.io subscription,
// and TanStack Query gives it the cache/refetch machinery that
// real-time invalidation will plug into later. Building it as a
// Server Component today and converting it later would mean rewriting
// its data layer mid-sprint — better to pay the small extra complexity
// cost now, once, deliberately.

export function RecentActivityFeed() {
  const { data, isLoading } = useDashboardOverview()  // initial data hydrated from RSC parent via initialData

  if (isLoading) return <RecentActivityFeedSkeleton />

  return (
    <Card className="col-span-8">
      <WidgetHeader title="Recent activity" href="#" />
      <ScrollArea className="h-[280px]">
        <ul className="divide-y divide-border">
          {data.activity.map((item) => <ActivityFeedItem key={item.id} item={item} />)}
        </ul>
      </ScrollArea>
    </Card>
  )
}
```

```tsx
// useDashboardOverview.ts
export function useDashboardOverview() {
  return useQuery({
    queryKey: queryKeys.dashboard.overview(teamId),
    queryFn: () => fetchDashboardOverviewClient(),
    staleTime: 30_000,        // matches cacheConfig pattern from architecture docs
    refetchOnWindowFocus: true,
  })
}
```
This widget is the bridge between today's RSC-first world and Day 39's realtime world — it is intentionally the *one* place on the dashboard where TanStack Query (not a raw server fetch) owns the data, because it is the *one* widget guaranteed to need live updates soon. Every other widget stays a pure async Server Component because they have no such near-term requirement — resisting the temptation to make everything a Client Component "for consistency" is itself the architectural decision worth recording.

### 4.9 `ActivityFeedItem.tsx`

```tsx
function ActivityFeedItem({ item }: { item: ActivityItem }) {
  const Icon = ACTIVITY_ICON_MAP[item.type] ?? Activity
  return (
    <li className="flex items-center gap-2.5 px-4 py-2 text-sm">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">
        <span className="font-medium text-foreground">{item.actorName}</span>{' '}
        <span className="text-muted-foreground">{item.actionText}</span>
      </span>
      <RelativeTime date={item.occurredAt} className="text-2xs shrink-0" />
    </li>
  )
}
```
Activity rows are intentionally **not** clickable links today — there is no single canonical destination for "Ahmed fulfilled a commitment" (it could link to the commitment, or Ahmed's profile). Rather than guess and ship an ambiguous click target, this is explicitly left non-interactive until a real product decision is made (likely alongside Day 38's member profile work). This is a conscious exception to the "every item clickable" principle — the principle serves clarity, and a row with an undefined destination is the opposite of clear.

### 4.10 `QuickActionsRow.tsx`

```tsx
'use client'
export function QuickActionsRow() {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => toast.info('Coming Day 32')}>
        <Plus className="h-3.5 w-3.5" /> Add meeting
      </Button>
      <Button size="sm" variant="outline" onClick={() => toast.info('Coming soon')}>
        <UserPlus className="h-3.5 w-3.5" /> Invite teammate
      </Button>
    </div>
  )
}
```
Rendered via `<PageHeader actions={<QuickActionsRow />} />` — proving out, on the very first real page, that the `actions` slot built into `PageHeader` on Day 26 works exactly as designed. If this slot needed modification today, that would be a signal Day 26 under-specified it; it does not.

### 4.11 `DashboardGrid.tsx`

```tsx
export function DashboardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-12 gap-4">{children}</div>
  )
}
```
Deliberately this thin. Column spans (`col-span-6`, `col-span-4`, `col-span-8`) live on each widget's own root `Card` element, not on wrapper `<div>`s injected by the grid — this avoids an extra DOM layer per widget and keeps the grid component itself completely dumb and reusable for any future N-widget arrangement.

**Responsive collapse (mobile):**
```
grid-cols-12 → at <768px, every widget's className adds `col-span-12` via
a sm:col-span-6 / sm:col-span-4 / sm:col-span-8 pattern, so the grid
naturally stacks to single-column on mobile without a separate mobile
component tree. Full mobile polish pass is Day 45 — today only ensures
the grid doesn't visually break, not that it's pixel-perfect on phones.
```

---

## 5. Skeleton Discipline (built first, matched exactly)

```tsx
// MyCommitmentsWidgetSkeleton.tsx — exact row count, exact heights, exact header
export function MyCommitmentsWidgetSkeleton() {
  return (
    <Card className="col-span-6">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-12" />
      </div>
      <ul className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2.5">
            <Skeleton className="h-1.5 w-1.5 rounded-full" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-10 shrink-0" />
          </li>
        ))}
      </ul>
    </Card>
  )
}
```
Every skeleton today mirrors its real widget's `py-2.5` row padding, `gap-3` spacing, and header height *exactly* — verified by literally overlaying the real widget and skeleton screenshots at 50% opacity during review. This is the mechanical way "zero layout shift on hydrate" gets satisfied rather than hoped for.

---

## 6. Empty States (designed today, not deferred)

```
WIDGET                    EMPTY CONDITION              COPY
─────────────────────────────────────────────────────────────────────────────
MyCommitmentsWidget       commitments.length === 0     "No open commitments" /
                                                        "Commitments extracted from
                                                        your meetings will show up here."
UpcomingMeetingsWidget    meetings.length === 0         "Nothing scheduled" /
                                                        "Connect a calendar to
                                                        auto-detect meetings."
TeamPulseWidget           pulse.total === 0             "Not enough data yet" /
                                                        (sparkline omitted, number
                                                        shows "—" not "0%" — avoids
                                                        implying a real 0% rate)
RecentActivityFeed        activity.length === 0          "No activity yet" centered
                                                        inside the ScrollArea height
```
The `TeamPulseWidget` "—" vs "0%" distinction is a real product-correctness detail: a brand-new team with zero commitments has *no fulfillment rate*, not a *zero* fulfillment rate. Rendering "0%" would be actively misleading (implying total failure rather than total absence of data) — this is exactly the kind of empty-state thinking that separates a considered product from a template that just renders whatever the API returns.

---

## 7. Error Boundary (`error.tsx`)

```tsx
'use client'
export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error) /* Sentry.captureException in Day 94 */ }, [error])
  return (
    <PageContainer>
      <div className="flex h-[400px] flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-foreground">Couldn't load the dashboard</p>
        <p className="text-xs text-muted-foreground">Something went wrong fetching your data.</p>
        <Button size="sm" variant="outline" onClick={reset}>Try again</Button>
      </div>
    </PageContainer>
  )
}
```
Note this is a **route-level** error boundary — it catches catastrophic failure of the whole page. Individual widget fetch failures are a separate, finer-grained concern explicitly deferred: today, if one widget's server fetch throws, it currently bubbles to this same boundary and takes down the whole dashboard, which is a known, accepted gap for today only. The correct fix (per-widget error boundaries so one failed query doesn't blank the whole screen) is recorded here as **immediate Day 28+ debt** to address once the dense-list pattern exists and there's a second real page to validate the pattern against, rather than over-engineering it in isolation on the very first page.

---

## 8. Performance Budget for Today

```
METRIC                                        TARGET            HOW VERIFIED
─────────────────────────────────────────────────────────────────────────────
Time to shell paint (sidebar/topbar visible)  < 400ms           Inherited from Day 26, re-verified
Time to first widget content                   < 600ms on 3G     Lighthouse, throttled
Time to ALL widgets resolved                    < 1.2s on 3G      Manual network tab inspection
RecentActivityFeed client JS (TanStack hook)   < 4kb incremental  bundle analyzer delta vs Day 26
Sparkline render cost                           0 extra deps      confirmed zero new packages in
                                                                   package.json diff
Artificial-delay test                           independence       throttle ONE widget's server fetch
                                                                   to 3000ms via a temporary
                                                                   `await sleep(3000)` — confirm other
                                                                   3 widgets render at normal speed
```
The "artificial-delay test" is listed explicitly because it is the *only* reliable way to prove the streaming architecture actually works rather than appearing to work. A page can look correct with all-fast queries and still secretly be a waterfall underneath — this test is the falsifiable check.

---

## 9. End-of-Day Checklist

```
STREAMING ARCHITECTURE
  [ ] Artificial 3s delay on one widget's fetch does NOT delay the other three
  [ ] loading.tsx only fires on hard nav / route-level loading, not on widget refetch
  [ ] No top-level Promise.all/sequential-await pattern exists in page.tsx

WIDGETS
  [ ] MyCommitmentsWidget: 5 rows max, PENDING before MISSED ordering correct
  [ ] UpcomingMeetingsWidget: shows next 3 by scheduledAt ascending
  [ ] TeamPulseWidget: shows "—" not "0%" when no data; sparkline renders with real points
  [ ] RecentActivityFeed: scrollable within fixed height, doesn't grow the page
  [ ] QuickActionsRow buttons render via PageHeader's actions slot, toast stubs fire correctly

CLICKABILITY & NAVIGATION
  [ ] Every commitment/meeting row navigates correctly on click anywhere in the row
  [ ] Hover background visible on every clickable row, cursor-pointer confirmed
  [ ] Activity feed rows confirmed intentionally non-clickable (not a bug)

EMPTY STATES
  [ ] All 4 widgets tested with zero data (seed an empty team) — no blank/broken cards
  [ ] Copy matches the table in Section 6 exactly

SKELETON / LAYOUT STABILITY
  [ ] loading.tsx skeleton overlaid against real grid — zero pixel drift
  [ ] CLS measured at 0.00 in Lighthouse for the dashboard route

TYPOGRAPHY
  [ ] TeamPulse number uses font-heading + tabular-nums, confirmed via inspector
  [ ] No new font sizes introduced beyond the one documented text-2xl-heading addition
  [ ] RelativeTime renders correct native title= tooltip with full timestamp on hover

ERROR HANDLING
  [ ] error.tsx renders on a forced thrown error, Retry button actually re-mounts the tree
  [ ] console.error fires (placeholder for Day 94 Sentry wiring)
```

---

*Document: DAY27-DASHBOARD-001 | Vocaply | Day 27 — Dashboard Home*
*First proof of the RSC streaming model that every later list/detail page in Phase 3 will reuse.*
