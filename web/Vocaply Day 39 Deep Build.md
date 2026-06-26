# Vocaply — Day 39 Deep Build Plan
## Full Realtime Pass: WebSocket Events Across Every List · Presence · Reconnection UX
> Senior Frontend Architect Edition | Industry-Grade | Trust-preserving realtime, zero notification fatigue
> Typography: Inter (UI/body) + Plus Jakarta Sans (headings/display) + Poppins (personal-numeral emphasis, unchanged scope)
> Document: DAY-39-DEEP-PLAN | Version 1.0

---

## 0. Why Today Is an Invisible-Engineering Day, Not a Visual One

Every prior day shipped a screen. Today ships almost no new screen — it ships **trust**. The entire value of today's work is that a user *never has to ask* "is this still accurate?" The moment a teammate marks something fulfilled, removes a member, or syncs a Jira ticket, every open tab in the building should already know, without a refresh, without a spinner, and — critically — without fifteen toasts firing in the corner of the screen like a chat app.

This is also the day the codebase's discipline either pays off or gets exposed. Every cache-patch pattern, every query-key factory entry, every `getAvailableActions` extraction from Days 36–38 gets reused here under *external* triggering for the first time — not a click the user made, but an event that arrived from someone else's session. If those patterns were built generically, today is wiring. If they were one-offs, today is a rewrite. The plan below assumes — and verifies — the former.

---

## 1. Typography System (unchanged, restated for completeness — no new font usage today)

```
--font-display: "Plus Jakarta Sans", "Inter", -apple-system, sans-serif;
--font-body:    "Inter", -apple-system, sans-serif;
--font-numeric: "Poppins", "Inter", -apple-system, sans-serif;
--font-mono:    "JetBrains Mono", "SF Mono", monospace;

DAY 39 USAGE MAP — deliberately narrow, nothing new introduced
  Plus Jakarta Sans (600) → RealtimeToast title line only ("Ahmed missed a commitment").
                              OfflineBanner's single line of copy is Inter, NOT Jakarta —
                              see §4.2 for why a banner about a problem gets the calmer font.
  Inter (400/500)          → PresenceAvatars tooltip names, ConnectionStatusDot tooltip
                              label, OfflineBanner copy, RealtimeToast body line.
  Inter tabular (tnum)     → "+N" overflow count in PresenceAvatars — a number that sits
                              beside avatars and must align cleanly, same rule as every
                              other numeral-beside-UI moment in the app.
  Poppins                  → NOT used today. Zero new call sites. The two-call-site rule
                              locked on Day 38 holds exactly — today is proof the
                              restriction wasn't just words.
```

**Micro-intention — why `OfflineBanner` is Inter, not Jakarta, even though it's a "headline" moment:** Jakarta has been established across Days 26–38 as the font of *structural confidence* — page titles, section headers, a person's score. A connection-loss banner is the opposite: it's a transient, slightly anxious moment, and dressing it in the same confident display font the rest of the app uses for "this is solid, this is true" would send a subtly wrong signal. Keeping it in plain Inter, mid-weight, is itself a typographic micro-decision: *this is information, not a statement.*

---

## 2. File Manifest (exact, in build order)

```
apps/web/src/
│
├── shared/
│   ├── lib/websocket/
│   │   └── socket.handlers.ts                      [1]  registry — built FIRST, before any hook
│   │
│   ├── components/feedback/
│   │   ├── ConnectionStatusDot.tsx                  [5]
│   │   ├── OfflineBanner.tsx                        [6]
│   │   └── RealtimeToast.tsx                        [7]
│   │
│   └── hooks/
│       └── usePresenceHeartbeat.ts                  [4]  generic heartbeat sender
│
├── store/
│   └── realtime.store.ts                            [2]  EXTENDED — built before consumer hooks
│
├── features/
│   ├── commitments/hooks/
│   │   └── useRealtimeCommitments.ts                [8]
│   ├── action-items/hooks/
│   │   └── useRealtimeActionItems.ts                [9]
│   └── team/hooks/
│       └── useRealtimeTeam.ts                       [10]
│
└── shared/components/layout/
    ├── SidebarUser.tsx                              [11] MOD — renders ConnectionStatusDot
    └── Topbar/
        └── PresenceAvatars.tsx                      [12]
```

