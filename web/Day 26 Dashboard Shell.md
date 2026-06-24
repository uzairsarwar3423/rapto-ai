# Day 26 — Dashboard Shell Build Plan
## AppShell · Sidebar · Topbar · Command Menu · Routing Foundation
> Senior Frontend Architecture Edition · Linear/Jira-grade Workspace Chrome
> Stack: Next.js 14 (App Router, RSC) · TypeScript strict · Tailwind · shadcn/ui · Zustand
> Document: DAY26-SHELL-001 | Version 1.0

---

## 0. Why This Day Is the Highest-Leverage Day of the Sprint

Every screen built from Day 27 onward mounts *inside* what we ship today. A 5px spacing mistake, a font-loading flash, or a sidebar that re-renders on every nav click will compound across 20 future pages. Today is not "build a sidebar" — today is **lock the physical constants of the entire product**: type scale, color tokens, motion curve, focus ring, row height. Nothing downstream should ever need to re-decide these.

**Definition of done for the day:** a blank dashboard route that *feels* like Linear — instant, dense, silent, keyboard-operable — with zero content yet rendered inside it.

---

## 1. Typography System (locked today, used forever)

Three font families, each with a *single job*. No font is decorative.

```
FAMILY                 ROLE                              WHERE USED
─────────────────────────────────────────────────────────────────────────────────
Inter                  UI text — the workhorse           Sidebar labels, topbar,
                        Variable font, tabular-nums       buttons, table cells, body
                        enabled for numeric columns       text, badges, tooltips

Plus Jakarta Sans      Headings / emphasis only           PageHeader <h1>, modal/sheet
                        Slightly geometric, more           titles, empty-state headline,
                        "designed" than Inter — used       settings section titles
                        SPARINGLY so it reads as intent,
                        not as a second random font

Geist Mono             IDs, keyboard shortcuts,           Kbd component, meeting IDs,
  (or JetBrains Mono)   timestamps in transcript,          commitment IDs, code-like
                        monospace numeric alignment        values, "⌘K" hint text
```

### 1.1 Why this split (and not "Inter everywhere")
- **Inter** at small sizes (13px) has excellent hinting and tabular figures — critical for dense tables where numbers must align column-to-column.
- **Plus Jakarta Sans** is reserved for headings only. Using it everywhere would slow the UI down visually (every heading would "shout"). Using it *only* for page titles and empty-state headlines gives the product a single moment of personality per screen, then gets out of the way.
- **Geist Mono** signals "this is a precise, copyable, technical value" — exactly how Linear uses mono for issue IDs (`ENG-142`) and how we'll use it for `mtg_01`, `com_01`, and `⌘K`.

### 1.2 Implementation — Next.js Font Loading

```
app/fonts.ts                      ← NEW: centralized font loader, self-hosted via next/font

  import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
  import localFont from 'next/font/local'

  export const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
    display: 'swap',
    axes: ['opsz'],
  })

  export const jakarta = Plus_Jakarta_Sans({
    subsets: ['latin'],
    weight: ['600', '700'],        // ONLY semibold/bold — never used for body weight
    variable: '--font-jakarta',
    display: 'swap',
  })

  export const geistMono = localFont({
    src: '../public/fonts/GeistMono-Variable.woff2',
    variable: '--font-mono',
    display: 'swap',
  })
```

```
app/layout.tsx
  <html className={cn(inter.variable, jakarta.variable, geistMono.variable)}>
  // Tailwind config maps these CSS vars to font-sans / font-heading / font-mono
```

```
tailwind.config.ts (extend)
  fontFamily: {
    sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
    heading: ['var(--font-jakarta)', 'var(--font-inter)', 'sans-serif'],
    mono:    ['var(--font-mono)', 'ui-monospace', 'monospace'],
  }
```

**Rule enforced from today onward:** no component ever imports a font directly. Everything goes through `font-sans` / `font-heading` / `font-mono` utility classes. This is what lets us swap a typeface in one file in Month 6 without touching 80 components.

