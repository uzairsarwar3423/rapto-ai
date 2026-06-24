# Vocaply — Landing Page Days 6–10 Detailed Build Plan
> Continuation of 10-Day Sprint · Days 6 Through 10
> Stack: Next.js 14 · TypeScript · Tailwind CSS · Framer Motion
> Solo Developer | 8 Hours/Day | Production-Grade
> Landing page lives inside `apps/web/src/app/(marketing)/`

---

## Important: Where We Are

Day 5 complete hone ke baad yeh sections built hain:
- Announcement Bar, Navigation, Hero Section
- Social Proof Bar, Product Showcase (3-tab mock)
- Problem Statement, How It Works
- Features Grid, AI Capabilities

Days 6–10 mein remaining 11 sections build honge, phir animations, performance, SEO, analytics, aur final deployment.

---

## Days 6–10 Overview

```
Day 6  → Integrations Section + Workflow Timeline
Day 7  → Benefits by Role + Use Cases + Testimonials + Customer Logos
Day 8  → Case Study + Security Section + Pricing Preview
Day 9  → FAQ + Final CTA + Footer + Mobile Polish Pass
Day 10 → Animations + Performance + SEO + Analytics + Vercel Deploy
```

---

## File Structure — Day 6 se Day 10 tak jo naya add hoga

```
apps/web/
└── src/
    ├── app/
    │   └── (marketing)/
    │       └── page.tsx                              ← DAILY UPDATE: naye sections add hote raheinge
    │
    ├── components/
    │   └── marketing/
    │       ├── sections/
    │       │   ├── IntegrationsSection.tsx           ← Day 6
    │       │   ├── WorkflowTimeline.tsx              ← Day 6
    │       │   ├── BenefitsByRole.tsx                ← Day 7
    │       │   ├── UseCases.tsx                      ← Day 7
    │       │   ├── Testimonials.tsx                  ← Day 7
    │       │   ├── CustomerLogos.tsx                 ← Day 7
    │       │   ├── CaseStudy.tsx                     ← Day 8
    │       │   ├── SecuritySection.tsx               ← Day 8
    │       │   ├── PricingPreview.tsx                ← Day 8
    │       │   ├── FAQSection.tsx                    ← Day 9
    │       │   └── FinalCTA.tsx                      ← Day 9
    │       │
    │       ├── layout/
    │       │   ├── MarketingFooter.tsx               ← Day 9 (full build)
    │       │   └── MobileCTABar.tsx                  ← Day 9 (new component)
    │       │
    │       └── ui/
    │           ├── IntegrationBadge.tsx              ← Day 6
    │           ├── TimelineNode.tsx                  ← Day 6
    │           ├── RoleCard.tsx                      ← Day 7
    │           ├── UseCaseTile.tsx                   ← Day 7
    │           ├── TestimonialCard.tsx               ← Day 7
    │           ├── AnimatedNumber.tsx                ← Day 7 (build) / Day 8 (use)
    │           ├── PricingCard.tsx                   ← Day 8
    │           ├── SecurityCard.tsx                  ← Day 8
    │           └── AccordionItem.tsx                 ← Day 9
    │
    ├── hooks/
    │   └── marketing/
    │       ├── usePricingToggle.ts                   ← Day 8
    │       ├── useAccordion.ts                       ← Day 9
    │       ├── useMobileCTABar.ts                    ← Day 9
    │       └── useCountUp.ts                         ← Day 7
    │
    ├── lib/
    │   ├── marketing/
    │   │   └── content/
    │   │       ├── integrations.content.ts           ← Day 6
    │   │       ├── workflow.content.ts               ← Day 6
    │   │       ├── benefits.content.ts               ← Day 7
    │   │       ├── usecases.content.ts               ← Day 7
    │   │       ├── testimonials.content.ts           ← Day 7
    │   │       ├── pricing.content.ts                ← Day 8
    │   │       ├── security.content.ts               ← Day 8
    │   │       └── faq.content.ts                    ← Day 9
    │   └── analytics.ts                              ← Day 10
    │
    └── types/
        └── marketing.types.ts                        ← UPDATES throughout (new types added)
```

---

## Day 6 — Integrations Section + Workflow Timeline

### Theme: Context aur Proof
> "Kya yeh meri stack ke saath kaam karta hai?" aur "Mujhe ek real
> scenario dikhao" — yeh do sawal aaj complete hote hain. Integrations
> section objections remove karta hai. Workflow timeline visitors ko
> mentally rehearse karwata hai Vocaply use karte hue — yeh conversion
> ke liye ek powerful psychological technique hai.

---

### Work Hours Breakdown (8 Hours)

```
9:00 AM – 10:30 AM  → IntegrationBadge UI component + IntegrationsSection
10:30 AM – 12:00 PM → Integrations content + hover states + layout
12:00 PM – 1:00 PM  → Lunch break
1:00 PM – 2:30 PM   → TimelineNode UI component design
2:30 PM – 4:30 PM   → WorkflowTimeline section (full build)
4:30 PM – 5:30 PM   → Timeline vertical line draw animation (Framer Motion)
5:30 PM – 6:00 PM   → Wire into page.tsx + responsive test
```

---

### What Functionality to Build Today

**1. IntegrationBadge UI Component:**
Har ek integration ke liye ek reusable pill/badge component. Iske andar ek SVG icon aur integration ka naam hoga. "Coming soon" badges alag style mein honge — dashed border, muted color, no hover effect.

Behavior:
- Active badge: white bg, solid border, hover pe border → green, translateY(-2px)
- Coming soon badge: light gray bg, dashed border, muted text, no hover interaction
- Click karne pe: yeh badges non-functional hain (sirf display, actual OAuth Day 10 ke baad)

**2. IntegrationsSection:**
Integration badges ka ek flowing grid. Section label, headline, subheadline, phir badges grid.

Layout logic:
- Badges: `display: flex`, `flex-wrap: wrap`, `gap: 12px`
- Mobile pe bhi same wrap behavior
- "Coming soon" badges visual separation ke liye slightly visually muted

**3. TimelineNode UI Component:**
Reusable node jo WorkflowTimeline mein use hoga. Har node ka structure:
- Timestamp (left side)
- Connecting dot on the vertical line (center)
- Title + description + optional mini UI callout (right side)

**4. WorkflowTimeline Section:**
Yeh section visitors ko ek complete story dikhata hai — Monday standup se Friday accountability tak. 5 timeline nodes vertical line pe connect hote hain.

