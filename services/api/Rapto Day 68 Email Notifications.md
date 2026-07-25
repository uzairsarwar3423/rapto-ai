# Vocaply — Day 68: Email Notifications — All 10 Templates, Real Delivery
## Full Scalable Industry-Level Build Plan
> Principal Backend Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-68-PLAN-001 | Version 1.0 | Phase 5 — Integrations (Days 56–70)

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [Analysis: How Top SaaS Products Design Transactional Email](#2-analysis-how-top-saas-products-design-transactional-email)
3. [Vocaply's Email Design System — Derived Standards](#3-vocaplys-email-design-system--derived-standards)
4. [File Structure to Create](#4-file-structure-to-create)
5. [The Complete 10-Template Roster](#5-the-complete-10-template-roster)
6. [Layer 1 — Shared Email Layout Primitives](#6-layer-1--shared-email-layout-primitives)
7. [Layer 2 — The Four Newly-Wired Templates](#7-layer-2--the-four-newly-wired-templates)
8. [Layer 3 — PaymentFailed & PlanLimit (New Templates)](#8-layer-3--paymentfailed--planlimit-new-templates)
9. [Layer 4 — notify.worker.ts Email Branch Completion](#9-layer-4--notifyworkerts-email-branch-completion)
10. [Layer 5 — email.service.ts Delivery Wrapper](#10-layer-5--emailservicets-delivery-wrapper)
11. [Layer 6 — Preference Checking & Recipient Resolution (Shared With Slack)](#11-layer-6--preference-checking--recipient-resolution-shared-with-slack)
12. [Rate Limiting Design](#12-rate-limiting-design)
13. [Unsubscribe Architecture](#13-unsubscribe-architecture)
14. [Cross-Channel Failure Isolation](#14-cross-channel-failure-isolation)
15. [Idempotency & Deduplication](#15-idempotency--deduplication)
16. [Security Architecture](#16-security-architecture)
17. [Deliverability Architecture](#17-deliverability-architecture)
18. [Performance Architecture](#18-performance-architecture)
19. [Error Handling & Retry Strategy](#19-error-handling--retry-strategy)
20. [Observability & Logging](#20-observability--logging)
21. [Accessibility & Rendering Considerations](#21-accessibility--rendering-considerations)
22. [Types & Interfaces](#22-types--interfaces)
23. [Testing Plan](#23-testing-plan)
24. [End-of-Day Checklist](#24-end-of-day-checklist)
25. [Risks & Edge Cases](#25-risks--edge-cases)

---

## 1. Day Overview & Goals

### What Gets Built Today

Day 68 closes out the platform's **last unimplemented notification
channel**. Four templates (`MeetingSummary`, `DeadlineReminder`,
`CommitmentMissed`, `ManagerAlert`) already exist as React Email
components but were only ever partially wired into `notify.worker.ts`'s
email branch — a scaffold left deliberately incomplete since Day 18/19
pending exactly this day's work. Two templates the original HLD
catalogued from the very beginning (`PaymentFailed`, `PlanLimit`) have
never been built at all, since billing didn't exist yet. Today builds
both new templates, finishes wiring the four partial ones, and — because
email is the channel every single Vocaply customer will see regardless of
whether they ever connect Slack — today also **establishes and applies a
proper visual design system** for every template, informed by a
deliberate study of how the best SaaS products in the industry design
their own transactional email, rather than treating each template as an
independent one-off design exercise.

```
TODAY BUILDS:
  ✅ A shared email design system: layout primitives, typography scale,
     spacing rhythm, color tokens, and a component library
     (EmailButton, EmailCard, EmailDivider, EmailFooter) — derived from a
     deliberate analysis of Linear, Stripe, Vercel, GitHub, and Notion's
     own transactional email design language
  ✅ PaymentFailed.tsx, PlanLimit.tsx — two new templates, built to this
     new design system from the start
  ✅ MeetingSummary.tsx, DeadlineReminder.tsx, CommitmentMissed.tsx,
     ManagerAlert.tsx — re-skinned onto the same shared design system
     (a deliberate refactor, not merely a wiring pass) and fully wired to
     real trigger data
  ✅ notify.worker.ts's email branch completed for all four in-flight types
  ✅ Confirmed, tested delivery-failure reporting from email.service.ts
     into the same job-outcome tracking used by every other channel
  ✅ Confirmed List-Unsubscribe header presence and correct per-type
     scoping across the entire 10-template roster
  ✅ Confirmed shared recipient-resolution/preference-check logic between
     the email and Slack (Day 67) channels — one implementation, not two

DOWNSTREAM IMPACT:
  Day 70 — WeeklyDigest.tsx, the tenth and final template, is built
           directly on top of today's shared design-system primitives —
           today's work is what makes that day's aggregate-report email
           visually consistent with everything else without needing its
           own bespoke layout decisions
  Phase 7 (Billing) — PaymentFailed.tsx and PlanLimit.tsx are fully
           built, styled, and dispatch-ready; Phase 7's actual work is
           reduced to wiring Stripe webhook/plan-limit-middleware TRIGGERS
           against an already-complete notification type

DO NOT SKIP OR RUSH:
  Email is the one notification channel every paying customer is
  guaranteed to have — unlike Slack (opt-in, Day 60) or in-app
  notifications (only seen while logged in), a poorly-designed,
  inconsistent, or unprofessional-looking email is a direct hit to how
  premium the entire product feels, regardless of how good the actual
  meeting-intelligence functionality is. Treating today as "just wire the
  remaining templates" without first fixing the underlying visual
  inconsistency across the four partially-built templates would be a
  missed opportunity this day specifically exists to correct.
```

### 8-Hour Time Allocation

```
9:00 AM – 9:45 AM    → Section 2's design analysis (documented, not merely
                        performed silently) + Section 3's derived standards
                        write-up
9:45 AM – 10:30 AM   → Shared email layout primitives: EmailLayout,
                        EmailButton, EmailCard, EmailDivider, EmailFooter,
                        typography/color/spacing tokens
10:30 AM – 11:15 AM  → Re-skin MeetingSummary.tsx + DeadlineReminder.tsx
                        onto the new shared primitives
11:15 AM – 12:00 PM  → Re-skin CommitmentMissed.tsx + ManagerAlert.tsx
                        onto the new shared primitives
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 1:45 PM    → Build PaymentFailed.tsx (new, on the shared system)
1:45 PM – 2:30 PM    → Build PlanLimit.tsx (new, on the shared system)
2:30 PM – 3:15 PM    → notify.worker.ts — complete the email branch for all
                        four in-flight types (preference check, prop
                        population, rate-limit check)
3:15 PM – 3:45 PM    → email.service.ts — confirm delivery-failure
                        reporting wired into job-outcome tracking
3:45 PM – 4:15 PM    → Unsubscribe header verification across all 10
                        templates + per-type scoping test
4:15 PM – 5:00 PM    → Unit tests: each template's prop-driven rendering,
                        snapshot tests for the new design system
5:00 PM – 5:45 PM    → Integration tests: full dispatch flow, rate-limit
                        enforcement, cross-channel isolation regression
5:45 PM – 6:00 PM    → Checklist review + sign-off
```

---

## 2. Analysis: How Top SaaS Products Design Transactional Email

Before building or re-skinning a single template, today's work begins
with a deliberate, documented study of how the industry's best-regarded
SaaS products design their own transactional/notification email — because
"clean, minimalist, big-SaaS" is a specific, learnable visual language,
not a vague aspiration, and copying its actual underlying decisions
produces a categorically better result than each engineer independently
guessing at what "professional" means.

### Linear

```
OBSERVED PATTERN:
  - Nearly all-white background, a single accent color used SPARINGLY
    (one button, one small icon — never a colored header banner)
  - Extremely restrained typography: one serif or clean sans headline,
    body copy in a neutral gray (never pure black — approximately
    #37352F/#3C4149-range dark grays), generous line-height
  - No decorative imagery, no stock photography, no gradients
  - A single, unambiguous call-to-action button per email — never two
    competing CTAs
  - Signature/footer is minimal: a small wordmark, one or two footer
    links, no social icons, no marketing content bolted onto a
    transactional message
WHY THIS WORKS:
  Linear's product identity IS restraint — their email doesn't try to be
  a marketing surface, it delivers information as fast and cleanly as
  possible, which reinforces the same "no wasted motion" brand promise
  their actual product makes.
```

### Stripe

```
OBSERVED PATTERN:
  - Consistent, narrow content column (typically ~480–600px), generous
    horizontal white space on wider viewports — never edge-to-edge content
  - A small, consistent header lockup: logo mark + a one-line contextual
    subject restated inside the email body itself (not just the subject
    line) so the email is self-explanatory even previewed out of context
  - Data-heavy emails (receipts, invoices) use genuinely tabular layouts
    with right-aligned numeric columns — never mimicking a paragraph
    trying to describe numbers in prose
  - Muted, desaturated color palette; color is used to communicate STATE
    (a green check for success, a muted red/amber for a failure) not for
    decoration
WHY THIS WORKS:
  Stripe's audience is developers and finance teams who need to scan and
  trust numbers quickly — their email design optimizes for scanability
  and unambiguous state communication over visual flourish.
```

### Vercel

```
OBSERVED PATTERN:
  - Near-monochrome (black/white/gray) with a single, deliberate accent
    used only for the primary action button
  - Sharp corners or very minimal border-radius (a deliberate contrast to
    the softer, heavily-rounded style common in less premium SaaS email)
  - Monospace or geometric sans typography reinforcing a
    "developer tool" identity even in a plain-text-adjacent HTML email
  - Extremely short body copy — often 2-3 sentences before the CTA,
    trusting the recipient's own product familiarity rather than
    over-explaining
WHY THIS WORKS:
  Vercel's emails read as an extension of a command-line/developer
  workflow — terse, confident, and fast to process, avoiding the
  over-friendly, over-explained tone common in less technical products.
```

### GitHub

```
OBSERVED PATTERN:
  - Heavier reliance on a clear VISUAL HIERARCHY via font-weight and size
    contrast rather than color — a bold, larger headline, a clearly
    smaller and lighter-weight body
  - Consistent iconography for notification TYPE (a distinct small icon
    per event category) reused identically across every email of that
    category, building quick pattern-recognition for frequent users
  - A persistent "why am I receiving this" footer line explaining the
    specific trigger (e.g., "You are receiving this because you were
    mentioned") — a transparency/trust pattern
WHY THIS WORKS:
  GitHub sends a very high VOLUME of transactional email to engaged
  users; their design optimizes for instant type-recognition at a glance
  and for reducing "why did I get this" support burden via explicit,
  consistent self-explanation.
```

### Notion

```
OBSERVED PATTERN:
  - Warmer, slightly more personality-forward than Linear/Vercel (a small
    amount of friendly illustration used sparingly, never as the dominant
    visual element)
  - Still fundamentally minimalist: single-column, generous whitespace,
    one clear CTA
  - Uses emoji sparingly and deliberately as a UI element (e.g., a single
    checkmark emoji next to a completed-task notification) rather than
    decoratively
WHY THIS WORKS:
  Notion's brand is "powerful tool, approachable feel" — their email
  design borrows the same minimalist bones as Linear/Vercel but allows a
  touch more warmth, appropriate for a broader, less exclusively
  developer-focused audience — a useful reference point specifically
  because Vocaply's own audience (managers and ICs across many
  functions, not purely engineers) is closer to Notion's than to
  Vercel's.
```

### Slack (as a Product Sending Email, Distinct From Vocaply's Own Slack Integration)

```
OBSERVED PATTERN:
  - Distinctive but restrained brand color used as a single accent
    (a header rule or button), never as a background wash
  - Very direct, conversational microcopy ("Here's what you missed") —
    warmer and more casual than Stripe/Vercel's terser tone
  - Digest-style emails (their equivalent of Vocaply's WeeklyDigest) use
    clear section dividers and small stat callouts (a number + a label)
    rather than dense paragraphs of prose
WHY THIS WORKS:
  Slack's email needs to summarize potentially large volumes of activity
  digestibly — their digest-specific patterns (stat callouts, clear
  section breaks) are the most directly reusable reference for Vocaply's
  own upcoming WeeklyDigest template (Day 70).
```

### Synthesized Cross-Product Conclusions

```
UNANIMOUS ACROSS EVERY PRODUCT STUDIED:
  1. Single-column layout, narrow content width (480–600px), generous
     margin — never edge-to-edge, never multi-column
  2. Exactly ONE primary call-to-action button per email
  3. Restrained color — one accent color used sparingly for state/action,
     never a colored background banner or gradient
  4. Neutral, dark-gray (not pure black) body text on a white/near-white
     background — maximizing readability without harsh contrast
  5. Minimal, unobtrusive footer — no social icons, no marketing content
     bolted onto transactional email, a clear unsubscribe/preferences link
  6. Short, confident body copy — trusting the recipient's product
     familiarity rather than over-explaining every notification
```

---

## 3. Vocaply's Email Design System — Derived Standards

Based directly on the synthesis in Section 2, today establishes the
following as Vocaply's own transactional-email design standard — applied
to every one of the ten templates, not merely the two built fresh today.

### Layout

- Single-column, 600px max content width, centered, with a minimum 24px
  horizontal gutter on narrower viewports (mobile email clients).
- White (`#FFFFFF`) background for the content card; a very light neutral
  gray (`#F6F6F7`) for the outer email-client background surrounding it —
  giving the content card subtle visual separation without a heavy
  border or shadow (email clients render `box-shadow` unreliably; a
  1px `#E5E5E5`-range border is used instead where separation is needed).

### Typography

- One typeface stack: a system-safe sans-serif (`-apple-system,
  BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`) —
  email clients' font-embedding support is inconsistent enough that a
  system stack, not a custom webfont, is the correct choice for
  reliability, mirroring the reasoning already applied to the platform's
  self-hosted-font strategy for its own web app (Day 2) not translating
  directly to email.
- Headline: 20–22px, semi-bold (600 weight), dark neutral
  (`#18181B`-range, not pure `#000000`).
- Body: 15–16px, regular (400) weight, `#52525B`-range gray, 1.6 line-height.
- Micro/footer text: 13px, `#71717A`-range lighter gray.

### Color

- **One** accent color, reused from the platform's existing brand token
  (`brand.500`, the primary green already defined in the web app's design
  tokens, Day 2/14) — used exclusively for the primary CTA button and,
  sparingly, for a small state-indicating icon or rule. Never used as a
  background wash or header banner.
- State colors (reused from the existing web-app semantic tokens, not
  invented fresh for email): a muted amber/red for
  `CommitmentMissed`/`PaymentFailed`-class "needs attention" messages, a
  muted green for `COMMITMENT_FULFILLED`-class positive messages — applied
  only to small icon/badge elements, never as a dominant background color,
  directly following Stripe's "color communicates state, not decoration"
  principle from Section 2.

### Components (Shared Primitives, Section 6)

- `EmailButton` — a single, consistently-styled primary CTA button
  component, used identically across every template (same padding,
  corner radius, weight) so that "the button" always looks and behaves
  the same regardless of which notification triggered it.
- `EmailCard` — the white content container with its subtle border.
- `EmailDivider` — a thin horizontal rule for section separation (used
  heavily in digest-style content, directly informed by Slack's digest
  pattern from Section 2).
- `EmailFooter` — one shared footer component across all ten templates:
  small Vocaply wordmark, a single "why am I receiving this" line
  (directly borrowed from GitHub's transparency pattern), and the
  unsubscribe/preferences link — never social icons, never additional
  marketing content.

### Tone & Copy Length

- Body copy defaults to 2–4 sentences before the CTA, trusting the
  recipient's product familiarity (the Vercel-influenced terseness
  principle) — but calibrated slightly warmer than Vercel/Linear's most
  clipped style, closer to Notion/Slack's approachability, since
  Vocaply's audience spans non-engineering roles (managers, team leads)
  who benefit from a touch more explanatory warmth than a pure developer
  tool's audience would need.
- Every notification-type-specific icon (a small checkmark for fulfilled,
  a clock for deadline reminders, a warning triangle for missed
  commitments) is used **consistently** across every email of that type —
  directly applying GitHub's "consistent iconography builds
  pattern-recognition" principle.

---

## 4. File Structure to Create

```
services/api/src/modules/notifications/templates/
│
├── shared/
│   ├── EmailLayout.tsx                    ← NEW — outer wrapper: background,
│   │                                          content-card, max-width
│   ├── EmailButton.tsx                    ← NEW — single shared CTA button
│   ├── EmailCard.tsx                      ← NEW — content-section container
│   ├── EmailDivider.tsx                   ← NEW — section-break rule
│   ├── EmailFooter.tsx                    ← NEW — wordmark + why-you-got-this
│   │                                          + unsubscribe link
│   ├── EmailStatCallout.tsx               ← NEW — number + label block,
│   │                                          used by digest-style content
│   │                                          (built today, reused Day 70)
│   └── email-tokens.ts                    ← NEW — typography/color/spacing
│                                              constants, Section 3's
│                                              standards made concrete
│
├── MeetingSummary.tsx                     ← MODIFY — re-skinned onto shared
│                                                primitives, fully wired
├── DeadlineReminder.tsx                    ← MODIFY — re-skinned, fully wired
├── CommitmentMissed.tsx                     ← MODIFY — re-skinned, fully wired
├── ManagerAlert.tsx                         ← MODIFY — re-skinned, fully wired
├── PaymentFailed.tsx                        ← NEW — built on shared system
├── PlanLimit.tsx                            ← NEW — built on shared system
├── TeamInvite.tsx                           ← REUSED (Day 16) — confirmed
│                                                still visually consistent;
│                                                re-skinned onto shared
│                                                primitives if not already
│                                                aligned
├── VerifyEmail.tsx                          ← REUSED (Day 6/7) — same
│                                                confirmation/re-skin pass
└── PasswordReset.tsx                        ← REUSED (Day 6/7) — same
                                                   confirmation/re-skin pass

services/api/src/
├── queues/workers/
│   └── notify.worker.ts                    ← MODIFY — email branch
│                                                completed for all four
│                                                in-flight types
└── modules/notifications/
    ├── email.service.ts                     ← MODIFY — delivery-failure
    │                                             reporting confirmed
    └── notifications.service.ts              ← MODIFY — shared
                                                    recipient-resolution
                                                    confirmed used by both
                                                    channels

services/api/tests/
├── unit/
│   ├── email-shared-primitives.test.tsx      ← NEW — snapshot tests for
│   │                                              EmailButton/Card/Divider/
│   │                                              Footer/StatCallout
│   └── email-templates.test.tsx               ← NEW — prop-driven rendering
│                                                    for all 10 templates
└── integration/
    ├── email-notifications.test.ts             ← NEW — full dispatch flow
    ├── email-rate-limit.test.ts                 ← NEW
    └── unsubscribe-header.test.ts                ← NEW — per-type header
                                                        scoping verification
```

### Why the Re-Skin of `TeamInvite`/`VerifyEmail`/`PasswordReset` Is In Scope Today

These three templates were built on Days 6/7/16, **before** today's design
system existed. Leaving them visually inconsistent with the newly-designed
majority of the roster would mean a customer's very first Vocaply email
(verification) looks meaningfully different from every subsequent one —
directly undermining the "consistent, professional, big-SaaS" goal this
day exists to achieve. This re-skin is a **visual-only** change (updating
which shared components each template's JSX uses) with zero change to
their existing trigger logic, dispatch paths, or props — confirmed via
snapshot-diff review focused only on rendered output, not logic.

---

## 5. The Complete 10-Template Roster

```
TEMPLATE                  STATUS BEFORE TODAY        STATUS AFTER TODAY
──────────────────────────────────────────────────────────────────────────
VerifyEmail.tsx            Built & wired (Day 6/7)    Re-skinned, logic unchanged
PasswordReset.tsx          Built & wired (Day 6/7)    Re-skinned, logic unchanged
TeamInvite.tsx              Built & wired (Day 16)      Re-skinned, logic unchanged
MeetingSummary.tsx          Built, partially wired      Re-skinned + fully wired
DeadlineReminder.tsx        Built, partially wired      Re-skinned + fully wired
CommitmentMissed.tsx        Built, partially wired      Re-skinned + fully wired
ManagerAlert.tsx            Built, partially wired      Re-skinned + fully wired
WeeklyDigest.tsx             NOT built                   Built Day 70 (on
                                                          today's design system)
PaymentFailed.tsx            NOT built                   Built + wired today
PlanLimit.tsx                 NOT built                   Built + wired today
```

---

## 6. Layer 1 — Shared Email Layout Primitives

### File: `shared/email-tokens.ts`

The single source of truth for every color, font-size, and spacing value
used across all ten templates — mirroring the exact "one config file, no
duplicated magic values" discipline already applied platform-wide (Day
16's `plans.config.ts`, Day 66's `team-settings.config.ts`). No template
ever hardcodes a hex color or font-size directly; every value is imported
from this file, ensuring a future brand-color update requires changing
exactly one file, not ten.

### File: `shared/EmailLayout.tsx`

The outermost wrapper every template renders inside — sets the outer
neutral-gray background, centers the 600px white content card, and
includes the standard `<head>`-level email-client compatibility
boilerplate (React Email's own `Html`/`Head`/`Preview`/`Body` primitives,
configured once here rather than repeated per template).

### File: `shared/EmailButton.tsx`

The single, reusable primary-CTA button component — accepts only `href`
and `children` (button label) as props, deliberately narrow to prevent
per-template styling drift (no template may pass a custom color or size
override; if a genuinely new button variant is ever needed, it is added
as a new, deliberate variant to this shared component, never inlined
ad-hoc in a single template).

### File: `shared/EmailCard.tsx`, `EmailDivider.tsx`, `EmailFooter.tsx`

Following the identical narrow-props, no-per-template-override discipline
as `EmailButton.tsx` — `EmailFooter.tsx` in particular accepts only a
`notificationType`-derived "why you received this" string and the
recipient's unsubscribe token, rendering the exact same wordmark/link
structure identically across every template, per Section 3's design
standard.

### File: `shared/EmailStatCallout.tsx`

A number-plus-label block (e.g., "12" / "Commitments Fulfilled") built
today specifically because `PlanLimit.tsx` needs to display a usage
number ("47 of 50 meetings used this month") in exactly this format, and
because Day 70's `WeeklyDigest.tsx` will need several of these side by
side — building this as a shared primitive today, on first genuine need,
rather than waiting until Day 70 to discover the need twice.

---

## 7. Layer 2 — The Four Newly-Wired Templates

### Re-Skin, Not Rewrite

For `MeetingSummary.tsx`, `DeadlineReminder.tsx`, `CommitmentMissed.tsx`,
and `ManagerAlert.tsx`: their existing prop interfaces (already
established across Days 18/19) are **not** changed today — only their
internal JSX is updated to compose the new shared primitives (Section 6)
instead of whatever ad-hoc styling each previously used. This is a
deliberate scope boundary: today is a visual-consistency and
dispatch-completion day, not a content/copy-rewrite day, and keeping the
prop contracts stable means `notify.worker.ts`'s completion work (Section
9) can proceed independently of the visual re-skin, in parallel if
staffed by more than one engineer.

### Full Wiring Completion (The Functional Half of Today's Work on These Four)

Beyond the visual re-skin, each of these four templates' corresponding
`notify.worker.ts` case is completed to:

1. Load the recipient's `notification_preferences` and skip sending
   entirely if the specific type/channel (`email.meetingSummary`,
   `email.deadlineReminder`, etc.) is disabled — reusing the exact shared
   preference-check logic confirmed Day 67 to live in
   `notifications.service.ts`, not a Slack-specific or email-specific
   duplicate.
2. Populate every template prop from the real, live triggering event's
   data — replacing any placeholder/mock values that may have been used
   during the templates' original Day 18/19 scaffolding.
3. Pass through the platform's shared daily email rate-limit check
   (Section 12) before dispatching.

---

## 8. Layer 3 — `PaymentFailed` & `PlanLimit` (New Templates)

### `PaymentFailed.tsx`

Built fresh today, on the new shared design system from the start.
Content: a clear, non-alarming statement that a payment attempt failed,
the specific reason if Stripe provides one in a customer-safe form (e.g.,
"card declined" vs. a raw processor error code — never surfacing raw
payment-processor internals to the customer), a single CTA button linking
to the billing settings page to update payment details, and — per
Section 3's state-color standard — a small muted-amber (not alarming red)
icon, since a single failed payment attempt is a "please take action
soon" state, not a "the sky is falling" state; Stripe's own documented
retry cadence (per the HLD's billing architecture) means this is rarely
the final word before an account-level consequence.

### `PlanLimit.tsx`

Built fresh today, using the new `EmailStatCallout.tsx` primitive
(Section 6) to display the specific usage figure ("47 of 50 meetings
used") prominently, followed by a clear, single upgrade CTA button. Tone
is deliberately framed as an opportunity ("You're getting great use out
of Vocaply — time to upgrade?") rather than a restrictive warning,
consistent with the product's broader accountability-partner tone
established across every other notification type, and avoiding the
punitive framing a plan-limit notification could easily fall into if
written carelessly.

### Both Templates Are Fully Built, Dispatch-Ready, Awaiting Only a Phase 7 Trigger

As established in the source planning material and reaffirmed here: the
actual Stripe webhook handler and plan-limit-enforcement middleware that
will **call** these two notification types belong to Phase 7. Today's
scope is strictly the template, its props, its wiring into
`notify.worker.ts`'s dispatch structure (an empty/stubbed trigger call
site can exist today, ready for Phase 7 to fill in, without Phase 7 ever
needing to touch the template or dispatch logic itself).

---

## 9. Layer 4 — `notify.worker.ts` Email Branch Completion

### Structural Consistency With Day 67's Slack Branch

Today's email-branch completion mirrors the exact structural pattern
Day 67 established for the Slack branch: each notification type's `case`
block independently loads relevant domain data (reusing existing
repository calls — no new queries required today, since every piece of
data these six templates need has already been fetched by existing
queries across Days 14/16/18/19/58-64), checks the specific recipient's
`email.*` preference, builds the render props, and dispatches via
`email.service.ts` — with each dispatch attempt wrapped in its own
independent try/catch, exactly matching Day 67's per-message isolation
discipline (Section 14 below).

### Manager Alert Fan-Out — Reused, Not Reinvented

`ManagerAlert.tsx`'s dispatch, like Day 67's Slack-side manager alert,
must reach every `MANAGER+` role holder independently. Today's work
confirms the **same** recipient-resolution function built/confirmed Day
67 (living in `notifications.service.ts`, channel-agnostic) is reused
here unchanged — email's manager fan-out and Slack's manager fan-out
share one resolution call, differing only in which channel's preference
key and which channel's send function each subsequently uses.

---

## 10. Layer 5 — `email.service.ts` Delivery Wrapper

### Confirming Existing Infrastructure, Not Building New

`email.service.ts`'s Resend SDK wrapper has existed as core infrastructure
since the early backend phase (auth emails, Day 6/7). Today's work is
**verification and completion**, not new construction: confirming the
wrapper's delivery-failure path correctly reports back into the same
`notify.worker.ts` job-outcome tracking every other channel uses (so a
failed email dispatch is logged and metriced identically to a failed
Slack dispatch, feeding the same dashboards), and confirming the wrapper
correctly attaches the platform's standard `List-Unsubscribe` header
(Section 13) to every outbound send, not merely the auth-related sends it
was originally built for.

### Why the Wrapper Itself Needs No New Logic

Resend's API is a simple, well-understood send-and-confirm HTTP call; the
wrapper's existing retry-on-transient-failure behavior (already
established for auth emails) generalizes correctly to every new template
sent today without modification — today's six additional call sites are
simply new *callers* of an already-correct, already-tested piece of
infrastructure.

---

## 11. Layer 6 — Preference Checking & Recipient Resolution (Shared With Slack)

### The Single Shared Implementation

As established Day 67 and reaffirmed today: recipient resolution (who
should receive a given notification — a single owner, or a fanned-out
list of managers) and preference-checking (does this specific recipient
want this specific type on this specific channel) both live in
`notifications.service.ts`, in a channel-agnostic shape, called
identically by both the Slack branch (Day 67) and the email branch
(today). Today's work includes an explicit verification pass — a
code-review checklist item, not merely a testing one — confirming no
email-specific duplicate of this logic was introduced during today's
`notify.worker.ts` work, since duplicating it would be precisely the kind
of drift-prone shortcut this platform's engineering standards (Day 64's
centralization principle, reaffirmed throughout this sprint) exist to
prevent.

---

## 12. Rate Limiting Design

### The Existing Rule, Applied Today for the First Time in Full

The platform's documented email rate-limiting policy (max 3 emails per
user per day, with meeting summaries and digests explicitly exempted from
the cap, per the HLD's already-specified email architecture) is, as of
today, actually **enforced** across every applicable template for the
first time — the four newly-completed types (`DeadlineReminder`,
`CommitmentMissed`, `ManagerAlert`, plus the two new billing-adjacent
types) are all subject to the cap; `MeetingSummary` is exempted (a team
that processes several meetings in one day should not have summary
emails suppressed by an unrelated cap meant to prevent alert fatigue, not
to throttle core product value delivery).

### Implementation Shape

A Redis-backed counter, `ratelimit:email:{userId}:{date}`, incremented on
every non-exempt send and checked before dispatch — reusing the exact
Redis-counter rate-limiting pattern already established platform-wide
(Day 14's login rate limiter, Day 17's IP rate limiter), not a new
rate-limiting mechanism invented specifically for email.

### Why the Cap Applies Per-User, Not Per-Notification-Type

A user hitting the cap across a mix of notification types (say, two
deadline reminders and one missed-commitment alert in one day) has still
received three emails today — the cap protects against total inbox
volume/fatigue, not against any single notification type's own frequency,
which is why it is implemented as one shared counter per user per day,
not one counter per (user, type) pair.

---

## 13. Unsubscribe Architecture

### One-Click, Per-Type Scoped Unsubscribe

Every template dispatched today (and every one already dispatching since
earlier days) includes the platform's standard `List-Unsubscribe` header
(and its accompanying `List-Unsubscribe-Post` header, required by major
mailbox providers — Gmail, Yahoo — for true one-click unsubscribe
support, per current email-deliverability best practice) pointing at the
existing `/unsubscribe?token=...` endpoint. Critically, per Section 3's
component design, `EmailFooter.tsx`'s unsubscribe link is scoped to the
**specific notification type** that email represents — clicking
"unsubscribe" on a `DeadlineReminder` email disables only
`email.deadlineReminder` in that user's preferences, never all email
categories at once, matching the platform's existing, already-documented
unsubscribe design principle.

### Today's Verification Work

A dedicated test file (`unsubscribe-header.test.ts`, Section 23) asserts,
for **every one** of the ten templates, that the correct, type-scoped
unsubscribe token is present and that following it results in only that
specific preference being disabled — closing the gap where this
guarantee previously held only for the templates it was originally built
against (the auth-related ones), not verified across the newly-completed
majority of the roster.

---

## 14. Cross-Channel Failure Isolation

### Reaffirming Day 67's Principle, From the Email Side

Exactly as Day 67 verified from the Slack side, today confirms the
inverse direction: a failed email dispatch (Resend API error, invalid
recipient address, transient network failure) never blocks, delays, or
reverts a parallel Slack dispatch for the same event, and never fails the
overall `notify` job. Each email dispatch attempt is independently
try/caught at the point of the `email.service.ts` call, mirroring the
identical granular-isolation discipline Day 67 applied to each Slack send.

### `cross-channel-isolation.test.ts` — Completed From Both Directions

The test file introduced Day 67 (asserting Slack failures don't block
email) is extended today with its mirror-image assertions (email failures
don't block Slack), completing the bidirectional verification of this
principle across every notification type in the roster, not merely
verified in one direction.

---

## 15. Idempotency & Deduplication

### Reused, Not Reinvented

Every notification type dispatched via email today uses the identical
`notif:dedup:{TYPE}:{userId}:{resourceId}` Redis key convention already
established Day 18 and exercised for Slack Day 67 — an email dispatch and
a Slack dispatch for the same underlying event independently check and
set their own instance of this key (the key composition doesn't include
a channel discriminator, since a duplicate-send concern is inherently
per-channel: sending the email twice is the failure mode being guarded
against, not sending both an email and a Slack message once each, which
is the correct, intended multi-channel behavior).

### Manager Fan-Out Dedup — Per-Recipient, Per-Channel

Following Day 67's exact granularity: each manager's email dedup key is
scoped individually
(`notif:dedup:COMMITMENT_MISSED:{managerId}:{commitmentId}` — the same
key namespace Slack's fan-out uses, since both channels are protecting
against the same "don't re-send to this person for this event" concern,
just via their own channel-specific send call reading/writing that shared
key).

---

## 16. Security Architecture

### No New Credential Handling

`email.service.ts`'s Resend API key is existing, already-secured
infrastructure (environment-variable-sourced, never logged, per the
platform's established secrets-handling discipline since Day 17) — today
introduces zero new credential surface.

### PII Handling in Template Content

Every template built or re-skinned today includes only the minimum
recipient-relevant data needed for the notification to be useful —
commitment text, meeting titles, usage figures — never another team
member's private data beyond what the specific notification type
legitimately requires (a `ManagerAlert` reasonably includes the missed
commitment's owner's name and the commitment text; it does not include
that owner's unrelated commitments or any other team member's data).

### Unsubscribe Token Security

The `/unsubscribe?token=...` endpoint's token generation and validation
(pre-existing infrastructure, referenced but not rebuilt today) is
confirmed to use a signed, non-guessable token scoped to a specific
`(userId, notificationType)` pair — preventing a maliciously-modified
unsubscribe link from disabling a different user's preferences or a
different notification type than the one the link was actually issued
for.

---

## 17. Deliverability Architecture

### SPF, DKIM, DMARC — Confirmed, Not Rebuilt

The platform's sending domain authentication (already configured per the
HLD's email architecture) is confirmed today to correctly cover the new
sending pattern introduced by six newly-active templates — no
configuration change is expected to be necessary, since Resend's
domain-verification setup is per-domain, not per-template, but today's
work includes sending a real test batch across all ten templates to a
set of major mailbox providers (Gmail, Outlook.com, a common corporate
Microsoft 365 tenant) to confirm inbox placement (not spam-folder
placement) before considering the day complete.

### Suppression List Handling

Existing bounce/complaint suppression-list handling (Resend's own
infrastructure, already integrated per the platform's email architecture)
is confirmed to correctly prevent a send attempt to a previously-bounced
or previously-complained-about address across all ten templates, not
merely the auth-related ones it may have originally been verified against.

---

## 18. Performance Architecture

### No New Load on the `notify` Queue

Exactly as Day 67 established for Slack: every email dispatch triggered
today is triggered by an event that already enqueues a `notify` job —
today's work extends what happens **inside** existing job processing,
introducing no new job-enqueueing trigger point and no change to the
`notify` queue's existing concurrency setting.

### Template Rendering Cost

React Email's server-side rendering (converting JSX templates to HTML at
send time) is a CPU-bound but fast operation for the simple, single-
column layouts this design system specifies (Section 3) — no template
built or re-skinned today introduces expensive rendering patterns (no
inline-computed complex layouts, no large embedded images requiring
server-side processing), keeping per-email render cost low and consistent
across the whole roster.

---

## 19. Error Handling & Retry Strategy

### Per-Message Failure Classification

```
CONDITION                                    HANDLING
──────────────────────────────────────────────────────────────────────────
Recipient has disabled this type/channel     Skipped, logged as info
  in their preferences                        (expected, not a failure)
Daily rate-limit cap reached for this user   Skipped for non-exempt types,
                                              logged as info; MeetingSummary
                                              still sends (exempted)
Resend API returns a transient error (5xx,   Single bounded retry (reusing
  network timeout)                            the existing wrapper's
                                              established retry behavior);
                                              if still failing, logged and
                                              skipped — never blocks the
                                              rest of the notify job
Recipient address previously bounced/        Send attempt skipped entirely
  complained (Resend suppression list)        by Resend's own
                                              infrastructure; logged as a
                                              distinct outcome category
                                              (not a generic failure) for
                                              observability clarity
```

### Why No Aggressive Job-Level Retry, Reaffirmed

Consistent with Day 67's reasoning for Slack: notification delivery is
best-effort and time-sensitive; the per-message try/catch plus the
existing dedup-key mechanism together ensure a transient failure produces
neither a duplicate-send risk nor a silently-lost notification, without
needing the `notify` queue's own job-level retry configuration to become
more aggressive.

---

## 20. Observability & Logging

### Structured Log Fields

Every dispatch attempt today logs, at minimum: the notification type, the
team/user ID, the specific recipient, and the outcome (sent, skipped —
preference/rate-limit/suppression-list, or failed) — mirroring Day 67's
exact structured-logging shape, extended to the email channel.

### New Metrics

`notify.email.{type}.sent` / `.skipped_preference` / `.skipped_ratelimit`
/ `.skipped_suppressed` / `.failed`, for each of the six newly-completed
types — feeding the same Grafana dashboard already tracking
`notify.slack.*` counters from Day 67, giving a genuinely complete,
side-by-side, cross-channel view of the platform's entire notification
health for the first time.

---

## 21. Accessibility & Rendering Considerations

### Email-Client Rendering Realities

Unlike the web app (which can rely on modern CSS), email HTML rendering
varies significantly across clients (Outlook's use of Word's rendering
engine being the most notorious constraint). Today's shared primitives
(Section 6) are built using React Email's own table-based/inline-style
layout conventions specifically because they are the framework's
documented, tested approach for maximizing cross-client rendering
consistency — no modern CSS layout technique (flexbox, grid) is used
anywhere in these templates, consistent with how the four previously
partially-built templates were presumably already constrained, and
explicitly carried forward as a non-negotiable rule for the two brand-new
templates built today.

### Accessible Markup Within Email's Constraints

Every `EmailButton.tsx` instance renders as a real anchor tag (never a
`<div>` with a click handler, which has no equivalent in email HTML
anyway, but stated as a design principle worth being explicit about),
every image (where used at all — today's design system deliberately
minimizes image use per Section 2/3's "no decorative imagery" standard)
includes descriptive `alt` text, and color is never the **sole** means of
conveying state (a state icon is always paired with a text label, e.g.,
"⚠ Action needed" rather than a bare colored dot).

---

## 22. Types & Interfaces

### File: `shared/email-tokens.ts`

- **`EmailColorTokens`**, **`EmailTypographyTokens`**, **`EmailSpacingTokens`** — plain constant objects, imported by every shared primitive and every template, the single source of truth per Section 6.

### File: `shared/EmailFooter.tsx` (props)

- **`EmailFooterProps`** — `{ notificationType: NotificationType; unsubscribeToken: string }`, deliberately narrow, deriving the "why you received this" copy internally from a lookup table keyed by `notificationType` rather than accepting free-text from each calling template (ensuring consistent phrasing across the roster, not per-template copywriting drift).

### File: `templates/PaymentFailed.tsx`, `PlanLimit.tsx` (props)

- **`PaymentFailedEmailProps`** — `{ teamName: string; amountDue: string; retryUrl: string }`.
- **`PlanLimitEmailProps`** — `{ teamName: string; resource: string; used: number; limit: number; upgradeUrl: string }`.

Both deliberately minimal, containing only customer-safe, already-sanitized
display data — never raw Stripe object fields passed through directly,
reinforcing Section 16's PII/security discipline at the type level.

---

## 23. Testing Plan

### Unit Tests

#### `email-shared-primitives.test.tsx`

- Snapshot tests for `EmailButton`, `EmailCard`, `EmailDivider`,
  `EmailFooter`, `EmailStatCallout` confirming stable, expected HTML
  output for representative props.
- `EmailFooter` correctly derives the right "why you received this"
  string for each `NotificationType` value, including the two new billing
  types.

#### `email-templates.test.tsx`

- Every one of the ten templates renders correctly for a representative
  prop fixture, with no missing/undefined value producing broken markup.
- `PaymentFailed`/`PlanLimit` render correctly with only their minimal,
  sanitized prop shape (Section 22) — confirming no raw billing-object
  data leaks through even in a test fixture that might otherwise pass one
  in by mistake.

### Integration Tests

#### `email-notifications.test.ts`

- Full dispatch flow for each of the six newly-completed/new types,
  using a mocked Resend API, confirming correct recipient targeting,
  correct preference-check behavior, and correct manager fan-out for
  `ManagerAlert`.

#### `email-rate-limit.test.ts`

- A user who has already received 3 non-exempt emails today is correctly
  skipped for a 4th `DeadlineReminder` attempt.
- A `MeetingSummary` dispatch for the same user, on the same day, still
  succeeds despite the cap (the exemption verified explicitly, not merely
  assumed).

#### `unsubscribe-header.test.ts`

- Every one of the ten templates includes both `List-Unsubscribe` and
  `List-Unsubscribe-Post` headers.
- Following the unsubscribe link for one template type disables only that
  specific `notification_preferences` key, verified for at least three
  representative types across the roster.

#### `cross-channel-isolation.test.ts` (extended from Day 67)

- A forced Resend API failure for any of the six completed/new types does
  not prevent a parallel Slack dispatch for the same event from
  succeeding, and the overall `notify` job still completes successfully.

### Manual Verification (Required Before Sign-Off)

A real test-send of all ten templates to a small set of real inboxes
across Gmail, Outlook.com, and a corporate Microsoft 365 account,
confirming: correct rendering (no broken layout in any client), inbox
placement (not spam), and visual consistency across the entire roster —
the human-eye confirmation that today's design-system work actually
achieves the "clean, minimalist, big-SaaS" goal it set out to, which no
automated snapshot test alone can fully verify.

---

## 24. End-of-Day Checklist

### Design System

- [ ] `email-tokens.ts` is the single source of truth for every color/
      font/spacing value; zero hardcoded values remain in any template
- [ ] All ten templates use the shared `EmailLayout`/`EmailButton`/
      `EmailCard`/`EmailDivider`/`EmailFooter` primitives — no per-template
      bespoke styling remains
- [ ] Exactly one primary CTA button per template, no competing actions
- [ ] Color used only for state/action, never as a decorative background

### New Templates

- [ ] `PaymentFailed.tsx` uses non-alarming, muted-amber state framing,
      never a punitive/alarming tone
- [ ] `PlanLimit.tsx` uses `EmailStatCallout` for usage figures, framed as
      an upgrade opportunity, not a restriction

### Wiring Completion

- [ ] All four previously-partial templates fully wired: preference
      check, real prop population, rate-limit check
- [ ] `ManagerAlert`'s email fan-out reuses the exact Day 67
      recipient-resolution function, no duplicated logic

### Rate Limiting & Unsubscribe

- [ ] Daily 3-email cap enforced for all non-exempt types;
      `MeetingSummary` confirmed exempt
- [ ] `List-Unsubscribe` + `List-Unsubscribe-Post` headers present and
      correctly type-scoped across all ten templates

### Cross-Channel Isolation

- [ ] A forced email failure never blocks a parallel Slack dispatch, and
      vice versa (bidirectional verification complete as of today)

### Security & Deliverability

- [ ] No raw billing-object data ever passed into `PaymentFailed`/
      `PlanLimit` props — only sanitized, customer-safe display values
- [ ] SPF/DKIM/DMARC confirmed correctly covering all ten templates'
      sending pattern
- [ ] Suppression-list handling confirmed across the full roster

### Observability

- [ ] Per-type, per-outcome metrics visible on the Grafana dashboard,
      completing the cross-channel (email + Slack) notification health view

### Sign-Off

- [ ] All unit and integration tests pass in CI
- [ ] Manual test-send performed across Gmail/Outlook.com/Microsoft 365,
      confirming correct rendering, inbox placement, and visual
      consistency across all ten templates

---

## 25. Risks & Edge Cases

```
RISK                                              MITIGATION BUILT TODAY
──────────────────────────────────────────────────────────────────────────
Re-skinning existing templates accidentally
  changes their trigger logic or prop contract       Explicit scope
                                                    boundary: visual-only
                                                    change, prop interfaces
                                                    unchanged, verified via
                                                    snapshot-diff focused
                                                    only on rendered output

New design system looks inconsistent across
  email clients despite passing snapshot tests       Real manual test-send
                                                    across Gmail/Outlook.com/
                                                    Microsoft 365 required
                                                    before sign-off — no
                                                    automated test alone is
                                                    trusted for this

PaymentFailed/PlanLimit accidentally receive raw,
  unsanitized Stripe object data once Phase 7
  wires their real trigger                           Minimal, explicitly
                                                    sanitized prop types
                                                    defined today (Section 22),
                                                    documented as the
                                                    permanent contract Phase 7
                                                    must populate, not expand

Daily rate-limit cap accidentally applied to
  MeetingSummary, suppressing core product value      Explicit exemption
                                                    test (email-rate-
                                                    limit.test.ts) asserting
                                                    MeetingSummary still
                                                    sends despite a maxed cap

Unsubscribe link for one notification type
  accidentally disables a broader set of
  preferences than intended                          Per-type token scoping
                                                    verified across all ten
                                                    templates today, not
                                                    merely the original
                                                    auth-related ones

Manager email fan-out silently diverges from
  Slack's manager fan-out logic over time              Single shared
                                                    recipient-resolution
                                                    function in
                                                    notifications.service.ts,
                                                    explicitly verified via
                                                    code review to have no
                                                    email-specific duplicate
```

---

*Document: DAY-68-PLAN-001 | Vocaply | Day 68: Email Notifications — All 10 Templates, Real Delivery*
*Full Scalable Industry-Level Build Plan | Principal Engineer Edition*
*Top-SaaS-informed email design system · Shared layout primitives · Full 10-template completion*
*Security-first · Deliverability-focused · Production-grade · Planning Document — No Code*
