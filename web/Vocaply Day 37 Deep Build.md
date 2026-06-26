# Vocaply — Day 37 Deep Build Plan
## Team Health Dashboard: Member Table · Score Column · Trend Indicators
> Senior Frontend Architect Edition | Industry-Grade | Scalable to multi-hundred-member teams
> Typography: Inter (UI/body) + Plus Jakarta Sans (headings/display)
> Document: DAY-37-DEEP-PLAN | Version 1.0

---

## 0. Why Today Is a Trust Test, Not a "Table With Avatars"

Day 36 proved the product can move N rows at once. Today is harder in a quieter way: this is the screen where Vocaply tells a person, in front of their whole team, *how reliable they are*. Every visual decision today is a trust decision. A red score, a crown on the OWNER, a gradient progress bar — any one of these tips the screen from "accountability tool" into "performance-review shame board," and the product's entire positioning (Linear/Jira/Notion calm, not HR-software anxiety) breaks in one glance.

The engineering bar is also real: `CommitmentScore` (Day 34) gets its first proof of being a true reusable primitive, and `SortableColumnHeader` is the first generic, multi-future-consumer sort primitive in the codebase. If either is built as a one-off, Day 38 (Member Profile) and Day 81 (Analytics) inherit the debt.

---

## 1. Typography System (carried from Day 36, no drift)

```
--font-display: "Plus Jakarta Sans", "Inter", -apple-system, sans-serif;
--font-body:    "Inter", -apple-system, sans-serif;
--font-mono:    "JetBrains Mono", "SF Mono", monospace;

USAGE TODAY
  Plus Jakarta Sans (600) → PageHeader title ("Team"), TeamHealthStats big numbers
                              (the "82" in Team Health 82), Sheet title (InviteMemberSheet),
                              CommitmentScore center number (large/medium sizes only —
                              see §4.2 size-tier rule).
  Inter (400/500)          → table rows, RoleBadge text, column headers, menu items,
                              email chips, per-row counts.
  Inter tabular (tnum)     → ALL numeric columns: score, fulfillment %, total/fulfilled/
                              missed counts — non-negotiable, these columns visually
                              compare across rows and must align on the same baseline.
  JetBrains Mono           → unused today (no IDs surfaced on this screen).

SIZE TOKENS (reused verbatim from Days 26–36, zero new sizes introduced)
  text-[15px] font-jakarta font-semibold  → PageHeader title, Sheet title
  text-[20px] font-jakarta font-semibold  → TeamHealthStats number (one size up from
                                              Day 27's StatPill default — see §3.1)
  text-[13px] font-inter                  → table cells, member name
  text-[12px] font-inter font-medium      → RoleBadge, column header labels
  text-[11px] font-inter font-medium uppercase tracking-wide → micro-labels only
```

**Micro-intention:** the *only* font-size escalation introduced today is `TeamHealthStats`' number going to `20px` (vs. the dashboard's `18px` StatPill from Day 27). This is deliberate, not inconsistency — the Team Health number is the single most "headline" data point a manager looks at first on this page, so it earns one step of extra visual weight, while every other numeral on the screen (table cells) stays at the dense `13px` tabular baseline. One escalation, used once, is a hierarchy decision; three escalations scattered around would be noise.

---

## 2. File Manifest (exact, in build order)

```
apps/web/src/
│
├── app/(dashboard)/team/
│   ├── page.tsx                                    [1] RSC entry
│   └── loading.tsx                                 [2]
│
├── features/team/
│   ├── components/
│   │   ├── TeamHealthDashboard/
│   │   │   ├── TeamHealthDashboard.tsx             [7]  page composition
│   │   │   └── TeamHealthStats.tsx                 [6]
│   │   ├── MemberTable/
│   │   │   ├── MemberTable.tsx                     [9]
│   │   │   ├── MemberRow.tsx                       [8]
│   │   │   ├── MemberTableHeader.tsx               [5]
│   │   │   └── MemberTableSkeleton.tsx             [10]
│   │   ├── CommitmentRateBar.tsx                   [4]
│   │   ├── RoleBadge.tsx                           [3]
│   │   └── InviteMemberSheet.tsx                   [11]
│   │
│   ├── hooks/
│   │   ├── useTeam.ts                              [A]
│   │   ├── useTeamMembers.ts                       [B]
│   │   ├── useTeamHealth.ts                        [C]
│   │   ├── useInviteMembers.ts                     [D]
│   │   └── useSortableColumns.ts                   [E]  (generic — lives in shared/)
│   │
│   ├── api/
│   │   └── team.api.ts                             [F]  (extend Day 16's stub)
│   │
│   └── types/
│       └── team.types.ts                           [G]
│
└── shared/
    ├── components/data-display/
    │   └── SortableColumnHeader.tsx                 [12]
    └── hooks/
        └── useSortableColumns.ts                    [E]  canonical generic location
```