**Build order rationale — why the registry (1) and the store (2) come before every domain hook:** `socket.handlers.ts` isn't just documentation today, it's the file that *forces* the question "what does this event do?" to be answered before the corresponding hook is written, not after. Writing the registry row for `commitment:fulfilled → useRealtimeCommitments → patches queryKeys.commitments.* + queryKeys.team.member(ownerId)` *before* `useRealtimeCommitments.ts` exists means the hook is implemented against a spec, not improvised. Same discipline as Days 36–38's "hooks before components" — extended one level further, to "registry entry before hook."

---

## 3. The Registry, the Store, and the Generic Pieces

### 3.1 `socket.handlers.ts` — documentation-as-code, not a new abstraction layer

```typescript
// shared/lib/websocket/socket.handlers.ts
//
// SINGLE SOURCE OF TRUTH for "what happens when event X arrives."
// This file does NOT call socket.on() itself — each domain hook still owns
// its actual subscription and cache-patch logic. This file exists so an
// engineer (or this very document, six months from now) can answer
// "what listens for commitment:missed?" in one grep, not five.

export const REALTIME_EVENT_MAP = {
  // Meetings (Day 32 — unchanged, registered here for completeness)
  'meeting:bot_joining':    { owner: 'useRealtimeMeeting',      patches: ['meetings.detail', 'meetings.list'] },
  'meeting:recording':      { owner: 'useRealtimeMeeting',      patches: ['meetings.detail', 'meetings.list'] },
  'meeting:processed':      { owner: 'useRealtimeMeeting',      patches: ['meetings.detail', 'meetings.list', 'commitments.all'] },

  // Commitments — NEW today
  'commitment:created':       { owner: 'useRealtimeCommitments', patches: ['commitments.all'] },
  'commitment:fulfilled':     { owner: 'useRealtimeCommitments', patches: ['commitments.all', 'team.members', 'team.member'] },
  'commitment:missed':        { owner: 'useRealtimeCommitments', patches: ['commitments.all', 'team.members', 'team.member'], toast: 'manager-only' },
  'commitment:deferred':      { owner: 'useRealtimeCommitments', patches: ['commitments.all'] },
  'member:score_updated':     { owner: 'useRealtimeCommitments', patches: ['team.members', 'team.member'] },

  // Action Items — NEW today
  'action_item:synced':       { owner: 'useRealtimeActionItems',  patches: ['actionItems.all'] },

  // Team — NEW today
  'member:joined':             { owner: 'useRealtimeTeam', patches: ['team.members'], effect: 'insert-with-highlight' },
  'member:removed':            { owner: 'useRealtimeTeam', patches: ['team.members'], effect: 'remove-row' },
  'system:removed_from_team':  { owner: 'useRealtimeTeam', patches: [], effect: 'force-redirect-self' },
  'my:role_updated':           { owner: 'useRealtimeTeam', patches: ['auth.me'], effect: 'refresh-permissions-self' },
} as const satisfies Record<string, RealtimeEventEntry>
```
**Micro-intentions:**
- `as const satisfies Record<...>` gives **compile-time enforcement** that every entry conforms to the shape, while still letting TypeScript narrow each entry's literal `owner`/`effect` strings — this is the difference between a registry that's *aspirational comments* and one that's *checked by the compiler*. If `useRealtimeTeam` is renamed and the string here isn't updated, nothing breaks at runtime, but it's a one-line diff to keep honest.
- The `toast: 'manager-only'` and `effect: '...'` fields are **metadata the implementation reads**, not decoration — `useRealtimeCommitments` literally checks `REALTIME_EVENT_MAP['commitment:missed'].toast === 'manager-only'` before deciding whether to fire `RealtimeToast` for the current user's role. This closes the loop between "the registry says it" and "the code does it" — a registry that can silently drift from behavior is worse than no registry.
- This file is the **first thing reviewed in any future PR that adds a new realtime event** — the team's working agreement (documented here, not just implied) is: no `socket.on()` call merges without a corresponding row added to this map first.

### 3.2 `realtime.store.ts` — presence as a Map, not an array

