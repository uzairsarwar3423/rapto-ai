# Vocaply — Day 40 Deep Build Plan
## Settings Core: Profile · Team · Members · Security
> Senior Frontend Architect Edition | Industry-Grade | One shell pattern, four pages, zero layout debt for Days 41–43
> Typography: Inter (UI/body) + Plus Jakarta Sans (headings/display) + Poppins (personal-numeral emphasis, unused today)
> Document: DAY-40-DEEP-PLAN | Version 1.0

---

## 0. Why Today Is an Architecture Day Wearing a Settings Costume

On paper, today ships "four settings tabs." In practice, today ships **one decision that the next three days inherit without re-deriving**: how does Vocaply render a settings shell, how does a save confirm itself, how does a destructive account action ask twice, how does a read-only field communicate "this isn't editable" without looking broken. Get any of these four patterns wrong today and Days 41–43 (Integrations, Billing, Notifications) either copy the mistake three more times or each invent their own variant — the exact "five different apps stitched together" failure mode this whole product has been built to avoid since Day 26.

The other quiet theme today: **proof of reuse**. `MemberTable` (Day 37) gets dropped into a second page with zero forking. `PasswordStrengthBar` (Day 9) gets its second consumer. If either needed a single line changed to work here, that's a signal the original component leaked an assumption about its page context — today is where that assumption either holds or gets caught.

---

## 1. Typography System (unchanged — Day 40 uses the existing three-font contract exactly)

```
--font-display: "Plus Jakarta Sans", "Inter", -apple-system, sans-serif;
--font-body:    "Inter", -apple-system, sans-serif;
--font-numeric: "Poppins", "Inter", -apple-system, sans-serif;
--font-mono:    "JetBrains Mono", "SF Mono", monospace;

DAY 40 USAGE MAP
  Plus Jakarta Sans (600) → SettingsSidebar section label ("Settings", if shown above
                              the list), each page's <h1> title (Profile/Team/Members/
                              Security), Sheet titles (MfaSetupSheet), AlertDialog titles
                              (Revoke session, Sign out all).
  Inter (400/500)          → SettingsSidebar nav items (active AND inactive — see §4.1
                              for why active state is weight-only, not font-swapped here,
                              unlike Day 38's section nav), all form labels/inputs,
                              SessionRow content, SaveStateIndicator text, placeholder
                              "Coming Day 41" labels.
  Inter tabular (tnum)      → SessionList's "last active" relative values if ever shown
                              as exact timestamps on hover; otherwise unused today —
                              no numeric columns of real weight on this page.
  Poppins                   → NOT used today. Zero call sites. Three days in a row now
                              (Day 39, Day 40) with zero Poppins usage, which is exactly
                              the proof the Day 38 restriction is holding as designed —
                              a font given a narrow, named purpose and never reached for
                              "because it's already loaded."
```

**Micro-intention — why `SettingsSidebar`'s active state is weight-only, not Jakarta-swapped, unlike Day 38's `MemberSectionNav`:** Day 38's scroll-spy nav swapped fonts on the active label because that nav represents *where you currently are within one continuous page* — a moment-to-moment, almost live state worth a stronger signal. `SettingsSidebar`, by contrast, is *persistent page-level navigation* — you're going to sit on `/settings/profile` for a while, glancing at the sidebar only occasionally. A permanent font-swap there would read as slightly heavier/louder than the moment deserves; a `font-medium` (500) vs. `font-normal` (400) Inter weight shift, plus the same subtle background-fill treatment the main `SidebarNav` already uses, is calibrated correctly for *settled* navigation rather than *active scanning*. This is the kind of distinction a junior implementation collapses into "just copy the Day 38 pattern" — and shouldn't.

---

## 2. File Manifest (exact, in build order)

