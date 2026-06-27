# Vocaply — Day 41 Master Build Plan
## Settings → Integrations: Connect / Configure / Disconnect / OAuth / Calendar Preview
> Principal Frontend Architect Edition · Industry-Grade · Linear/Jira-Calm UI · Zero "AI Demo" Tells
> Continues Day 40's Settings shell. No new visual idiom. No new color. Every interaction justified.

---

## 0. Reading This Document

This is not a feature list — it is a **construction order**. Every section answers four questions for whichever piece it covers: *what gets built, in what file, with what micro-interaction, and why that micro-interaction (not a flashier one) is correct for this product.* By the end of today, `/settings/integrations` should feel like it shipped from the same team that built Linear's integrations page — calm, dense, instant, zero ceremony.

---

## 1. Typography System for Today's Surface (Locked)

Three typefaces are already in the stack. Today's job is to apply them **consistently and minimally** — typography is one of the few places this product is allowed to show craft, precisely because color is so restrained.

```
FONT ROLES
──────────────────────────────────────────────────────────────────────────
Plus Jakarta Sans   → Page titles, Sheet titles, section headings (H1–H3)
                       Weight: 600 (semibold) only — never 700/800 (too loud)
                       Letter-spacing: -0.01em (tightened, never default)
                       Used: "Integrations" page title, Sheet headers
                       ("Connect Jira", "Configure Slack"), section labels
                       ("Team Integrations" / "Personal Integrations")

Inter                → All UI chrome: body text, labels, descriptions, menu
                       items, badges, hints, buttons, table cells
                       Weight: 400 (body), 500 (labels/buttons), 600 (emphasis only)
                       Used: provider names, descriptions, badge text,
                       dropdown menu items, field labels, tooltips

Poppins              → Reserved EXCLUSIVELY for numeric/identity emphasis:
                       provider connection counts ("4 connected"), the
                       unread-style count badges, and the onboarding-style
                       step indicators if/when they appear inline here.
                       Weight: 500. Used SPARINGLY — if Poppins appears more
                       than twice on this page, that's a smell, not a feature.
                       tabular-nums always applied alongside it.
```

### Concrete Type Scale for This Page

```
ELEMENT                                FONT                  SIZE   WEIGHT  LINE-HEIGHT
─────────────────────────────────────────────────────────────────────────────────────────
Page title ("Integrations")            Plus Jakarta Sans     20px   600     28px
Section label ("Team Integrations")    Plus Jakarta Sans     13px   600     20px  (uppercase
                                                                                    tracking +0.04em,
                                                                                    muted color)
Sheet title ("Connect Jira")           Plus Jakarta Sans     16px   600     24px
Provider name (row)                    Inter                 13px   500     20px
Provider description (row, muted)      Inter                 12px   400     18px
Badge text                             Inter                 11px   500     16px  (caps, +0.02em)
Field label (config form)              Inter                 12px   500     16px
Field hint (InlineFieldHint)           Inter                 12px   400     16px  (muted/60%)
Button label                           Inter                 13px   500     20px
Tooltip text                           Inter                 12px   400     16px
"Last synced" / RelativeTime           Inter                 12px   400     16px  (tabular-nums)
Connected-count chip ("4 connected")   Poppins               12px   500     16px  (tabular-nums)
```

**Why this split matters:** Plus Jakarta Sans has just enough geometric personality to make titles feel designed, not default — but at body sizes it reads slightly too "branded." Inter disappears into the background at small sizes, which is exactly the job of 90% of this page's text. Poppins' rounded numerals are reserved for the handful of moments where a *number* is the point (counts, scores) — using it everywhere would make the page feel like a marketing site instead of a tool.

---

## 2. File & Component Architecture