### 1.3 Type Scale (the only sizes allowed in the entire dashboard)

```
TOKEN              SIZE / LINE-HEIGHT     WEIGHT        USAGE
──────────────────────────────────────────────────────────────────────────
text-2xs           11px / 16px            500           Kbd hints, micro-labels
text-xs            12px / 16px            400/500       Badge text, table meta, timestamps
text-sm            13px / 20px            400           Body default — THE base size
text-sm-medium     13px / 20px            500           Active nav item, emphasized cell
text-base-heading  15px / 22px            600 (Jakarta)  PageHeader <h1>, Sheet title
text-lg-heading    18px / 26px            700 (Jakarta)  Empty-state headline only
```

No `text-base` (16px), no `text-lg` Inter, no `text-xl+` anywhere in the dashboard shell. Marketing-site type scale (Days 71–80) is intentionally a separate, larger scale — the two must never bleed into each other.

---

## 2. Color Token Finalization (CSS variables, light + dark)

Building directly on the locked palette, formalized as actual CSS so every component below references *tokens*, never raw Tailwind colors.

```css
/* app/globals.css */

@layer base {
  :root {
    --background:        0 0% 100%;
    --surface:            0 0% 98%;
    --surface-hover:      0 0% 96%;
    --border:             0 0% 90%;
    --border-strong:      0 0% 83%;
    --foreground:         0 0% 9%;
    --muted-foreground:   0 0% 45%;
    --accent:             0 0% 9%;          /* near-black accent, not blue/purple */
    --accent-foreground:  0 0% 100%;
    --ring:               0 0% 9%;
    --danger:             4 70% 45%;
    --warning:            38 70% 45%;
    --success:            150 40% 35%;
    --radius:             6px;
  }

  .dark {
    --background:         0 0% 7%;
    --surface:             0 0% 10%;
    --surface-hover:       0 0% 13%;
    --border:              0 0% 16%;
    --border-strong:       0 0% 22%;
    --foreground:          0 0% 95%;
    --muted-foreground:    0 0% 60%;
    --accent:              0 0% 95%;
    --accent-foreground:   0 0% 9%;
    --ring:                0 0% 70%;
    --danger:              4 65% 58%;
    --warning:             38 65% 58%;
    --success:             150 40% 50%;
  }
}
```

**Hard rule:** `--success` / `--warning` / `--danger` are used only as *text/dot* colors (status indicators), never as full badge backgrounds. A "MISSED" badge is `text-[--danger] border-[--danger]/30 bg-transparent`, never a solid red pill. This is what keeps the UI from looking like a generic admin template.

---

## 3. File Structure for Today (final, with build order)

```
shared/components/layout/
  AppShell.tsx
  Sidebar/
    Sidebar.tsx
    SidebarProvider.tsx
    SidebarNav.tsx
    SidebarNavItem.tsx
    SidebarNavGroup.tsx
    SidebarTeamSwitcher.tsx
    SidebarUser.tsx
    SidebarCollapseButton.tsx
  Topbar/
    Topbar.tsx
    Breadcrumb.tsx
    SearchTrigger.tsx
    NotificationBell.tsx
    TopbarActions.tsx
  CommandMenu/
    CommandMenu.tsx
    CommandMenuItem.tsx
    commandMenu.registry.ts
  PageContainer.tsx
  PageHeader.tsx
  Kbd.tsx

shared/hooks/
  useKeyboardShortcut.ts
  useSidebarState.ts
  useCommandMenu.ts
  useFocusListNavigation.ts        ← NEW: generic ↑/↓/Enter list nav (reused Day 28+)

store/
  ui.store.ts                      (extended)

app/
  fonts.ts                         ← NEW (Section 1.2)
  layout.tsx                       (root — fonts + ThemeProvider only)
  (dashboard)/
    layout.tsx                     ← RSC entry point
    dashboard/page.tsx             ← placeholder "Dashboard" stub today (real Day 27)

middleware.ts                      ← EXTEND: read sidebar-collapsed cookie pass-through
```

