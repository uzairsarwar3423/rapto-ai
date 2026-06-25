# Vocaply — Day 32 Deep Build Plan
## Add Meeting Sheet + Bot Status Banner Live Wiring + Realtime Foundation
> Senior Frontend Architecture Edition — Form Micro-interactions, Socket Lifecycle, Cache-Patch Patterns
> Continues from Day 31 (Action Items / Commitments tabs). Today: the app's first creation flow, and the first realtime data pipe.

---

## 0. Typography Carried Forward (no new rules — applied to new surfaces today)

```
--font-sans:    "Inter"              → ALL form labels, input text, helper/error text,
                                        Select options, button labels, badge text
--font-display: "Plus Jakarta Sans"  → Sheet title ONLY ("Add meeting"), nothing else in
                                        this entire flow — a form is pure UI, not editorial,
                                        so display font usage stays minimal by design
--font-mono:    "JetBrains Mono"     → the scheduledAt time input value, PlatformDetectBadge's
                                        detected-ID fragment if shown (e.g. "j/123456789"),
                                        Kbd hints in the Sheet footer ("Esc to cancel")

Rule reinforced today: a Sheet header is the ONLY place font-display appears in a form context.
Field labels are font-sans text-sm font-medium text-foreground — labels are functional, not
decorative, and must scan as fast as the input itself.
```

---

## 1. Why Today Is Architecturally Two Days in One

Day 32 ships two genuinely separate subsystems that happen to land together: **(A)** the first real *write* flow in the app (form → validation → mutation → multi-state error handling), and **(B)** the first *realtime* subscription in the app (Socket.io → cache patch → live UI). They're sequenced together deliberately — the Sheet gives an immediate, low-risk place to prove the mutation-error-handling pattern (Sheet-local banners vs. toasts vs. field errors), while the realtime wiring is scoped to something already visually shipped (Day 29's static banner), so today's "live" work is upgrading an existing surface rather than building a new one from scratch. Two smaller, provably-correct subsystems beat one large, harder-to-verify one.

---

## 2. Files to Create — Full Tree

```
features/meetings/components/
  AddMeetingSheet.tsx
  AddMeetingForm.tsx
  AddMeetingFormFields/
    TitleField.tsx
    MeetingUrlField.tsx
    PlatformField.tsx
    ScheduledAtField.tsx
  PlatformDetectBadge.tsx
  PlanLimitBanner.tsx
  DuplicateUrlError.tsx               ← NEW small inline-error renderer, reused pattern

shared/providers/
  WebSocketProvider.tsx

shared/lib/websocket/
  socket.ts
  socket.events.ts
  socket.cache-patchers.ts            ← NEW: pure functions mapping event → cache mutation

store/
  realtime.store.ts

features/meetings/hooks/
  useCreateMeeting.ts
  useRealtimeMeeting.ts
  usePlatformDetect.ts                ← NEW: extracted client-side detect logic, debounced

shared/components/feedback/
  UpgradeModalStub.tsx

shared/hooks/
  useSocketReconnectToast.ts          ← NEW: surfaces connection-loss/restore as a subtle toast
```

---

## 3. Component Contracts

```ts
// AddMeetingSheet.tsx — controls open state, nothing else
interface AddMeetingSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultMeetingUrl?: string   // future: prefill from a pasted URL elsewhere in the app
}

// AddMeetingForm.tsx — pure form, no Sheet knowledge (testable standalone)
interface AddMeetingFormProps {
  onSuccess: (meeting: Meeting) => void
  onPlanLimitHit: () => void
}

// usePlatformDetect.ts
function usePlatformDetect(url: string, debounceMs = 300): {
  platform: PlatformType | null
  detectedId: string | null
  isDetecting: boolean   // true during the debounce window — drives a subtle loading state
}

// socket.cache-patchers.ts — one pure function per event, unit-testable without a socket
type CachePatcher<T> = (queryClient: QueryClient, payload: T) => void
export const patchMeetingBotJoining: CachePatcher<{ meetingId: string }>
export const patchMeetingRecording: CachePatcher<{ meetingId: string; startedAt: string }>
export const patchMeetingProcessing: CachePatcher<{ meetingId: string }>
export const patchMeetingProcessed: CachePatcher<{ meetingId: string; summary: string }>
```