```
app/(dashboard)/settings/integrations/
  page.tsx                                    ← RSC — parallel fetch: integrations + plan + calendar status
  loading.tsx                                 ← Skeleton matching IntegrationsGrid exactly (zero CLS)

features/integrations/
  components/
    IntegrationsGrid.tsx                      ← Two grouped sections, dense rows
    IntegrationsGridHeader.tsx                 ← Page title + Poppins "{n} connected" chip + ⌘K hint
    IntegrationSection.tsx                     ← Generic: section label + list of IntegrationRow
    IntegrationRow.tsx                         ← Single row, all states
    IntegrationIcon.tsx                        ← 20px provider mark, consistent padding box
    IntegrationStatusBadge.tsx                 ← 4-state neutral badge
    IntegrationRowMenu.tsx                     ← DropdownMenu: Configure / Test / Reconnect / Disconnect
    ConnectIntegrationSheet.tsx                ← Generic OAuth-intent Sheet (team + personal)
    IntegrationConfigSheet.tsx                 ← Generic config shell, slots in provider form
    IntegrationConfigForm/
      JiraConfigForm.tsx
      SlackConfigForm.tsx
      LinearConfigForm.tsx
      NotionConfigForm.tsx
    SearchableChannelPicker.tsx                ← Popover+Command list, reused across Slack/Linear/Notion
    CalendarEventsPreviewSheet.tsx
    CalendarEventPreviewRow.tsx                ← Single detected-meeting row inside the preview Sheet
    DisconnectIntegrationAlert.tsx
    TestConnectionInlineButton.tsx             ← Renamed/clarified from "TestNotificationInlineButton"
                                                   (today's button tests the *connection*, not a notification —
                                                    naming precision matters, see §6.7)
    IntegrationEmptyDescription.tsx            ← Per-provider 2–3 line OAuth-intent copy (data, not JSX, see §4)

  hooks/
    useIntegrations.ts
    useOAuthConnect.ts
    useDisconnectIntegration.ts
    useIntegrationConfig.ts
    useCalendarEvents.ts
    useTestConnection.ts

  data/
    providers.config.ts                       ← Static provider metadata: id, name, icon, scope group,
                                                  description copy, docs link — single source for both
                                                  IntegrationsGrid and the ⌘K registry

shared/components/feedback/
  InlineFieldHint.tsx
  InlineSaveState.tsx                          ← Confirmed reused verbatim from Day 40 (no fork)

shared/lib/cache/
  query-keys.ts                                ← EXTENDED: integrations.all(teamId), integrations.config(provider)
```

### Why `providers.config.ts` exists as data, not scattered JSX

Every provider's name, icon, OAuth-intent copy, and required scopes live in **one typed array**. `IntegrationsGrid` maps over it to render rows; `⌘K`'s registry maps over the *same* array to generate searchable actions; `ConnectIntegrationSheet` reads its copy from the same array. This is the day's single most important architectural decision — it guarantees the row list, the command palette, and the OAuth-intent Sheet can never drift out of sync with each other, and it means adding the 7th provider after Day 70 is a one-line data change, not a four-file change.

```ts
// features/integrations/data/providers.config.ts (shape, not full content)
export const INTEGRATION_PROVIDERS = [
  {
    id: 'JIRA',
    scope: 'team',
    name: 'Jira',
    description: 'Create and sync tickets from action items.',
    icon: 'jira',
    consentCopy: 'Vocaply will create Jira tickets from action items and update them when marked complete. We never read other Jira issues.',
    docsUrl: '/docs/integrations/jira',
  },
  // Linear, Slack, Notion, Google Calendar, Outlook Calendar …
] as const
```

---

## 3. Layout Anatomy — Pixel-Level

```
PageContainer (max-width: 760px, same as every other Settings tab — locked Day 40)
  └─ IntegrationsGridHeader
       "Integrations"  (Plus Jakarta Sans 20/600)        [4 connected]  Poppins chip, muted bg
                                                          ⌘K hint: "⌘K to search integrations" (right-aligned, 11px, 40% muted)
  └─ Separator (full-width, 1px, border color, 24px margin top/bottom)
  └─ IntegrationSection label="Team Integrations"
       └─ IntegrationRow × 4   (Jira, Linear, Slack, Notion)
  └─ Separator (24px margin)
  └─ IntegrationSection label="Personal Integrations"
       └─ IntegrationRow × 2   (Google Calendar, Outlook Calendar)
```