```typescript
// store/realtime.store.ts — extended
interface RealtimeState {
  connectionStatus: 'connected' | 'connecting' | 'offline'
  presence: Map<string, number>   // userId → lastSeenAt (epoch ms)
  setConnectionStatus: (status: ConnectionStatus) => void
  recordPresence: (userId: string, timestamp: number) => void
  prunePresence: (staleAfterMs: number) => void
}

export const useRealtimeStore = create<RealtimeState>()((set, get) => ({
  connectionStatus: 'connecting',
  presence: new Map(),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  recordPresence: (userId, timestamp) =>
    set((s) => {
      const next = new Map(s.presence)
      next.set(userId, timestamp)
      return { presence: next }
    }),

  prunePresence: (staleAfterMs) =>
    set((s) => {
      const cutoff = Date.now() - staleAfterMs
      const next = new Map([...s.presence].filter(([, ts]) => ts > cutoff))
      return next.size === s.presence.size ? s : { presence: next }   // skip re-render if nothing pruned
    }),
}))
```
**Micro-intentions:**
- **`Map<userId, timestamp>`, not an array of `{userId, status}` objects** — presence is fundamentally "when did I last hear from this person," and a Map gives O(1) update-on-heartbeat and trivial pruning, versus `array.findIndex` + splice on every ping at a team of 60 people pinging every 25 seconds.
- **`prunePresence` returns the *same* state object (`return s`) when nothing actually changed** — this is a deliberate Zustand micro-optimization: a naive implementation would always return a new object/Map even when the filter removed zero entries, causing every consumer of `presence` to re-render every prune interval for nothing. The one-line size-comparison guard prevents that.
- This store has **zero knowledge of Socket.io** — it's pure client state. `socket.ts` (Day 32) and the new domain hooks call `recordPresence`/`setConnectionStatus`; the store itself never imports `socket.ts`. This one-directional dependency (socket → store, never store → socket) is what keeps the store trivially unit-testable without mocking a WebSocket connection.

### 3.3 `usePresenceHeartbeat.ts` — sender, generic, deliberately dumb

```typescript
// shared/hooks/usePresenceHeartbeat.ts
function usePresenceHeartbeat(intervalMs = 25_000) {
  const socket = useSocket()
  const { teamId, userId } = useAuthContext()

  useEffect(() => {
    if (!socket) return
    const send = () => socket.emit(ClientEvents.MARK_PRESENCE, { userId, teamId })
    send()   // immediate first beat — don't wait a full interval to appear "online"
    const id = setInterval(send, intervalMs)
    return () => clearInterval(id)
  }, [socket, teamId, userId, intervalMs])
}
```
**Micro-intention — the immediate first beat:** without `send()` called once before the `setInterval` starts, a user who just opened the app would appear offline to teammates for up to 25 seconds before their first heartbeat lands. One extra line, and the "who's around" feature feels instant on load rather than mysteriously delayed.

---

## 4. Component-Level Patterns & Micro-Intentions

### 4.1 `ConnectionStatusDot.tsx` — three states, one shape, color-only differentiation

```tsx
function ConnectionStatusDot() {
  const status = useRealtimeStore((s) => s.connectionStatus)

  const config = {
    connected:  { className: 'bg-primary',         label: 'Connected',  pulse: false },
    connecting: { className: 'bg-muted-foreground', label: 'Reconnecting…', pulse: true },
    offline:    { className: 'bg-transparent border border-muted-foreground/40', label: 'Offline', pulse: false },
  }[status]

  return (
    <Tooltip content={config.label}>
      <span
        role="status"
        aria-live="polite"
        aria-label={config.label}
        className={cn(
          'inline-block size-1.5 rounded-full transition-colors duration-150',
          config.className,
          config.pulse && 'animate-pulse'
        )}
      />
    </Tooltip>
  )
}
```
**Micro-intentions:**
- **The dot never changes shape or size across states, only fill** — `connected` is a solid filled circle, `offline` is the *same* circle but hollow (border-only, transparent fill), `connecting` is the solid fill with `animate-pulse`. Three states, one consistent 6px (`size-1.5`) silhouette — the eye never has to re-parse "wait, is this a different element now?" the way it would if offline swapped to an icon or a different shape.
- **`animate-pulse` is Tailwind's existing opacity-oscillation utility**, not a new custom keyframe — it satisfies "opacity-only motion" from the platform's locked motion budget without introducing a bespoke animation just for this one dot.
- **`role="status"` + `aria-live="polite"`** — a screen-reader user is told "Reconnecting…" the moment the status changes, without it interrupting whatever they're currently doing (`polite`, not `assertive`) — connection status is ambient information, not an alert that should yank focus.
- **No state ever uses red.** `offline` is rendered as a *hollow* neutral dot, not a red-filled one — this is the same "severity through shape/absence, never through alarm color" principle that's governed `CommitmentRateBar` and `CommitmentScore` since Day 34, now extended to system status itself.

