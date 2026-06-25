# Vocaply — Day 34 Deep Build Plan
## CommitmentScore Gauge, Cross-Meeting Timeline, Stats Strip, Detail Page
> Senior Frontend Architecture Edition — SVG Geometry, Animated Stroke Math, Audit-Trail UX
> Continues from Day 33 (Tracker + Segmented Tabs). Today: the one bespoke visual component of the week, and the page that builds user trust in the AI.

---

## 0. Typography Carried Forward (no new rules — applied to today's new surfaces)

```
--font-sans:    "Inter"              → CommitmentScoreLegend lines, TrendIndicator text,
                                        StatPill labels, timeline event body text, owner name
                                        on CommitmentDetailHeader
--font-display: "Plus Jakarta Sans"  → CommitmentDetailHeader's commitment TEXT itself (the
                                        actual quoted promise, e.g. "I'll finish the login
                                        feature by Thursday") — this is a deliberate, narrow
                                        exception: the commitment's own words are the single
                                        most important content on the page, and rendering them
                                        in the display font at a slightly larger size (text-lg,
                                        15px) gives them the visual weight of a "headline" for
                                        this page, the same way a Sheet title gets font-display
                                        on Day 32 — content that IS the page's subject earns
                                        display treatment; everything describing/surrounding it
                                        stays in Inter
--font-mono:    "JetBrains Mono"     → the score number inside the gauge (the single most
                                        important reason font-mono exists in this design system:
                                        a tabular-nums mono numeral inside a donut never shifts
                                        the visual center of mass as it animates from one value
                                        to another), StatPill numeric values, timeline timestamps
```

---

## 1. Why Today Is "One Component, Built Right" Rather Than "Many Components, Built Fast"

Days 31–33 were breadth days — many small files composing into screens. Today is deliberately a **depth day**: most of the engineering effort goes into a single SVG component (`CommitmentScore`) that will be mounted in at least four places across the product's lifetime (today's detail page, Day 37's member table, Day 38's member profile, and likely a future analytics card). Getting its math, its prop contract, and its animation behavior exactly right today means every future call site is a one-line `<CommitmentScore score={x} />` with zero special-casing — the opposite of Day 32's form, which was inherently single-purpose. The Timeline component is the second focus, because it's the UI's only direct window into the backend's cross-meeting resolver — if it doesn't read clearly, the product's core AI claim ("we remember what you promised across meetings") stays invisible no matter how good the backend logic is.

---

## 2. Files to Create — Full Tree

```
app/(dashboard)/commitments/[commitmentId]/
  page.tsx
  loading.tsx
  error.tsx                          ← NEW, not in original spec — added for the 404/cross-team case

features/commitments/components/
  CommitmentScore/
    CommitmentScore.tsx
    CommitmentScore.utils.ts         ← NEW: pure geometry math, unit-testable, zero JSX
    CommitmentScoreLegend.tsx
  CommitmentTimeline/
    CommitmentTimeline.tsx
    CommitmentTimelineEvent.tsx
    CommitmentTimelineEventIcon.tsx  ← NEW: small dot/icon per event type, split for clarity
  CommitmentStats.tsx
  CommitmentDetailHeader.tsx
  TrendIndicator.tsx

features/commitments/hooks/
  useCommitmentStats.ts
  useCommitment.ts

shared/lib/cache/
  query-keys.ts                      ← EXTEND: commitments.detail(id), commitments.stats(teamId)
```

---

## 3. Component Contracts — Written Before the SVG Touches the DOM

```ts
// CommitmentScore.tsx — the reusable primitive
interface CommitmentScoreProps {
  score: number              // 0–100, clamped internally — never trust the caller blindly
  size?: 'sm' | 'md' | 'lg'   // sm=32px (table cell), md=56px (detail chip), lg=96px (future
                              // profile hero use) — three fixed sizes, NOT an arbitrary
                              // numeric size prop, because stroke-width and font-size both
                              // need to scale in lockstep with the diameter, and three curated
                              // presets guarantee that relationship stays correct everywhere
                              // it's used, rather than trusting every future caller to pick a
                              // sensible arbitrary pixel value
  showLabel?: boolean        // false in dense table cells (Day 37), true in detail/profile views
  animateFrom?: number       // optional — if provided, gauge animates FROM this value TO
                              // `score` on mount (used by Day 35's post-mutation recalculation,
                              // NOT used on initial page load, where the gauge should render
                              // already-settled, not animate in from zero every time)
}

// CommitmentScore.utils.ts — pure functions, the actual hard part of today
export function clampScore(score: number): number               // Math.min(100, Math.max(0, score))
export function scoreToStrokeDashoffset(score: number, circumference: number): number
export function scoreToArcColor(score: number): string           // returns a CSS var reference,
                                                                   // NOT a literal hex — see §6
export function getGaugeDimensions(size: 'sm' | 'md' | 'lg'): {
  diameter: number
  strokeWidth: number
  fontSize: number
}

// CommitmentTimeline.tsx
interface CommitmentTimelineProps {
  events: CommitmentTimelineEventData[]   // already sorted chronologically by the API
}
interface CommitmentTimelineEventData {
  type: 'created' | 'referenced' | 'resolved'
  meetingId: string
  meetingTitle: string
  occurredAt: string
  excerpt?: string          // the actual transcript sentence that triggered this event, if available
  resultingStatus?: CommitmentStatus   // only present on 'resolved' events
}
```