**Build order rationale:** `RoleBadge` and `CommitmentRateBar` (3, 4) are built *before* `MemberRow` (8) because they're pure, prop-only leaf components — building leaves before the row that composes them means `MemberRow` is written by *assembling already-correct pieces*, not by inlining logic that gets extracted later. `useSortableColumns` (E) is built before `MemberTableHeader`/`MemberTable` for the same reason as Day 36's hooks-before-components rule.

---

## 3. Data & State Architecture

### 3.1 `useTeamHealth.ts` — zero client-side math, by design

```typescript
function useTeamHealth() {
  return useQuery({
    queryKey: queryKeys.team.health(teamId),
    queryFn: () => teamApi.getHealth(),
    ...cacheConfig.teamHealth,   // staleTime 60s — health score doesn't need 15s freshness
  })
}
// Returns: { score: number; fulfillmentRate: number; onTimeRate: number; trend: Trend }
```
**Micro-intention:** the frontend does not compute `fulfillmentRate×0.6 + avgMemberScore×0.3 + onTimeRate×0.1` anywhere — not even as a "preview while loading" guess. This is a single-source-of-truth discipline carried from the architecture docs: any client-side reimplementation of a scoring formula is a future bug the moment the backend's weights change and nobody remembers to update the frontend's copy. `TeamHealthStats` is a pure renderer of four numbers it didn't calculate.

### 3.2 `useTeamMembers.ts` — small dataset, client-sort, server-shape

```typescript
function useTeamMembers() {
  return useQuery({
    queryKey: queryKeys.team.members(teamId),
    queryFn: () => teamApi.getMembers(),  // returns ALL members, no pagination
    ...cacheConfig.teamMembers,
    select: (data) => data.members,       // unwrap once, here, not in every consumer
  })
}
```
**Why no pagination today:** the platform's own plan-limit ceiling caps team size at 60 (BUSINESS tier) — this is a deliberate, documented decision to fetch the full member list in one call and sort/filter entirely client-side, rather than building cursor pagination for a dataset that structurally cannot exceed 60 rows. Building pagination here would be premature engineering for a bounded set; the moment ENTERPRISE's "unlimited" members becomes a real product reality, *that's* the day this hook gets a cursor — not before.

### 3.3 `useSortableColumns.ts` — the generic sort primitive (shared/hooks/)

```typescript
type SortDirection = 'asc' | 'desc'

function useSortableColumns<T>(
  items: T[],
  defaultSort: { key: keyof T; direction: SortDirection }
) {
  const [sort, setSort] = useState(defaultSort)

  const sorted = useMemo(() => {
    const copy = [...items]
    copy.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key]
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return sort.direction === 'asc' ? cmp : -cmp
    })
    return copy
  }, [items, sort])

  const toggleSort = (key: keyof T) => {
    setSort(prev =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }  // new column always starts ascending
    )
  }

  return { sorted, sort, toggleSort }
}
```
**Micro-intentions:**
- **Clicking a *new* column always resets to ascending**, never remembers a previous direction for that column — this matches the universal table convention (Notion, Linear, every spreadsheet) and avoids the confusing "I clicked Score and it sorted descending, why?" moment on first click.
- **No URL sync for sort state** — this is a deliberate divergence from `useMeetingFilters`/`useCommitmentFilters` (which *do* sync to the URL). Sort order here is ephemeral viewing preference on a small, fully-loaded dataset, not a filter that changes what data exists or that a manager would want to bookmark/share as a link. Documented here explicitly so a future engineer doesn't "fix" this into URL state and add complexity the screen doesn't need.
- **Generic over `T`**, not `Member`-typed — this hook is the one piece of today's work explicitly built for a *second* consumer before that consumer exists (any future small, fully-client-sortable table — e.g., a future "Integrations" list or "API Keys" settings table).