### 4.2 `OfflineBanner.tsx` — debounced appearance, the "~3 second" rule made explicit

```tsx
function OfflineBanner() {
  const status = useRealtimeStore((s) => s.connectionStatus)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (status === 'offline') {
      const timer = setTimeout(() => setVisible(true), 3000)   // the debounce IS the feature
      return () => clearTimeout(timer)
    }
    setVisible(false)
  }, [status])

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'fixed top-0 inset-x-0 z-50 h-8 flex items-center justify-center gap-2',
        'bg-muted text-foreground text-[13px] font-inter',
        'transition-all duration-150 ease-out',
        visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      )}
    >
      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse" />
      Connection lost — reconnecting…
    </div>
  )
}
```
**Micro-intentions:**
- **The 3-second `setTimeout` is the entire feature, design-wise.** A WebSocket reconnect blip (a laptop waking from sleep, a brief Wi-Fi hiccup) resolves in under a second almost every time — without the debounce, the banner would flicker in and out constantly during perfectly normal network behavior, training users to ignore it within a day. The debounce is what makes the banner *mean something* when it finally appears: by the time it's visible, the disconnect is real enough to be worth a sentence of UI.
- **`role="alert"` + `aria-live="assertive"`** here, deliberately the *opposite* urgency level from `ConnectionStatusDot`'s `polite` — the dot is ambient, glanceable status; the banner only appears for a disconnect that's already lasted three real seconds, which *does* warrant an assertive, interrupt-and-announce-now treatment for a screen-reader user, since by then sighted users are also seeing an unmissable top-of-viewport bar.
- **`bg-muted`, not a red/amber alert background** — re-stating the "never alarming-red" rule from §4.1 at the banner level. The copy itself ("Connection lost — reconnecting…") already communicates urgency in words; the visual treatment doesn't need to shout the same thing a second time in color.
- **Auto-dismiss is implicit, not a second timer** — the banner's visibility is entirely derived from `connectionStatus`; the moment `socket.ts`'s reconnection logic (Day 32) flips status back to `connected`, this effect's cleanup branch sets `visible` false immediately, no separate "wait N seconds before hiding" debounce on the way out. Showing should be cautious (3s debounce); hiding should be instant — asymmetric timing, intentionally.

### 4.3 `PresenceAvatars.tsx` — stacked, capped, deliberately quiet

```tsx
function PresenceAvatars() {
  const presence = useRealtimeStore((s) => s.presence)
  const { members } = useTeamMembers()
  const onlineIds = useMemo(() => {
    const cutoff = Date.now() - 60_000   // 60s grace beyond the 25s heartbeat — avoids flicker
    return new Set([...presence].filter(([, ts]) => ts > cutoff).map(([id]) => id))
  }, [presence])

  const online = members.filter((m) => onlineIds.has(m.id))
  const visible = online.slice(0, 5)
  const overflow = online.length - visible.length

  if (online.length === 0) return null   // nobody online → render nothing, not an empty stack

  return (
    <div className="flex items-center -space-x-1.5" aria-label={`${online.length} online`}>
      {visible.map((m) => (
        <Tooltip key={m.id} content={m.name}>
          <Avatar className="size-5 ring-2 ring-background">
            <AvatarImage src={m.avatarUrl} />
            <AvatarFallback className="text-[9px] font-inter">{initials(m.name)}</AvatarFallback>
          </Avatar>
        </Tooltip>
      ))}
      {overflow > 0 && (
        <span className="size-5 rounded-full bg-muted ring-2 ring-background
                          flex items-center justify-center text-[9px] font-inter tabular text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  )
}
```
**Micro-intentions:**
- **60-second online cutoff against a 25-second heartbeat** — a 2.4x grace window absorbs one missed beat (a brief tab-backgrounding throttle, a momentary network blip) without a teammate visibly "blinking" offline and back online every time their browser tab isn't focused. This ratio is a deliberate tuning choice, not an arbitrary number — too tight and presence flickers distractingly; too loose and "online" stops meaning anything.
- **`-space-x-1.5` negative margin for the classic overlapping-avatar stack**, `ring-2 ring-background` on each avatar so the overlap reads as discrete circles cut into each other, not a smudged blob — this is the same visual technique every serious collaborative tool (Linear, Figma, Notion) uses, applied here at its smallest, calmest scale (20px avatars, max 5 visible).
- **Renders `null` when nobody's online**, never an empty bordered placeholder — an empty presence stack communicates nothing useful and would just be visual noise sitting in the Topbar permanently during off-hours.
- **No "last seen" tooltip text, just the name** — this widget answers "who's around right now," full stop; it deliberately does not become a richer presence/status feature (no "Ahmed — away," no custom status text) per the base spec's explicit restraint, re-affirmed here at the implementation level.