**Why geometry math lives in a separate `.utils.ts` file instead of inline in the component:** SVG `stroke-dashoffset` math (circumference, percentage-to-offset conversion) is exactly the kind of logic that's trivial to get subtly wrong (off-by-quarter-circle rotation errors are the classic donut-gauge bug) and trivial to unit-test in isolation if it's pure functions with no JSX. Today's checklist includes testing `scoreToStrokeDashoffset(0)`, `(50)`, `(100)` against known-correct values *before* wiring them into JSX — catching the classic "my gauge starts at 3 o'clock instead of 12" bug at the function level, not by eyeballing a rendered SVG.

---

## 4. CommitmentScore — Full Geometry Specification

```
SVG STRUCTURE (two concentric circles, both using stroke + stroke-dasharray, NOT <path> arcs —
circles are simpler, avoid path-arc-flag math entirely, and are the standard technique for a
single-segment donut gauge):

  <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
    {/* rotate -90deg so 0% starts at 12 o'clock, not the SVG default 3 o'clock — this is
        the single most important visual decision: a gauge that starts at 3 o'clock reads as
        "broken" to anyone who's seen a progress ring before */}
    <circle class="track" cx="50" cy="50" r="45"
            stroke="var(--border)" stroke-width={strokeWidth} fill="none" />
    <circle class="arc" cx="50" cy="50" r="45"
            stroke={arcColor} stroke-width={strokeWidth} fill="none"
            stroke-linecap="round"
            stroke-dasharray={circumference}
            stroke-dashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.4, 0, 0.2, 1)' }} />
  </svg>
  <span class="score-label" style={{ transform: 'rotate(90deg)' }}>{score}</span>
  {/* the label sits in a normal (non-rotated) <div> positioned absolutely over the SVG's
      center — counter-rotated back to upright since its parent SVG is rotated -90deg */}

CIRCUMFERENCE:  2 * π * 45 ≈ 282.74 (radius fixed at 45 in the 0–100 viewBox coordinate system,
                regardless of size prop — the SAME viewBox is used for sm/md/lg, only the
                outer rendered <svg> width/height and the stroke-width/font-size scale; this
                means the geometry math never has three different radius values to juggle,
                only ONE circumference constant ever computed)

DASH OFFSET:    dashOffset = circumference * (1 - clampedScore / 100)
                at score=0:   dashOffset = circumference        (arc fully hidden)
                at score=100: dashOffset = 0                     (arc fully drawn, full circle)
                at score=50:  dashOffset = circumference / 2      (half-circle drawn)

STROKE-LINECAP: "round" — gives the arc's leading edge a soft rounded tip rather than a hard
                square cut-off, the detail that separates a "designed" gauge from a default one;
                at score=0 there's technically a zero-length arc so the rounded cap is invisible,
                no edge case to guard against

ARC COLOR:      ALWAYS a single CSS variable, var(--score-arc) mapped in globals.css to the
                SAME accent hue used for active SegmentedTabs/focus rings (re-using the one
                approved accent color app-wide, never introducing a second "score color"
                palette) — explicitly confirmed: score 12 and score 94 render the identical
                arc color, only the SWEPT LENGTH differs, never the hue. This is the literal
                implementation of "informational, not alarming."

TRACK COLOR:    var(--border) — the unfilled remainder of the circle uses the exact same
                neutral border color used for every other border in the app, so the gauge's
                "background ring" doesn't introduce a new gray value into the palette
```