```
apps/web/src/
│
├── shared/
│   ├── hooks/
│   │   └── useSaveState.ts                          [1]  generic — built FIRST
│   └── components/
│       ├── feedback/
│       │   └── SaveStateIndicator.tsx                [2]
│       └── layout/
│           └── SettingsSidebar.tsx                   [3]
│
├── app/(dashboard)/settings/
│   ├── layout.tsx                                    [4]  shell — depends on [3]
│   ├── page.tsx                                       [5]  redirect only
│   ├── profile/page.tsx                               [9]
│   ├── team/page.tsx                                  [12]
│   ├── members/page.tsx                               [14]
│   └── security/page.tsx                              [11]
│
├── features/auth/components/
│   ├── ProfileForm.tsx                                [6]
│   ├── ChangePasswordForm.tsx                          [7]
│   ├── MfaSetupSheet.tsx                               [8]
│   ├── SessionList.tsx                                 [10a]
│   ├── SessionRow.tsx                                  [10b]
│   └── RevokeSessionButton.tsx                         [10c]
│
├── features/team/components/
│   ├── TeamSettingsForm.tsx                            [13a]
│   ├── TeamSlugField.tsx                               [13b]
│   └── MembersSettingsTable.tsx                        [15]
│
└── features/auth/hooks/
    ├── useUpdateProfile.ts                             [A]
    ├── useChangePassword.ts                            [B]
    ├── useSessions.ts                                  [C]
    └── useRevokeSession.ts                              [D]
```

**Build order rationale:** `useSaveState` (1) and `SaveStateIndicator` (2) ship before *any* form, because every one of today's four pages needs them — building the indicator against `ProfileForm`'s specific needs first, then "generalizing later," is exactly backwards and produces a leaky abstraction. `SettingsSidebar` (3) and `layout.tsx` (4) ship before any individual settings page, for the same reason Day 26's `AppShell` shipped before any dashboard page existed — the shell is the contract every page below it depends on.

---

## 3. The Shell Pattern — Decided Once, Inherited Three Times

### 3.1 `useSaveState.ts` — the generic hook every settings page will call

```typescript
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function useSaveState(autoResetMs = 2000) {
  const [state, setState] = useState<SaveState>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    clearTimeout(timerRef.current)
    setState('saving')
    try {
      await fn()
      setState('saved')
      timerRef.current = setTimeout(() => setState('idle'), autoResetMs)
    } catch (err) {
      setState('error')
      timerRef.current = setTimeout(() => setState('idle'), autoResetMs * 1.5)  // error gets slightly longer
      throw err   // let the caller's own onError (toast, field error) still fire
    }
  }, [autoResetMs])

  return { state, run }
}
```
**Micro-intentions:**
- **`run()` wraps the async action rather than the hook exposing raw setters** — every consumer calls `saveState.run(() => mutation.mutateAsync(values))` instead of manually choreographing `setState('saving')` → `await` → `setState('saved')` in five different forms with five chances to forget a step or mishandle the error path. One correct implementation, five correct call sites for free.
- **Error state auto-resets 1.5x slower than success** — a fleeting "✓ Saved" at 2 seconds is plenty; an error needs a beat longer on screen because the user is more likely to be re-reading it, deciding what to do next, not just glancing and moving on. A small asymmetry, deliberately tuned rather than reusing one constant for both.
- **Re-throws after setting error state** — this hook owns *only* the inline visual feedback; it explicitly does not swallow the error or decide whether a toast/field-error should also fire. That decision stays with whichever form is calling it, keeping `useSaveState` a narrow, single-responsibility primitive rather than an ad-hoc error-handling framework.

### 3.2 `SaveStateIndicator.tsx`