**Why `socket.cache-patchers.ts` is split out as pure functions:** if cache-patching logic lives inline inside `useRealtimeMeeting`'s `socket.on(...)` callbacks, it's untestable without spinning up a real socket connection. Extracting each patch as `(queryClient, payload) => void` means every event-to-UI-update mapping gets a plain unit test today, and Day 39 (full realtime pass across every list) imports these same functions instead of writing new ones inline elsewhere.

---

## 4. Micro-Interactions — Specified Per Element

### 4.1 Sheet open/close — entrance and exit choreography
```
OPEN:
  t=0ms     Trigger clicked (e.g. "Add meeting" button in Topbar/PageHeader)
  t=0ms     Backdrop fades in: opacity 0→1, 160ms ease-out, background black/4% (NOT a dark
            full-opacity scrim — page content stays legible behind it, reinforcing "preserve
            context" over the heavier modal-dimming convention)
  t=0ms     Sheet panel slides in from right: translateX(16px)→0 + opacity 0→1, 180ms ease-out
            (slightly longer than the 120–160ms row-hover budget because this is a larger,
            less frequent transition — bigger surface area earns slightly more time, but never
            crosses 200ms, keeping it inside the platform's outer motion bound)
  t=180ms   First focusable field (TitleField) receives autofocus — NOT the close button,
            NOT the Sheet container — this matters: focus should land where typing starts

CLOSE (Esc, backdrop click, or Cancel button):
  Reverse of the above, same durations, but additionally: if the form has any dirty field
  (touched + changed), close routes through a lightweight native `confirm()`-free check —
  instead, Cancel button itself shows a tiny inline "Discard changes?" two-button swap in
  place (button morphs into "Discard" / "Keep editing" for 4 seconds before reverting) rather
  than spawning a second confirmation Sheet/Dialog on top of a Sheet — nesting overlays is
  explicitly avoided per the platform's interaction grammar
```

### 4.2 MeetingUrlField → PlatformDetectBadge — the showcase micro-interaction of the day
```
t=0ms        User pastes/types a URL
t=0–300ms    isDetecting = true (from usePlatformDetect's debounce window) — MeetingUrlField's
             trailing icon area shows a tiny static dot (NOT a spinner — spinners imply
             network latency; this is instant client-side regex work, so the indicator should
             feel correspondingly lightweight: a single pulsing opacity dot, 0.4↔1 over 600ms,
             CSS-only, no JS animation loop)
t=300ms      Debounce settles, regex runs (<1ms). Result renders:
             MATCH    → PlatformDetectBadge fades in: opacity 0→1 + translateY(2px)→0, 140ms
                        ease-out. Badge text: "Detected: Zoom" with the platform's small
                        monochrome icon (reused from MeetingPlatformIcon, Day 28) at 14px.
                        Simultaneously, PlatformField (the <Select>) auto-sets its value —
                        but the Select's own visual update has NO additional animation beyond
                        its native shadcn open/close (we don't double-animate the same change
                        in two places)
             NO MATCH → No badge appears at all (not an error state — an unrecognized URL is
                        valid for platform="MANUAL", so absence of the badge is itself the
                        correct, calm signal — no red "couldn't detect" message)
ON EDIT      If the user keeps typing after a badge already appeared, the badge doesn't
             flicker/disappear immediately — it stays rendered with reduced opacity (0.5) during
             the next debounce window, then either updates (if a new platform matches) or fades
             out (160ms) if the edited URL no longer matches anything. This prevents the jarring
             "badge vanishes then reappears" flicker on every keystroke.
```

### 4.3 Field-level Zod validation — timing and tone
```
VALIDATION TRIGGER: onBlur for first error, then onChange thereafter (react-hook-form's
                     mode: 'onBlur', reValidateMode: 'onChange' — standard, correct pattern:
                     don't show an error while the user is still mid-typing their FIRST pass
                     through a field, but give live feedback once they've already seen an error
                     and are actively correcting it)
ERROR APPEARANCE:    text-xs text-foreground (NOT red — consistent with the badge/status
                     philosophy from Day 31: urgency via weight/position, not color) rendered
                     directly below the field, prefixed with a small "!" glyph in a circle,
                     14px. Appears via opacity 0→1 + translateY(-2px)→0, 120ms — error text
                     drops in from slightly above its resting position, a subtle "arriving"
                     motion distinct from the badge's translateY(2px) (arriving from below) —
                     intentional directional differentiation so errors and confirmations don't
                     feel visually identical even at a glance
INPUT BORDER:        on error, border-color shifts from var(--border) to var(--foreground)
                     (darker neutral, not red) — 120ms transition, matching the row-hover timing
                     budget for consistency across the whole app
```