### Size presets (`getGaugeDimensions`)
```
sm:  diameter 32px, strokeWidth 3,  fontSize 10px (label hidden by default at this size —
     showLabel=false is the typical pairing, used standalone in a dense table cell where the
     number appears in an adjacent column instead)
md:  diameter 56px, strokeWidth 4,  fontSize 16px (today's detail-page chip size)
lg:  diameter 96px, strokeWidth 6,  fontSize 28px (reserved for Day 38's profile hero — not
     exercised today, but the preset exists now so Day 38 needs zero CommitmentScore changes)
```

---

## 5. Micro-Interactions — Specified Per Element

### 5.1 The gauge's own animation — the single most important motion this week
```
ON MOUNT (no `animateFrom` prop): the arc renders ALREADY at its final dashOffset — NO
  animation plays on initial page load. A donut gauge that sweeps from 0 to its value every
  single time a page loads is a "skill bar" cliché from template-era web design; an established
  product (Linear, Stripe dashboard) shows settled data instantly and animates only on
  CHANGE, never on first paint. This is the most important taste judgment of the day.
ON UPDATE (animateFrom provided, used starting Day 35): the CSS transition declared directly
  on the `stroke-dashoffset` property (600ms cubic-bezier(0.4,0,0.2,1) — a slightly slower,
  more "settling" curve than the 120–180ms UI-chrome transitions used everywhere else, because
  this single transition IS the entire content of the interaction, not an accompaniment to a
  state change happening elsewhere) handles the animation automatically the moment React
  re-renders with a new `score` value — no requestAnimationFrame, no animation library, the
  browser's native CSS transition engine does the interpolation.
  The center number does NOT count up digit-by-digit in sync with the arc (e.g. 78→82 does not
  visually tick through 79, 80, 81) — it swaps instantly the moment the new score prop arrives,
  while the arc visually settles into place over the 600ms. This split (instant number, smooth
  arc) is deliberate: the number is precise data that should be trustworthy and immediate; the
  arc is an ambient visual indicator where a smooth transition reads as polish rather than lag.
```

### 5.2 CommitmentScoreLegend — staggered reveal, not simultaneous
```
The three lines (Fulfillment / On-time / Trend) fade in with a small stagger: 0ms, 40ms, 80ms
delays, each individually opacity 0→1 + translateY(2px)→0 over 120ms — a deliberately tiny
stagger (40ms increments, not the more decorative 80–100ms staggers some marketing sites use)
that's barely perceptible as "staggered" but prevents three lines of text from feeling like
they materialized as one flat block; this only plays once on the detail page's initial mount,
never re-triggers on data refetch (guarded via a mounted-ref, not re-keying the component).
```

### 5.3 TrendIndicator — icon + text, no color alarm
```
"↑ improving"  → text-foreground, small ↑ glyph (Lucide's ArrowUp icon, 12px) inline before text
"→ stable"     → text-muted-foreground, → glyph
"↓ declining"  → text-foreground, ↓ glyph — STILL not red; declining is communicated via the
                 glyph direction and the fact that "declining" is a less favorable WORD than
                 "improving," not via a color shift. This is the strictest application of the
                 neutral-color principle this week: even a clearly negative signal stays
                 monochrome, trusting the user to read words and arrows rather than relying on
                 a red/green reflex that the rest of the product has deliberately opted out of.
HOVER:          tooltip on the whole TrendIndicator showing the underlying comparison
                 ("This week: 82% · Last week: 71%") — same 300ms-delay Tooltip convention
                 used for ActionItemPriorityBadge on Day 31, reused verbatim for grammar
                 consistency across "badges/indicators that have more detail available on hover"
```