```tsx
function SaveStateIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null

  const config = {
    saving: { icon: Loader2,    spin: true,  label: 'Saving…', className: 'text-muted-foreground' },
    saved:  { icon: Check,      spin: false, label: 'Saved',   className: 'text-primary' },
    error:  { icon: AlertCircle, spin: false, label: 'Couldn\'t save', className: 'text-destructive' },
  }[state]

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('inline-flex items-center gap-1 text-[12px] font-inter transition-opacity duration-150', config.className)}
    >
      <config.icon className={cn('size-3', config.spin && 'animate-spin')} />
      {config.label}
    </span>
  )
}
```
**Micro-intentions:**
- **`saving` is the one and only place today a spin animation is permitted**, and it's scoped to a 12px icon next to a Save button, not a full-screen shimmer — this is a deliberate, narrow exception to "no AI shimmer/spinner" guidance: a tiny, conventional loading spinner on a button-adjacent label reads as *standard form UX* (every serious SaaS product does this), categorically different from the AI-dashboard "thinking…" shimmer the platform explicitly rejects elsewhere. The distinction matters and is worth stating outright so a future audit doesn't flag this as a violation of the no-shimmer rule.
- **Returns `null` at `idle`**, not an invisible-but-present placeholder — no layout reservation for an indicator that isn't showing anything, consistent with `PresenceAvatars`' identical "render nothing rather than an empty shell" decision from Day 39.
- **`error` uses `text-destructive`, the only color-coded state on this page** — and that's appropriate, because unlike `CommitmentRateBar`/`CommitmentScore` (where color-by-severity was explicitly rejected because it implies judgment about a *person*), this is a binary system-fact ("did the save succeed, yes or no") with no person being judged — red here is informative, not shaming, and the one place today's "neutral colors" rule correctly yields to clarity.

### 3.3 `SettingsSidebar.tsx` — page-level nav, not a sideways Tabs component

```tsx
const SETTINGS_NAV = [
  { href: '/settings/profile',       label: 'Profile',       enabled: true },
  { href: '/settings/team',          label: 'Team',          enabled: true },
  { href: '/settings/members',       label: 'Members',       enabled: true },
  { href: '/settings/integrations',  label: 'Integrations',  enabled: false, comingDay: 41 },
  { href: '/settings/billing',       label: 'Billing',       enabled: false, comingDay: 42 },
  { href: '/settings/notifications', label: 'Notifications', enabled: false, comingDay: 43 },
  { href: '/settings/security',      label: 'Security',      enabled: true },
] as const

function SettingsSidebar() {
  const pathname = usePathname()

  return (
    <nav aria-label="Settings" className="w-[220px] shrink-0 py-4 px-2">
      <h2 className="font-jakarta font-semibold text-[13px] px-2 mb-2 text-muted-foreground">
        Settings
      </h2>
      <ul className="space-y-0.5">
        {SETTINGS_NAV.map((item) => {
          const active = pathname.startsWith(item.href)
          if (!item.enabled) {
            return (
              <li key={item.href}>
                <Tooltip content={`Coming Day ${item.comingDay}`}>
                  <span className="flex items-center justify-between h-8 px-2 rounded-md
                                    text-[13px] font-inter text-muted-foreground/50 cursor-default">
                    {item.label}
                    <Badge variant="outline" className="text-[10px] px-1.5">Soon</Badge>
                  </span>
                </Tooltip>
              </li>
            )
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center h-8 px-2 rounded-md text-[13px] font-inter transition-colors duration-150',
                  active
                    ? 'font-medium bg-muted text-foreground'
                    : 'font-normal text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```
**Micro-intentions:**
- **Disabled items are real, visible, tooltip-explained, non-interactive `<span>`s — never `<Link>`s with a disabled attribute hack.** A disabled `<a>` is a known accessibility and event-handling minefield (click handlers still fire unless carefully guarded, focus behavior is inconsistent across browsers); rendering a plain `<span>` for the not-yet-built items sidesteps the whole problem category while still being honest about what exists.
- **The `Soon` badge plus a tooltip giving the actual day number** is more informative than a generic "coming soon" — internally this also doubles as a living changelog *inside the product itself*: anyone (including a future engineer demoing the build) can see exactly which day unlocks which tab, which is a small but real documentation win that costs nothing extra to ship.
- **`aria-current="page"` on the active link** — the correct, standard ARIA attribute for "this nav item represents the current page," picked up automatically by screen readers without any extra `aria-label` engineering; `usePathname().startsWith(item.href)` (not exact match) correctly keeps "Profile" highlighted even on a future nested route like `/settings/profile/avatar` if one is ever added.
- **No icons next to labels.** The main `SidebarNav` (Day 26) does use icons; this nav deliberately doesn't, because at 220px width with only seven short text labels, icons would add visual weight without adding scanability — restraint applied per-context rather than copying the parent sidebar's pattern wholesale.