### 4.4 `RealtimeToast.tsx` — the one toast, built so a second one can't sneak in unreviewed

```tsx
// shared/components/feedback/RealtimeToast.tsx
function fireRealtimeToast(event: keyof typeof REALTIME_EVENT_MAP, payload: { title: string; description?: string; href?: string }) {
  const entry = REALTIME_EVENT_MAP[event]
  if (!entry.toast) {
    // Defensive guard: a hook can only fire a toast for an event the registry
    // explicitly marks as toast-worthy. This makes "just add a toast here real
    // quick" structurally inconvenient — you have to edit the registry first,
    // which is the point.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`fireRealtimeToast called for "${event}" but registry has no toast policy.`)
    }
    return
  }

  toast.custom((t) => (
    <div className="flex flex-col gap-0.5 rounded-md border bg-background p-3 shadow-md max-w-xs">
      <p className="font-jakarta font-semibold text-[13px]">{payload.title}</p>
      {payload.description && (
        <p className="font-inter text-[12px] text-muted-foreground">{payload.description}</p>
      )}
      {payload.href && (
        <Link href={payload.href} onClick={() => toast.dismiss(t)} className="text-[12px] underline mt-1">
          View →
        </Link>
      )}
    </div>
  ), { duration: 6000 })
}
```
**Micro-intentions:**
- **The function refuses to fire unless the registry (§3.1) explicitly opted that event into `toast`.** This is the architectural answer to "the team explicitly avoids toast-spamming every event" — it's not a verbal agreement in a planning doc that erodes over six months of feature additions, it's a runtime guard with a dev-mode warning. Adding a second toast-worthy event later requires touching the registry first, which is exactly the friction point that keeps future engineers honest.
- **`toast.custom` with hand-built JSX, not the default toast string API** — this is the one place today Jakarta appears, on the title line only, because a cross-user notification *is* a small moment of structural importance ("something happened that involves you") and earns the same visual weight as a Sheet title.
- **6-second duration, with a `View →` link that dismisses the toast on click** — long enough to read and react, short enough not to pile up if multiple commitments are missed in a burst (e.g., end-of-day cron firing for several overdue items at once — each gets its own toast, but each ages out within 6 seconds rather than stacking indefinitely).

### 4.5 `useRealtimeTeam.ts` — the hook with real consequences for the current user