### 4.4 ScheduledAtField — two-input date/time pattern
```
Two adjacent inputs (date, time) inside a single bordered group that LOOKS like one field
(shared border, divider line between them at 50% border opacity) — this avoids the visual
clutter of two separately-bordered inputs while keeping native <input type="date">/<input
type="time"> for zero-dependency correctness. Tab order: date → time → next field, natural
DOM order, no tabindex override needed.
Past-date guard: if selected datetime < now, the SAME field-error pattern from §4.3 fires
("Must be in the future") — validated identically to backend's Zod refinement, so the error
a user sees client-side is word-for-word what they'd otherwise get from the API, building
trust that the client isn't lying about what the server will accept.
```

### 4.5 Submit button — three states, no spinner-only state
```
DEFAULT:    "Schedule meeting" — font-sans font-medium text-sm, default button styling
SUBMITTING: text changes to "Scheduling…" (NOT just a spinner replacing the label — losing
            the verb mid-action removes context). A small 12px spinner (CSS conic-gradient
            spin, not an SVG animation library) appears to the LEFT of the text, matching the
            icon-before-label convention used elsewhere in the app (e.g. platform icons).
            Button becomes aria-disabled, NOT visually greyed-to-illegible (opacity 0.7, not 0.4
            — disabled states should still be readable, just clearly non-interactive)
SUCCESS:    No button-level success state at all — the moment the mutation resolves, the
            Sheet closes (§4.1 reverse) and a toast confirms ("Meeting scheduled") — success
            is communicated by the Sheet disappearing and the new row appearing in the list
            behind it, not by a checkmark flash on the button itself (avoids a redundant,
            momentary state that most users won't even see before the Sheet closes)
```

### 4.6 PlanLimitBanner — inline, not interruptive
```
Renders INSIDE the form, above all fields, the moment a 402 response is caught — NOT as a
toast (a toast would disappear before a user reads the upgrade CTA) and NOT by closing the
Sheet (per the platform's "fail gracefully" rule). Entrance: opacity 0→1 + height 0→auto via
a measured-height transition (180ms) so the form fields below visibly settle downward rather
than snapping — this is the one place a height-transition is justified, since it's a rare,
important state change, not a frequent interaction.
Visual: text-sm, muted background strip (var(--surface)), single-line message + "View plans"
text-link (same link styling as Day 31's "View all →", reused verbatim for grammar consistency)
on the right. Submit button becomes disabled for the remainder of the Sheet's open lifetime
(re-enabled only if the Sheet is closed and reopened, forcing a fresh quota check).
```

### 4.7 DuplicateUrlError (409) — field-scoped, not form-scoped
```
Unlike PlanLimitBanner (form-level, blocking), a 409 on meetingUrl renders through the EXACT
SAME field-error mechanism as client-side Zod errors (§4.3) — the only difference is the error
message originates from the server response instead of local validation. This is a deliberate
unification: from the user's perspective, "this URL is already scheduled" should look and feel
identical to "this field is required," because both are just reasons this specific input is
currently invalid. Submit re-enables immediately (it's a single-field fix, not a blocking
account-level state like the plan limit).
```

### 4.8 Connection status — the quiet realtime indicator
```
realtime.store's connectionStatus ('connected' | 'connecting' | 'disconnected') does NOT
produce a banner or toast on every blip — Socket.io's own reconnection handles transient drops
silently. useSocketReconnectToast only fires a toast if disconnected for >3 consecutive seconds
(debounced), reading "Reconnecting…" then auto-dismissing on reconnect with no further toast
("connected" doesn't need its own celebratory toast — silence on recovery is correct, only
the problem state deserves a brief, dismissible nudge).
```