### 3.4 `app/(dashboard)/settings/layout.tsx` — the shrink-the-container decision, made explicit

```tsx
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageContainer className="flex gap-6 max-w-5xl">
      <SettingsSidebar />
      <div className="flex-1 min-w-0 py-4">{children}</div>
    </PageContainer>
  )
}
```
**Micro-intention:** `max-w-5xl` on `PageContainer` here is *narrower* than the default dashboard max-width used by Meetings/Commitments/Action Items lists — settings forms are inherently narrower-feeling content (label + single input, not a wide multi-column table), and constraining the whole settings shell's width (not just individual form fields) prevents a layout where the `SettingsSidebar` sits far to the left of a form that's centered or left-aligned within an otherwise much wider canvas. One container width decision, inherited by all seven settings pages including the three not yet built.

---

## 4. Component-Level Patterns & Micro-Intentions

### 4.1 `ProfileForm.tsx` — the canonical save-state consumer

```tsx
function ProfileForm({ user }: { user: User }) {
  const saveState = useSaveState()
  const updateProfile = useUpdateProfile()
  const form = useForm({ resolver: zodResolver(profileSchema), defaultValues: user })

  const onSubmit = (values: ProfileFormValues) =>
    saveState.run(() => updateProfile.mutateAsync(values))

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 max-w-md">
      <FormField name="name" label="Name" />
      <AvatarUploadField name="avatarUrl" />
      <FormSelectField name="timezone" label="Timezone" options={IANA_TIMEZONES} />
      <FormSelectField name="locale" label="Language" options={LOCALES} />

      <Separator />

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saveState.state === 'saving'}>
          Save changes
        </Button>
        <SaveStateIndicator state={saveState.state} />
      </div>
    </form>
  )
}
```
**Micro-intention:** the Save button and `SaveStateIndicator` sit in the **same flex row, button first** — this fixed layout (button → indicator, never the reverse, never stacked) is the template every one of today's three other save-able forms (`ChangePasswordForm`, `TeamSettingsForm`) copies exactly, so a user's eye learns the pattern once on Profile and never has to re-learn it scanning down to Team or Security. Consistency of *spatial position*, not just component reuse, is itself a micro-intention worth naming.

### 4.2 `ChangePasswordForm.tsx` — reuse without ceremony

```tsx
function ChangePasswordForm() {
  const saveState = useSaveState()
  const changePassword = useChangePassword()
  const form = useForm({ resolver: zodResolver(changePasswordSchema) })
  const newPassword = form.watch('newPassword')

  return (
    <form onSubmit={form.handleSubmit((v) => saveState.run(() => changePassword.mutateAsync(v)))}
          className="space-y-4 max-w-md">
      <FormField name="currentPassword" label="Current password" type="password" />
      <FormField name="newPassword" label="New password" type="password" />
      <PasswordStrengthBar password={newPassword} />   {/* Day 9's component, zero changes */}
      <FormField name="confirmPassword" label="Confirm new password" type="password" />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saveState.state === 'saving'}>
          Update password
        </Button>
        <SaveStateIndicator state={saveState.state} />
      </div>
    </form>
  )
}
```
**Micro-intention:** `<PasswordStrengthBar password={newPassword} />` is imported with **zero new props, zero wrapper, zero "we need it to look slightly different here" adjustment.** If Day 9's component had been built with any registration-page-specific assumption (a hardcoded margin matching the auth card's width, a prop name like `registerPassword`), today is exactly when that assumption would surface as friction. It doesn't, because the component was built as "a bar that reacts to a password string" — proof that Day 9's original scope discipline was correct.

### 4.3 `SessionList.tsx` / `SessionRow.tsx` / `RevokeSessionButton.tsx` — the "can't lock yourself out" guarantee