### IntegrationRow — exact anatomy (44px height, confirmed against Day 40/37 row grammar)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [24px icon box]  Jira                                    [Connected]  4m ago  ⋯ │
│                   Create and sync tickets from action items                     │
└──────────────────────────────────────────────────────────────────────────────────┘
  16px pad-l         13px/500 name (Inter)              Badge   12px    24px
                      12px/400 desc, 1 line, truncate    11px    Inter   menu
                      (muted-60%, ellipsis on overflow)           tabular  trigger
```

Grid: `[24px icon] [1fr name+desc, min-w-0] [auto badge] [auto relative-time] [32px menu]` — `display: grid; grid-template-columns: 24px 1fr auto auto 32px; align-items: center; gap: 12px`. The `1fr` column has `min-width: 0` so the description always truncates correctly rather than pushing the row's right-hand content off-screen — a detail that breaks silently if skipped and is exactly the kind of thing a 25-year frontend engineer checks first.

---

## 4. Micro-Interactions — Full Catalogue (the actual craft of the day)

This is the section that separates "it works" from "it feels expensive." Every micro-interaction below has a stated *duration*, *easing*, and *trigger* — nothing is "just add a transition."

### 4.1 Row hover (every IntegrationRow)
```
Trigger:   mouseenter on row
Effect:    background-color shifts to --muted (zinc-100 / zinc-900 dark), 100ms linear
Cursor:    pointer ONLY on the row's clickable surface (opens Configure if connected,
           Connect Sheet if not) — the row-end menu button has its own independent
           hover state (background circle, 100ms) so the two affordances never visually compete
Why:       100ms linear (not ease) for hover — hover feedback should feel like flipping
           a switch, not like something "animating in." Ease-out is reserved for things
           that enter/exit the DOM (Sheets, dropdowns), not for state toggles on static elements.
```

### 4.2 Status Badge transition (Connected ↔ Syncing ↔ Connected)
```
Trigger:   mutation success/pending state change
Effect:    text crossfades (opacity 0→1, 120ms ease-out) — the badge's background
           never changes color (all 4 states share the identical neutral badge style,
           per Day 40/37 precedent), so the only thing animating is the word itself
Why:       Crossfading text-only avoids any "pulse of color" that would read as a
           status-severity signal — reinforcing the "communicate via words, not color" rule
           even at the micro-interaction layer, not just the static-state layer.
Anti-pattern avoided: NO pulsing/glowing dot, NO color sweep — this is the exact spot
           where a less disciplined build would add a shimmer "syncing" animation.
           We don't. "Syncing…" is just a word that's there for as long as it's true.
```

### 4.3 Sheet open/close (ConnectIntegrationSheet, IntegrationConfigSheet, CalendarEventsPreviewSheet)
```
Trigger:   row click (not-connected → ConnectIntegrationSheet; connected → IntegrationConfigSheet)
Effect:    Sheet panel: translateX(16px)→0 + opacity 0→1, 160ms ease-out (entrance)
           Backdrop: opacity 0→1, 120ms linear, no blur (blur reads as "fancy," costs paint perf)
           Exit: reverse, but 100ms (exits should always feel slightly faster than entrances —
                 a long-standing motion-design principle: arriving is welcomed, leaving is brisk)
Focus:     First focusable element inside the Sheet receives focus on mount (the primary
           CTA or first input) — never the close button, since that's the opposite of intent