### 3.4 `useInviteMembers.ts` — modeling partial success as data, not as an exception

```typescript
interface InviteResult {
  invited: string[]
  alreadyMember: string[]
  alreadyInvited: string[]
  failed: string[]
}

function useInviteMembers() {
  return useMutation<InviteResult, ApiError, { emails: string[]; role: UserRole }>({
    mutationFn: (payload) => teamApi.inviteMembers(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.team.members(teamId) })
      // NOTE: no toast fired here — see §4.5, the Sheet itself renders the breakdown
    },
    onError: (err: ApiError) => {
      if (err.code === 'PLAN_LIMIT') return  // handled inline by the Sheet, not a toast
      toast.error('Failed to send invitations')
    },
  })
}
```
The mutation's success type is a **structured breakdown, not a boolean** — this is the data-modeling decision that makes §4.5's honest per-email UI possible at all. A lesser implementation would collapse this into `{ success: true }` and lose the nuance the backend deliberately computed.

---

## 4. Component-Level Patterns & Micro-Intentions

### 4.1 `RoleBadge.tsx` — restraint as the design choice

```tsx
function RoleBadge({ role }: { role: UserRole }) {
  return (
    <Badge variant="outline" className="font-inter font-medium text-[12px] tracking-wide">
      {role}
    </Badge>
  )
}
```
That's the entire component. No icon prop, no color-by-role map, no `switch` statement choosing a badge variant per role. **The absence of a feature here is the feature.** The one piece of restraint worth calling out: `variant="outline"` (not `"default"` filled) is used for *every* role identically — including OWNER — so that scanning down the column, the eye reads "these are all labels," not "this row is special." Differentiation lives entirely in `MemberRowMenu`'s available actions (§4.4), where it belongs functionally rather than decoratively.

### 4.2 `CommitmentScore` — proving the size-prop contract from Day 34

```tsx
<CommitmentScore score={member.commitmentScore} size="sm" />
```
Today's job for this component is **zero new code** — if `MemberRow` needs to add a prop or special-case to make the Day-34 gauge work at table-row scale, that's a signal Day 34's API was under-specified, and the fix belongs in `CommitmentScore.tsx` itself (adjusting stroke-width proportionally at `sm`, ensuring the center number drops to `10px` and stays legible without clipping), not in a wrapper. **Size-tier rule, locked today for all future consumers (Day 38, any future dashboard):**

```
size="sm"  → 32px diameter, stroke 3px, center number 10px Inter (NOT Jakarta — too small for the
             display font's wider letterforms to render cleanly at this size)
size="md"  → 56px diameter, stroke 4px, center number 16px Jakarta semibold
size="lg"  → 96px diameter, stroke 6px, center number 28px Jakarta semibold
```
**Micro-intention:** the center number's font *changes* between sizes — Jakarta at `md`/`lg`, Inter at `sm`. This is the one place today where the typography rule ("Jakarta never appears below display sizes") directly drives a component's internal logic rather than just a class name choice. At 32px diameter, Jakarta's slightly wider numeral shapes start to clip/feel cramped; Inter's tighter numerals stay crisp. Small detail, but it's exactly the kind of thing that separates "looks designed" from "looks fine."

### 4.3 `CommitmentRateBar.tsx`

```tsx
function CommitmentRateBar({ rate }: { rate: number }) {
  return (
    <div
      role="img"
      aria-label={`Fulfillment rate ${rate}%`}
      className="h-1 w-full rounded-full bg-muted overflow-hidden"
    >
      <div
        className="h-full bg-primary rounded-full transition-[width] duration-150 ease-out"
        style={{ width: `${Math.max(rate, 2)}%` }}
      />
    </div>
  )
}
```
**Micro-intentions:**
- `Math.max(rate, 2)` — a literal `0%` renders a fill of `2%` minimum, not nothing. A bar that visually disappears at zero reads as "broken," not "zero"; a 2px sliver at the start of the track communicates "this is a bar, currently empty" — small but deliberate floor value.
- `transition-[width]` (not a generic `transition-all`) — scoping the transition to exactly the property that changes avoids accidentally animating color/border on a future style tweak, and keeps the animation budget honest to the platform's "opacity + translateY only" *spirit* even though a width-fill bar is a justified, narrow exception (there's no other way to visually represent "this grew from 60% to 75%" without animating width).
- `role="img"` + `aria-label` — a 4px decorative-looking bar is otherwise invisible to a screen reader; this one line makes the exact same information available non-visually, in the same sentence a sighted user reads it ("Fulfillment rate 79%"), not buried in a separate table cell announcement.