### Build order (why this sequence, not file-alphabetical)
1. **Tokens + fonts first** (Section 1–2) — nothing visual should be built before the constants exist.
2. **`Kbd.tsx` + `useKeyboardShortcut`** — tiny, dependency-free, needed by almost everything else today.
3. **`SidebarProvider` + `useSidebarState`** — state must exist before any component reads it.
4. **`Sidebar/*`** — the widest, most stateful piece.
5. **`Topbar/*`** — depends on nothing from Sidebar except shared layout width.
6. **`CommandMenu/*`** — depends on the nav registry, built last so it can register real routes from Sidebar.
7. **`AppShell.tsx` + `app/(dashboard)/layout.tsx`** — the assembly step, wires everything together.

---

## 4. Component-by-Component Engineering Detail

### 4.1 `Kbd.tsx` — the smallest, most-reused component of the whole sprint

```tsx
// Pure, no state, no deps beyond cn()
interface KbdProps { keys: string[] }

export function Kbd({ keys }: KbdProps) {
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-2xs text-muted-foreground">
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded-[4px] border border-border bg-surface px-1.5 py-0.5
                     leading-none shadow-[inset_0_-1px_0_var(--border)]"
        >
          {k}
        </kbd>
      ))}
    </span>
  )
}
```
- Renders OS-aware symbols (`⌘` on Mac, `Ctrl` on Windows) via a small `useIsMac()` hook checking `navigator.platform` once at mount, memoized.
- Used inside: `SearchTrigger`, `CommandMenuItem`, `SidebarCollapseButton` tooltip, and every future "shortcut hint" in the product.

### 4.2 `useKeyboardShortcut.ts`

```
Signature: useKeyboardShortcut(combo: string, handler: () => void, opts?: { enabled?: boolean })

Engineering requirements:
  - Single global keydown listener per unique combo (dedupe via a module-level Map<string, Set<handler>>)
    so 10 components binding 'esc' don't register 10 raw `addEventListener` calls.
  - Ignores keydown when focus is inside an <input>/<textarea>/[contenteditable]
    UNLESS the combo explicitly opts in (Cmd+K must work even while typing in a search box elsewhere).
  - Cleans up on unmount — no leaked listeners across route changes (verified via a dev-only
    listener-count assertion in development mode).
```

### 4.3 `useSidebarState.ts` + `SidebarProvider.tsx`

```
Server truth:  cookie "sidebar:collapsed" (httpOnly: false, so client can write it too)
Client truth:  Zustand slice (ui.store.ts) hydrated FROM the cookie value on first render

Flow:
  1. app/(dashboard)/layout.tsx (RSC) reads cookies().get('sidebar:collapsed')
  2. Passes defaultCollapsed boolean as a prop into <SidebarProvider defaultCollapsed={...}>
  3. SidebarProvider initializes Zustand state with that value — NO useEffect, NO flash
  4. SidebarCollapseButton calls setCollapsed() → updates Zustand AND writes the cookie
     (document.cookie write, 1-year expiry) so next server render already knows

Why cookie + Zustand (not just localStorage):
  localStorage is invisible to the RSC on first server render → guaranteed flash of
  wrong-width sidebar. Cookie is visible server-side → zero flash. Zustand is what
  makes the *client-side* toggle instant without prop-drilling through every layout.
```

### 4.4 `Sidebar.tsx` — composition, not a monolith