Esc:       Closes immediately, no animation skip-flash — exit transition still plays at 100ms
```

### 4.4 OAuth round-trip (the highest-stakes interaction on the page)
```
Trigger:   "Connect {Provider}" button click inside ConnectIntegrationSheet
Sequence:
  1. Button enters a brief "Redirecting…" label-swap (no spinner icon — text-only,
     120ms crossfade, matching §4.2's no-spinner discipline) for the ~150–300ms before
     window.location.href actually navigates away — this prevents the dead-feeling gap
     where a slow network makes the button look unresponsive for a moment
  2. Full-tab navigation occurs (NOT a popup — see Day 41 spec). This is a hard requirement:
     popups get silently blocked by ad-blockers and Safari ITP often enough that a "popup
     never opened" support ticket is one of the most common OAuth bugs in the industry.
  3. On return to /settings/integrations?connected=jira:
       - Page mounts with the query param present
       - A single `useEffect` (or RSC searchParams check) reads it ONCE, then immediately
         calls `router.replace()` to strip the param from the URL (never leave OAuth
         callback params sitting in the address bar — a small but telling polish detail)
       - The corresponding row's badge crossfades Not Connected → Connected (§4.2)
       - The IntegrationConfigSheet AUTO-OPENS, 200ms after mount (not instant — instant
         seems abrupt right after a page reload; 200ms lets the row's new state register
         visually first, then the Sheet for configuration follows as a natural next step)
  4. On return with ?error=access_denied or similar:
       - No Sheet auto-opens
       - A single-line inline error appears directly below that provider's row
         (not a toast — the error is spatially anchored to its cause), auto-dismissable,
         persists until the next connect attempt or 8 seconds, whichever first
```

### 4.5 Config form save (every `*ConfigForm`)
```
Pattern:    Identical to Day 40's useSaveState/SaveStateIndicator — reused verbatim, not re-themed
States:     "Save" → "Saving…" (120ms crossfade) → "✓ Saved" (120ms crossfade,
            checkmark is a static Lucide icon, no draw-in animation) → reverts to "Save" after 2000ms
Disabled:   Save button is disabled (not hidden) until at least one field has changed —
            a flat, no-animation opacity:0.5 state change, instant, since "can I click this"
            should never be ambiguous for even one animation-frame
```

### 4.6 Searchable picker (SlackConfigForm's channel picker, etc.)
```
Component:  Popover containing a `Command` list (same primitive as ⌘K itself — reused, not a
            new combobox library)
Trigger:    click opens Popover, 100ms ease-out scale-from-98%+opacity (the ONE place on this
            page a subtle scale is acceptable, because it's a small anchored popover, not a
            page-level surface — Radix's default Popover animation primitive, not custom)
Typing:     Filters list with zero debounce (client-side filter over an already-fetched small
            list — channels/projects/databases are bounded sets, no need to debounce a
            network call here, which keeps it feeling instant)
Keyboard:   ↑/↓ to move highlight, Enter to select + close Popover, Esc to close without selecting
Selection:  Selected item gets a trailing check icon, list stays open for 80ms after click
            (long enough to visually register the check) then Popover closes automatically
```

### 4.7 Disconnect flow (DisconnectIntegrationAlert)
```
Trigger:    "Disconnect" menu item (destructive text style: muted-foreground default,
            turns to --destructive-foreground text color ONLY on hover/focus of that
            specific menu item — never a red background fill)
AlertDialog: standard two-action dialog, no custom motion beyond the Radix default
Optimistic: On confirm, row badge flips to "Not connected" INSTANTLY (before network
            resolves), row's secondary content (last-synced, config) clears immediately
Rollback:   On mutation error, badge reverts + a row-anchored inline error appears
            (same pattern as §4.4's OAuth error — errors are always anchored to their
            row, never a floating toast for something the user can see the direct cause of)
```

### 4.8 Calendar preview Sheet — list entrance
```
Rows:       CalendarEventPreviewRow items do NOT stagger-animate in (no "cascading list"
            entrance) — they render immediately as a static list the instant the Sheet's
            own entrance animation (§4.3) completes. Staggered list-item animations are
            explicitly rejected here: they read as "look how alive our UI is," which is
            precisely the AI-product tell this build exists to avoid. A list is just... there.
```

### 4.9 Tooltip timing (every icon-only affordance, every disabled-state explanation)
```
Delay:      400ms hover delay before showing (Radix default, intentionally not shortened —
            sub-300ms tooltips fire too eagerly and feel twitchy on a dense page where the
            cursor crosses many small targets while scanning)
Duration:   80ms ease-out entrance, no exit delay (disappears the instant the cursor leaves)
```

---

## 5. The Four Status States — Full Specification

| State | Badge Text | Badge Style | Row Secondary Content | Row-End Menu Items |
|---|---|---|---|---|
| **Not Connected** | `Not connected` | neutral outline badge | provider description only | *(no menu — row itself IS the CTA; clicking anywhere opens ConnectIntegrationSheet)* |
| **Connected** | `Connected` | neutral filled badge (subtle bg, not accent-colored) | `Last synced {RelativeTime}` | Configure · Test connection · Disconnect |
| **Needs Reauth** | `Needs reauth` | same neutral filled badge | inline `Reconnect` link (Inter 12px/500, underline-on-hover only) replaces the synced-time slot | Configure · Disconnect *(Test connection omitted — reauth must happen first)* |
| **Syncing…** | `Syncing…` | same neutral filled badge | `Started {RelativeTime}` | menu disabled entirely (greyed trigger, tooltip: "Available once sync completes") |

**The one rule that governs all four:** identical badge container styling across every state — same padding, same border-radius, same font-size/weight. The *only* variable is the word inside it. This is checked explicitly in QA (§9) because it's the easiest discipline to accidentally break six months from now when someone "just wants to make errors pop a little more."

---

## 6. Component-by-Component Build Notes

### 6.1 `IntegrationsGridHeader.tsx`
- Renders page `<h1>` in Plus Jakarta Sans, plus a Poppins `Badge`-style chip showing connected count, computed client-side from `useIntegrations()` data (never a separate API call for a number derivable from data already in hand).
- Right-aligned micro-hint: `⌘K to search integrations` in 11px/40%-opacity Inter — this single line is today's lightest-touch onboarding mechanism for the command-palette extension shipping today; it disappears (via local `useLocalStorage` dismiss flag) after the user's first successful ⌘K integration search, so it never becomes permanent visual noise for returning users.

### 6.2 `IntegrationSection.tsx`
- Pure layout component: `label: string`, `children`. Renders the uppercase Plus Jakarta Sans section label with `+0.04em` tracking, 8px bottom margin, then a `divide-y` list of rows. No card wrapper, no border box around the section — sections are separated by whitespace + the section label itself, not by a bounding box (bounding boxes around every group is the #1 "looks like a generated admin panel" tell).

### 6.3 `IntegrationRow.tsx`
- Single component handles all four states via a `status` prop — never four separate row components. Internally branches only on (a) which secondary-content slot renders and (b) which menu items are present, per §5's table. This keeps the row's core layout grid (§3) write-once.
- Whole-row click target excludes the menu trigger button via `event.stopPropagation()` on the trigger — identical discipline to every other row-with-menu pattern already proven across Meetings/Commitments/Action Items/Member Table.

### 6.4 `IntegrationStatusBadge.tsx`
- Tiny, intentionally dumb component: `status` in, fixed-style `Badge` out. No internal logic beyond a string lookup table mapping status → label text. This is the component most tempting to "improve" with color — resist; its entire job is to prove the neutral-badge discipline by being boring.

### 6.5 `ConnectIntegrationSheet.tsx`
- Reads provider metadata from `providers.config.ts` (§2) by `providerId` prop — zero per-provider JSX branching inside this file. Footer: single primary button, full-width on mobile breakpoint, right-aligned with a quiet `Learn more →` text link (to `docsUrl`) on desktop.
- Personal-vs-team distinction is **invisible in this Sheet's UI** — same exact layout for Jira and Google Calendar. The only difference is which endpoint `useOAuthConnect` calls under the hood (`/integrations/:provider/connect` vs `/integrations/calendar/:provider/connect`), confirming the "generic, not Jira-shaped" requirement from the spec.

### 6.6 `IntegrationConfigSheet.tsx` + form variants
- `IntegrationConfigSheet` is a shell: title (Plus Jakarta Sans), a `children` slot for the provider-specific form, and a fixed footer with `InlineSaveState` + Save button — every provider form looks identical in chrome, differs only in fields.
- Each `*ConfigForm.tsx` is a plain `react-hook-form` + Zod form (matching every other form in this codebase), no provider-specific styling decisions — only field composition differs (e.g., Jira has 3 Select fields, Slack has 1 picker).

### 6.7 `TestConnectionInlineButton.tsx`
- Deliberately renamed from the spec's `TestNotificationInlineButton` — this button tests whether the *OAuth connection itself* is alive (a lightweight "ping the provider API" call), which is a meaningfully different concern from Day 43's notification-channel test send. Reusing one ambiguously-named component across both would be exactly the kind of "looks reused but means two different things" trap that erodes a codebase's trustworthiness over time. They share the identical inline-state *pattern* (idle → testing… → ✓ verified / ✗ failed) but are two distinct, clearly-named components.

### 6.8 `CalendarEventsPreviewSheet.tsx` + `CalendarEventPreviewRow.tsx`
- Read-only by construction — no row click handlers, no menu, no hover background (hover states are reserved for clickable things; a non-interactive preview row should never visually suggest otherwise). Each row: `MeetingPlatformIcon` (reused Day 28) + title (Inter 13px/500) + time (Inter 12px, tabular-nums, muted).
- Empty state (`zero detected meetings in next 7 days`): plain centered text, "No upcoming meetings detected in the next 7 days" — no illustration, consistent with every other empty state in this build.

### 6.9 `DisconnectIntegrationAlert.tsx`
- `AlertDialog` body copy is sourced from `providers.config.ts`'s per-provider `disconnectConsequence` field (extend the config shape) so the destructive-explanation text lives in the same single source of truth as everything else on this page, rather than as a hardcoded string buried in the Alert component itself.

### 6.10 `InlineFieldHint.tsx`
- Generic, two props: `children`. Renders 12px/400 Inter at 60% foreground opacity, 4px top margin from its associated field. This is today's one genuinely new shared primitive (composition, not a new dependency) — it will be reused starting tomorrow by Billing's plan-comparison fine print and by Notifications' dependency hints, so its API is deliberately minimal (no icon slot, no variant prop) to resist scope creep before it's even proven itself once.

---

## 7. ⌘K Command Palette Extension (Today's Cross-Cutting Feature)

```
NEW COMMAND CATEGORY: "Integrations"

Generated entirely from providers.config.ts at registry-build time:
  For each provider:
    if NOT connected → action: "Connect {Provider}"   → opens ConnectIntegrationSheet
    if connected      → action: "Configure {Provider}" → opens IntegrationConfigSheet
                       → action: "Test {Provider} connection" → fires useTestConnection inline
                         (palette closes, result surfaces as a row-anchored inline state,
                         per §4.7's anchoring principle — the palette itself never shows
                         a result, it only ever triggers actions and gets out of the way)

Search matching: provider name + a small synonym list ("issue tracker" → Jira/Linear,
                  "chat" → Slack, "notes" → Notion, "schedule" → Calendar) — improves
                  discoverability for users who think in task-language, not brand-language
```

This is the first day the palette indexes **settings actions with state-dependent behavior** (the action shown literally changes based on connection status) rather than a static list of navigation targets — the registry pattern introduced here (`generate commands from a typed config array`) is the template Days 42–43 follow for Billing and Notifications.

---

## 8. Accessibility & Keyboard Pass (Non-Negotiable, Checked Today)

```
- Every IntegrationRow is reachable via Tab in document order; Enter/Space activates it
  identically to a click (Connect Sheet or Config Sheet depending on state)
- Row-end menu trigger has its own Tab stop, separate from the row — confirmed no
  "double activation" ambiguity when tabbing through
- All Sheets: focus-trapped, labelled via aria-labelledby pointing at the Sheet title,
  Esc closes, focus returns to the triggering row's element on close (not document.body)
- Status badges are NOT the only signal of state for screen readers — each row's
  accessible name includes the status text directly ("Jira, Connected, last synced
  4 minutes ago"), never relying on a sr-only icon-only badge
- Disconnect AlertDialog: destructive action button is NEVER the default-focused
  element on open — focus lands on Cancel, requiring a deliberate Tab+Enter or explicit
  click to confirm destruction (standard, well-established AlertDialog safety pattern)
- Color contrast: neutral badge text confirmed ≥ 4.5:1 against its background in both
  light and dark theme — verified today, not assumed, since "neutral" must not become
  an excuse for "low contrast"
```

---

## 9. QA / End-of-Day Checklist

```
TYPOGRAPHY
  [ ] Page title and every Sheet title render in Plus Jakarta Sans 600, never default-weight
  [ ] No body/label text anywhere on this page uses Plus Jakarta Sans — Inter only
  [ ] Poppins appears in exactly one place: the connected-count chip — audit confirms no creep
  [ ] tabular-nums applied to all relative-time and count text (zero digit-width jitter on live update)

LAYOUT
  [ ] IntegrationRow grid never overflows or wraps awkwardly down to 768px viewport
  [ ] Description truncation (min-width:0 fix) verified on the longest real provider description
  [ ] Section label spacing/tracking matches Day 40's locked Settings pattern exactly

MICRO-INTERACTIONS
  [ ] Row hover: 100ms linear background only, no scale/shadow added anywhere
  [ ] Status badge state changes crossfade text only — confirmed zero color animation
  [ ] Sheet entrance 160ms ease-out / exit 100ms — measured, not eyeballed
  [ ] OAuth button shows "Redirecting…" label-swap before navigation on slow network (throttled test)
  [ ] OAuth callback query param is stripped from the URL after being read exactly once
  [ ] Config auto-opens 200ms after a fresh connect — not instant, not delayed further
  [ ] Searchable picker filters with zero debounce lag, ↑/↓/Enter/Esc all correct
  [ ] Disconnect flips badge optimistically before network resolves; rollback verified by
      forcing a mutation error
  [ ] Calendar preview rows render with zero stagger/cascade animation
  [ ] Tooltip 400ms delay confirmed not shortened anywhere on this page

STATE CORRECTNESS
  [ ] All four status states render pixel-identical badge containers — only text differs
  [ ] Needs-reauth row's inline Reconnect link present and functional without opening the menu
  [ ] Syncing state correctly disables the row-end menu with explanatory tooltip

COMMAND PALETTE
  [ ] Every provider searchable by name and at least one synonym
  [ ] Connect/Configure action correctly reflects live connection state, not stale at mount
  [ ] Test-connection-from-palette closes palette and anchors result to the row, never floats a toast

ACCESSIBILITY
  [ ] Full keyboard traversal of the page completed with no mouse, start to finish
  [ ] Screen-reader pass (VoiceOver or NVDA) confirms row accessible name includes status + sync time
  [ ] Disconnect AlertDialog default focus is Cancel, not the destructive action

GRACEFUL DEGRADATION
  [ ] Missing GOOGLE_CLIENT_ID (simulated): Calendar row's Connect affordance disables with
      tooltip explanation, never throws, never shows a broken button
  [ ] Network failure mid-OAuth-redirect surfaces the row-anchored inline error, not a blank page
```

---

## 10. What Tomorrow (Day 42) Inherits From Today

- `InlineFieldHint` — reused verbatim for Billing's plan-comparison fine print
- The `providers.config.ts` → ⌘K registry-generation pattern — directly templated for Billing's "Manage billing / View invoices / Compare plans" commands
- The row-anchored-error-over-toast principle — applied identically when Billing surfaces a failed checkout redirect
- `InlineSaveState` — confirmed today as genuinely shared (Day 40 origin, Day 41 second consumer), proven generic before Billing becomes its third

---

*Document: BUILD-PLAN-DAY-41 | Vocaply | Version 1.0*
*Track: Core Frontend Dashboard (Phase 3) — Settings: Integrations*
*Typography: Plus Jakarta Sans (headings) · Inter (UI/body) · Poppins (numeric emphasis, sparingly)*