### 4.4 `MemberRow.tsx` — permission-computed menu, not permission-checked-in-JSX

```tsx
function getAvailableActions(target: Member, requester: User): RowAction[] {
  const actions: RowAction[] = []
  if (target.role === 'OWNER') return actions               // nothing — ever
  if (target.id === requester.id) return actions             // can't act on yourself here
  if (ROLE_LEVEL[requester.role] <= ROLE_LEVEL[target.role]) return actions

  actions.push({ id: 'change-role', label: 'Change role' })
  actions.push({ id: 'remove', label: 'Remove from team', destructive: true })
  return actions
}

function MemberRow({ member, requester }: Props) {
  const actions = useMemo(() => getAvailableActions(member, requester), [member, requester])

  return (
    <div
      role="row"
      tabIndex={0}
      className="grid grid-cols-[1fr_100px_72px_140px_180px_90px_36px] h-9 items-center
                 text-[13px] hover:bg-muted/40 cursor-pointer outline-none
                 focus-visible:bg-muted/40"
      onClick={() => router.push(`/team/${member.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && router.push(`/team/${member.id}`)}
    >
      <div className="flex items-center gap-2 truncate">
        <Avatar className="size-6"><AvatarImage src={member.avatarUrl} /></Avatar>
        <span className="truncate">{member.name}</span>
      </div>
      <RoleBadge role={member.role} />
      <CommitmentScore score={member.commitmentScore} size="sm" />
      <CommitmentRateBar rate={member.fulfillmentRate} />
      <div className="tabular text-right text-muted-foreground text-[12px]">
        {member.fulfilled}/{member.total} · {member.missed} missed
      </div>
      <TrendIndicator trend={member.trend} />
      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost" size="icon-sm"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Actions for ${member.name}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {actions.map(a => (
              <DropdownMenuItem key={a.id} variant={a.destructive ? 'destructive' : 'default'}>
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
**Micro-intentions:**
- `getAvailableActions` is a **pure function exported from the row file**, not inline JSX conditionals scattered across three `{condition && <Item/>}` blocks — this is what makes the "menu item absent entirely, not just disabled" checklist requirement trivially testable in isolation (a unit test calls the function with fixtures, no rendering needed) and reusable verbatim by Day 38's `MemberProfile` header menu, which needs the *exact same* permission logic at a different visual scale.
- **`actions.length > 0` gates whether the `DropdownMenu` trigger renders at all** — for OWNER rows and the requester's own row, there is no kebab button, not a disabled one. A disabled-but-visible button invites a curious click and a "why can't I do this?" moment; an absent button doesn't.
- Whole-row is `role="row"` + `tabIndex={0}` + `onKeyDown` Enter-to-navigate — this is the keyboard-first principle applied identically to how `MeetingCard`/`CommitmentRow` already work, satisfying ⌘K-adjacent "everything reachable by keyboard" without introducing a new interaction idiom.
- `stopPropagation` is applied at **both** the trigger button and the menu content's click — a menu item click that bubbles to the row's `onClick` and accidentally navigates away mid-action is a real bug class in careless table implementations; both layers are guarded explicitly.

### 4.5 `InviteMemberSheet.tsx` — partial success rendered honestly