```tsx
function SessionRow({ session, isCurrent }: { session: Session; isCurrent: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_120px_140px_80px] h-9 items-center text-[13px] font-inter">
      <div className="flex items-center gap-2 truncate">
        <DeviceIcon device={session.deviceLabel} className="size-3.5 text-muted-foreground" />
        <span className="truncate">{session.deviceLabel}</span>
        {isCurrent && (
          <Badge variant="outline" className="text-[10px]">This device</Badge>
        )}
      </div>
      <span className="text-muted-foreground text-[12px] truncate">{session.location ?? '—'}</span>
      <span className="text-muted-foreground text-[12px]">
        <RelativeTime date={session.lastUsedAt} />
      </span>
      {!isCurrent && <RevokeSessionButton sessionId={session.id} />}
    </div>
  )
}

function RevokeSessionButton({ sessionId }: { sessionId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const revoke = useRevokeSession()

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive justify-self-end">
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle className="font-jakarta font-semibold">Revoke this session?</AlertDialogTitle>
        <AlertDialogDescription>This device will be signed out immediately.</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => revoke.mutate(sessionId)}>Revoke</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```
**Micro-intentions:**
- **`{!isCurrent && <RevokeSessionButton .../>}` — the button doesn't render at all for the current session**, the identical "absent, not disabled" discipline from Day 37's `getAvailableActions` applied here to a different permission boundary (not role-based, but identity-based: "is this row *me*, right now"). A disabled Revoke button on your own session invites exactly the confused click `getAvailableActions` was designed to prevent in the team-permission context.
- **`isCurrent` gets a small outline `Badge`, not a different row background color** — the current-session row is marked the same restrained way `RoleBadge` marks identity (text label, not decorative highlighting), keeping the table visually uniform aside from that one small, legible tag.
- **The grid column template here is independent from `MemberTable`'s** — a quiet but important non-decision: there was no temptation to force `SessionRow` into `MemberTable`'s exact column widths just because both are "a dense row in Settings." Reuse should track *genuine* shared structure (as with `MembersSettingsTable` below), not superficial row-height similarity.

### 4.4 `MfaSetupSheet.tsx` — honest scaffolding, not fake success

```tsx
function MfaSetupSheet({ open, onOpenChange }: Props) {
  const [code, setCode] = useState('')
  const [submitted, setSubmitted] = useState(false)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-jakarta font-semibold text-[14px]">
            Set up two-factor authentication
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col items-center gap-3 py-4">
          <div className="size-40 rounded-md border-2 border-dashed border-muted-foreground/30
                           flex items-center justify-center text-[12px] text-muted-foreground">
            QR code placeholder
          </div>
          <p className="text-[12px] text-muted-foreground font-mono">ABCD-EFGH-IJKL-MNOP</p>
        </div>

        <FormField label="Enter 6-digit code" value={code} onChange={setCode} maxLength={6} />

        {submitted && (
          <p role="status" className="text-[12px] text-muted-foreground mt-2">
            MFA verification is coming soon — this won't be enabled yet.
          </p>
        )}

        <SheetFooter>
          <Button onClick={() => setSubmitted(true)} disabled={code.length !== 6}>
            Verify and enable
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```
**Micro-intention:** the secret-key fallback text uses `font-mono` — the one legitimate JetBrains Mono appearance today, because a manually-typed TOTP secret key is exactly the category of string mono fonts exist for (unambiguous character disambiguation, O vs 0, I vs l). The honest "coming soon" message on submit is styled identically to *informational* text elsewhere (muted, 12px, no icon, no color), specifically avoiding a green checkmark or success-styled treatment — visually, this state must never be mistakable for "MFA is now on," because a user genuinely believing they've secured their account when they haven't is a real harm, not just an inconsistency.

### 4.5 `TeamSlugField.tsx` — read-only that *looks* read-only

