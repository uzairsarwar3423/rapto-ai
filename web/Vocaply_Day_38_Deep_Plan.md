# Vocaply — Day 38 Deep Build Plan
## Member Profile Page: Cross-Meeting History · Personal Timeline · Trend Chart
> Senior Frontend Architect Edition | Industry-Grade | One-person accountability story, zero shame-board aesthetics
> Typography: Inter (UI/body) + Plus Jakarta Sans (headings/display) + Poppins (numeric callouts, reserved/rare)
> Document: DAY-38-DEEP-PLAN | Version 1.0

---

## 0. Why Today Is the Most Personal Screen in the Product

Every screen up to Day 37 looked at the team in aggregate. Today looks at *one person*. That changes the design contract: a sparkline that dips, a score that drops — these now read as "this is about me" rather than "this is about the team's numbers." The bar for calm, neutral, non-judgmental rendering is higher here than anywhere else in Vocaply, not lower.

Engineering-wise, today is a **composition stress test**: almost nothing new is built, almost everything is *assembled*. `CommitmentScore` gets its third size deployment, `CommitmentList`/`CommitmentRow` get reused with a pinned filter, and the row-permission logic from Day 37 gets imported, not reimplemented. The only genuinely new code is a ~40-line SVG sparkline and a scroll-spy hook — both intentionally small, hand-rolled, and boring.

---

## 1. Typography System (extended today — third font introduced, used narrowly)

```
--font-display: "Plus Jakarta Sans", "Inter", -apple-system, sans-serif;
--font-body:    "Inter", -apple-system, sans-serif;
--font-numeric: "Poppins", "Inter", -apple-system, sans-serif;   /* NEW today */
--font-mono:    "JetBrains Mono", "SF Mono", monospace;
```