### 5.4 CommitmentTimeline — the trust-building component
```
LAYOUT:  vertical line (1px, var(--border)) running down the left edge, each
         CommitmentTimelineEvent positioned with its dot centered on that line — IDENTICAL
         visual grammar to MeetingTimeline (Day 29), confirmed by literally sharing the same
         underlying connector-line CSS class, not a re-implementation

DOT PER EVENT TYPE (CommitmentTimelineEventIcon):
  created:    a filled solid dot (8px, var(--foreground)) — this is the origin point, gets the
              strongest visual weight
  referenced: a hollow/outline dot (8px, border var(--muted-foreground), no fill) — visually
              "lighter" than created/resolved because nothing was DECIDED at this point, it's
              just a mention; the row's text is ALSO rendered at text-muted-foreground (not the
              same opacity-dim technique as Day 31's confidence-dim, but the analogous idea:
              less-certain/less-final information gets visually demoted, consistently, across
              the whole product)
  resolved:   a filled dot, but with a small ring/halo (a second, larger concentric circle at
              30% opacity around it) — the ONE place this week a dot gets slightly more visual
              decoration than a flat fill, because "resolved" is the payoff moment of the entire
              feature and deserves the smallest amount of extra emphasis; still no color change,
              purely a size/halo treatment

EVENT ROW CONTENT: meeting title (as a <Link>, underline-on-hover only, foreground-colored per
  the established link convention) + RelativeTime (Day 27 component, reused) + an OPTIONAL
  excerpt line below in font-mono text-xs text-muted-foreground wrapped in a subtle left-border
  accent (border-l-2 var(--border), pl-2) styled like a quoted transcript fragment — this is
  literally showing the user the sentence the AI keyed off of, e.g. "I finished the login
  feature" — the single most trust-building piece of UI in the entire app, because it makes the
  AI's reasoning inspectable rather than a black box

RESOLVED-EVENT EXTRA: when type === 'resolved', the row additionally renders a small
  CommitmentStatusBadge (reused from Day 31, e.g. "FULFILLED") inline after the meeting link —
  the only event type that shows a status badge, since created/referenced events don't have a
  resulting status yet

ENTRANCE: the whole timeline fades in as one unit (opacity 0→1, 140ms) on mount — individual
  events do NOT stagger-in (timelines can have many events; staggering 8+ rows would feel slow
  and gimmicky, unlike the 3-line legend's justified tiny stagger in §5.2 — motion budget is
  spent proportionally to item count, not applied uniformly everywhere)
```

### 5.5 CommitmentDetailHeader — the page's anchor
```
LAYOUT: commitment text (font-display text-lg, §0) as the dominant element, CommitmentStatusBadge
  + owner Avatar+name + CommitmentScore (size="sm", showLabel=false, since the number already
  appears redundantly close by if needed — at this size it's a glanceable indicator, not a
  primary data point) arranged in a single metadata row below the text, all in font-sans text-sm
  text-muted-foreground EXCEPT the owner's name itself, which is text-foreground (names are
  identity, not metadata-gray, consistent with how owner names render in every row across the app)
STATUS-ACTION BUTTONS: rendered today but visually disabled (opacity 0.5, aria-disabled, tooltip
  "Coming tomorrow") rather than omitted entirely — this is a deliberate choice over hiding them:
  showing the eventual action surface (even non-functional) previews tomorrow's capability and
  avoids a jarring "new buttons appeared overnight" feeling for anyone who saw the page today
```

### 5.6 CommitmentStats strip — instant, not animated
```
Four StatPills (Day 27 component, reused with zero modification) render their values directly
on data arrival — no count-up animation here either, for the identical reasoning as §5.1's
gauge-mount decision: settled dashboard-adjacent numbers should look authoritative and instant,
not like they're "calculating." The ONE motion present: each StatPill's number uses tabular-nums
so that when filters change the underlying tracker (Day 33) and these stats recompute, digit
width never shifts and causes the four pills to visibly jiggle/reflow against each other.
```

---

## 6. Color Token Addition Today

```css
/* globals.css — one new token, deliberately reusing an EXISTING hue, not introducing a new one */
:root {
  --score-arc: var(--ring);   /* literally aliases the existing focus-ring accent color —
                                  confirms there is exactly ONE accent color in the entire
                                  design system, reused for: active SegmentedTabs thumb border,
                                  focus rings, and now the score gauge arc. Zero new colors
                                  introduced this week. */
}
```

---

## 7. Data Flow

```
app/(dashboard)/commitments/[commitmentId]/page.tsx (RSC)
  → server-fetch commitment by ID, scoped to req.teamId (existing backend contract)
  → IF NOT FOUND (wrong team or doesn't exist) → notFound() → renders error.tsx's 404 state,
    NEVER a generic crash — this is the literal implementation of the backend's stated security
    rule "never reveal whether a resource exists in another tenant," now enforced client-side too
  → fetches commitment detail + timeline events in PARALLEL (Promise.all), passes both as
    initialData into client components — zero loading flash on first visit, consistent with
    every prior RSC-shell page this week

CommitmentStats (on the tracker page, NOT the detail page)
  → useCommitmentStats(teamId, currentFilters) — IMPORTANT: unlike useCommitmentCounts (Day 33,
    always reflects ALL statuses), the STATS strip DOES respect the currently active filters
    (owner/date/confidence, but notably NOT the status tab — fulfillment rate needs PENDING+
    MISSED+FULFILLED all represented to mean anything, so status tab selection is explicitly
    excluded from the stats query's filter set even though it's included in the list query's)
```

---

## 8. Accessibility Pass