```tsx
<aside
  data-collapsed={collapsed}
  className="group flex h-dvh flex-col border-r border-border bg-surface
             transition-[width] duration-180 ease-out
             w-[240px] data-[collapsed=true]:w-[56px]"
>
  <SidebarTeamSwitcher collapsed={collapsed} />
  <Separator />
  <ScrollArea className="flex-1 px-2 py-3">
    <SidebarNavGroup label="Workspace" collapsed={collapsed}>
      <SidebarNavItem icon={LayoutDashboard} label="Dashboard" href="/dashboard" />
      <SidebarNavItem icon={Video}          label="Meetings"   href="/meetings" />
      <SidebarNavItem icon={CheckCircle2}   label="Commitments" href="/commitments" />
      <SidebarNavItem icon={ListTodo}       label="Action Items" href="/action-items" />
      <SidebarNavItem icon={Users}          label="Team"        href="/team" />
      <SidebarNavItem icon={BarChart3}      label="Analytics"   href="/analytics" />
    </SidebarNavGroup>
    <Separator className="my-2" />
    <SidebarNavGroup label="Intelligence" collapsed={collapsed}>
      <SidebarNavItem icon={Sparkles} label="Intelligence" href="/intelligence" />
    </SidebarNavGroup>
  </ScrollArea>
  <Separator />
  <SidebarNavItem icon={Settings} label="Settings" href="/settings" className="mx-2 mt-2" />
  <SidebarUser collapsed={collapsed} />
</aside>
```

**Active-state logic (`SidebarNavItem`):**
```
isActive = pathname === href || pathname.startsWith(href + '/')
className:
  base:    flex items-center gap-2.5 h-8 rounded-md px-2 text-sm text-muted-foreground
            hover:bg-surface-hover hover:text-foreground transition-colors duration-120
  active:  bg-surface-hover text-foreground font-medium
           relative before:absolute before:left-0 before:top-1 before:bottom-1
           before:w-[2px] before:rounded-full before:bg-foreground
```
That `before:` pseudo-element is the *entire* "active indicator" — a 2px left bar, no background fill block, no colored icon. This single visual rule is what separates Linear-grade restraint from a generic dashboard template with blue highlighted rows.

**Collapsed state behavior:**
- `SidebarNavItem` renders only the icon, centered, `w-8 h-8`.
- Label moves into a `Tooltip` (`delayDuration={300}`, `side="right"`) — exact label text, exact same string as expanded mode (single source of truth: the `label` prop, never duplicated).
- `SidebarNavGroup` headers (e.g., "Workspace") disappear entirely when collapsed — no truncated "W" label, just remove it (Separator still shows as a visual section break).

### 4.5 `SidebarTeamSwitcher.tsx`

```
Trigger button: Avatar (team initials or logo, 24px) + team name (truncate) + ChevronsUpDown icon
                 Collapsed: avatar only, no chevron, no name

DropdownMenu content:
  ┌─────────────────────────────┐
  │ TechFlow Engineering         │  ← current team, Badge "GROWTH" inline
  │ ──────────────────────────── │
  │ Team settings            →   │  → /settings/team
  │ Invite members            →   │  → opens InviteMemberModal (stub today)
  │ ──────────────────────────── │
  │ + Create team (soon)         │  ← disabled, tooltip "Multi-team coming soon"
  └─────────────────────────────┘

Engineering note: team/user data comes down as props from the RSC layout — this
component does ZERO client-side fetching. It is purely presentational + a
DropdownMenu wiring exercise today. Real "switch team" logic is multi-team v2,
explicitly out of scope (per backend design docs) — the disabled state is intentional,
not a bug.
```

### 4.6 `SidebarUser.tsx`

```
Bottom-pinned row: Avatar (24px) + name (truncate) + email subtext (12px muted)
                    Collapsed: avatar only, centered

Click → DropdownMenu (anchored above, side="top" so it never clips at viewport bottom):
  Profile · Notifications · Security · ────── · Sign out (text-danger)

"Sign out" wires to the EXISTING useLogout() hook from Day 9 — no new auth logic
written today, just consumed.
```

### 4.7 `Topbar.tsx`

```tsx
<header className="flex h-12 items-center justify-between border-b border-border
                    bg-background px-4">
  <div className="flex items-center gap-3">
    <SidebarCollapseButton />          {/* mobile/desktop both — icon-only, ⌘\ tooltip */}
    <Breadcrumb />
  </div>
  <SearchTrigger />                     {/* visually centered via flex-1 + justify-center wrapper */}
  <div className="flex items-center gap-2">
    <TopbarActions />                   {/* empty slot today */}
    <NotificationBell />
  </div>
</header>
```