### 4.9 BotStatusBanner going live — the transition between static and live data
```
Day 29 built this as a server-rendered conditional block. Today, the FIRST live patch that
arrives after mount triggers exactly one micro-interaction: if the banner is about to APPEAR
(status just became BOT_JOINING/RECORDING), it slides down from height 0 with opacity, 160ms
— consistent with the "rare, important state change" treatment from §4.6. If the banner is
about to DISAPPEAR (status moved past RECORDING), it fades+collapses in the reverse, 160ms.
Subsequent same-banner content updates (e.g. timer ticking, if ever added) do NOT re-trigger
the entrance animation — only true mount/unmount of the banner element animates; in-place
text changes are instant, no flicker-fade on every patch.
```

---

## 5. Socket Lifecycle — State Machine

```
DISCONNECTED ──connect()──→ CONNECTING ──'connect' event──→ CONNECTED
                                  │                              │
                                  │ timeout/error                │ 'disconnect' (non-server-initiated)
                                  ▼                              ▼
                              DISCONNECTED ◄──── auto-retry ── RECONNECTING
                                                  (backoff: 1s→2s→4s→...→30s cap)

CONNECTED ──'connect_error' (TOKEN_EXPIRED)──→ SILENT REFRESH
  → POST /api/auth/refresh (existing Day 9 flow, reused, NOT reinvented)
  → on success: socket.auth.token updated, socket.connect() retried — user sees NOTHING
  → on failure: useAuthStore.clearAuth() → redirect /login (consistent with the existing
    silent-refresh failure path already established for HTTP requests)
```

`socket.ts` exposes `connect(token)`, `disconnect()`, `getSocket()` as the only public surface — `WebSocketProvider` is the only caller of `connect`/`disconnect` (on auth state change), and `useRealtimeMeeting` only ever calls `getSocket()?.on(...)`/`.off(...)` — no component anywhere calls `connect` directly, preventing duplicate-connection bugs from a second mount somewhere down the tree.

---

## 6. Data Flow — Mutation Side

```
AddMeetingForm submit
  → useCreateMeeting.mutate(formValues)
  → POST /api/v1/meetings (existing backend contract from Day 17)
  → SUCCESS:
      - queryClient.setQueryData on meetings list (prepend new meeting — optimistic-adjacent,
        but here we wait for the real server response since we need the server-assigned ID
        and recallBotId; this is "confirmed-then-inject," not "optimistic," and that distinction
        matters: meetings have an external side effect (a real bot gets scheduled), so jumping
        the gun with a fake optimistic row risks showing a meeting that the server might reject)
      - onSuccess(meeting) callback closes the Sheet, fires success toast, navigates nowhere
        (stays on the meetings list, new row visible, consistent with "don't yank the user
        across the app after every action")
  → 402: onPlanLimitHit() → renders PlanLimitBanner in place, sheet stays open
  → 409: react-hook-form's setError('meetingUrl', ...) → renders via §4.7
  → 5xx/network: generic toast ("Couldn't schedule meeting — try again"), Sheet stays open,
    form values preserved (react-hook-form state untouched on error — nothing is ever cleared
    out from under a user after a failed submit)
```

---

## 7. Visual Spec — Exact Tokens

```
SHEET:
  width:          480px (fixed, not responsive-fluid — a creation form benefits from a
                   consistent, predictable width regardless of viewport, per "predictable >
                   fancy"; mobile breakpoint converts Sheet to full-width, handled by shadcn
                   Sheet's existing responsive variant, not custom code)
  padding:         24px
  header height:   56px, border-bottom 1px var(--border)
  footer height:   64px, border-top 1px var(--border), sticky to bottom, buttons right-aligned

FORM FIELD SPACING:
  gap between fields: 20px
  label-to-input gap: 6px
  label:               text-sm font-medium font-sans text-foreground
  helper text (non-error): text-xs text-muted-foreground, 4px below input

PLATFORM DETECT BADGE:
  variant:        outline, text-xs, rounded-sm (4px, matching Day 31's badge-shape rule),
                  icon + text, px-2 py-0.5

PLAN LIMIT BANNER:
  background:     var(--surface)
  border:         1px var(--border), rounded-md
  padding:        10px 12px
  text:           text-sm text-foreground, link in font-medium text-foreground with underline-
                  on-hover (no separate "link color" — links are foreground-colored + underline,
                  per neutral-color principle, never a blue/accent link color)
```