```typescript
function useRealtimeTeam() {
  const socket = useSocket()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { userId } = useAuthContext()

  useEffect(() => {
    if (!socket) return

    const onMemberJoined = ({ user }: { user: Member }) => {
      queryClient.setQueryData(queryKeys.team.members(teamId), (old: Member[] = []) => [...old, user])
      // 'insert-with-highlight' effect (per registry) — flagged via a transient
      // Set in realtime.store so MemberRow can render a brief background-fade
      useRealtimeStore.getState().flashRow(user.id)
    }

    const onMemberRemoved = ({ userId: removedId }: { userId: string }) => {
      queryClient.setQueryData(queryKeys.team.members(teamId), (old: Member[] = []) =>
        old.filter((m) => m.id !== removedId)
      )
    }

    const onRemovedFromTeam = () => {
      // This is about ME. No cache patch matters anymore — every team-scoped
      // query is about to be invalid. Clear and redirect, don't try to be clever.
      queryClient.clear()
      router.push('/removed')
    }

    const onRoleUpdated = ({ newRole }: { newRole: UserRole }) => {
      queryClient.setQueryData(queryKeys.auth.me(), (old: User | undefined) =>
        old ? { ...old, role: newRole } : old
      )
      toast.message(`Your role is now ${newRole}`)
      // No redirect — permission-gated UI (e.g. getAvailableActions consumers
      // from Days 36-38) re-derives automatically because it reads role from
      // the same query this just patched. Nothing else to do.
    }

    socket.on(ServerEvents.MEMBER_JOINED, onMemberJoined)
    socket.on(ServerEvents.MEMBER_REMOVED, onMemberRemoved)
    socket.on(ServerEvents.SESSION_EXPIRED /* placeholder name */, onRemovedFromTeam)
    socket.on(ServerEvents.MY_ROLE_UPDATED, onRoleUpdated)

    return () => {
      socket.off(ServerEvents.MEMBER_JOINED, onMemberJoined)
      socket.off(ServerEvents.MEMBER_REMOVED, onMemberRemoved)
      socket.off(ServerEvents.SESSION_EXPIRED, onRemovedFromTeam)
      socket.off(ServerEvents.MY_ROLE_UPDATED, onRoleUpdated)
    }
  }, [socket, queryClient, router, userId])
}
```
**Micro-intentions:**
- **`onRemovedFromTeam` doesn't try to patch caches surgically — it clears everything and redirects.** This is a deliberate "don't be clever in a moment that doesn't deserve cleverness" decision: once you're removed, *every* team-scoped query in the cache is about a workspace you no longer belong to. Attempting a targeted patch here would be more code, more risk, for a state that's about to be thrown away anyway.
- **`onRoleUpdated` does *not* force a redirect or a hard refresh** — it patches the `auth.me` query, and trusts that every permission-gated component (`getAvailableActions` consumers from Day 37/38, route guards) re-derives correctly because they all read role from that same query, not from a snapshot taken at page load. This is the payoff of *not* having scattered, locally-cached copies of "my role" anywhere else in the codebase — one source, one patch, everything downstream is correct by construction.
- **`flashRow(user.id)` is a transient, self-clearing flag**, not a persistent style — `MemberRow` checks this id, applies a `bg-primary/10` fade-out class for ~1.2s via a CSS transition, and the store clears the flag itself after a timeout. This is the "brief highlight-fade, not a jarring re-sort" requirement made concrete: the new member appears at the end of the current sort order (no re-sort), with a momentary visual cue that *this* row is the reason the list just changed.

---

## 5. Performance Engineering for Today

```
CONCERN                          TECHNIQUE
──────────────────────────────────────────────────────────────────────────
Heartbeat traffic at scale        25s interval, single emit per client — at a
                                   60-member team that's ~2.4 events/sec team-wide,
                                   negligible; no client-side batching needed at
                                   this scale (documented ceiling, same reasoning
                                   as Day 37's "no pagination under 60 members")
Presence Set recomputation        useMemo keyed on the presence Map reference —
                                   recomputes onlineIds only when a heartbeat
                                   actually changes the Map, not on unrelated
                                   store updates (connectionStatus changes don't
                                   re-trigger this memo)
Cache patch fan-out                Every realtime patch uses the same
                                   setQueriesData-by-predicate technique proven
                                   in Day 36 — O(1) re-renders per affected
                                   component regardless of how many query
                                   variants (filters/pages) are cached
Toast duration vs. burst events    Fixed 6s auto-dismiss per toast, no manual
                                   stacking limit needed — Sonner/the toast
                                   library's own queue handles concurrent toasts;
                                   the registry-gate (§4.4) is what prevents
                                   volume, not a rate-limiter
Offline banner debounce            setTimeout-based, cleared on every status
                                   change — zero risk of a stale timer firing
                                   after reconnection already happened
```

---

## 6. Accessibility & Live-Region Map (Day 39 — the day's real a11y focus)