`Breadcrumb.tsx` — derives from `usePathname()` + a static map:
```
ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', meetings: 'Meetings', commitments: 'Commitments',
  'action-items': 'Action Items', team: 'Team', analytics: 'Analytics',
  intelligence: 'Intelligence', settings: 'Settings',
}
// Dynamic segments ([meetingId] etc.) are NOT resolved to titles today —
// they render as a generic "Meeting" placeholder; Day 29 upgrades this to
// show the real meeting title once detail pages exist.
```

`SearchTrigger.tsx`:
```tsx
<button onClick={openCommandMenu}
        className="flex h-8 w-[280px] items-center justify-between rounded-md
                    border border-border bg-surface px-3 text-sm text-muted-foreground
                    hover:border-border-strong transition-colors duration-120">
  <span className="flex items-center gap-2">
    <Search className="h-3.5 w-3.5" /> Search everything…
  </span>
  <Kbd keys={['⌘', 'K']} />
</button>
```

`NotificationBell.tsx`:
```
Icon button (Bell, 16px) + a 6px unread dot (top-right, --danger) shown only if
unreadCount > 0 (hardcoded 0 today — Day 39 wires real count via WebSocket).
onClick → opens <Sheet side="right"> with a placeholder: "No notifications yet"
EmptyState pattern (reused from shared/components/feedback/EmptyState.tsx).
```

### 4.8 Command Menu — the keyboard-first centerpiece

```
commandMenu.registry.ts:

  type CommandItem = {
    id: string
    label: string
    group: 'Navigate' | 'Actions'
    icon: LucideIcon
    shortcut?: string[]
    perform: (router: AppRouterInstance) => void
  }

  export const navigateCommands: CommandItem[] = [
    { id: 'nav-dashboard',   label: 'Dashboard',    group: 'Navigate', icon: LayoutDashboard,
      perform: (r) => r.push('/dashboard') },
    { id: 'nav-meetings',    label: 'Meetings',     group: 'Navigate', icon: Video,
      perform: (r) => r.push('/meetings') },
    { id: 'nav-commitments', label: 'Commitments',  group: 'Navigate', icon: CheckCircle2,
      perform: (r) => r.push('/commitments') },
    { id: 'nav-action-items',label: 'Action Items', group: 'Navigate', icon: ListTodo,
      perform: (r) => r.push('/action-items') },
    { id: 'nav-team',        label: 'Team',         group: 'Navigate', icon: Users,
      perform: (r) => r.push('/team') },
    { id: 'nav-analytics',   label: 'Analytics',    group: 'Navigate', icon: BarChart3,
      perform: (r) => r.push('/analytics') },
    { id: 'nav-settings',    label: 'Settings',     group: 'Navigate', icon: Settings,
      perform: (r) => r.push('/settings') },
  ]

  export const actionCommands: CommandItem[] = [
    { id: 'action-new-meeting', label: 'New meeting', group: 'Actions', icon: Plus,
      shortcut: ['⌘', 'N'],
      perform: () => toast.info('Coming Day 32') },   // stub — real Day 32
  ]

  // Future days append to these arrays — CommandMenu.tsx itself never changes.
```

```tsx
// CommandMenu.tsx
<CommandDialog open={open} onOpenChange={setOpen}>
  <CommandInput placeholder="Type a command or search…" />
  <CommandList>
    <CommandEmpty>No results found.</CommandEmpty>
    <CommandGroup heading="Navigate">
      {navigateCommands.map((cmd) => <CommandMenuItem key={cmd.id} cmd={cmd} />)}
    </CommandGroup>
    <CommandGroup heading="Actions">
      {actionCommands.map((cmd) => <CommandMenuItem key={cmd.id} cmd={cmd} />)}
    </CommandGroup>
  </CommandList>
</CommandDialog>
```