---

## 8. Accessibility Pass

```
- Sheet: focus-trapped (shadcn default), aria-labelledby pointing at "Add meeting" header,
  Esc closes (native shadcn behavior, verified not overridden)
- Form fields: every <input>/<select> has a real <label htmlFor>, never placeholder-as-label
- Error messages: aria-describedby links each input to its error <span id>, role="alert" on
  the error span itself so screen readers announce it the moment it mounts
- PlatformDetectBadge: aria-live="polite" region announces "Detected Zoom" once, doesn't
  re-announce on every keystroke during the debounce window (only on settled detection change)
- Submit button: aria-busy="true" during submission, label change ("Scheduling…") is itself
  the accessible announcement — no separate visually-hidden live region needed since the
  visible text already communicates state
- Socket reconnect toast: role="status", not role="alert" — a connection blip is informational,
  not urgent, so it shouldn't interrupt screen reader flow the way an alert would
```

---

## 9. Performance Notes

- `usePlatformDetect`'s regex matching is pure, synchronous, client-side — explicitly NOT a network call, so the 300ms "debounce" is purely to avoid re-running regex on every keystroke (cheap either way, but consistent with the codebase's existing debounce convention from search inputs)
- Socket connection is a true singleton — verified via a dev-mode guard (`if (this.socket) return existingSocket`) so React's Strict Mode double-invoke in development never opens two connections
- `socket.cache-patchers.ts` functions never trigger a refetch — they're surgical `setQueryData` writes, meaning a live-updating meeting list during a busy multi-meeting morning doesn't generate any extra network traffic beyond the WebSocket frames themselves

---

## 10. End-of-Day Checklist

**Functional**
- [ ] Sheet opens/closes without losing meetings-list scroll position behind it
- [ ] Platform auto-detect fires correctly for Zoom/Meet/Teams/Webex sample URLs, stays silent for unmatched URLs
- [ ] Zod validation errors render per-field on blur-then-change, submit disabled until valid
- [ ] 402 plan-limit response renders inline banner, not a toast/redirect; submit stays disabled until Sheet reopened
- [ ] 409 duplicate response renders as field-level error, submit re-enables immediately after edit
- [ ] Socket reconnects automatically after simulated token expiry, zero user-visible disruption
- [ ] BotStatusBanner animates in/out only on true mount/unmount, not on every data patch
- [ ] Meetings list row status updates live in a second browser tab without refresh

**Typography**
- [ ] font-display appears ONLY on the Sheet's "Add meeting" header — nowhere else in the form
- [ ] All field labels/inputs/errors render in font-sans, no accidental display-font leakage
- [ ] scheduledAt time value and Kbd hints render in font-mono

**Micro-interactions**
- [ ] Sheet entrance/exit timing measured at ~160–180ms, never exceeding 200ms
- [ ] PlatformDetectBadge entrance direction (translateY from below) visually distinct from error entrance (translateY from above)
- [ ] Submit button shows "Scheduling…" + left-aligned spinner, never a bare spinner with no label
- [ ] PlanLimitBanner height-transition settles smoothly, no content jump/snap
- [ ] Discard-changes inline button-morph works and auto-reverts after 4s if untouched

**Accessibility**
- [ ] Screen reader announces field errors via role="alert" the moment they mount
- [ ] PlatformDetectBadge live-region announces once per settled detection, not per keystroke
- [ ] Full keyboard traversal: open Sheet via keyboard, fill form, submit, close — zero mouse required

**Architecture / Reuse Readiness**
- [ ] `socket.cache-patchers.ts` functions unit-tested independent of a real socket connection
- [ ] `usePlatformDetect` confirmed reusable for any future URL-based detection need (no Sheet-specific coupling)
- [ ] `useRealtimeMeeting` confirmed to be the only consumer pattern Day 39 needs to replicate for other entities (commitments, action items)

---

*Document: BUILD-PLAN-DAY-32-DEEP | Vocaply | Version 1.0*
*Track: Core Frontend Dashboard (Phase 3) | Form Micro-interaction + Realtime Lifecycle Specification Edition*