```tsx
function InviteMemberSheet() {
  const [emails, setEmails] = useState<string[]>([])
  const [role, setRole] = useState<UserRole>('MEMBER')
  const invite = useInviteMembers()
  const [result, setResult] = useState<InviteResult | null>(null)

  return (
    <Sheet>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-jakarta font-semibold text-[14px]">
            Invite teammates
          </SheetTitle>
        </SheetHeader>

        {invite.error?.code === 'PLAN_LIMIT' && (
          <PlanLimitBanner {...invite.error.details} />
        )}

        {!result ? (
          <>
            <EmailChipInput value={emails} onChange={setEmails} max={20} />
            <Select value={role} onValueChange={setRole}>
              {/* MEMBER / MANAGER / ADMIN only — OWNER never an option */}
            </Select>
          </>
        ) : (
          <ul className="space-y-1 text-[13px]">
            {result.invited.map(e => <InviteResultRow key={e} email={e} status="invited" />)}
            {result.alreadyMember.map(e => <InviteResultRow key={e} email={e} status="alreadyMember" />)}
            {result.alreadyInvited.map(e => <InviteResultRow key={e} email={e} status="alreadyInvited" />)}
          </ul>
        )}

        <SheetFooter>
          {!result ? (
            <Button onClick={() => invite.mutate({ emails, role }, { onSuccess: setResult })}>
              Send invites
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => { setResult(null); setEmails([]) }}>
              Invite more
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function InviteResultRow({ email, status }: { email: string; status: InviteStatus }) {
  const copy = {
    invited:        { label: 'Invited',          icon: Check },
    alreadyMember:  { label: 'Already a member', icon: Minus },
    alreadyInvited: { label: 'Invite pending',    icon: Clock },
  }[status]
  return (
    <li className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="truncate text-muted-foreground">{email}</span>
      <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
        <copy.icon className="size-3" /> {copy.label}
      </span>
    </li>
  )
}
```
**Micro-intentions:**
- The Sheet **swaps its own body content** (form → result list) rather than closing and firing a toast — this keeps the user in context with exactly what they submitted, and the "Invite more" footer button resets cleanly back to the form for a second batch without reopening the Sheet, a small continuity win for anyone inviting a whole team in two or three passes.
- Every status uses a **neutral icon + muted text**, never a green checkmark badge or red warning — `alreadyMember` is informational, not an error; `alreadyInvited` is informational, not a warning. Coloring any of these would imply judgment about an outcome that's actually just "here's what's true right now."
- `PlanLimitBanner` renders **inside the still-open Sheet**, above the form, not as a redirect or a blocking error screen — the user can see exactly how many emails they tried to add vs. how many the plan allows, and trim the list themselves rather than starting over.

### 4.6 `TeamHealthStats.tsx` — composition, not new chart code

```tsx
function TeamHealthStats() {
  const { data, isPending } = useTeamHealth()
  if (isPending) return <TeamHealthStatsSkeleton />

  return (
    <div className="grid grid-cols-4 gap-3">
      <StatPill label="Team Health"    value={data.score}            size="lg" />
      <StatPill label="Fulfillment"    value={`${data.fulfillmentRate}%`} />
      <StatPill label="On-time"        value={`${data.onTimeRate}%`} />
      <StatPill label="Trend"          value={<TrendIndicator trend={data.trend} />} />
    </div>
  )
}
```
This is intentionally the **shortest component in today's build** — `StatPill` (Day 27), `TrendIndicator` (Day 34), and `useTeamHealth` (§3.1) already did all the real work. Writing this component as four lines of JSX composition rather than reaching for a new chart/stat-card pattern is itself the architectural statement: by Day 37, the primitive vocabulary should be rich enough that a new "dashboard strip" is assembly, not invention.

---

## 5. Performance Engineering for Today

```
CONCERN                          TECHNIQUE
──────────────────────────────────────────────────────────────────────────
Member list (bounded ≤60 rows)   No virtualization needed — plain map render;
                                  VirtualList would be over-engineering for a
                                  dataset this small (documented decision, §3.2)
Client-side sort cost            useMemo-wrapped sort in useSortableColumns —
                                  recomputes only when items or sort key/direction
                                  change, not on every parent re-render
CommitmentScore re-render         Memoized at the score-value level — a sort or
                                  filter that reorders rows does NOT re-render
                                  every gauge's SVG, only re-positions the row
RoleBadge / CommitmentRateBar     Both pure, prop-only, zero internal state —
                                  trivially cheap, no memoization even needed
Sheet result-list render          InviteResultRow list is capped at 20 (the
                                  invite max) — no virtualization needed, same
                                  bounded-dataset reasoning as the member table
Font weight                      Zero new font weights/sizes loaded today beyond
                                  the existing Day-2 font subset — no additional
                                  network request
```

---

## 6. Accessibility & Keyboard Map (Day 37 additions)

```
KEY                  CONTEXT                          ACTION
──────────────────────────────────────────────────────────────────────
Enter                Row focused                      Navigate to MemberProfile
Click on header       Sortable column                  Toggle asc/desc for that column
Tab                  Sheet open (Invite)               Cycles email input → role select →
                                                        send button (focus-trapped)
Esc                  Sheet open                        Closes Sheet, discards unsent draft
Enter                Email chip input                  Commits current text as a chip
Backspace (empty)    Email chip input                  Removes last chip
```
`MemberTableHeader`'s sortable columns are real `<button>` elements (not `<div onClick>`), so they're keyboard-focusable and `Enter`/`Space`-activatable for free — no custom keyboard handler needed beyond what a semantic button already provides. This is the same "use the right element, inherit the right behavior" discipline as Day 36's `Checkbox` indeterminate state.