```tsx
function TeamSlugField({ slug }: { slug: string }) {
  return (
    <div>
      <label className="text-[12px] font-medium text-muted-foreground">Team URL</label>
      <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40
                       text-[13px] font-inter text-muted-foreground cursor-not-allowed select-none">
        <span className="text-muted-foreground/60">vocaply.com/</span>
        <span>{slug}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">
        Changing your team URL isn't supported yet, since it would break existing links.
      </p>
    </div>
  )
}
```
**Micro-intentions:**
- **`bg-muted/40` + `cursor-not-allowed` + `select-none`, rendered as a `<div>`, not a `disabled` `<input>`.** A disabled input still visually resembles an editable field (same border weight, same height, same caret-shaped cursor on some browsers) just grayed out — which invites a click-and-wonder-why-nothing-happens moment. A plain styled `div` with a `not-allowed` cursor communicates "this was never going to be an input" the instant the pointer hovers it, satisfying the checklist's "genuinely read-only — no input focus, no edit affordance" requirement at the DOM level, not just visually.
- **The explanatory note is a *reason*, not just a restriction** ("isn't supported yet, since it would break existing links") — telling a curious admin *why* is the difference between a field that feels like a limitation and one that feels like a considered product decision they can respect.
- **`vocaply.com/` prefix shown in a dimmer tone than the slug itself** — a small visual hierarchy choice that reinforces "the part you actually chose is *this*," consistent with how form fields elsewhere in the app dim placeholder/prefix chrome relative to real content.

### 4.6 `MembersSettingsTable.tsx` — the reuse-proof, written as a one-line wrapper

```tsx
function MembersSettingsTable() {
  const { members, isPending } = useTeamMembers()
  if (isPending) return <MemberTableSkeleton />
  return <MemberTable members={members} />   // Day 37's component. No props added. No fork.
}
```
**Micro-intention:** this file exists *only* to be the page-level data-fetch boundary for `/settings/members` — it is intentionally not a copy-pasted, slightly-modified `MemberTable`. The one-line render call is the proof artifact for the checklist item "confirmed to be the literal same component as Day 37's `/team` page." If a future engineer needs `MembersSettingsTable` to look even slightly different from the standalone `/team` page's table, the correct fix is adding an optional prop to `MemberTable` itself (e.g., `compact?: boolean`), never forking — this file's entire existence is a standing reminder of that rule.

---

## 5. Performance Engineering for Today

```
CONCERN                          TECHNIQUE
──────────────────────────────────────────────────────────────────────────
Settings nav re-render            SETTINGS_NAV is a module-level const array,
                                   not recreated per render — usePathname() is
                                   the only reactive input to SettingsSidebar
Save-state timer cleanup          useSaveState clears any pending auto-reset
                                   timer at the START of every new run() call —
                                   prevents a stale "Saved" → "idle" timer from
                                   firing AFTER a second, faster save already
                                   landed and is mid-flight
Avatar upload                     AvatarUploadField (not detailed above, reuses
                                   existing image-optimization pipeline from
                                   Day 2's design system) — no new upload
                                   infrastructure built today, composes existing
                                   primitives only
Session list size                 Bounded by realistic device count per user
                                   (rarely >10) — no virtualization needed,
                                   same "small bounded dataset" reasoning as
                                   Day 37's member table
Settings shell layout shift        max-w-5xl + fixed 220px sidebar width means
                                   zero layout recalculation when switching
                                   between settings pages — only the content
                                   slot's children change, the shell itself
                                   never re-mounts (layout.tsx persists across
                                   the nested route changes)
```

---

## 6. Accessibility & Keyboard Map (Day 40 additions)

```
KEY                  CONTEXT                              ACTION
──────────────────────────────────────────────────────────────────────
Tab                  SettingsSidebar                       Cycles enabled nav links only —
                                                             disabled placeholders are <span>,
                                                             never receive focus (correctly
                                                             excluded from the tab order)
Enter                Save button focused                    Submits form, triggers useSaveState
Esc                  MfaSetupSheet / RevokeSessionButton    Closes Sheet / AlertDialog respectively
                     AlertDialog
Tab                  RevokeSessionButton → AlertDialog       Focus moves into dialog; "Cancel" is
                                                             the default-focused action (safer
                                                             default for a destructive confirm)
```
**Micro-intention on focus default:** `AlertDialogCancel` receiving initial focus when the Revoke/Sign-out-all dialogs open (rather than the destructive `AlertDialogAction`) is a deliberate safety choice — a user who reflexively hits Enter without reading the dialog text lands on "Cancel," not "Revoke." This is the same reasoning that governs destructive confirmations across every serious tool; worth stating explicitly here since it's easy for a generic AlertDialog implementation to default focus to whichever button is visually last/rightmost instead.