**Why a third font, and why so late:** Poppins is being introduced today for exactly one job — **the single hero number in `MemberTrendChart`** (the current week's fulfillment % sitting beside the sparkline line, §4.3) and **the large `lg`-tier `CommitmentScore` center number** inside `MemberScoreBreakdown` (§4.2). Poppins' geometric circular forms give numerals a slightly rounder, friendlier weight than either Inter's grid-aligned numerals or Jakarta's structural ones — and this page, more than any other, needs that one extra degree of warmth, because it's a page *about a person*, not about a table of rows. It is **not** a replacement for Jakarta on headings, and it never appears in body text, badges, or table cells anywhere in the app.

```
FONT USAGE MAP — DAY 38

Plus Jakarta Sans (600) → PageHeader-equivalent (MemberProfileHeader name), Sheet titles
                            (RemoveMemberSheet/ChangeMemberRoleSheet), MemberSectionNav
                            active label.

Poppins (600)            → MemberScoreBreakdown's lg CommitmentScore center number ONLY.
                            MemberTrendChart's current-week callout number ONLY.
                            Nowhere else. Two call sites, zero exceptions.

Inter (400/500)          → everything else: RoleBadge, metadata row, CommitmentScoreLegend
                            labels, history list rows (inherited from CommitmentRow), nav
                            inactive labels, "Joined {date}" text.

Inter tabular (tnum)      → score legend percentages, history row counts — same rule as
                            every prior day.

JetBrains Mono            → unused today (no IDs surfaced on-screen).
```

**Locked rule going forward:** Poppins is reserved for *emphasis numerals in personal/identity contexts* (a person's score, a person's trend value) — it must never spread into team-aggregate numbers (those stay Jakarta, per Day 37's `TeamHealthStats`) or into dense table cells (those stay Inter tabular). Three fonts is already one more than most "boring tool" products carry; the discipline that keeps it from feeling fussy is that each one has exactly one job and never moonlights as another.

```css
/* globals.css — Day 38 addition */
@font-face { font-family: "Poppins"; font-weight: 600; font-display: optional; ... }
/* Only the 600 weight is loaded — no 400/500/700 Poppins ships, keeping the
   font-loading budget narrow even as the family count grows. */
```

---

## 2. File Manifest (exact, in build order)

```
apps/web/src/
│
├── app/(dashboard)/team/[memberId]/
│   ├── page.tsx                                    [1] RSC entry
│   └── loading.tsx                                 [2]
│
├── features/team/
│   ├── components/
│   │   ├── MemberProfile/
│   │   │   ├── MemberProfileHeader.tsx             [4]
│   │   │   ├── MemberScoreBreakdown.tsx            [5]
│   │   │   ├── MemberTrendChart.tsx                [6]
│   │   │   ├── MemberSectionNav.tsx                [7]
│   │   │   ├── MemberCommitmentHistory.tsx         [8]
│   │   │   └── MemberProfile.tsx                   [9]  page composition, built LAST
│   │   ├── RemoveMemberSheet.tsx                   [10]
│   │   └── ChangeMemberRoleSheet.tsx               [11]
│   │
│   ├── hooks/
│   │   ├── useMemberProfile.ts                     [A]
│   │   ├── useMemberTrend.ts                       [B]
│   │   └── useMemberCommitments.ts                 [C]
│   │
│   └── lib/
│       └── sparkline-path.ts                       [D]  pure SVG-path generator, unit-testable
│
└── shared/
    └── hooks/
        └── useScrollSpy.ts                         [3]  generic, built FIRST
```

**Build order rationale:** `useScrollSpy` (3) is built before any component that consumes it — same hooks-before-consumers discipline as Days 36–37. `sparkline-path.ts` (D) is deliberately extracted as a **pure function in its own file**, separate from `MemberTrendChart.tsx`, specifically so it can be unit-tested with plain arrays of numbers (flat/rising/falling fixtures) without mounting any React component or touching the DOM — see §6. `MemberProfile.tsx` (9), the page composition, is built **last**, after every section it assembles already exists and is independently verified — composing five proven leaf components is a different (and safer) task than composing five components while still debugging two of them.

---

## 3. Data & State Architecture

### 3.1 `useMemberProfile.ts`

```typescript
function useMemberProfile(memberId: string) {
  return useQuery({
    queryKey: queryKeys.team.member(teamId, memberId),
    queryFn: () => teamApi.getMember(memberId),
    ...cacheConfig.teamMembers,   // same tier as Day 37's member list — not a new cache class
  })
}
// Throws/returns 404 shape on cross-team ID — see §3.4 for the security note
```
No new cache tier introduced — this hook deliberately shares `cacheConfig.teamMembers`'s staleTime with Day 37's list query, because both represent "how fresh does a person's score need to be," which is the same product answer regardless of which screen is asking.

### 3.2 `useMemberTrend.ts`

```typescript
interface TrendPoint { week: string; fulfillmentRate: number }

function useMemberTrend(memberId: string) {
  return useQuery({
    queryKey: queryKeys.team.memberTrend(teamId, memberId),
    queryFn: () => teamApi.getMemberTrend(memberId),  // 8 weekly points, oldest→newest
    ...cacheConfig.analytics,   // reuse Day 27/34's analytics tier — trend data is exactly
                                 // as time-sensitive as the dashboard's own trend widgets
  })
}
```

### 3.3 `useMemberCommitments.ts` — composition, not a new query shape

```typescript
function useMemberCommitments(memberId: string, status?: CommitmentStatus) {
  return useCommitments({ ownerId: memberId, status })   // Day 33's hook, called with a pin
}
```
This is the entire hook. **Zero new query logic.** The only reason this wrapper exists at all (rather than calling `useCommitments` directly from `MemberCommitmentHistory`) is to give the call site a self-documenting name and a single place to pin `ownerId` so it can never accidentally be omitted by a future edit to the component — a one-line safety net, not an abstraction for its own sake.

### 3.4 Tenant-isolation note (engineering, not visual, but critical today)

```typescript
// app/(dashboard)/team/[memberId]/page.tsx
const member = await getMemberServerSide(memberId)   // server-side, scoped to req.teamId
if (!member) notFound()   // Next.js 404, NOT a client-side redirect-after-fetch
```
**Micro-intention:** the cross-team-ID-returns-404 checklist item is enforced **at the RSC layer**, before any client component mounts — a member ID belonging to a different team never reaches the browser as a flash of data-then-redirect. This mirrors the exact tenant-isolation discipline already documented for Meetings/Commitments detail pages (Days 29/34): the page either resolves with data the requester is allowed to see, or it 404s server-side, full stop.

---

## 4. Component-Level Patterns & Micro-Intentions

### 4.1 `MemberProfileHeader.tsx`

```tsx
function MemberProfileHeader({ member, requester }: Props) {
  const actions = getAvailableActions(member, requester)   // imported from Day 37, NOT reimplemented

  return (
    <div className="flex items-start justify-between pb-4 border-b">
      <div className="flex items-center gap-3">
        <Avatar className="size-12">
          <AvatarImage src={member.avatarUrl} />
          <AvatarFallback>{initials(member.name)}</AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-jakarta font-semibold text-[18px]">{member.name}</h1>
            <RoleBadge role={member.role} />
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Joined <RelativeTime date={member.joinedAt} />
          </p>
        </div>
      </div>

      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              Actions <ChevronDown className="size-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map(a => (
              <DropdownMenuItem
                key={a.id}
                variant={a.destructive ? 'destructive' : 'default'}
                onSelect={() => openSheet(a.id)}
              >
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
```
**Micro-intention — importing, not reimplementing, `getAvailableActions`:** this is the single highest-leverage decision on this page. Day 37 explicitly built that function as an exported pure function for exactly this reuse. If a second, slightly-different permission check were written here "because the header looks different from the table row," that's the moment the two surfaces silently drift — one allowing an action the other blocks. Today's header literally imports `features/team/components/MemberTable/MemberRow.ts`'s exported `getAvailableActions`, proving Day 37's investment in extraction was correct.

`size-12` (48px) Avatar with a real `AvatarFallback` (initials, not a broken-image icon) — at this size, a failed avatar load is far more visually noticeable than at the table's 24px, so the fallback path gets explicit attention today rather than being an edge case nobody looks at.

### 4.2 `MemberScoreBreakdown.tsx` — the third size deployment, and where Poppins lands

```tsx
function MemberScoreBreakdown({ member }: { member: MemberDetail }) {
  return (
    <div className="flex items-center gap-6 py-4">
      <CommitmentScore score={member.commitmentScore} size="lg" />
      <CommitmentScoreLegend
        fulfillmentRate={member.fulfillmentRate}
        onTimeRate={member.onTimeRate}
        trend={member.trend}
      />
    </div>
  )
}
```
The `lg` size tier (locked in Day 37's spec: 96px diameter, 28px center number) is where the center-number font switches from Inter (used at `sm`) to **Poppins 600** rather than Jakarta — a refinement of Day 37's original "Jakarta at md/lg" rule, made today specifically because the *profile* context (a person, not a table) is where the warmer numeral shape earns its keep. `CommitmentScore.tsx`'s internal size-tier switch (built Day 34, refined Day 37) gets one more conditional branch:

```tsx
// CommitmentScore.tsx — internal font selection by size, updated Day 38
const numberFontClass = {
  sm: 'font-inter',
  md: 'font-jakarta',
  lg: 'font-poppins',   // NEW today — the one lg-specific typographic refinement
}[size]
```
**Micro-intention:** this is a deliberately *small, surgical* edit to an already-shipped, already-tested component — not a rewrite. The component's external contract (`score`, `size` props) doesn't change; only an internal class lookup gains a third branch. This is exactly how a mature codebase should evolve a shared primitive: additive, scoped, and driven by a real second/third consumer's need, never a speculative refactor.

`CommitmentScoreLegend` is rendered completely unchanged from Day 34 — three lines, Inter throughout, no Poppins leakage into the legend text itself, only the gauge's own center number gets the new treatment.

### 4.3 `MemberTrendChart.tsx` + `sparkline-path.ts` — the day's one new visual

```typescript
// features/team/lib/sparkline-path.ts — pure, unit-testable, zero React
export function buildSparklinePath(
  values: number[],
  width: number,
  height: number,
  padding = 4
): { path: string; points: { x: number; y: number }[] } {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1   // guard against a perfectly flat series → no /0

  const points = values.map((v, i) => ({
    x: padding + (i / (values.length - 1)) * (width - padding * 2),
    y: height - padding - ((v - min) / range) * (height - padding * 2),
  }))

  const path = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ')

  return { path, points }
}
```

```tsx
// MemberTrendChart.tsx
function MemberTrendChart({ memberId }: { memberId: string }) {
  const { data, isPending } = useMemberTrend(memberId)
  if (isPending) return <Skeleton className="h-10 w-32" />

  const values = data.points.map(p => p.fulfillmentRate)
  const { path } = buildSparklinePath(values, 120, 32)
  const current = values[values.length - 1]

  return (
    <div className="flex items-center gap-3">
      <svg width={120} height={32} role="img" aria-label={trendAriaLabel(data.points)}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5}
              className="text-primary" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className="font-poppins font-semibold text-[20px] tabular">{current}%</span>
    </div>
  )
}

function trendAriaLabel(points: TrendPoint[]): string {
  const first = points[0].fulfillmentRate
  const last = points[points.length - 1].fulfillmentRate
  const direction = last > first ? 'rising' : last < first ? 'falling' : 'flat'
  return `Fulfillment trend over 8 weeks, ${direction}, currently ${last} percent`
}
```
**Micro-intentions:**
- `sparkline-path.ts` exported as a **standalone pure function**, not inlined in the component — this is the single decision that makes the checklist item "trend chart SVG path renders correctly for flat/rising/falling 8-week data" trivially testable: three `it()` blocks feeding three fixture arrays into `buildSparklinePath` and asserting on the returned path string and point coordinates, no `render()`/jsdom/SVG-measurement involved at all.
- **`range = max - min || 1`** is the guard that makes a perfectly flat 8-week series (every week exactly 80%) render as a flat horizontal line at mid-height rather than throwing or collapsing to `NaN` coordinates — a small but easy-to-miss edge case for anyone who's had a genuinely consistent month.
- **No dots, no gridlines, no per-point tooltip** — matching the dashboard's existing sparkline philosophy verbatim. The temptation on a "personal" page is to add more affordance (hover for exact weekly values); today deliberately resists that, because the product's promise is "see the shape at a glance," and a tooltip-per-point turns a 2-second glance into a hover-hunting exercise.
- **`trendAriaLabel` is a sentence, not a number** — a sighted user reads the shape of the line plus the bold "73%" beside it in one glance; a screen-reader user gets the equivalent meaning ("rising," "currently 73 percent") in one `aria-label`, computed from the same data, not a separate hand-written string that could drift out of sync with what's actually drawn.
- `stroke="currentColor"` + `className="text-primary"` — the line color inherits Vocaply's single accent token exactly the way every other accented element in the app does; there is no chart-specific color constant introduced, which is what keeps a future dark-mode/theme change a one-line CSS-variable edit rather than a hunt through chart code.

### 4.4 `MemberSectionNav.tsx` + `useScrollSpy.ts` — wayfinding, explicitly not filtering

```typescript
// shared/hooks/useScrollSpy.ts — generic
function useScrollSpy(sectionIds: string[], options?: { rootMargin?: string }) {
  const [activeId, setActiveId] = useState(sectionIds[0])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]) setActiveId(visible[0].target.id)
      },
      { rootMargin: options?.rootMargin ?? '-20% 0px -70% 0px', threshold: [0, 0.5, 1] }
    )
    sectionIds.forEach(id => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [sectionIds])

  return activeId
}
```
```tsx
function MemberSectionNav({ sections }: { sections: { id: string; label: string }[] }) {
  const activeId = useScrollSpy(sections.map(s => s.id))

  return (
    <nav className="sticky top-[48px] z-10 flex gap-4 h-9 items-center
                     border-b bg-background/95 backdrop-blur-sm px-1">
      {sections.map(s => (
        <button
          key={s.id}
          onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className={cn(
            "text-[13px] pb-2 -mb-px border-b-2 transition-colors duration-150",
            activeId === s.id
              ? "font-jakarta font-semibold border-primary text-foreground"
              : "font-inter font-normal border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {s.label}
        </button>
      ))}
    </nav>
  )
}
```
**Micro-intentions:**
- **`rootMargin: '-20% 0px -70% 0px'`** is the specific tuning that makes scroll-spy feel correct rather than laggy or premature — it shrinks the observer's effective viewport so a section is only considered "active" once it's meaningfully into the upper-middle of the screen, not the instant its top pixel appears at the very bottom edge. This single line is the difference between a scroll-spy nav that feels "off by one section" and one that feels exactly right — it's the most fragile, easiest-to-get-wrong constant in this entire file, called out explicitly so a future tweak doesn't regress it blindly.
- **The active label switches font from Inter to Jakarta semibold**, not just color — this is a deliberate, *additional* signal beyond the underline, consistent with the rest of the app's habit of using Jakarta as a "this is structurally important right now" marker rather than a purely decorative choice.
- **Explicitly NOT a `Tabs` component** — re-stating the architectural decision from the base spec in code-adjacent terms: this `nav` never hides any section's DOM, it only scrolls to it and highlights a label. Swapping this for shadcn's `Tabs` later would silently change the product behavior (sections would need to mount/unmount instead of co-existing), which is exactly the regression this file's own comment block should warn against.
- `bg-background/95 backdrop-blur-sm` on the sticky nav gives it a soft "floating above content" read as the page scrolls underneath, without a hard drop-shadow or border-heavy chrome — consistent with the platform's "smooth micro-interactions only" restraint.

### 4.5 `MemberCommitmentHistory.tsx` — proving zero new list code

```tsx
function MemberCommitmentHistory({ memberId }: { memberId: string }) {
  return (
    <section id="history" className="scroll-mt-20">
      <h2 className="font-jakarta font-semibold text-[14px] mb-2">History</h2>
      <CommitmentStatusTabs ownerId={memberId} />   {/* Day 33's segmented control, pinned */}
      <CommitmentList ownerId={memberId} />          {/* Day 33's list, pinned */}
    </section>
  )
}
```
**`scroll-mt-20` on the section, not a manual offset calculation in `useScrollSpy`** — `scroll-margin-top` is the CSS-native way to tell `scrollIntoView`/anchor navigation "stop 80px short of this element's top, to clear the sticky nav above it." Using the CSS property instead of computing pixel offsets in JS keeps the scroll-positioning logic declarative and co-located with the exact element it affects, rather than a magic number living in a hook three files away.

### 4.6 `RemoveMemberSheet.tsx` / `ChangeMemberRoleSheet.tsx` — asymmetric confirmation, by design

```tsx
function ChangeMemberRoleSheet({ member, open, onOpenChange }: Props) {
  const [role, setRole] = useState(member.role)
  const changeRole = useChangeMemberRole()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-sm">
        <SheetHeader>
          <SheetTitle className="font-jakarta font-semibold text-[14px]">
            Change role
          </SheetTitle>
        </SheetHeader>
        <Select value={role} onValueChange={setRole}>{/* MEMBER/MANAGER/ADMIN */}</Select>
        <SheetFooter>
          <Button onClick={() => changeRole.mutate({ memberId: member.id, role }, {
            onSuccess: () => onOpenChange(false),
          })}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function RemoveMemberSheet({ member, open, onOpenChange }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const removeMember = useRemoveMember()

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="max-w-sm">
          <SheetHeader>
            <SheetTitle className="font-jakarta font-semibold text-[14px]">
              Remove {member.name}
            </SheetTitle>
          </SheetHeader>
          <p className="text-[13px] text-muted-foreground">
            They'll lose access immediately. Their past commitments and meeting
            history stay with the team.
          </p>
          <SheetFooter>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              Remove from team
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Remove {member.name} from the team?</AlertDialogTitle>
          <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeMember.mutate(member.id, {
                onSuccess: () => { setConfirmOpen(false); onOpenChange(false); router.push('/team') },
              })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```
**Micro-intention — the asymmetry is the point.** `ChangeMemberRoleSheet` has exactly one confirmation surface (the Sheet itself) because a role change is trivially reversible — change it back if it was a mistake. `RemoveMemberSheet` has **two** (Sheet → AlertDialog) because removal is not reversible and has real consequences for the person on the other end. This mirrors the exact two-step-only-for-destructive convention already established by `CancelCommitmentSheet` (Day 35) — a future engineer reading this file should recognize the pattern instantly rather than wonder why one Sheet confirms and the other double-confirms. On successful removal, the router **navigates back to `/team`** rather than leaving the user on a now-stale profile page for someone no longer on the team — a small but important "don't leave the user looking at a ghost" detail.

---

## 5. Performance Engineering for Today

```
CONCERN                          TECHNIQUE
──────────────────────────────────────────────────────────────────────────
Sparkline render cost            Pure function, no memoization needed — 8 points,
                                  trivially cheap; premature useMemo here would be
                                  noise, not optimization
IntersectionObserver overhead    Single observer instance for all 3 sections (not
                                  one observer per section) — useScrollSpy sets up
                                  exactly one IntersectionObserver and observes
                                  multiple targets, the correct API usage
Score gauge at lg size            Same SVG component as sm/md — no new rendering
                                  cost, only stroke-width/viewBox/font-class differ
                                  via existing prop-driven branching
Commitment history reuse          Zero new query/list code — inherits Day 33's
                                  cursor pagination and VirtualList wiring exactly,
                                  meaning this page's history section scales to
                                  the same row counts the main tracker already
                                  handles correctly
Font payload                      Poppins 600-only, single weight — smallest
                                  possible addition for the visual gain; no
                                  italic/other-weight files requested
Scroll Area custom scrollbar      CSS-only styling on the existing Radix
                                  ScrollArea primitive — no JS scroll-position
                                  polyfill, no extra runtime cost over a native
                                  scrollbar beyond the (already-shipped) primitive
```

---

## 6. Testing Strategy for the One New Piece of Logic

```typescript
// features/team/lib/sparkline-path.test.ts
describe('buildSparklinePath', () => {
  it('renders a flat line at mid-height for constant values', () => {
    const { points } = buildSparklinePath([80, 80, 80, 80], 100, 40)
    const ys = points.map(p => p.y)
    expect(new Set(ys).size).toBe(1)          // all points share one y — truly flat
  })

  it('renders strictly descending y for rising values (SVG y-axis is inverted)', () => {
    const { points } = buildSparklinePath([10, 30, 50, 90], 100, 40)
    for (let i = 1; i < points.length; i++) {
      expect(points[i].y).toBeLessThan(points[i - 1].y)
    }
  })

  it('renders strictly ascending y for falling values', () => {
    const { points } = buildSparklinePath([90, 50, 30, 10], 100, 40)
    for (let i = 1; i < points.length; i++) {
      expect(points[i].y).toBeGreaterThan(points[i - 1].y)
    }
  })

  it('never divides by zero on a single-point or fully-flat series', () => {
    expect(() => buildSparklinePath([50], 100, 40)).not.toThrow()
    expect(() => buildSparklinePath([0, 0, 0], 100, 40)).not.toThrow()
  })
})
```
This is the entire test investment today — four small, fast, DOM-free unit tests that directly cover the checklist's "renders correctly for flat, rising, and falling data" requirement with actual assertions, not a manual eyeball check. Because `sparkline-path.ts` has zero dependency on React, Query, or the DOM, this test file runs in milliseconds and can't flake on a rendering timing issue — a deliberate payoff of §2's "extract the pure function" decision.

---

## 7. Accessibility & Keyboard Map (Day 38 additions)

```
KEY                  CONTEXT                              ACTION
──────────────────────────────────────────────────────────────────────
Tab                  MemberSectionNav                      Cycles Overview/History/Activity
                                                             labels as real <button> elements
Enter / Space        Section nav label focused              Smooth-scrolls to that section
Tab                  RemoveMemberSheet → AlertDialog        Focus moves correctly into the
                                                             AlertDialog when it opens over Sheet
Esc                  AlertDialog open (Remove confirm)      Closes confirm dialog, returns to Sheet
                                                             (does NOT close the Sheet underneath)
```
The trend chart's `<svg role="img" aria-label="...">` (§4.3) and `CommitmentRateBar`'s identical pattern from Day 37 are the same accessibility technique applied twice now — a visual-only data shape gets one computed sentence, not silence and not a wall of per-point announcements.

---

## 8. Scalability Notes (why this survives product growth without rework)

1. **`getAvailableActions` reuse (§4.1) is now a two-site-proven contract** — Day 37 introduced it, today consumes it from a second, visually distinct surface. Any future third surface (e.g., a future "Quick actions" command-palette entry for a member) imports the same function with full confidence it's correct.
2. **`sparkline-path.ts` is generic enough to power a second sparkline** — Day 70's "Team health trend, weekly digest" or any future per-metric mini-chart calls the exact same pure function with a different data series; nothing about it is member-specific.
3. **`useScrollSpy` is fully generic over section IDs** — any future long-scrolling detail page (a richer Meeting detail redesign, a future Integration detail page) adopts the identical hook rather than reinventing IntersectionObserver wiring.
4. **The Poppins-for-personal-numerals rule is documented narrowly enough to not sprawl** — exactly two call sites today, and the rule for "where Poppins is allowed" is written down (§1) precisely so a well-meaning future contributor doesn't start using it for every big number in the app and dilute the one place it's meant to feel special.
5. **Tenant isolation is enforced at the routing layer, not the component layer** (§3.4) — this pattern, now used identically across Meetings/Commitments/Team member detail pages, is the kind of repeated, boring correctness that scales to every future detail page without anyone having to remember a checklist each time.

---

## 9. End-of-Day Verification (engineering + design QA, combined)

```
ENGINEERING
[ ] sparkline-path.test.ts: all 4 unit tests pass (flat/rising/falling/divide-by-zero guard)
[ ] getAvailableActions imported (not reimplemented) in MemberProfileHeader — confirmed
    via import statement, not just behavioral similarity
[ ] useScrollSpy correctly attaches a single IntersectionObserver instance observing
    multiple targets — verified in DevTools, not multiple per-section observers
[ ] useMemberCommitments confirmed to be a 1-line wrapper around useCommitments,
    zero duplicated query logic

DESIGN / TYPOGRAPHY
[ ] Poppins renders ONLY at: MemberScoreBreakdown's lg gauge center number, and
    MemberTrendChart's current-value callout — confirmed zero leakage elsewhere on page
[ ] CommitmentScore color logic identical across sm (table)/md (chip)/lg (profile) —
    only size and number-font differ, never the stroke color or threshold behavior
[ ] MemberSectionNav active label uses Jakarta + underline together, never underline alone
[ ] Sparkline line uses currentColor/text-primary — no hardcoded hex anywhere in the SVG

ACCESSIBILITY
[ ] Trend chart's aria-label sentence matches the actual rendered direction (rising/falling/flat)
    across at least one fixture of each type, verified by hand
[ ] Section nav buttons are real <button> elements, Tab-reachable, Enter/Space-activatable
[ ] AlertDialog (Remove confirm) traps focus correctly even though it's stacked above an
    already-open Sheet — confirmed Esc closes only the top-most layer

PRODUCT BEHAVIOR (carried from base spec — re-verified against today's deeper implementation)
[ ] Cross-team memberId in the URL resolves to a server-side 404, never a client flash-then-redirect
[ ] Removing a member navigates back to /team afterward — no ghost profile page left behind
[ ] Change-role flow has exactly one confirmation surface; Remove flow has exactly two
[ ] History section's CommitmentStatusTabs correctly filters to ONLY this member's commitments
    across every tab (Pending/Missed/Fulfilled/Deferred), verified with a multi-member fixture
```

---

*Document: DAY-38-DEEP-PLAN | Vocaply | Member Profile Page | Version 1.0*
*Typography: Plus Jakarta Sans (structural headings) + Inter (body/UI, tabular numerals) + Poppins (personal-numeral emphasis, two call sites only) + JetBrains Mono (unused today)*
*Principal Frontend Architecture — one person's accountability story, told with restraint*