---

## 7. Scalability Notes (why this survives team growth and product growth)

1. **`getAvailableActions` (§4.4) is the single source of row-permission truth** — Day 38's `MemberProfile` header menu imports this exact function rather than re-deriving the OWNER/self/role-hierarchy rules a second time. If the backend's permission rules ever change, one function changes, two UI surfaces inherit the fix automatically.
2. **`useSortableColumns` is generic over `T`** — any future small, bounded, client-sortable list (API Keys settings table, Webhooks list) gets sorting for free, with the exact same "click resets to ascending" convention already battle-tested here.
3. **`CommitmentScore`'s three-tier size contract (§4.2) is now locked by a real second consumer** — Day 38 can safely add a `lg` usage without guessing whether the component's internals will hold up; today's `sm` usage already proved the prop-driven scaling works.
4. **`InviteResult`'s structured shape (§3.4) scales to richer future UI** — if a future version wants to show *why* an email was already invited (e.g., "invited 3 days ago, expires in 4"), that's an additive field on the existing shape, not a redesign of the success/error model.
5. **The member-list "no pagination, bounded by plan limit" decision is explicitly documented**, not an accidental oversight — the day ENTERPRISE's unlimited tier ships, this is the one file (`useTeamMembers.ts`) that gets a cursor added, with zero ripple into `MemberTable`/`MemberRow`, which already only know "a list of members," not "how that list was fetched."

---

## 8. End-of-Day Verification (engineering + design QA, combined)

```
ENGINEERING
[ ] useSortableColumns: clicking a new column always starts ascending, re-clicking same
    column toggles direction, confirmed across string (name) and numeric (score) columns
[ ] getAvailableActions covered by unit tests: OWNER target, self target, lower-role
    requester, equal-role requester — all four return an empty action list correctly
[ ] CommitmentScore "sm" size renders with zero SVG clipping at 32px in both
    Chrome and Safari (stroke/viewBox math double-checked at the smallest tier)
[ ] InviteResult partial-success state renders correctly for a mixed batch
    (some invited, some alreadyMember, some alreadyInvited in one submission)

DESIGN / TYPOGRAPHY
[ ] Plus Jakarta Sans confirmed ONLY on: PageHeader title, TeamHealthStats big number,
    Sheet title, CommitmentScore center number at md/lg sizes (NOT sm — Inter there)
[ ] RoleBadge uses identical visual treatment for OWNER as for MEMBER — zero color/icon
    differentiation confirmed by direct screenshot comparison
[ ] CommitmentRateBar fill color identical at 10%, 50%, 90% test values — only width differs
[ ] CommitmentRateBar at 0% renders a visible 2px sliver, not an invisible empty track

ACCESSIBILITY
[ ] Sortable column headers are real <button> elements, reachable and activatable via Tab+Enter
[ ] CommitmentRateBar announces "Fulfillment rate {N}%" via aria-label, verified with
    a screen reader, not just visually inspected
[ ] Row-end kebab menu unmounts entirely (not disabled) for OWNER rows and the requester's
    own row — confirmed in the DOM inspector, not just visually hidden

PRODUCT BEHAVIOR (carried from base spec — re-verified)
[ ] Row click navigates to profile; menu trigger/menu-item clicks do not (stopPropagation
    verified at both the trigger and the content layer)
[ ] ADMIN requester sees Change-role/Remove on MANAGER/MEMBER rows but not on other ADMINs
[ ] MANAGER requester sees no Change-role/Remove options on ADMIN or OWNER rows
[ ] FREE plan limit hit during invite → PlanLimitBanner renders inside the still-open Sheet,
    submitted email list remains visible/editable, not cleared
```

---

*Document: DAY-37-DEEP-PLAN | Vocaply | Team Health Dashboard | Version 1.0*
*Typography: Plus Jakarta Sans (display) + Inter (body/UI, tabular numerals) + JetBrains Mono (unused today)*
*Principal Frontend Architecture — accountability without anxiety, density without decoration*