---

## 7. Scalability Notes (why this survives Days 41–43 without rework)

1. **`useSaveState` + `SaveStateIndicator` are the *only* save-feedback primitives that will ever need to exist in Settings** — Day 42's Billing form, Day 43's Notification toggles, all call the exact same hook/component pair. Nothing about today's implementation is Profile-specific.
2. **`SETTINGS_NAV`'s `enabled`/`comingDay` shape is the contract for unlocking future tabs** — Day 41 doesn't redesign the sidebar; it flips one object's `enabled: false → true` and removes a `comingDay` field. The placeholder-to-live transition is a one-line diff, by construction.
3. **The "disabled nav item is a `<span>`, never a hacked `<Link>`" pattern** generalizes to any future not-yet-built feature surfaced in any nav anywhere in the app (a future locked Analytics tier feature, a future beta-flagged page) — same shape, same accessibility guarantee, reusable verbatim.
4. **`TeamSlugField`'s "styled div, not disabled input" technique** is now the canonical answer for *any* future genuinely-immutable field (a future read-only API key display, a future locked plan-tier field) — one pattern, multiple future call sites, no new invention required.
5. **`MembersSettingsTable`'s one-line wrapper convention** sets the precedent for how *any* future "same component, second page context" need gets handled across the app — write the data-fetch boundary as its own tiny file, import the real component unmodified, never fork.

---

## 8. End-of-Day Verification (engineering + design QA, combined)

```
ENGINEERING
[ ] useSaveState: rapid double-submit (fast click, fast click again) does not leave
    a stale "Saved" indicator stuck from the first call after the second completes —
    verified by clearing the pending timer at the start of every run()
[ ] TeamSettingsForm's submit payload contains ONLY changed keys — confirmed via
    network tab inspection, not just code review
[ ] MembersSettingsTable confirmed to import MemberTable directly with zero new
    props or wrapper styling — diff against Day 37's usage shows zero divergence
[ ] Disabled SettingsSidebar items are <span> elements, confirmed absent from the
    Tab-key focus order via keyboard-only navigation test

DESIGN / TYPOGRAPHY
[ ] SettingsSidebar active state uses Inter font-medium + bg-muted only — no Jakarta
    font-swap, confirmed against the explicit Day 38 contrast documented in §1
[ ] MfaSetupSheet's secret key uses font-mono; nothing else on the page does
[ ] "Coming Day N" Soon badges render with identical neutral outline styling across
    all three placeholder items — no per-item color variance
[ ] SaveStateIndicator's spin animation confirmed scoped to the 12px icon only —
    no full-section shimmer anywhere on any of today's four pages

ACCESSIBILITY
[ ] AlertDialogCancel receives initial focus on both Revoke-session and Sign-out-all
    confirmations, verified by keyboard-only flow, not just visual inspection
[ ] SaveStateIndicator's role="status" aria-live="polite" announces state changes
    correctly with a screen reader during a real (throttled-network) save
[ ] TeamSlugField's read-only div has no tabIndex and is correctly skipped by Tab

PRODUCT BEHAVIOR (carried from base spec — re-verified against today's deeper implementation)
[ ] Settings shell renders inside AppShell — main app sidebar remains visible/clickable
    while any settings page is open
[ ] Current-device session row has zero Revoke button, confirmed via DOM inspection,
    not just "it's grayed out"
[ ] MfaSetupSheet's "coming soon" message never resembles a success/confirmation state —
    confirmed it shares styling with other informational (not celebratory) text
[ ] Navigating directly to /settings/integrations (typed URL, not clicked) still resolves
    to the same informative placeholder experience, never a 404
```

---

*Document: DAY-40-DEEP-PLAN | Vocaply | Settings Core | Version 1.0*
*Typography: Plus Jakarta Sans (page/Sheet/Dialog titles) + Inter (everything else, incl. nav) + Poppins (unused — three consecutive days, restriction holding) + JetBrains Mono (TOTP secret key, one call site)*
*Principal Frontend Architecture — one shell, decided once, inherited honestly by every settings page that follows*