**Performance requirement:** `CommandMenu` is mounted once, globally, inside `AppShell` — never per-page. It is also **code-split**: `cmdk` only loads when the user first triggers it (`next/dynamic` with `ssr: false`), so the ~8kb dependency never blocks first paint on a page where the user never opens the palette.

```tsx
const CommandMenu = dynamic(() => import('./CommandMenu').then(m => m.CommandMenu), { ssr: false })
```

`useCommandMenu.ts` exposes `{ open, setOpen, toggle }` backed by `ui.store.ts`'s `commandMenuOpen` — bound to `Cmd+K` / `Ctrl+K` via `useKeyboardShortcut('mod+k', toggle)` registered once in `AppShell`.

### 4.9 `AppShell.tsx` — final assembly

```tsx
// shared/components/layout/AppShell.tsx
export function AppShell({ user, team, defaultCollapsed, children }: Props) {
  return (
    <SidebarProvider defaultCollapsed={defaultCollapsed}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <Sidebar user={user} team={team} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <ScrollArea className="flex-1">
            <main className="min-h-full">{children}</main>
          </ScrollArea>
        </div>
      </div>
      <CommandMenu />
    </SidebarProvider>
  )
}
```

```tsx
// app/(dashboard)/layout.tsx
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies()
  const defaultCollapsed = cookieStore.get('sidebar:collapsed')?.value === 'true'

  const [user, team] = await Promise.all([getServerUser(), getServerTeam()])
  if (!user) redirect('/login')
  if (!team) redirect('/onboarding')

  return (
    <AppShell user={user} team={team} defaultCollapsed={defaultCollapsed}>
      {children}
    </AppShell>
  )
}
```

`getServerUser` / `getServerTeam` reuse the exact server-side auth helpers built Day 10 — **no new fetching logic is written today**, only consumed.

### 4.10 `PageContainer.tsx` / `PageHeader.tsx`

```tsx
export function PageContainer({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1400px] px-6 py-5">{children}</div>
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-5 flex items-start justify-between">
      <div>
        <h1 className="font-heading text-base-heading text-foreground">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
```

This is the **only** place `font-heading` (Plus Jakarta Sans) appears in the entire dashboard shell today — every page title in the product, forever, routes through this one component.

---

## 5. Motion Specification (exact values, no ambiguity)

```
TRANSITION                     PROPERTY       DURATION   EASING            NOTES
─────────────────────────────────────────────────────────────────────────────────
Sidebar collapse/expand        width          180ms      ease-out          CSS transition only
Nav item hover                 background     120ms      ease-out          color, never transform
Tooltip appear                 opacity        100ms      ease-out          delay 300ms before start
Command menu open               opacity+y(4px) 100ms      ease-out          Radix default + override
Sheet slide-in (notification)  transform      180ms      ease-out          Radix default, unmodified
Active nav indicator            (none)        instant    —                 no transition — appears/
                                                                            disappears immediately,
                                                                            since route change itself
                                                                            already has visual weight
```

`tailwind.config.ts` extension:
```ts
transitionDuration: { '120': '120ms', '160': '160ms', '180': '180ms' },
transitionTimingFunction: { 'out-soft': 'cubic-bezier(0.16, 1, 0.3, 1)' },
```
Every custom transition in the shell uses `duration-120`/`duration-180` + `ease-out` — never the Tailwind default `ease-in-out`, which has a slow-start that feels sluggish for UI chrome.

---

## 6. Accessibility & Focus Management (non-negotiable today)

- Every interactive element in Sidebar/Topbar/CommandMenu has a visible **focus ring** (`focus-visible:ring-2 focus-visible:ring-[--ring] focus-visible:ring-offset-2`) — mouse clicks never show the ring (`focus-visible`, not `focus`), keyboard tabbing always does.
- `Sidebar` nav list is a semantic `<nav><ul><li>` structure, not a `div` soup — screen readers get a real landmark.
- `CommandDialog` (Radix `Dialog` under the hood via `cmdk`) automatically traps focus and restores it to the trigger on close — verified manually today, not assumed.
- Collapsed sidebar icons each carry an `aria-label` matching their tooltip text, since the visible label is removed from the DOM.
- Skip-link consideration deferred to Day 91 (dedicated a11y day) but the landmark structure (`<header>`, `<nav>`, `<main>`) is established today specifically so that day has something correct to attach to.