```
COMPONENT               ARIA TREATMENT                          URGENCY
──────────────────────────────────────────────────────────────────────────
ConnectionStatusDot      role="status" aria-live="polite"        ambient
OfflineBanner            role="alert" aria-live="assertive"      interrupting
PresenceAvatars          aria-label="{N} online" on the group     ambient, summarized
RealtimeToast            inherits toast library's own live-region handling
                         (Sonner's built-in aria-live region) — not re-implemented
```
**Micro-intention behind the urgency split:** today is the first day the app has *two different* live-region urgencies operating simultaneously, and the rule for choosing between them is now explicit and reusable: **ambient/background status → `polite`; something the user needs to know happened/changed right now → `assertive`.** Every future realtime indicator (a future "syncing" status elsewhere, a future inline alert) should be evaluated against this exact two-bucket rule rather than guessing per-component.

---

## 7. Scalability Notes (why this survives every future realtime feature)

1. **`socket.handlers.ts` is the gate for all future events** — Day 58's real Jira sync, Day 60's Slack events, any future webhook-driven UI update adds a row here first. The registry's `satisfies` typing means a malformed entry is a compile error, not a runtime surprise discovered in production.
2. **The toast-gate pattern (§4.4) scales policy, not code** — deciding a *new* event deserves a toast is a one-line registry edit (`toast: 'manager-only'` or a new policy string), never a new bespoke toast component.
3. **`realtime.store.ts`'s presence Map and the 25s/60s heartbeat ratio are tunable in one place** — if a future team-size tier (ENTERPRISE, hundreds of members) makes 25-second heartbeats too chatty, the interval and grace window are two constants in two files, not a redesign.
4. **`onRoleUpdated`'s "patch the single source query, trust downstream re-derivation" pattern** is the template for any future "something about *me* changed" event — a future plan-downgrade event, a future feature-flag change, all follow the identical shape: patch `auth.me` (or the relevant single-source query), don't hunt down every component that might care.
5. **The ambient/assertive a11y split (§6)** is now a documented decision rule, not a one-off choice — the next engineer adding a live region doesn't need to re-derive when to use which urgency from first principles.

---

## 8. End-of-Day Verification (engineering + design QA, combined)

```
ENGINEERING
[ ] socket.handlers.ts: every domain hook's socket.on() calls have a corresponding
    registry entry — manual cross-check, zero orphaned subscriptions
[ ] realtime.store.ts: prunePresence returns the identical Map reference when
    nothing was pruned — verified via reference equality in a unit test
[ ] fireRealtimeToast: calling it for a non-whitelisted event logs a dev warning
    and does NOT render a toast — confirmed in dev console
[ ] useRealtimeTeam: onRemovedFromTeam clears the full query cache before
    redirecting — verified no stale team-scoped data lingers post-redirect

DESIGN / TYPOGRAPHY / MOTION
[ ] OfflineBanner copy renders in Inter, not Jakarta — confirmed against the
    documented "information, not a statement" rule
[ ] ConnectionStatusDot never changes shape across states — only fill/border —
    confirmed across all three states side by side
[ ] No realtime indicator anywhere on this page uses red — confirmed by audit
[ ] PresenceAvatars renders null (not an empty stack) when zero members online

ACCESSIBILITY
[ ] ConnectionStatusDot uses aria-live="polite"; OfflineBanner uses "assertive" —
    confirmed both fire correctly and at the intended urgency with a screen reader
[ ] PresenceAvatars group has one summarizing aria-label, not N individual
    unannounced avatar images

PRODUCT BEHAVIOR (carried from base spec — re-verified against today's deeper implementation)
[ ] Every list from Days 28/31/33/36/37 reacts live to its corresponding webhook
    event, manually fired via Postman, with zero manual refresh
[ ] OfflineBanner does not flicker on a sub-3-second reconnect blip (simulated via
    rapid online/offline toggling in DevTools)
[ ] Presence avatars reflect a teammate going offline within ~60s + one heartbeat,
    not instantly on tab-blur (grace window confirmed, not over-eager)
[ ] RealtimeToast fires for exactly the one documented case (commitment:missed,
    manager-only) — full audit of today's build confirms no second toast call exists
```

---

*Document: DAY-39-DEEP-PLAN | Vocaply | Full Realtime Pass | Version 1.0*
*Typography: Plus Jakarta Sans (toast titles only) + Inter (everything else, tabular numerals) + Poppins (unused today — scope held exactly to Day 38's two call sites)*
*Principal Frontend Architecture — realtime that earns trust by staying quiet*