```
- CommitmentScore: the SVG itself is aria-hidden="true" (decorative, the geometry conveys
  nothing semantic on its own) — the actual accessible content is a sibling visually-hidden
  <span>{`Commitment score: ${score} out of 100`}</span>, so screen readers get a clean
  sentence instead of trying to parse a rotated SVG and a counter-rotated number span
- CommitmentTimeline: each event is a <li> inside a <ol> (chronological order is semantically
  an ordered list, not a generic div soup) — <ol aria-label="Commitment history">
- Resolved-event halo (§5.4): purely decorative, no separate accessible announcement needed
  beyond the existing status badge's own aria-label (reused from Day 31)
- TrendIndicator: the arrow glyph is aria-hidden, the surrounding text already says
  "improving"/"stable"/"declining" in words, so no redundant visually-hidden label is needed
  here (contrast with the gauge, which DOES need one, since a gauge has no inherent text)
- Detail page error.tsx: renders a real heading ("Commitment not found") + explanatory text +
  a link back to the tracker — never a bare "404" or stack trace, even in dev mode for this
  specific tenant-isolation-sensitive route
```

---

## 9. Performance Notes

- `CommitmentScore.utils.ts`'s functions are pure and have zero allocations beyond simple arithmetic — calling them on every render (rather than memoizing) is intentionally fine; memoizing trivial math would be premature optimization adding complexity for no measurable gain.
- The gauge's animation is pure CSS (`transition` on `stroke-dashoffset`), meaning React never re-renders mid-animation — only the initial prop change triggers one render, then the browser's compositor handles 600ms of interpolation entirely off the React render loop, the cheapest possible way to animate this.
- `useCommitmentStats` and `useCommitment` (detail) are on the same 30s-ish cache tier as Day 33's counts query — no new caching tier invented today, reusing the existing `cache-config.ts` categories keeps the mental model of "how long does X stay fresh" consistent across the whole app.

---

## 10. End-of-Day Checklist

**Functional**
- [ ] CommitmentScore renders correctly at 0, 50, 100 — verified via Storybook/manual props, no SVG arc rotation glitches at any value
- [ ] Score gauge color confirmed identical hue at score=5 and score=95 (only sweep length differs)
- [ ] Timeline correctly distinguishes Created/Referenced/Resolved visually (dot fill/halo, text color, badge presence)
- [ ] Timeline meeting links navigate to the correct source meeting for each event type
- [ ] Detail page returns a real 404 (not a crash, not a data leak) for a commitment ID belonging to another team
- [ ] Stats strip numbers match the tracker's filtered totals (cross-checked against Day 33's owner/date/confidence filters, independent of status tab)
- [ ] Gauge component confirmed reusable: zero commitments-specific imports/logic inside `CommitmentScore.tsx` or `.utils.ts`

**Typography**
- [ ] font-display appears only on the detail header's commitment-text line — confirmed nowhere else on this page
- [ ] Gauge center number and all StatPill/timeline-timestamp values render in font-mono with tabular-nums
- [ ] Legend, trend text, timeline body all in font-sans

**Micro-interactions**
- [ ] Gauge shows NO sweep-in animation on initial page load (settled state from first paint)
- [ ] Gauge DOES animate smoothly when `animateFrom` is supplied (test manually by hardcoding a prop change)
- [ ] Center number swaps instantly while arc transitions over 600ms — confirmed visually decoupled
- [ ] Legend's three lines show the subtle 40ms-increment stagger once, never on refetch
- [ ] TrendIndicator hover tooltip shows underlying week-over-week comparison
- [ ] Resolved timeline dots show the halo treatment; created/referenced do not

**Accessibility**
- [ ] Screen reader announces gauge as a clean sentence via the visually-hidden span, not raw SVG/number soup
- [ ] Timeline read as an ordered list with a meaningful aria-label
- [ ] 404 error state has a real heading + back-link, verified with screen reader

**Architecture / Reuse Readiness**
- [ ] `getGaugeDimensions('lg')` preset confirmed present and correct even though unused until Day 38
- [ ] `scoreToStrokeDashoffset`/`scoreToArcColor` unit-tested in isolation, no JSX required to verify correctness
- [ ] `--score-arc` confirmed aliased to the existing `--ring` token — no second accent hue exists in globals.css

---

*Document: BUILD-PLAN-DAY-34-DEEP | Vocaply | Version 1.0*
*Track: Core Frontend Dashboard (Phase 3) | SVG Gauge Geometry + Audit-Trail Timeline Specification Edition*