Animation:
- Vertical line "draws" itself from top to bottom (scaleY: 0 → 1) jab section viewport mein aata hai
- Har node sequentially fade in aur slide in karta hai — alternating sides se (left nodes left se, right nodes right se)
- Timeline line: absolute positioned, 2px wide, brand color (#E4E3DF base, animated portion #1A6B3C)

Mini UI Callouts (har node ke saath):
- Node 1: Small "● Recording" red pulsing pill
- Node 2: Mini CommitmentRow component (PENDING badge wala)
- Node 3: Slack-style DM bubble (mock)
- Node 4: MISSED status badge
- Node 5: Mini meeting summary snippet

---

### UI Design Details

**IntegrationsSection Design:**

```
Section background: #F2F1EE (gray-1) — subtle break from white
Padding: clamp(60px, 8vw, 100px) var(--pad)
Max-width: 1120px, centered

Section label: "Integrations"
Headline: "Plays well with |everything you use.|"
  SectionHeading component, accent on "everything you use."
  Italic green on the phrase

Subheadline:
  "No ripping out your stack. Vocaply connects to the tools your
   team already lives in."
  17px, DM Sans 300, #6B6A67, max-width 480px
  Margin-bottom: 48px

Badges flex container:
  Display: flex, flex-wrap: wrap, gap: 12px
  Margin-bottom: 40px

ACTIVE IntegrationBadge:
  Background: white
  Border: 1px solid #E4E3DF
  Border-radius: 8px
  Padding: 10px 18px
  Display: flex, align-items: center, gap: 8px
  Cursor: default (badges are display-only)
  Font: DM Sans 14px, 500, #0A0A0A

  Icon: 18px SVG, loaded from /public/icons/
  
  Hover:
    Border-color → #1A6B3C
    translateY(-2px)
    Box-shadow: 0 4px 12px rgba(26,107,60,0.08)
    Transition: all 150ms ease

COMING SOON IntegrationBadge:
  Background: transparent
  Border: 1px dashed #E4E3DF
  Color: #9B9A96
  Font: same but lighter
  After name: " — soon" small text, 11px, italic
  No hover effect (cursor: default, pointer-events: none)

Active badges order:
  💬 Slack
  📋 Jira
  △  Linear
  📝 Notion
  📅 Google Calendar
  📅 Outlook Calendar
  📹 Zoom
  🎥 Google Meet
  💼 Microsoft Teams

Coming soon badges:
  🔗 Asana (coming soon)
  ⭕ GitHub (coming soon)

Caption below badges:
  "Each integration is one-click, OAuth-secured, and takes under 2 minutes to set up."
  DM Sans 13px, italic, #9B9A96
  Margin-top: 32px
```

**WorkflowTimeline Design:**

```
Section background: white
Padding: clamp(60px, 8vw, 100px) var(--pad)
Max-width: 1120px, centered

Section label: "See it in action"
Headline: "From standup to accountability — |in under 5 minutes.|"
  SectionHeading, accent on "in under 5 minutes."
  Margin-bottom: 16px

No subheadline — headline is self-explanatory

Timeline container:
  Position: relative
  Max-width: 720px
  Margin: 56px auto 0
  Padding: 0 (timeline nodes handle their own spacing)

Vertical line:
  Position: absolute
  Left: 50% (center, but desktop only)
  Width: 2px
  Background: #E4E3DF
  Top: 24px (starts at first node)
  Bottom: 24px (ends at last node)
  Transform-origin: top
  
  Animated portion (Framer Motion):
    scaleY: 0 → 1 on section entry
    Duration: 1.2s, ease: linear
    This creates the "drawing" effect

Each TimelineNode:
  Position: relative
  Display: grid
  Grid on desktop: 2 columns (timestamp side / content side)
  Alternating: odd nodes → timestamp left + content right
               even nodes → content left + timestamp right
  Margin-bottom: 48px

  Center dot:
    Position: absolute, left: 50%, transform: translateX(-50%)
    Width: 16px, height: 16px
    Background: white
    Border: 2px solid #1A6B3C
    Border-radius: 50%
    Z-index: 2 (above the line)
    Top: 4px

  Timestamp column:
    Font: DM Sans 12px, 600, uppercase, letter-spacing 0.06em
    Color: #9B9A96
    Padding-top: 2px

  Content column:
    Title: DM Sans 15px, 600, #0A0A0A, margin-bottom: 6px
    Description: DM Sans 14px, #6B6A67, line-height 1.6
    Mini callout: rendered below description, margin-top: 12px

Node content:

  NODE 1 — Monday 9:00 AM:
    Title: "Bot joins your standup"
    Desc: "Ali says 'I'll finish login by Thursday.' Vocaply bot is in the meeting, silent."
    Callout: Red pulsing pill — "● Recording"
      bg: #FDECEA, color: #C84B31, 11px, 500
      ● dot: 6px, bg #C84B31, pulsing (same animation as announcement bar dot)

  NODE 2 — Monday 9:35 AM:
    Title: "Commitment extracted automatically"
    Desc: "Meeting ends. 3 new commitments appear in dashboard. Slack message sent."
    Callout: Mini CommitmentRow (reuse CommitmentRow component, scaled down)
      Show PENDING version: "Ali Raza — Login feature — Thu, May 15"
      Scale: 85% of normal size, padding tighter

  NODE 3 — Wednesday 9:00 AM:
    Title: "Reminder sent to Ali"
    Desc: "Slack DM: 'Your login feature deadline is tomorrow. Any update?'"
    Callout: Slack-style message bubble
      bg: white, border: 1px solid #E4E3DF, border-radius: 8px
      Top: small "Vocaply" label (11px, green, bold)
      Message text: "Your login feature is due tomorrow. Any update?"
      Bottom: 9:00 AM · Slack (muted timestamp)

  NODE 4 — Thursday 6:00 PM:
    Title: "Deadline passed. No update."
    Desc: "Commitment auto-marked MISSED. Manager alerted via Slack instantly."
    Callout: MISSED StatusBadge (reuse StatusBadge component)
      Large version: padding 5px 14px, 13px font

  NODE 5 — Next Monday 9:00 AM:
    Title: "Carried into the next standup"
    Desc: "New meeting summary includes: '2 commitments from last week are still open.'"
    Callout: Mini summary snippet
      bg: #F2F1EE, border-radius: 6px, padding: 10px 12px
      Text: "⚠ 2 open from last week: Ali → Login feature (3 days overdue)"
      13px, #6B6A67

Node Animation (Framer Motion):
  Odd nodes (1, 3, 5): initial x: -30px, opacity: 0 → animate x: 0, opacity: 1
  Even nodes (2, 4):   initial x: +30px, opacity: 0 → animate x: 0, opacity: 1
  Each node has 200ms delay after previous
  Triggered by useScrollReveal on the timeline container

Mobile layout (< 768px):
  Vertical line: left: 20px (not center)
  All nodes: content to the right of line, timestamps above title
  No alternating sides — all content right-aligned to line
  Dot: positioned on left line
```

---

### Content Files

**integrations.content.ts:**
```
IntegrationItem type: { name, iconPath, iconAlt, comingSoon?: boolean }
activeIntegrations: 9 items (Slack, Jira, Linear, Notion, Google Cal, Outlook, Zoom, Meet, Teams)
comingSoonIntegrations: 2 items (Asana, GitHub)
```

**workflow.content.ts:**
```
WorkflowStep type: { timestamp, title, description, calloutType }
steps: 5 items with above data
```

### Files to Create Today

```
CREATE:
  src/components/marketing/sections/IntegrationsSection.tsx
  src/components/marketing/sections/WorkflowTimeline.tsx
  src/components/marketing/ui/IntegrationBadge.tsx
  src/components/marketing/ui/TimelineNode.tsx
  src/lib/marketing/content/integrations.content.ts
  src/lib/marketing/content/workflow.content.ts

UPDATE:
  src/app/(marketing)/page.tsx
    → <IntegrationsSection id="integrations" /> after AICapabilities
    → <WorkflowTimeline /> after IntegrationsSection
  src/types/marketing.types.ts
    → Add IntegrationItem, WorkflowStep types
```

### Day 6 End-of-Day Checklist

```
Integrations:
  [ ] All 9 active badges render with icons + names
  [ ] 2 coming soon badges in dashed/muted style
  [ ] Active badge hover: green border + lift (150ms)
  [ ] Coming soon badges have no hover effect
  [ ] Flex wrap works at all widths (no overflow)
  [ ] Caption text below badges renders correctly
  [ ] SVG icons load from /public/icons/

Workflow Timeline:
  [ ] Vertical line renders (2px, gray)
  [ ] Line draw animation fires on scroll entry (scaleY 0→1)
  [ ] All 5 nodes render with correct timestamp, title, desc
  [ ] Center dots visible on the line
  [ ] Odd nodes animate from left, even from right
  [ ] Nodes stagger (200ms between each)
  [ ] Mini callouts render inside each node
  [ ] Recording pill has pulsing dot
  [ ] Mini CommitmentRow inside Node 2 readable
  [ ] Slack bubble inside Node 3 styled correctly
  [ ] Mobile: line on left side, all content right

Page Flow:
  [ ] Order: ... → AI Capabilities → Integrations → Workflow Timeline
  [ ] Visual break between sections (bg colors alternate correctly)
```

---

## Day 7 — Benefits by Role + Use Cases + Testimonials + Customer Logos

### Theme: Social Proof aur Persona Resonance
> Visitor ne product samjha. Ab unhe confirm karna hai ki yeh unke
> jaison ke liye hai, aur real logon ne isse kaam karte hue dekha hai.
> Yeh section trust-building ka core hai — numbers, faces, names.
> Yahan se conversion rate pe sabse zyada direct impact hota hai.

---

### Work Hours Breakdown (8 Hours)

```
9:00 AM – 10:00 AM  → AnimatedNumber + useCountUp hook
10:00 AM – 11:30 AM → BenefitsByRole section + RoleCard component
11:30 AM – 12:00 PM → UseCases section + UseCaseTile component
12:00 PM – 1:00 PM  → Lunch break
1:00 PM – 2:30 PM   → TestimonialCard component + Testimonials section
2:30 PM – 3:30 PM   → CustomerLogos section
3:30 PM – 4:30 PM   → All content files
4:30 PM – 5:30 PM   → Wire into page.tsx + responsive testing
5:30 PM – 6:00 PM   → Checklist
```

---

### What Functionality to Build Today

**1. useCountUp Hook:**
Jab koi stat (70%, 2.5h, 88%) viewport mein aati hai, woh 0 se animate ho ke apni value tak aati hai.

Logic:
- Props: `{ from, to, duration (default 1500ms), suffix? }`
- `requestAnimationFrame` loop use karta hai
- Easing: easeOut cubic (fast start, slow end)
- `useScrollReveal` se trigger hota hai — jab visible ho tab count start karo
- Returns: current display value as string

**2. AnimatedNumber Component:**
`useCountUp` hook wrap karta hai ek display component mein. Large serif font mein number render karta hai. CaseStudy section (Day 8) mein use hoga lekin aaj build karna hai taaki ready rahe.

**3. RoleCard UI Component:**
Teen personas ke liye ek role-specific card. Props: roleLabel, icon, headline, bullets array, ctaText.

**4. BenefitsByRole Section:**
Teen RoleCard components side by side. Har card ek specific persona ke liye tailored messaging deta hai.

**5. UseCaseTile UI Component:**
Chhota tile jo ek specific use case show karta hai — title, short caption, aur small integration tags.

**6. UseCases Section:**
2×2 grid of UseCaseTile components.

**7. TestimonialCard UI Component:**
Quote text (Instrument Serif italic), bold ke phrase, attribution (name, role, company), avatar circle (initials).

**8. Testimonials Section:**
3 TestimonialCard components, horizontal row on desktop, single column mobile. Optional: horizontal swipeable carousel on mobile using simple CSS scroll snap.

**9. CustomerLogos Section:**
Full-width gray band with company names/logos in greyscale.

---

### UI Design Details

**BenefitsByRole Design:**

```
Section background: white
Padding: clamp(60px, 8vw, 100px) var(--pad)
Max-width: 1120px, centered

Section label: "Who it's for"
Headline: "Built for the people who run the meetings."
  Instrument Serif, h2 size
  No accent phrase (clean, direct headline)
  Margin-bottom: 56px

Three RoleCard grid:
  Display: grid, grid-template-columns: repeat(3, 1fr)
  Gap: 24px
  Desktop: 3 columns
  Tablet (768px–1024px): still 3 columns but tighter
  Mobile (< 768px): single column stack

RoleCard design:
  Background: white
  Border: 1px solid #E4E3DF
  Border-radius: 10px
  Padding: 32px
  Display: flex, flex-direction: column
  Height: 100% (stretch to match tallest)

  Hover:
    translateY(-4px)
    Box-shadow: var(--shadow-md)
    Border-color: #E4E3DF (stays same, no green on role cards)
    Transition: all 200ms ease

  Role label:
    Font: DM Sans 11px, 600, uppercase, letter-spacing 0.08em
    Color: #9B9A96 (gray-3)
    Margin-bottom: 16px
    Display: flex, align-items: center, gap: 8px

  Icon:
    24px emoji, displayed inline before role label text

  Headline:
    Font: DM Sans 18px, 600, #0A0A0A
    Line-height: 1.3
    Margin-bottom: 16px
    Letter-spacing: -0.3px

  Bullets (3 per card):
    List-style: none, padding: 0
    Each item:
      Display: flex, gap: 10px, align-items: flex-start
      Margin-bottom: 10px
      "✓" prefix: color #1A6B3C, font-weight: 600, flex-shrink: 0
      Text: DM Sans 14px, #6B6A67, line-height 1.5

  CTA (bottom):
    Margin-top: auto (pushes to bottom of card)
    Padding-top: 24px
    Border-top: 1px solid #E4E3DF
    Font: DM Sans 14px, 500, #1A6B3C
    Display: flex, align-items: center, gap: 4px
    "→" suffix
    Hover: gap → 8px (arrow moves right, 150ms)
    This is a text link, not a button

Three cards content:

  CARD 1 — 👨‍💻 Engineering Managers:
    Headline: "Stop spending Sunday nights writing follow-up emails."
    Bullets:
      ✓ Data for 1:1s: "Ali's commitment rate: 65% this sprint"
      ✓ Visibility before fires start, not after
      ✓ 2+ hours/week back from manual follow-up
    CTA: "Start free for your team →"

  CARD 2 — 🗂️ Product Managers:
    Headline: "Never lose a cross-team commitment again."
    Bullets:
      ✓ Single source of truth for every cross-team agreement
      ✓ Proof for every stakeholder conversation — with timestamps
      ✓ Automated post-meeting summaries to all stakeholders
    CTA: "See how PMs use it →"

  CARD 3 — 🚀 Founders:
    Headline: "Run a company without hiring a PM yet."
    Bullets:
      ✓ Track what you promised investors and clients automatically
      ✓ Team accountability without micromanaging
      ✓ Scales to 25 people without changing anything
    CTA: "Start free for your team →"

Scroll reveal:
  Container: staggerChildren 150ms
  Each card: fadeUpVariant
```

**UseCases Design:**

```
Section background: #F2F1EE (gray-1) — visual break
Padding: clamp(60px, 8vw, 100px) var(--pad)
Max-width: 1120px, centered

Section label: "Use cases"
Headline: "Every meeting type. |One system.|"
  SectionHeading, accent on "One system."
  Margin-bottom: 56px

Grid:
  Display: grid, grid-template-columns: repeat(2, 1fr)
  Gap: 24px
  Mobile: single column

UseCaseTile design:
  Background: white
  Border-radius: 10px
  Padding: 32px
  Border: 1px solid #E4E3DF (invisible against white, subtle)
  
  Hover:
    Box-shadow: var(--shadow-sm)
    Border-color: #E4E3DF (same, slight shadow instead of border change)

  Icon: large emoji, 32px, margin-bottom: 16px, display: block
  Title: DM Sans 16px, 600, #0A0A0A, margin-bottom: 8px
  Caption: DM Sans 14px, #6B6A67, line-height 1.55, margin-bottom: 20px

  Integration tag strip:
    Display: flex, flex-wrap: wrap, gap: 6px
    Each tag: DM Sans 11px, 500, #9B9A96
              bg: #F2F1EE, border-radius: 4px, padding: 3px 8px
              No border (just background differentiates from white card)

Four tiles content:

  TILE 1 — 🎯 Engineering Standups:
    Caption: "Monday standup to Friday delivery — tracked automatically."
    Tags: Zoom · Jira · Slack

  TILE 2 — 🔄 Sprint Reviews:
    Caption: "Sprint commitments that don't disappear between sessions."
    Tags: Google Meet · Linear · Notion

  TILE 3 — 🤝 Client Calls:
    Caption: "Proof of what was agreed. Protection from 'I never said that.'"
    Tags: MS Teams · Notion · Email

  TILE 4 — 📢 All-Hands Meetings:
    Caption: "Company commitments from leadership — visible to every team."
    Tags: Zoom · Slack · Google Calendar

Scroll reveal: stagger 0ms/100ms/200ms/300ms
```

**Testimonials Design:**

```
Section background: white
Padding: clamp(60px, 8vw, 100px) var(--pad)
Max-width: 1120px, centered

Section label: "What teams say"
Headline: "They stopped chasing. |We started tracking.|"
  SectionHeading, accent on "We started tracking."
  Margin-bottom: 56px

Cards layout:
  Desktop: display grid, grid-template-columns: repeat(3, 1fr), gap: 24px
  Mobile: single column (no carousel — simpler, more reliable)

TestimonialCard design:
  Background: white
  Border: 1px solid #E4E3DF
  Border-radius: 10px
  Padding: 28px

  Hover:
    Box-shadow: 0 0 0 1px #1A6B3C (green border replacement)
    Transition: box-shadow 200ms

  Quote text:
    Font: Instrument Serif, 15px, color: #0A0A0A
    Line-height: 1.7
    Font-style: italic
    Margin-bottom: 20px

    Bold phrase (wrapped in <strong>):
      Font-style: italic (inherited)
      Font-weight: 600

  Author section:
    Display: flex, align-items: center, gap: 12px
    Margin-top: 20px
    Border-top: 1px solid #F2F1EE
    Padding-top: 20px

  Avatar circle:
    Width: 36px, height: 36px
    Background: #E4E3DF
    Border-radius: 50%
    Display: flex, align-items: center, justify-content: center
    Font: DM Sans 13px, 600, #6B6A67
    Content: initials (AR, SK, AH)

  Name: DM Sans 13px, 600, #0A0A0A
  Role + Company: DM Sans 12px, #9B9A96

Three testimonials:

  1. Ali Raza — Engineering Manager · TechFlow
     Quote: "I used to spend Sunday night writing follow-up emails from our
     Friday standup. Vocaply made that **completely unnecessary.** Everything
     is tracked, everything is sent — automatically."

  2. Sara Khan — Head of Product · Buildify
     Quote: "Our team commitment rate went from 60% to 88% in 6 weeks.
     Not because we hired better people — because **everyone finally knew
     their promises were being tracked.**"

  3. Ahmed Hassan — CTO · RemoteStack
     Quote: "The Jira integration alone is worth the price. **Our standups
     now automatically generate tickets** with the right assignee and due
     date. We removed an entire manual step from our workflow."

Scroll reveal: stagger 0ms/150ms/300ms
```

**CustomerLogos Design:**

```
Full-width section
Background: #F2F1EE (gray-1)
Padding: 32px var(--pad) (shorter than regular sections)
Border-top: 1px solid #E4E3DF
Border-bottom: 1px solid #E4E3DF

Label:
  "Trusted by teams at"
  Font: DM Sans 11px, 600, uppercase, letter-spacing 0.08em
  Color: #9B9A96
  Text-align: center
  Margin-bottom: 24px
  Display: block

Logo strip:
  Display: flex, justify-content: center
  Align-items: center
  Gap: 48px
  Flex-wrap: wrap
  
  Each logo (text-based wordmark if no real SVG):
    Font: DM Sans 14px, 700, #9B9A96 (greyscale)
    Opacity: 0.6
    Letter-spacing: -0.3px
    Hover: opacity 1.0, transition 200ms
    
  Six companies: TechFlow · Buildify · RemoteStack · CodeHive · LaunchPad · GridBase
  
  Note in content file: "Real logos replace these when partnerships confirmed.
  For now, wordmarks are used as placeholders."

Mobile:
  Gap reduced to 24px
  May wrap to 2 rows — acceptable
```

---

### Content Files

**benefits.content.ts:**
```
RoleCard type: { icon, roleLabel, headline, bullets: string[], ctaText, ctaHref }
roleCards: array of 3 items (Engineering Manager, Product Manager, Founder)
```

**usecases.content.ts:**
```
UseCaseTile type: { icon, title, caption, integrationTags: string[] }
useCaseTiles: array of 4 items
```

**testimonials.content.ts:**
```
Testimonial type: { quote, boldPhrase, authorName, authorRole, authorCompany, initials }
testimonials: array of 3 items
```

### Files to Create Today

```
CREATE:
  src/components/marketing/sections/BenefitsByRole.tsx
  src/components/marketing/sections/UseCases.tsx
  src/components/marketing/sections/Testimonials.tsx
  src/components/marketing/sections/CustomerLogos.tsx
  src/components/marketing/ui/RoleCard.tsx
  src/components/marketing/ui/UseCaseTile.tsx
  src/components/marketing/ui/TestimonialCard.tsx
  src/components/marketing/ui/AnimatedNumber.tsx
  src/hooks/marketing/useCountUp.ts
  src/lib/marketing/content/benefits.content.ts
  src/lib/marketing/content/usecases.content.ts
  src/lib/marketing/content/testimonials.content.ts

UPDATE:
  src/app/(marketing)/page.tsx
    → Add BenefitsByRole after WorkflowTimeline
    → Add UseCases after BenefitsByRole
    → Add Testimonials after UseCases
    → Add CustomerLogos after Testimonials
  src/types/marketing.types.ts
    → Add Testimonial, UseCaseTile, RoleCard types
```

### Day 7 End-of-Day Checklist

```
AnimatedNumber + useCountUp:
  [ ] Number counts up from 0 to target value on scroll entry
  [ ] Easing feels natural (fast start, slows at end)
  [ ] Suffix (%, h, x) appends correctly
  [ ] Only animates once per page load

BenefitsByRole:
  [ ] 3 role cards in equal-width columns (desktop)
  [ ] Role labels in small uppercase gray
  [ ] Headline bold + correct size
  [ ] 3 bullet points with green ✓ prefix each
  [ ] CTA text links at bottom of each card
  [ ] Arrow on CTA moves right on hover (gap animation)
  [ ] Cards all same height (CSS stretch)
  [ ] Hover: lift 4px + shadow
  [ ] Mobile: single column

UseCases:
  [ ] 2×2 grid on desktop
  [ ] Large emoji icon above title
  [ ] Integration tags strip below caption
  [ ] Cards in light gray section bg
  [ ] Single column mobile

Testimonials:
  [ ] 3 cards horizontal (desktop)
  [ ] Quotes in Instrument Serif italic
  [ ] Bold phrases have correct weight within italic
  [ ] Avatar initials in circle
  [ ] Author name + role + company below
  [ ] Hover: green outline replaces border (box-shadow technique)
  [ ] Stagger reveal 150ms

CustomerLogos:
  [ ] 6 company names in gray, centered
  [ ] Opacity 0.6 default, 1.0 on hover
  [ ] Compact section height (not full section padding)

Page at Day 7:
  [ ] 15 sections now built and rendering in correct order
  [ ] No missing sections in the chain
  [ ] Background colors alternate naturally (white / gray-1 / white)
```

---

## Day 8 — Case Study + Security Section + Pricing Preview

### Theme: Final Objections Remove Karo
> Aaj ke sections conversion funnel ke bottom mein hain — yahan
> visitors hain jo seriously consider kar rahe hain lekin ruk rahe hain.
> Har ek section ek specific barrier remove karta hai: "Prove it",
> "Is my data safe?", "What does it cost?" Yeh teen sawal aaj
> answer hote hain — clearly, specifically, confidently.

---

### Work Hours Breakdown (8 Hours)

```
9:00 AM – 10:30 AM  → CaseStudy section (dark, with AnimatedNumber)
10:30 AM – 12:00 PM → SecurityCard component + SecuritySection
12:00 PM – 1:00 PM  → Lunch break
1:00 PM – 2:00 PM   → usePricingToggle hook
2:00 PM – 4:00 PM   → PricingCard component + PricingPreview section
4:00 PM – 5:00 PM   → Annual/monthly toggle animation
5:00 PM – 5:30 PM   → Wire into page.tsx
5:30 PM – 6:00 PM   → Responsive testing + checklist
```

---

### What Functionality to Build Today

**1. CaseStudy Section:**
Dark background section (second dark section after AICapabilities). Left side: story text + pull quote + CTA link. Right side: 3 large animated metrics (AnimatedNumber component use hoga yahan).

**2. SecurityCard UI Component:**
Individual security claim card with icon, title, description. Light gray cards on white background.

**3. SecuritySection:**
4 SecurityCards in 2×2 grid. Compliance badges row below the grid.

**4. usePricingToggle Hook:**
Monthly/annual toggle state manage karta hai. Monthly → Annual switch karne pe prices change hoti hain with animation.

Logic:
- State: `isAnnual: boolean`, default `false`
- `toggle()` function
- Returns current prices based on state: `{ starter, growth, business }`
- Used by PricingPreview section and individual PricingCards

**5. PricingCard UI Component:**
Individual plan card. Props: planName, monthlyPrice, annualPrice, memberLimit, meetingLimit, features, isPopular, isAnnual (from toggle state).

Most Popular card: double border + floating badge.

**6. PricingPreview Section:**
Monthly/annual toggle above cards. 4 PricingCard components. Enterprise CTA below. Feature comparison teaser.

---

### UI Design Details

**CaseStudy Design:**

```
Section background: #0A0A0A (full dark — second dark section on page)
Padding: clamp(60px, 8vw, 100px) var(--pad)
Width: 100% viewport, inner max-width: 1120px centered

Layout: grid 2 columns, gap: 64px (desktop)
  Left: 55% — story
  Right: 45% — metrics

LEFT COLUMN:

  Small label:
    "Case study" — DM Sans 11px, 600, uppercase, rgba(255,255,255,0.4)
    Margin-bottom: 16px

  Headline:
    "How TechFlow reduced missed deadlines |by 70%| in one sprint"
    Instrument Serif, clamp(28px, 3.5vw, 42px), white
    Accent "by 70%" in #6ECC8E (light green)
    Margin-bottom: 24px

  Body paragraph:
    "TechFlow's engineering team was running daily standups with no
    follow-up system. Sprint after sprint, commitments made on Monday
    were forgotten by Wednesday. After integrating Vocaply, every
    standup automatically produced a tracked commitment list — synced
    to Jira, posted to Slack, and monitored by AI."
    DM Sans 15px, rgba(255,255,255,0.6), 300 weight, line-height 1.7
    Margin-bottom: 28px

  Pull quote:
    Border-left: 3px solid #1A6B3C
    Padding-left: 20px
    Margin-bottom: 28px
    
    Quote text:
      "Before Vocaply, I was the human reminder system for my team.
      Now the system does it — and I get my Sundays back."
      Instrument Serif, 16px, italic, rgba(255,255,255,0.85)
      Margin-bottom: 8px
    
    Attribution:
      "— Ali Raza, Engineering Manager at TechFlow"
      DM Sans 13px, rgba(255,255,255,0.4)

  CTA link:
    "Read the full case study →"
    Color: #6ECC8E (light green), 14px, 500
    Hover: underline appears
    href: /case-studies/techflow (placeholder)

RIGHT COLUMN:

  Three metric blocks stacked vertically, gap: 32px

  Each metric block:
    No border, no card — just the number + label
    
    Number:
      AnimatedNumber component
      Font: Instrument Serif, 64px, color: #6ECC8E (light green)
      Line-height: 1.0
      Letter-spacing: -2px
    
    Label:
      DM Sans 14px, rgba(255,255,255,0.5), margin-top: 6px

  Three metrics:
    70%   — "reduction in missed commitments"
    2.5h  — "saved per manager per week"  (suffix: "h")
    88%   — "team commitment rate (up from 60%)"  (suffix: "%")

  AnimatedNumber triggers: when right column enters viewport
  Count from 0 to target over 1500ms, easeOut

Mobile:
  Stack: metrics ABOVE story (metrics first = hook)
  Metrics: horizontal row (3 blocks side by side, smaller font 40px)
  Story: below metrics
```

**SecuritySection Design:**

```
Section background: white
Padding: clamp(60px, 8vw, 100px) var(--pad)
Max-width: 1120px, centered

Section label: "Security & privacy"
Headline: "Your meetings are private. |We keep them that way.|"
  SectionHeading, accent on "We keep them that way."
  Margin-bottom: 56px

Cards grid:
  Display: grid, grid-template-columns: repeat(2, 1fr), gap: 24px
  Desktop: 2×2
  Mobile: 1 column

SecurityCard design:
  Background: #F2F1EE (gray-1) — not white (differentiates from page bg)
  Border-radius: 10px
  Padding: 28px
  No border needed (bg difference provides separation)

  Icon:
    Width: 40px, height: 40px
    Background: #E8F5EE (accent-light)
    Border-radius: 10px
    Font: 20px emoji centered
    Margin-bottom: 16px

  Title: DM Sans 15px, 600, #0A0A0A, margin-bottom: 6px
  Description: DM Sans 14px, #6B6A67, line-height 1.6

  Special note for SOC 2 card:
    Small italic note: "(Certification in progress — expected Q3 2026)"
    Color: #9B9A96, 12px, italic

Four cards content:

  🔒 End-to-end encryption
      "All meeting data encrypted in transit (TLS 1.3) and at rest
      (AES-256). Your transcripts are yours alone."

  🛡️ No AI training on your data
      "Vocaply never uses your meeting transcripts to train AI models.
      Your conversations stay private and are processed only for extraction."

  📋 GDPR compliant
      "Data deletion on request. Data export available at any time.
      EU data residency options available on Business plan."

  ⭐ SOC 2 Type II (in progress)
      "Security audit underway. Expected certification Q3 2026.
      (Certification in progress — expected Q3 2026)"

Compliance badges row (below grid):
  Display: flex, gap: 8px, justify-content: flex-start
  Margin-top: 32px

  Each badge:
    Font: DM Sans 11px, 600
    Padding: 6px 12px
    Border-radius: 4px
    Font-family: monospace (technical credibility)
    
    GDPR:     bg #E8F5EE, color #1A6B3C
    TLS 1.3:  bg #E8F5EE, color #1A6B3C
    AES-256:  bg #E8F5EE, color #1A6B3C
    SOC 2 ↗:  bg #F2F1EE, color #9B9A96 (muted — not certified yet)
```

**PricingPreview Design:**

```
Section background: #F2F1EE (gray-1)
Padding: clamp(60px, 8vw, 100px) var(--pad)
Max-width: 1120px, centered

Section label: "Pricing"
Headline: "Simple pricing. |One flat price per team.|"
  SectionHeading, accent on "One flat price per team."
  Margin-bottom: 8px

Subheadline:
  "No per-seat anxiety. Add your whole team freely."
  DM Sans 17px, 300, #6B6A67
  Margin-bottom: 40px

Monthly/Annual Toggle:
  Container: inline-flex, centered, margin-bottom: 40px
  Background: #E4E3DF (pill container)
  Border-radius: 100px
  Padding: 4px

  Two buttons: "Monthly" | "Annual — Save 20%"
  
  Active button:
    Background: white
    Color: #0A0A0A, DM Sans 13px, 500
    Box-shadow: 0 1px 4px rgba(0,0,0,0.08)
    Border-radius: 100px
    Padding: 6px 20px

  Inactive button:
    Background: transparent
    Color: #6B6A67
    Padding: 6px 20px

  "Save 20%" text inside Annual button:
    Color: #1A6B3C, font-weight: 600, font-size: 11px
    Displayed inline after "Annual"

Plans grid:
  Display: grid, grid-template-columns: repeat(4, 1fr), gap: 16px
  Desktop: 4 columns
  Tablet: 2×2 grid
  Mobile: 1 column, horizontal scroll (overflow-x: auto) OR stacked

PricingCard design:

  BASE style (all cards):
    Background: white
    Border: 1px solid #E4E3DF
    Border-radius: 12px
    Padding: 28px 24px
    Display: flex, flex-direction: column

  POPULAR style (Growth card):
    Border: 2px solid #0A0A0A
    Box-shadow: 0 0 0 1px #0A0A0A (double border effect)
    Position: relative (for badge)

    "Most Popular" floating badge:
      Position: absolute, top: -12px, left: 50%, transform: translateX(-50%)
      Background: #0A0A0A
      Color: white
      Font: DM Sans 11px, 600, uppercase, letter-spacing 0.06em
      Padding: 4px 12px
      Border-radius: 100px
      White-space: nowrap

  Plan name:
    DM Sans 12px, 600, uppercase, letter-spacing 0.08em, #9B9A96
    Margin-bottom: 8px

  Price display:
    Number: Instrument Serif, 48px, #0A0A0A, letter-spacing -2px, line-height 1.0
    Period: DM Sans 13px, #9B9A96, margin-left: 4px
    
    Annual price animation:
      When toggle switches to Annual:
        Old price: opacity → 0, scale → 0.9 (150ms)
        New price: opacity → 1, scale → 1 (150ms, after short delay)
      This is a simple CSS transition + React state swap

  Annual billing note:
    "billed as $XXX/year" — DM Sans 11px, #1A6B3C
    Only visible when Annual toggle is active
    Fades in when annual selected

  Member/meeting limits:
    "Up to XX members · XX meetings/month"
    DM Sans 12px, #1A6B3C, 500
    Padding-bottom: 20px
    Border-bottom: 1px solid #E4E3DF
    Margin-bottom: 20px

  Feature list (4–5 per card):
    List-style: none, padding: 0
    Each item:
      DM Sans 13px, #6B6A67, line-height 1.6
      "✓" prefix: color #1A6B3C, 500 weight
      Gap: 8px between items

  CTA button (bottom):
    Margin-top: auto (flush to bottom)
    Full-width
    
    FREE + STARTER + BUSINESS: outlined (border #0A0A0A, text #0A0A0A)
    GROWTH (popular): filled (#0A0A0A bg, white text)
    
    Hover for all:
      Background → #1A6B3C, border-color → #1A6B3C, text → white

Four plan prices:

  FREE:     $0 forever    | Monthly $0 Annual $0
  STARTER:  $49/month     | Monthly $49 Annual $39
  GROWTH:   $99/month     | Monthly $99 Annual $79   ← Most Popular
  BUSINESS: $199/month    | Monthly $199 Annual $159

Below grid:

  Note text:
    "All paid plans include a 14-day free trial · No credit card required · Cancel anytime"
    DM Sans 13px, #9B9A96, text-align: center, margin-top: 24px

  Enterprise CTA:
    "Need more than 60 members? → Enterprise pricing"
    DM Sans 14px, #1A6B3C (green link)
    Text-align: center, margin-top: 16px
    href: /enterprise (placeholder)

Mobile pricing:
  Overflow-x: auto on grid container
  Cards: min-width: 260px so they don't squish too much
  Snap scrolling: scroll-snap-type: x mandatory
  Each card: scroll-snap-align: start
  OR: simply stack single column on mobile (simpler option)
```

---

### Content Files

**pricing.content.ts:**
```
PricingPlan type: { name, monthlyPrice, annualPrice, memberLimit, 
                    meetingLimit, features, isPopular, ctaText }
plans: array of 4 items
```

**security.content.ts:**
```
SecurityClaim type: { icon, title, description, hasNote?: string }
claims: array of 4 items
complianceBadges: array of 4 badge strings
```

### Files to Create Today

```
CREATE:
  src/components/marketing/sections/CaseStudy.tsx
  src/components/marketing/sections/SecuritySection.tsx
  src/components/marketing/sections/PricingPreview.tsx
  src/components/marketing/ui/SecurityCard.tsx
  src/components/marketing/ui/PricingCard.tsx
  src/hooks/marketing/usePricingToggle.ts
  src/lib/marketing/content/pricing.content.ts
  src/lib/marketing/content/security.content.ts

UPDATE:
  src/app/(marketing)/page.tsx
    → Add CaseStudy after CustomerLogos
    → Add SecuritySection after CaseStudy
    → Add PricingPreview after SecuritySection (id="pricing")
  src/types/marketing.types.ts
    → Add PricingPlan, SecurityClaim types
```

### Day 8 End-of-Day Checklist

```
CaseStudy:
  [ ] Full dark background, entire section width
  [ ] 2-column: story left, metrics right
  [ ] AnimatedNumber animates on scroll for all 3 numbers
  [ ] 70% counts up correctly (from 0 to 70 then % suffix)
  [ ] 2.5h counts up (from 0.0 to 2.5 with "h" suffix)
  [ ] 88% counts up correctly
  [ ] Pull quote has green left border
  [ ] "Read the full case study" link in light green
  [ ] Mobile: metrics above story in row format

Security:
  [ ] 4 cards in 2×2 grid, gray backgrounds
  [ ] Icons have green-tinted icon boxes
  [ ] SOC 2 card has italic "(in progress)" note
  [ ] 4 compliance badges below grid
  [ ] GDPR/TLS 1.3/AES-256 badges in green
  [ ] SOC 2 badge muted (not certified yet)

Pricing:
  [ ] Toggle switches between Monthly/Annual
  [ ] All 4 prices update on toggle switch
  [ ] Price change has fade animation
  [ ] Annual billing note appears when Annual selected
  [ ] FREE plan: $0 forever, no trial needed
  [ ] Growth card: double black border + floating "Most Popular" badge
  [ ] FREE/STARTER/BUSINESS: outlined CTA
  [ ] GROWTH: filled dark CTA
  [ ] All hover states: green fill
  [ ] Enterprise CTA link below grid
  [ ] Legal note below grid (no credit card, cancel anytime)
  [ ] Mobile: cards scroll horizontally OR stack cleanly
```

---

## Day 9 — FAQ + Final CTA + Footer + Mobile Polish Pass

### Theme: Close, aur Polish Karo
> Aaj ke pehle 4 ghante: page ke closing sections (FAQ, Final CTA, Footer).
> Baad ke 4 ghante: pura page kholna at 375px, 390px, 430px, 768px aur
> har ek section ko theek karna jo mobile pe broken lag raha ho.
> Mobile polish kiye bina page ship nahi hoga — aaj yeh complete hona chahiye.

---

### Work Hours Breakdown (8 Hours)

```
9:00 AM – 10:00 AM  → AccordionItem component + useAccordion hook
10:00 AM – 11:30 AM → FAQSection (8 questions, accordion behavior)
11:30 AM – 12:00 PM → FinalCTA section (dark closing block)
12:00 PM – 1:00 PM  → Lunch break
1:00 PM – 2:30 PM   → MarketingFooter (full sitemap footer)
2:30 PM – 3:00 PM   → MobileCTABar (sticky bottom bar, mobile only)
3:00 PM – 5:30 PM   → Full mobile responsive polish pass (all sections)
5:30 PM – 6:00 PM   → Checklist + final verification
```

---

### What Functionality to Build Today

**1. useAccordion Hook:**
FAQ accordion state manage karta hai. Only one item open at a time.

Logic:
- State: `openIndex: number | null`, default `0` (first item open)
- `toggle(index)`: agar already open hai → close (null), agar closed → open that index
- Returns: `{ openIndex, toggle, isOpen: (index) => boolean }`

**2. AccordionItem UI Component:**
Single FAQ accordion row. Closed state: question + chevron. Open state: question + answer + rotated chevron.

Animation (Framer Motion):
- Answer height: `height: 0 → "auto"` using Framer Motion (not CSS height: auto directly)
- Chevron: rotate 0° → 180° when open
- Answer text: opacity 0 → 1 during height expansion

**3. FAQSection:**
8 AccordionItem components. Section label + headline. First item open by default.

**4. FinalCTA Section:**
Last section before footer. Pure dark background. Centered layout. Large headline. Two buttons. Trust note.

**5. MarketingFooter:**
Full sitemap footer. Logo + tagline. 4 navigation columns. Bottom row: copyright + legal + social icons.

**6. MobileCTABar:**
Fixed bottom bar only on mobile (< 768px). "Start free trial" full-width button. Appears after 300px scroll. Fades in smoothly.

**7. Mobile Polish Pass (2.5 Hours):**
Systematic check of every section at 375px (iPhone SE), 390px (iPhone 14), 430px (iPhone 15 Plus), 768px (iPad).

---

### UI Design Details

**FAQSection Design:**

```
Section background: white
Padding: clamp(60px, 8vw, 100px) var(--pad)
Max-width: 800px (narrower — FAQ reads better in narrower column)
Margin: 0 auto (centered)

Section label: "FAQ"
Headline: "Everything you need to know."
  Instrument Serif, h2 size
  Margin-bottom: 48px

Accordion container:
  Border-top: 1px solid #E4E3DF (top of first item)

AccordionItem design:

  Container:
    Border-bottom: 1px solid #E4E3DF
    
  Question row (trigger):
    Display: flex, justify-content: space-between, align-items: center
    Padding: 20px 0
    Cursor: pointer
    
    Question text:
      DM Sans 15px, 500, #0A0A0A
      
    Chevron icon:
      16px SVG chevron-down
      Color: #9B9A96
      Transition: transform 200ms ease
      Open state: rotate(180deg)

  Answer:
    Framer Motion animated div
    Overflow: hidden
    Initial height: 0
    Open height: auto (Framer Motion handles this via animate={{ height: "auto" }})
    
    Inner padding:
      Padding-bottom: 20px
      
    Answer text:
      DM Sans 14px, #6B6A67, line-height 1.7
      Links within answers: color #1A6B3C

Eight FAQ questions (content file):

  Q1: "Does my whole team need to sign up?"
      A: Only the team admin signs up initially. Team members can be invited
         after the first meeting is recorded — they don't need accounts before
         the first standup.

  Q2: "Will the bot disrupt our meetings?"
      A: The bot announces itself when it joins ("Vocaply is recording"). It's
         silent for the rest of the meeting. Most teams stop noticing it
         within 2 sessions.

  Q3: "How accurate is the AI extraction?"
      A: Extraction accuracy on standup-style meetings is above 90% for clear
         first-person commitments. Ambiguous statements get a lower confidence
         score and are flagged for review. You can edit or remove any extracted item.

  Q4: "Does it work with our video platform?"
      A: Yes. Vocaply works with Zoom, Google Meet, and Microsoft Teams.
         Webex support is coming Q3 2026.

  Q5: "Is our meeting data used to train AI models?"
      A: No. Your meeting data is never used for training. It's processed for
         extraction and then stored securely for your team only.

  Q6: "What happens to data if we cancel?"
      A: You can export all your data (transcripts, commitments, action items)
         before cancelling. After 30 days of cancellation, data is permanently deleted.

  Q7: "We already use Jira. Will this duplicate our tickets?"
      A: Vocaply creates Jira tickets from action items extracted in meetings.
         You can toggle this on or off per meeting or globally. Existing tickets
         are never duplicated — only new action items generate new tickets.

  Q8: "Can I change plans later?"
      A: Yes. You can upgrade or downgrade at any time. Upgrades take effect
         immediately. Downgrades take effect at the end of the billing cycle.
```

**FinalCTA Design:**

```
Section background: #0A0A0A (full dark — third dark section, most dramatic)
Padding: clamp(60px, 8vw, 100px) var(--pad)
Width: 100%, inner max-width: 760px, centered (narrow for focus)
Text-align: center

Small label:
  "Get started today"
  DM Sans 11px, 600, uppercase, rgba(255,255,255,0.4), letter-spacing 0.1em
  Margin-bottom: 24px
  Display: block

Main headline (2 lines, large):
  Line 1: "Stop chasing your team."
  Line 2: "Let Vocaply |do it.|"
  
  Font: Instrument Serif, display size (clamp(48px, 6vw, 72px))
  Color: white, line-height: 1.1
  "do it." → italic #6ECC8E (light green)

Subheadline:
  "Set up in 5 minutes. Bot joins your next meeting automatically.
   First 14 days free."
  DM Sans 17px, 300, rgba(255,255,255,0.5)
  Margin: 24px 0 40px

Button group:
  Display: flex, gap: 16px, justify-content: center
  Flex-wrap: wrap (stacks on mobile)

  Primary button: "Start free trial →"
    Background: white
    Color: #0A0A0A
    Font: DM Sans 15px, 500
    Padding: 13px 32px
    Border-radius: 6px
    Hover: bg → #6ECC8E (light green), color → #0A0A0A
    Transition: 200ms

  Secondary button: "See a demo"
    Background: transparent
    Border: 1px solid rgba(255,255,255,0.15)
    Color: rgba(255,255,255,0.6)
    Same size/padding as primary
    Hover: border → rgba(255,255,255,0.4), color → white

Trust note below buttons:
  "No credit card · Works with Zoom, Meet & Teams · Cancel anytime"
  DM Sans 12px, rgba(255,255,255,0.3)
  Margin-top: 16px
```

**MarketingFooter Design:**

```
Background: #FAFAF8 (same as page — seamless)
Border-top: 1px solid #E4E3DF
Padding-top: 48px

Top area:
  Display: flex, justify-content: space-between, align-items: flex-start
  Margin-bottom: 40px
  
  Left (brand):
    Logo wordmark: "vocaply" — same as nav
    Tagline below: "Not just transcription. Accountability."
    DM Sans 13px, italic, #9B9A96
    Margin-top: 8px
    Max-width: 180px

  Right (nav columns): 4 columns in flex row, gap: 60px
  
    Each column:
      Column header:
        DM Sans 11px, 600, uppercase, letter-spacing 0.06em, #0A0A0A
        Margin-bottom: 16px
      
      Links list:
        Each link: DM Sans 13px, #6B6A67, line-height: 2.2
        Hover: color → #0A0A0A (150ms)
        No underlines by default

    COLUMN 1 — Product:
      Features · Integrations · Pricing · Changelog · Roadmap

    COLUMN 2 — Resources:
      Blog · Documentation · API · Case Studies · Status

    COLUMN 3 — Company:
      About · Careers · Press · Legal · Contact

    COLUMN 4 — Compare:
      vs Otter.ai · vs Fireflies · vs Fathom · vs Gong
      (These are SEO link pages — placeholder hrefs for now)

Bottom row:
  Border-top: 1px solid #E4E3DF
  Padding: 20px 0 32px
  Display: flex, justify-content: space-between, align-items: center
  
  Left: "© 2026 Vocaply. All rights reserved."
  Center: Privacy Policy · Terms of Service · Cookie Settings (links)
  Right: Social icons — Twitter/X · LinkedIn · GitHub

  All text: DM Sans 12px, #9B9A96
  Links: hover → #0A0A0A
  Social icons: 18px SVG, opacity 0.6, hover opacity 1.0

Mobile footer:
  Stack vertically
  Logo + tagline: top, centered
  Nav columns: 2-column grid (Product+Resources left, Company+Compare right)
  Bottom: copyright + legal + social all centered, stacked
```

**MobileCTABar Design:**

```
Visibility: ONLY on mobile (CSS: display none on ≥ 768px)
Position: fixed, bottom: 0, left: 0, right: 0
Z-index: 50

Background: white
Border-top: 1px solid #E4E3DF
Padding: 12px 16px
Padding-bottom: calc(12px + env(safe-area-inset-bottom))
  ↑ This handles iPhone notch/home indicator area

Button inside:
  "Start free trial — no credit card"
  Full width (width: 100%)
  Background: #0A0A0A
  Color: white, DM Sans 15px, 500
  Padding: 13px
  Border-radius: 6px
  Hover: bg → #1A6B3C

Visibility behavior:
  Initial: opacity 0, translateY(+60px)
  After 300px scroll: opacity 1, translateY(0)
  Transition: both over 300ms ease
  
  useMobileCTABar hook:
    useEffect: window scroll listener
    If scrollY > 300 → setVisible(true)
    Else → setVisible(false)
    Cleanup: remove listener

Note: This bar sits above the footer. Footer has enough bottom-padding
to not be covered by this bar on mobile.
```

---

### Mobile Polish Pass — Section by Section

**For each breakpoint (375px, 768px) check:**

```
AnnouncementBar:
  → Text doesn't overflow. × button not cut off. Center text wrap gracefully.

Navigation:
  → Logo visible. Hamburger icon large enough (44×44px touch target).
  → Mobile overlay fills screen. Links easily tappable.

HeroSection:
  → Text stacks above visual. H1 at least 36px (readable).
  → CTAs full-width, stacked. Trust note wraps cleanly.
  → MockBrowserFrame scales down, sidebar hidden.

SocialProofBar:
  → Horizontal scroll works. No clipping. Scrollbar hidden.

ProductShowcase:
  → Tab switcher still functional (tabs don't squish to unreadable size).
  → MockBrowserFrame full width.

ProblemStatement:
  → Two columns stack to single column. Left above, right below.
  → Both columns full width.

HowItWorks:
  → Cards stack to single column. No horizontal overflow.

FeaturesGrid:
  → 2-column grid → 1 column. Cards full width.

AICapabilities:
  → Dark section full width. Extraction animation visible at 375px.
  → Sentence text doesn't overflow the demo card.

IntegrationsSection:
  → Badges wrap correctly. No single badge gets cut off.

WorkflowTimeline:
  → Line on left side. All content right of line.
  → Timestamps above titles (not left column).

BenefitsByRole:
  → 3 cards stack to 1 column.

UseCases:
  → 2×2 grid → 1 column. Tags still visible.

Testimonials:
  → 3 cards → 1 column. Full-width cards.

CustomerLogos:
  → Logos wrap to 2 rows if needed. Still centered.

CaseStudy:
  → Metrics go above story in mobile. Metrics as row (3 across).
  → Numbers readable at smaller size (40px serif).

SecuritySection:
  → 2×2 grid → 1 column.

PricingPreview:
  → Plans: either horizontal scroll with snap, or 1-column stack.
  → Toggle stays centered.

FAQSection:
  → Accordion works at all widths. Text readable.
  → Chevron visible. Touch targets ≥ 44px.

FinalCTA:
  → Buttons stack to 1 column, full width.
  → Headline at smaller size still impactful.

Footer:
  → Stacks correctly. 2-column nav grid on mobile.
  → Social icons centered.

MobileCTABar:
  → Visible after scroll. Doesn't cover footer content.
  → Safe area inset respected.
```

### Files to Create Today

```
CREATE:
  src/components/marketing/sections/FAQSection.tsx
  src/components/marketing/sections/FinalCTA.tsx
  src/components/marketing/layout/MarketingFooter.tsx
  src/components/marketing/layout/MobileCTABar.tsx
  src/components/marketing/ui/AccordionItem.tsx
  src/hooks/marketing/useAccordion.ts
  src/hooks/marketing/useMobileCTABar.ts
  src/lib/marketing/content/faq.content.ts

UPDATE:
  src/app/(marketing)/page.tsx
    → Add FAQSection after PricingPreview
    → Add FinalCTA after FAQSection
    → Add MarketingFooter after main content
    → Add MobileCTABar (renders outside <main>, after footer)
  src/app/(marketing)/layout.tsx
    → Ensure footer is positioned correctly
```

### Day 9 End-of-Day Checklist

```
FAQ:
  [ ] 8 questions render in accordion
  [ ] First question open by default
  [ ] Click question: opens with height animation
  [ ] Click open question: closes
  [ ] Only one open at a time
  [ ] Chevron rotates 180° on open
  [ ] Section max-width 800px (narrower than other sections)

FinalCTA:
  [ ] Full dark background
  [ ] "do it." renders italic light green
  [ ] Primary button: white bg with light green hover
  [ ] Secondary button: transparent with white outline
  [ ] Trust note below buttons (barely visible, rgba 0.3)
  [ ] Centered layout, max-width 760px

Footer:
  [ ] Logo + tagline left
  [ ] 4 navigation columns (Product, Resources, Company, Compare)
  [ ] All links have hover states
  [ ] Bottom row: copyright + legal + social
  [ ] Social icons greyscale, hover fills
  [ ] Mobile: columns go to 2-column grid

MobileCTABar:
  [ ] Hidden on desktop (≥ 768px)
  [ ] Appears after 300px scroll on mobile
  [ ] Smooth fade + slide up on appear
  [ ] Full-width button with correct copy
  [ ] Safe area inset handled (no overlap with iPhone home indicator)

Mobile Polish:
  [ ] 375px: entire page renders without horizontal overflow
  [ ] 375px: all text ≥ 14px
  [ ] 375px: all tap targets ≥ 44px
  [ ] 768px: tablet layout correct
  [ ] All 20 sections tested at 375px
  [ ] No section broken or layout-shifted on mobile

Page Completeness:
  [ ] All 20 sections in page.tsx in correct order
  [ ] No section missing
  [ ] Page renders top to bottom without errors
  [ ] No TypeScript compilation errors
```

---

## Day 10 — Animations + Performance + SEO + Analytics + Deploy

### Theme: Ship It
> Page functionally complete hai. Aaj woh sab karo jo page ko
> "complete" se "production-ready" banata hai. Animations polish,
> performance optimize, SEO metadata, analytics wire up, aur
> finally Vercel pe deploy karo. Yeh woh din hai jo sab kuch
> real karta hai.

---

### Work Hours Breakdown (8 Hours)

```
9:00 AM – 10:30 AM  → Page load sequence animation + all scroll reveals audit
10:30 AM – 12:00 PM → Micro-interactions + reduced motion support
12:00 PM – 1:00 PM  → Lunch break
1:00 PM – 2:00 PM   → Performance optimization (fonts, images, bundle)
2:00 PM – 3:00 PM   → SEO: metadata, structured data, sitemap, robots
3:00 PM – 4:00 PM   → Analytics: PostHog events wiring
4:00 PM – 5:00 PM   → Accessibility final pass
5:00 PM – 5:30 PM   → Vercel deployment + production verification
5:30 PM – 6:00 PM   → Final QA checklist
```

---

### What Functionality to Build Today

**1. Page Load Sequence Animation:**
Hero section ke elements page load pe sequentially animate in hote hain — announcement bar se shuru ho ke product visual tak.

Yeh `initial` + `animate` + `transition.delay` (Framer Motion) se implement hota hai. Yeh scroll se trigger nahi hota — page load pe directly chalta hai.

**2. Scroll Reveal Audit:**
Har section check karo ki `useScrollReveal` correctly trigger ho raha hai. Kuch edge cases fix karo:
- Sections jo viewport ke ander already hain page load pe (agar koi kisi anchor se page pe aaye)
- Fast scroll karne pe animations ek saath trigger ho jayein
- `once: true` sab jagah properly respected ho

**3. Micro-interactions Polish:**
Remaining hover states aur transitions jo missing ho sakte hain:
- Testimonial card hover: green outline
- Social proof logos: color restore on hover  
- Footer links: subtle underline slide-in (CSS only)
- MockBrowser tab switch: brief "refresh flash" on content area

**4. prefers-reduced-motion Support:**
Accessibility requirement. Jo users OS-level mein animations disable karte hain unhe animated experience nahi milna chahiye.

**5. Performance Optimization:**
- Font loading verify: `display: swap`, preconnect tags in `<head>`
- Image optimization: `/public/og-image.png` ko 200KB se kam compress karo
- Bundle analysis: `@next/bundle-analyzer` run karo, large dependencies identify karo
- Console.log cleanup: production build mein sab console.log remove karo

**6. SEO Implementation:**
- `app/layout.tsx` mein full metadata object
- `app/page.tsx` mein JSON-LD structured data (SoftwareApplication + FAQPage)
- `app/sitemap.ts` create karo (Next.js App Router format)
- `app/robots.ts` create karo

**7. PostHog Analytics Events:**
`lib/analytics.ts` create karo aur 10 key events wire up karo. Har CTA button pe event tracking.

**8. Accessibility Final Pass:**
- Focus rings visible everywhere
- Semantic HTML check (one H1, logical heading order)
- ARIA labels on interactive elements
- Screen reader test (basic — keyboard navigation)
- Color contrast check (critical text)
- Skip to main content link

**9. Vercel Deployment:**
- `pnpm build` — must pass with zero errors
- Environment variables set karo: `NEXT_PUBLIC_POSTHOG_KEY`
- Vercel project connect karo
- Custom domain configure karo (vocaply.com)
- Lighthouse run karo on live URL

---

### Animation Specifications

**Page Load Sequence:**

```
What happens when user first lands on the page
(no scroll needed — first viewport only):

Timeline:
  0ms:    Announcement bar: y: -40 → 0, opacity: 0 → 1 (300ms ease)
  150ms:  Navigation: opacity: 0 → 1 (250ms ease)
  250ms:  Hero label pill: y: 16 → 0, opacity: 0 → 1 (400ms)
  400ms:  Hero H1 line 1: y: 24 → 0, opacity: 0 → 1 (500ms)
  500ms:  Hero H1 line 2 (green accent): same as above
  620ms:  Hero subheadline: y: 16 → 0, opacity: 0 → 1 (400ms)
  750ms:  Hero CTAs: y: 12 → 0, opacity: 0 → 1 (350ms)
  850ms:  Trust note: opacity: 0 → 1 (300ms)
  950ms:  Hero product visual (right column): x: 40 → 0, opacity: 0 → 1 (600ms)

How to implement:
  Each element: Framer Motion <motion.div> or <motion.h1>
  Props: initial={{ opacity: 0, y: 24 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ duration: 0.5, delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
  
  These delays are intentional — they create a layered reveal that
  feels designed, not accidental.
```

**Scroll Reveals — Final Audit:**

```
ALL section-level reveals:
  Using containerVariant (stagger) + cardVariant (individual items)
  
  Sections where stagger is important (multiple children):
    FeaturesGrid: 6 cards, 100ms stagger
    HowItWorks: 3 cards, 150ms stagger
    ProblemStatement: 2 columns, 150ms stagger
    BenefitsByRole: 3 cards, 150ms stagger
    UseCases: 4 tiles, 100ms stagger
    Testimonials: 3 cards, 150ms stagger
    PricingPreview: 4 cards, 100ms stagger
    SecuritySection: 4 cards, 100ms stagger
    AICapabilities claims: 4 items, 100ms stagger
    WorkflowTimeline: 5 nodes, 200ms stagger

  Sections with single reveal (whole section fades up):
    SocialProofBar, CustomerLogos, CaseStudy metrics,
    FAQSection, FinalCTA, Footer

Threshold for all: 0.12 (section enters when 12% visible)
```

**Micro-interactions to Add/Verify:**

```
Testimonial cards:
  Hover: box-shadow: 0 0 0 1px #E4E3DF → 0 0 0 1px #1A6B3C
  Duration: 200ms

Integration logos in SocialProofBar:
  Hover: filter grayscale(1) opacity(0.6) → opacity(1) filter none
  Duration: 200ms

Footer links:
  CSS only approach:
  link::after pseudo-element: 
    content: ''
    display: block
    height: 1px
    bg: #0A0A0A
    scaleX: 0, transform-origin: left
    transition: transform 150ms ease
  Hover: scaleX: 1

MockBrowser tab switch:
  When tab changes: content area briefly flashes 
  (opacity: 0.6 for 50ms, back to 1)
  This simulates a "loading" feel on tab change

CTA buttons (all, global):
  Already defined: translateY(-1px) + bg color change
  Verify all buttons have this on hover
```

**prefers-reduced-motion:**

```
In Providers.tsx:
  import { MotionConfig } from 'framer-motion'
  Add: reducedMotion="user"
  
  This single prop tells Framer Motion to respect OS setting.
  All animations become instant for users who prefer no motion.

Also in globals.css:
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
  
  This covers any CSS-only animations (like the pulsing dot).
```

---

### SEO Specifications

**Metadata (app/layout.tsx):**

```typescript
// Full metadata object:

title: 'Vocaply — AI Meeting Accountability for Remote Teams'
description: 'Vocaply automatically tracks every commitment made in 
  your meetings and alerts your team when deadlines slip. Works with 
  Zoom, Meet, and Teams. Free trial, no credit card.'

openGraph:
  title: 'Vocaply — AI Meeting Accountability for Remote Teams'
  description: 'Stop chasing your team. Vocaply remembers every promise 
    made in your standups.'
  url: 'https://vocaply.com'
  siteName: 'Vocaply'
  images: [{ url: '/og-image.png', width: 1200, height: 630 }]
  type: 'website'
  locale: 'en_US'

twitter:
  card: 'summary_large_image'
  title: 'Vocaply — AI Meeting Accountability'
  description: 'AI that joins your standups and tracks every 
    commitment automatically.'
  images: ['/og-image.png']

keywords: 
  'meeting accountability, AI meeting notes, standup tracker,
   action item tracker, meeting commitments, team accountability,
   meeting follow-up automation'

robots:
  index: true, follow: true
  googleBot: { index: true, follow: true, max-image-preview: 'large' }

alternates:
  canonical: 'https://vocaply.com'
```

**JSON-LD Structured Data (app/(marketing)/page.tsx):**

```
Two separate JSON-LD blocks:

1. SoftwareApplication schema:
   @type: SoftwareApplication
   name: Vocaply
   applicationCategory: BusinessApplication
   description: [full description]
   url: https://vocaply.com
   offers: array of 4 plan offers with prices

2. FAQPage schema:
   @type: FAQPage
   mainEntity: array mapping all 8 FAQ items to Question/Answer pairs
   
   This directly helps Google show FAQ rich results in search —
   can increase click-through rate by 20-30% for branded searches.
```

**sitemap.ts (app/sitemap.ts):**

```
Next.js App Router sitemap generator:
Returns array of:
  { url: 'https://vocaply.com', lastModified: new Date(), 
    changeFrequency: 'weekly', priority: 1.0 }
  
  Other URLs (when pages exist):
  /pricing, /features, /integrations, /blog, /about, /contact
  (These are placeholder — currently only / exists)
```

**robots.ts (app/robots.ts):**

```
Rules: [{ userAgent: '*', allow: '/' }]
Sitemap: 'https://vocaply.com/sitemap.xml'
```

---

### Analytics Event Specification

**analytics.ts:**

```typescript
// lib/analytics.ts
// PostHog wrapper — safe to call server/client

export const trackEvent = (
  event: string,
  properties?: Record<string, unknown>
) => {
  if (typeof window !== 'undefined' && (window as any).posthog) {
    (window as any).posthog.capture(event, properties)
  }
}
```

**10 Events to Wire Up:**

```
Event 1: 'hero_cta_click'
  Where: HeroSection primary button
  Properties: { cta_text: 'Start free trial', position: 'hero' }

Event 2: 'nav_cta_click'
  Where: MarketingNav "Start free trial" button
  Properties: { position: 'nav' }

Event 3: 'demo_request_click'
  Where: FinalCTA "See a demo" button
  Properties: { position: 'final_cta' }

Event 4: 'pricing_toggle'
  Where: usePricingToggle hook, when user toggles
  Properties: { toggled_to: 'annual' | 'monthly' }

Event 5: 'faq_opened'
  Where: AccordionItem, when any item opens
  Properties: { question: string (first 50 chars) }

Event 6: 'pricing_plan_click'
  Where: PricingCard CTA button
  Properties: { plan: 'free' | 'starter' | 'growth' | 'business' }

Event 7: 'integration_badge_hover'
  Where: IntegrationBadge onMouseEnter
  Properties: { integration: string }

Event 8: 'testimonial_section_reached'
  Where: useScrollReveal fires on Testimonials section
  Properties: {} (no extra — just marks depth reached)

Event 9: 'case_study_cta_click'
  Where: CaseStudy "Read the full case study" link
  Properties: { company: 'TechFlow' }

Event 10: 'mobile_cta_bar_click'
  Where: MobileCTABar button
  Properties: { scroll_depth: number }
```

---

### Accessibility Final Pass Checklist

```
SEMANTIC HTML:
  [ ] One and only one <h1> on the page (hero headline)
  [ ] Section headings: H1 → H2 (section headlines) → H3 (card titles)
  [ ] No heading levels skipped
  [ ] <nav aria-label="Main navigation"> on MarketingNav
  [ ] <main> wraps all landing page sections
  [ ] <footer> for MarketingFooter

INTERACTIVE ELEMENTS:
  [ ] All buttons: descriptive text content (no icon-only buttons)
  [ ] Accordion: aria-expanded on trigger, aria-controls linking to panel
  [ ] Mobile menu hamburger: aria-expanded + aria-label="Open menu"
  [ ] Tab switcher in ProductShowcase: role="tablist" + role="tab" + aria-selected
  [ ] Focus rings: 2px solid #1A6B3C, outline-offset: 2px — visible on ALL elements
  [ ] No outline: none anywhere without replacement
  [ ] All links have descriptive text (no "click here")

IMAGES + MEDIA:
  [ ] All SVG icons: aria-hidden="true" (they're decorative)
  [ ] Product showcase MockBrowser: aria-label describing what it shows
  [ ] OG image: meaningful alt text in meta

KEYBOARD NAVIGATION:
  [ ] Tab through entire page — all interactive elements reachable
  [ ] Escape key closes mobile menu
  [ ] Enter/Space activates accordion items
  [ ] Skip to main content: visually hidden <a> as first focusable element
      Becomes visible on focus (outline, white bg, padding)
      href="#main-content", wraps to <main id="main-content">

COLORS:
  [ ] Body text (#6B6A67 on #FAFAF8): contrast ratio ≥ 4.5:1 ✓
  [ ] Heading text (#0A0A0A on #FAFAF8): contrast ratio ≥ 7:1 ✓
  [ ] White text on #0A0A0A: contrast ratio ≥ 21:1 ✓
  [ ] Green (#1A6B3C) on white: check — may need verification at 13px size
```

---

### Vercel Deployment

**Pre-deployment:**

```bash
pnpm type-check          # Must pass — zero TypeScript errors
pnpm build               # Must pass — zero build errors
pnpm lint                # Must pass — zero ESLint errors

# After build, check:
# → .next/static/chunks/pages/_app.js size (target < 150KB first load)
# → No "window is not defined" errors (SSR safety)
# → No "hydration mismatch" warnings
```

**Environment Variables (Vercel Dashboard):**

```
NEXT_PUBLIC_POSTHOG_KEY   = phc_[your key]
NEXT_PUBLIC_POSTHOG_HOST  = https://app.posthog.com
NEXT_PUBLIC_BASE_URL      = https://vocaply.com
```

**Post-deployment Checks:**

```
Performance:
  [ ] vocaply.com loads in < 2.5s (measure with WebPageTest)
  [ ] Lighthouse Performance ≥ 90 on mobile
  [ ] Lighthouse Performance ≥ 95 on desktop
  [ ] Lighthouse Accessibility ≥ 95
  [ ] Lighthouse SEO = 100
  [ ] Lighthouse Best Practices ≥ 90

Functionality:
  [ ] OG image shows correctly (test with opengraph.xyz)
  [ ] All anchor links work (#features, #integrations, #pricing, #how-it-works)
  [ ] Announcement bar dismiss works on production
  [ ] Pricing toggle works on production
  [ ] All FAQ accordions open/close on production
  [ ] Mobile sticky CTA bar appears on scroll (test on real device)

Analytics:
  [ ] PostHog dashboard receiving events from vocaply.com
  [ ] Test: click "Start free trial" → see hero_cta_click in PostHog live view
  [ ] Test: open FAQ → see faq_opened event

SEO:
  [ ] View source: <title> correct
  [ ] View source: meta description present
  [ ] View source: OG tags present
  [ ] /sitemap.xml returns valid XML
  [ ] /robots.txt returns correct content
  [ ] JSON-LD: test at schema.org/docs/gs.html validator
  [ ] FAQPage JSON-LD: test with Google Rich Results Test tool

Cross-browser (test on production URL):
  [ ] Chrome desktop
  [ ] Firefox desktop
  [ ] Safari desktop (Mac)
  [ ] Chrome mobile (Android)
  [ ] Safari mobile (iPhone)
```

### Files to Create Today

```
CREATE:
  src/lib/analytics.ts                              ← PostHog event helpers
  app/sitemap.ts                                    ← Next.js sitemap generator
  app/robots.ts                                     ← robots.txt generator
  public/og-image.png                               ← 1200×630 social share image

UPDATE:
  src/app/layout.tsx
    → Full metadata object
    → Preconnect links for Google Fonts
    → MotionConfig with reducedMotion="user" in Providers
  
  src/app/(marketing)/page.tsx
    → JSON-LD script tags (SoftwareApplication + FAQPage)
    → Skip to main content link (visually hidden)
    → id="main-content" on <main>
  
  src/components/providers/Providers.tsx
    → MotionConfig reducedMotion="user" added
  
  All CTA button components:
    → trackEvent() calls added at onClick
  
  src/components/marketing/sections/HeroSection.tsx
    → Page load sequence animations (Framer Motion delays)
  
  src/components/marketing/ui/AccordionItem.tsx
    → trackEvent('faq_opened') on open
  
  src/components/marketing/ui/PricingCard.tsx
    → trackEvent('pricing_plan_click') on CTA click
  
  src/hooks/marketing/usePricingToggle.ts
    → trackEvent('pricing_toggle') on toggle
```

### Day 10 End-of-Day Checklist

```
ANIMATIONS:
  [ ] Page load sequence: announcement → nav → hero (staggered, smooth)
  [ ] All scroll reveals fire correctly on every section
  [ ] No janky or broken animations
  [ ] prefers-reduced-motion: ALL animations disabled (test in OS settings)
  [ ] No Cumulative Layout Shift from animations (page doesn't jump)

PERFORMANCE:
  [ ] pnpm build: zero errors, zero warnings
  [ ] First Load JS < 150KB (check build output table)
  [ ] Fonts load with display: swap (check Network tab — no invisible text)
  [ ] Lighthouse Performance ≥ 90 (mobile)
  [ ] No render-blocking resources

SEO:
  [ ] Title tag: exact match to spec
  [ ] Meta description: correct
  [ ] OG tags: all present, og-image verified with opengraph.xyz
  [ ] Canonical URL: set
  [ ] Sitemap: accessible at /sitemap.xml
  [ ] Robots.txt: accessible at /robots.txt
  [ ] SoftwareApplication JSON-LD: valid (schema validator)
  [ ] FAQPage JSON-LD: valid (Google Rich Results Test)

ANALYTICS:
  [ ] PostHog script loads on production
  [ ] hero_cta_click fires (verify in PostHog live events)
  [ ] nav_cta_click fires
  [ ] pricing_toggle fires on toggle click
  [ ] faq_opened fires with question text
  [ ] pricing_plan_click fires with plan name

ACCESSIBILITY:
  [ ] Skip to main content link (first tab stop, visible on focus)
  [ ] Tab through entire page — all elements reachable
  [ ] Focus rings visible on all interactive elements
  [ ] One H1 on the page (verify with axe or wave)
  [ ] No missing alt text (WAVE check)
  [ ] ARIA on accordion, tabs, nav

DEPLOYMENT:
  [ ] https://vocaply.com loads
  [ ] HTTPS active (automatic on Vercel)
  [ ] Custom domain connected and DNS propagated
  [ ] Production environment variables set
  [ ] Preview URL shared with team
  [ ] Google Search Console: sitemap submitted
```

---

## 10-Day Complete Summary

```
DAY  THEME                  SECTIONS BUILT                    COMPONENTS
──────────────────────────────────────────────────────────────────────────────
 1   Foundation             Design System                     cn(), globals.css
 2   First Impression       Announcement, Nav, Hero           MarketingButton, SectionLabel
 3   Show Don't Tell        Social Proof, Product Showcase    MockBrowser, StatusBadge
 4   Build the Case         Problem, How It Works             StepCard, useScrollReveal
 5   Product Depth          Features Grid, AI Capabilities    FeatureCard, SectionHeading
 6   Context + Proof        Integrations, Workflow Timeline   IntegrationBadge, TimelineNode
 7   Social Proof           Benefits, Use Cases, Testimonials RoleCard, TestimonialCard
 8   Remove Objections      Case Study, Security, Pricing     PricingCard, AnimatedNumber
 9   Close + Polish         FAQ, Final CTA, Footer, Mobile    AccordionItem, MobileCTABar
10   Ship                   Animations, SEO, Analytics, Deploy analytics.ts, structured data
──────────────────────────────────────────────────────────────────────────────

Total sections: 20
Total components (Days 1–10): 35+
Total custom hooks: 10+
Total content files: 16
Final target Lighthouse: Performance ≥ 90 · Accessibility ≥ 95 · SEO = 100
Deployment: Vercel (vocaply.com)
```

---

## Important Architecture Reminder

```
Poori landing page apps/web/src/app/(marketing)/ ke andar hai.
Ek hi Next.js project. Ek hi deployment. Route groups se layouts separate hain.

Final page.tsx ka section order:
──────────────────────────────────────────────────
<AnnouncementBar />
<MarketingNav />
<main id="main-content">
  <HeroSection />
  <SocialProofBar />
  <ProductShowcase />
  <ProblemStatement />
  <HowItWorks id="how-it-works" />
  <FeaturesGrid id="features" />
  <AICapabilities />
  <IntegrationsSection id="integrations" />
  <WorkflowTimeline />
  <BenefitsByRole />
  <UseCases />
  <Testimonials />
  <CustomerLogos />
  <CaseStudy />
  <SecuritySection />
  <PricingPreview id="pricing" />
  <FAQSection />
  <FinalCTA />
</main>
<MarketingFooter />
<MobileCTABar />
──────────────────────────────────────────────────

Section ID anchors (#how-it-works, #features, #integrations, #pricing)
nav links se directly linked hain.
```

---

## Design Consistency Reference (Days 6–10)

```
DARK SECTIONS (3 total — use sparingly):
  Section 8 (AI Capabilities):    #0A0A0A background, first dark section
  Section 15 (Case Study):        #0A0A0A background, second dark section
  Section 19 (Final CTA):         #0A0A0A background, closing dark section
  Light green accent on dark:     #6ECC8E (not #1A6B3C — lighter for dark bg)

GRAY SECTIONS (alternate rhythm):
  Section 3 (Social Proof Bar):   #F2F1EE
  Section 6 (How It Works):       white (resets after dark-ish)
  Section 9 (Integrations):       #F2F1EE
  Section 12 (Use Cases):         #F2F1EE
  Section 14 (Customer Logos):    #F2F1EE
  Section 17 (Pricing):           #F2F1EE

SECTION SPACING REMINDER:
  Every section: padding clamp(60px, 8vw, 100px) var(--pad)
  Exception: CustomerLogos and SocialProofBar = shorter (28–32px vertical)
  Max-width: 1120px on all sections (except FinalCTA: 760px for focused impact)

FONT USAGE REMINDER:
  Instrument Serif: H1 hero, all section H2 headlines, pull quotes, case study,
                    testimonial quotes, final CTA headline, pricing numbers
  DM Sans: everything else — body, labels, captions, nav, buttons, badges
```

---

*Plan: Landing Page Days 6–10 | Vocaply | Version 1.0 | May 2026*
*Continuation of Days 1–5 Sprint*
*Stack: Next.js 14 · TypeScript · Tailwind CSS · Framer Motion*
*Architecture: Landing page inside apps/web/src/app/(marketing)/*
*Deployment target: Vercel (vocaply.com)*