---

## 7. Performance Budget for Today's Shell

```
METRIC                                  TARGET           HOW VERIFIED
─────────────────────────────────────────────────────────────────────────────
Shell JS (Sidebar+Topbar, gzipped)      < 12kb           webpack-bundle-analyzer
cmdk chunk (lazy)                       < 10kb            loaded only on first ⌘K
Sidebar collapse toggle response        < 16ms            one frame, no layout thrash
First paint of shell (no content)       < 400ms on 3G     Lighthouse throttled run
Cumulative Layout Shift                 0.00              cookie-based collapse state
                                                           removes the #1 CLS cause
```

`Sidebar`, `Topbar` are **Server Components wherever possible** — only the pieces that need interactivity (`SidebarCollapseButton`, `SidebarTeamSwitcher` dropdown, `NotificationBell`, `CommandMenu`) are marked `'use client'`. The nav item list itself (`SidebarNav`/`SidebarNavItem`) can be server-rendered for the *initial* paint with `usePathname()` swapped for a server-computed active path passed as a prop — only hydrating the minimal interactive surface (this matches the RSC "islands" principle already established in the architecture docs).

---

## 8. End-of-Day Checklist

```
TYPOGRAPHY & TOKENS
  [ ] Inter, Plus Jakarta Sans, Geist Mono all load via next/font, zero FOUT/FOIT flash
  [ ] font-sans / font-heading / font-mono utility classes wired in Tailwind config
  [ ] No raw hex colors anywhere — every color is a CSS var token
  [ ] Light + dark mode both verified pixel-by-pixel for Sidebar/Topbar

SIDEBAR
  [ ] Collapses/expands with zero flash on hard reload (cookie verified in Network tab)
  [ ] Active route shows 2px left-bar indicator only — no background block
  [ ] Collapsed mode: tooltips show correct label after 300ms delay
  [ ] SidebarTeamSwitcher dropdown opens, shows plan badge, disabled "Create team" has tooltip
  [ ] SidebarUser dropdown "Sign out" actually logs out (Day 9 hook reused, not reimplemented)

TOPBAR
  [ ] Breadcrumb updates correctly across all static routes
  [ ] SearchTrigger opens CommandMenu on click AND on ⌘K
  [ ] NotificationBell opens a Sheet with EmptyState placeholder, closes on Esc/outside click

COMMAND MENU
  [ ] ⌘K opens in under 50ms perceived (no spinner, no jank)
  [ ] Fuzzy search filters Navigate + Actions groups correctly
  [ ] Arrow keys move selection, Enter executes, Esc closes
  [ ] cmdk bundle confirmed lazy-loaded (check Network tab — no cmdk JS on initial load)

KEYBOARD & A11Y
  [ ] ⌘\ toggles sidebar from any focus context except active text input
  [ ] Tab order through Sidebar → Topbar → main is logical, no traps
  [ ] All icon-only buttons have aria-label
  [ ] Focus ring visible on keyboard nav, absent on mouse click

PERFORMANCE
  [ ] Shell bundle size measured and under budget (Section 7)
  [ ] CLS = 0.00 in Lighthouse run
  [ ] Sidebar/Topbar confirmed Server Components except documented interactive islands

ROUTING
  [ ] /dashboard renders placeholder inside full shell with no console errors
  [ ] Redirect to /login works when unauthenticated (manually clear cookies and test)
  [ ] Redirect to /onboarding works when user has no team
```

---

*Document: DAY26-SHELL-001 | Vocaply | Day 26 — Dashboard Shell*
*Foundation for Days 27–45 — every later screen inherits these tokens, this shell, this motion language.*
