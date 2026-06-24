# Vocaply — Landing Page 5-Day Detailed Build Plan
> Full Scalable · Day-by-Day · No Code · Pure Planning
> Stack: Next.js 14 · TypeScript · Tailwind CSS · Framer Motion
> Solo Developer | 8 hours/day | First 5 Days of 10-Day Sprint

---

## Important: Landing Page Lives Inside Next.js Web App

**Sabse pehle yeh samajhna zaroori hai:**

Landing page alag project nahi banegi. Yeh `apps/web/` ke andar hi aayegi — wohi Next.js app jis mein dashboard bhi hai. Ek hi monorepo, ek hi Next.js project, sirf alag route group.

```
apps/web/src/app/
├── (marketing)/               ← Landing page yahan hai
│   ├── layout.tsx             ← Marketing shell (no sidebar, no topbar)
│   └── page.tsx               ← "/" root — yahi landing page hai
│
├── (auth)/                    ← Login/Register pages
│   └── ...
│
└── (dashboard)/               ← Actual app (dashboard, meetings, etc.)
    └── ...
```

**Kyu ek hi project:**
- Shared design tokens (same colors, fonts, spacing)
- Shared components (Button, Badge, etc.)
- Same deployment (Vercel ek hi deploy karta hai)
- SEO metadata bhi same Next.js metadata system use karta hai
- Landing page se signup karo → directly app mein jaate ho

---

## 5-Day Overview

```
Day 1  → Project setup + design system + tokens + base layout shell
Day 2  → Announcement Bar + Navigation + Hero Section
Day 3  → Social Proof Bar + Product Showcase (Mock UI)
Day 4  → Problem Statement + How It Works
Day 5  → Features Grid + AI Capabilities Section
```

---

## Final File Structure (After Day 5)

```
apps/web/
│
├── src/
│   │
│   ├── app/
│   │   │
│   │   ├── (marketing)/                    ← Route group: landing page
│   │   │   ├── layout.tsx                  ← Marketing layout (no sidebar)
│   │   │   └── page.tsx                    ← Root "/" — main landing page
│   │   │
│   │   ├── (auth)/                         ← Auth pages (login, register)
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (dashboard)/                    ← App pages (after login)
│   │   │   └── layout.tsx
│   │   │
│   │   ├── layout.tsx                      ← Root layout (fonts, providers)
│   │   ├── globals.css                     ← Design tokens + Tailwind
│   │   └── not-found.tsx                   ← 404 page
│   │
│   │
│   ├── components/
│   │   │
│   │   ├── marketing/                      ← LANDING PAGE KE SAARE COMPONENTS
│   │   │   │
│   │   │   ├── layout/
│   │   │   │   ├── MarketingNav.tsx        ← Sticky navigation (Day 2)
│   │   │   │   ├── MobileMenuDrawer.tsx    ← Mobile hamburger overlay (Day 2)
│   │   │   │   └── AnnouncementBar.tsx     ← Top dismissible banner (Day 2)
│   │   │   │
│   │   │   ├── sections/
│   │   │   │   ├── HeroSection.tsx         ← H1 + CTAs + product visual (Day 2)
│   │   │   │   ├── SocialProofBar.tsx      ← Integration logos strip (Day 3)
│   │   │   │   ├── ProductShowcase.tsx     ← Browser mock + tab switcher (Day 3)
│   │   │   │   ├── ProblemStatement.tsx    ← Without/With contrast grid (Day 4)
│   │   │   │   ├── HowItWorks.tsx          ← 3-step cards (Day 4)
│   │   │   │   ├── FeaturesGrid.tsx        ← 6 feature cards (Day 5)
│   │   │   │   └── AICapabilities.tsx      ← Dark section, AI claims (Day 5)
│   │   │   │
│   │   │   ├── mock/
│   │   │   │   ├── MockBrowserFrame.tsx    ← Browser chrome wrapper (Day 3)
│   │   │   │   ├── MockAppSidebar.tsx      ← Dashboard sidebar mock (Day 3)
│   │   │   │   ├── MockCommitmentsView.tsx ← Commitment tracker UI mock (Day 3)
│   │   │   │   ├── MockMeetingView.tsx     ← Post-meeting detail mock (Day 3)
│   │   │   │   └── MockTeamHealthView.tsx  ← Team health dashboard mock (Day 3)
│   │   │   │
│   │   │   └── ui/
│   │   │       ├── MarketingButton.tsx     ← Primary + ghost CTA buttons (Day 2)
│   │   │       ├── SectionLabel.tsx        ← Small uppercase section tag (Day 2)
│   │   │       ├── SectionHeading.tsx      ← H2 with serif + accent word (Day 5)
│   │   │       ├── StatusBadge.tsx         ← PENDING/MISSED/FULFILLED badge (Day 3)
│   │   │       ├── CommitmentRow.tsx       ← Single mock commitment item (Day 3)
│   │   │       ├── StepCard.tsx            ← How-it-works numbered card (Day 4)
│   │   │       ├── FeatureCard.tsx         ← Individual feature card (Day 5)
│   │   │       └── IntegrationPill.tsx     ← Integration logo+name pill (Day 3)
│   │   │
│   │   └── shared/                         ← SHARED (dashboard + marketing dono use)
│   │       └── providers/
│   │           └── Providers.tsx           ← Framer Motion wrapper (Day 1)
│   │
│   │
│   ├── hooks/
│   │   ├── marketing/
│   │   │   ├── useAnnouncementBar.ts       ← localStorage dismiss logic (Day 2)
│   │   │   ├── useMobileMenu.ts            ← Hamburger open/close state (Day 2)
│   │   │   ├── useNavScroll.ts             ← Nav background on scroll (Day 2)
│   │   │   ├── useScrollReveal.ts          ← IntersectionObserver reveal (Day 4)
│   │   │   └── useProductShowcaseTabs.ts   ← Tab switcher state (Day 3)
│   │   └── shared/
│   │       └── useMediaQuery.ts            ← Breakpoint detection (Day 2)
│   │
│   │
│   ├── lib/
│   │   ├── cn.ts                           ← clsx + tailwind-merge (Day 1)
│   │   └── marketing/
│   │       └── content/
│   │           ├── navigation.content.ts   ← Nav links data (Day 2)
│   │           ├── hero.content.ts         ← Hero copy + CTA text (Day 2)
│   │           ├── social-proof.content.ts ← Integration logos data (Day 3)
│   │           ├── product-tabs.content.ts ← Product showcase tab data (Day 3)
│   │           ├── problem.content.ts      ← Without/with items data (Day 4)
│   │           ├── how-it-works.content.ts ← 3 steps data (Day 4)
│   │           ├── features.content.ts     ← 6 feature cards data (Day 5)
│   │           └── ai-capabilities.content.ts ← AI claims data (Day 5)
│   │
│   │
│   └── types/
│       └── marketing.types.ts              ← TypeScript types (Day 1)
│
│
├── public/
│   ├── fonts/                              ← Self-hosted (optional, Day 1)
│   └── icons/
│       ├── zoom.svg                        ← (Day 3)
│       ├── slack.svg
│       ├── jira.svg
│       ├── linear.svg
│       ├── notion.svg
│       ├── google-meet.svg
│       └── teams.svg
│
├── tailwind.config.ts                      ← Full design system (Day 1)
├── next.config.ts                          ← Image + font optimization (Day 1)
└── tsconfig.json                           ← Path aliases @/ configured (Day 1)
```

---

## Day 1 — Project Setup · Design System · Tokens · Base Architecture

### Theme: Foundation
> Aaj koi visible UI nahi banega. Lekin jo kuch bhi aage banega
> woh sab iss din pe depend karta hai. Ek bhi color galat ho,
> ek bhi font token missing ho — toh baad mein sab theek karna padega.

---

### Work Hours Breakdown (8 Hours)

```
9:00 AM – 10:30 AM   → Next.js project scaffold + monorepo integration
10:30 AM – 12:00 PM  → Tailwind design tokens + globals.css design system
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 2:30 PM    → Route group structure + layout files
2:30 PM – 4:00 PM    → TypeScript config + path aliases + cn() utility
4:00 PM – 5:30 PM    → Framer Motion setup + Providers + font loading
5:30 PM – 6:00 PM    → Verification pass + checklist
```

---

### What Functionality to Build Today

**1. Project Initialization:**
Agar already `apps/web/` exist karta hai (monorepo mein) toh Next.js already installed hai. Agar fresh start hai toh `create-next-app` se scaffold karo with App Router, TypeScript, aur Tailwind CSS. Ensure karo `src/` directory structure ho, strict TypeScript ho, aur path alias `@/` point kare `src/` pe.

**2. Route Group Architecture:**
Teen route groups banana hai: `(marketing)`, `(auth)`, `(dashboard)`. Yeh groups Next.js ka feature hai jismein parenthesis wale folders URL mein nahi aate — sirf layout ko separate karne ke liye hain. Aaj sirf empty `layout.tsx` files banana hai inke andar — koi content nahi, bas shell.

**3. Tailwind Design System:**
Yeh pura din ka sabse important kaam hai. `tailwind.config.ts` mein poora Vocaply brand extend karna hai. Har ek color, font, font-size, spacing, shadow, animation — sab ek jagah define hona chahiye. Agar koi developer kal se koi bhi component banaye toh usse directly `text-accent` likhna chahiye, `#1A6B3C` nahi. Tokens centralized hone chahiye.

**4. CSS Custom Properties (globals.css):**
Tailwind classes ke saath-saath CSS variables bhi define karne hain `globals.css` mein. Kuch jagah CSS variables directly use honge (CSS calc(), pseudo-elements, etc.) isliye dono jagah define karna zaroori hai. Base resets bhi yahan aayenge: `box-sizing: border-box`, smooth scroll, body font family default, antialiasing.

**5. Google Fonts Integration:**
`Instrument Serif` aur `DM Sans` load karni hain. Next.js ka built-in `next/font/google` use karna hai, `<link>` tags nahi. Yeh approach fonts ko server-side optimize karta hai, layout shift prevent karta hai (`display: swap`), aur external request eliminate karta hai.

**6. Framer Motion Provider:**
`Providers.tsx` banana hai jo `MotionConfig` wrap kare. Isme `reducedMotion="user"` set karna hai taki accessibility respect ho — jo users OS-level mein animations disable karte hain unko animated experience nahi milega.

**7. cn() Utility:**
`lib/cn.ts` ek tiny helper hai jo `clsx` aur `tailwind-merge` combine karta hai. Yeh isliye zaroori hai kyunki conditional Tailwind classes mein conflicts ho sakte hain (e.g., `text-gray-4` aur `text-accent` dono apply ho jayein — merge sort out karta hai kaunsa rakha jaye).

**8. TypeScript Types:**
`types/marketing.types.ts` mein wo sab types banana hai jo content files aur components share karenge — `NavItem`, `FeatureCard`, `StepCard`, `TestimonialCard`, etc. Yeh types Day 2 se use honge.

---

### Design System — Kya Define Karna Hai

**Color Tokens (Tailwind extend.colors):**

```
Name           Hex Value    Use Case
black          #0A0A0A      Primary text, dark backgrounds, primary CTA button background
white          #FAFAF8      Page background, text on dark backgrounds
gray-1         #F2F1EE      Section backgrounds, card fills, social proof bar
gray-2         #E4E3DF      Borders, dividers, card borders, separator lines
gray-3         #9B9A96      Muted labels, captions, logo strip, placeholder text
gray-4         #6B6A67      Secondary body text, nav links default, subtitles
accent         #1A6B3C      PRIMARY BRAND GREEN — CTAs, links, active states, fulfilled badge
accent-light   #E8F5EE      Green-tinted card backgrounds, fulfilled row bg, hover bg on ghost
accent-mid     #2D8A50      Hover state on green buttons, slightly darker green
warn           #C84B31      Missed commitments, error states, overdue alerts
warn-light     #FDECEA      Missed commitment row background, error banner background
```

**Why Itne Limited Colors:**
Yeh intentional hai. Near-monochrome base (black + white + grays) ka matlab hai jab bhi green dikhta hai, user ka attention automatically wahan jata hai. Green = action ya success. Red = problem. Baaki sab neutral. Scarcity of accent color makes it powerful.

**Typography Tokens:**

```
Font Family
  serif:  'Instrument Serif', Georgia, serif     ← Headlines, pull quotes, emphasis
  sans:   'DM Sans', system-ui, sans-serif        ← Everything else

Font Sizes (responsive using clamp)
  display:   clamp(48px, 6vw, 78px)   lineHeight 1.08   letterSpacing -1.5px
  h2:        clamp(32px, 4vw, 52px)   lineHeight 1.10   letterSpacing -1.0px
  h3:        clamp(18px, 2vw, 28px)   lineHeight 1.20   letterSpacing -0.3px
  body-lg:   clamp(16px, 2vw, 19px)   lineHeight 1.65   (subheadlines, intros)
  body:      16px                      lineHeight 1.60   (standard body copy)
  sm:        14px                      lineHeight 1.65   (card descriptions)
  xs:        13px                      lineHeight 1.70   (captions, metadata)
  label:     11px  uppercase  letter-spacing 0.1em       (section labels)
```

**Spacing:**

```
Base unit: 8px grid
--pad:   clamp(20px, 5vw, 80px)   ← Horizontal section padding
--max:   1120px                    ← Max content width
Section vertical padding: clamp(60px, 8vw, 100px) top and bottom
Card internal padding: 32px desktop, 24px mobile
Gap between grid items: 24px cards, 16px inline items
```

**Shadows:**

```
shadow-sm:   0 1px 3px rgba(0,0,0,0.05)
shadow-md:   0 4px 24px rgba(0,0,0,0.08)
shadow-lg:   0 8px 40px rgba(0,0,0,0.12)
shadow-green: 0 4px 24px rgba(26,107,60,0.08)   ← Feature card hover
```

**Border Radius:**

```
radius:    6px    ← Default (buttons, badges, small elements)
radius-md: 8px    ← Integration pills, tab switcher
radius-lg: 10px   ← Feature cards, pricing cards, testimonial cards
radius-xl: 12px   ← Product showcase browser frame, large modals
```

**Animation Tokens:**

```
transition-fast:  150ms ease    ← Hover color changes, small transitions
transition-base:  200ms ease    ← Button hover, link hover, focus states
transition-slow:  400ms ease    ← Reveal animations, larger state changes
reveal:           600ms cubic-bezier(0.25, 0.1, 0.25, 1)  ← Scroll reveals
stagger-child:    150ms         ← Delay between staggered items
```

---

### UI/UX Design Today

Aaj koi visual design user nahi dekhe ga. Lekin internally:

- `globals.css` mein body background automatically `var(--white)` ho jayega
- Links color automatically `var(--accent)` ho jayegai
- Scrollbar styling subtle hogi (webkit custom scrollbar, thin, gray)
- Selection color brand green tinted hoga (`::selection` pseudo-element)
- Focus ring style globally defined hoga (2px solid accent, 2px offset)

---

### Files to Create Today — Complete List

```
CREATE (new files):
  apps/web/src/app/(marketing)/layout.tsx          ← Marketing shell layout
  apps/web/src/app/(marketing)/page.tsx             ← Landing page entry (empty)
  apps/web/src/app/(auth)/layout.tsx               ← Auth shell (empty)
  apps/web/src/app/(dashboard)/layout.tsx          ← Dashboard shell (empty)
  apps/web/src/app/layout.tsx                      ← Root layout: fonts, providers
  apps/web/src/app/globals.css                     ← Full design token CSS
  apps/web/src/app/not-found.tsx                   ← Simple 404
  apps/web/src/components/shared/providers/Providers.tsx
  apps/web/src/lib/cn.ts                           ← Utility function
  apps/web/src/types/marketing.types.ts            ← Shared TypeScript types

CONFIGURE (existing files):
  apps/web/tailwind.config.ts                      ← Full brand token extension
  apps/web/next.config.ts                          ← Font + image optimization
  apps/web/tsconfig.json                           ← Path aliases, strict mode
```

---

### Day 1 End-of-Day Checklist

```
Setup:
  [ ] pnpm dev runs without errors on localhost:3000
  [ ] Route groups created: (marketing), (auth), (dashboard)
  [ ] No TypeScript errors (run pnpm type-check)
  [ ] Path alias @/ resolves to src/ correctly

Design System:
  [ ] tailwind.config.ts has all 10 color tokens
  [ ] All 3 font sizes (display, h2, h3) defined with correct clamp values
  [ ] All shadow tokens defined
  [ ] All border radius tokens defined
  [ ] All animation tokens defined

CSS:
  [ ] globals.css has all CSS custom properties
  [ ] Body uses --white background automatically
  [ ] Smooth scroll enabled
  [ ] ::selection styled with brand green

Fonts:
  [ ] Instrument Serif loading (check Network tab in browser DevTools)
  [ ] DM Sans loading (all 4 weights: 300, 400, 500, 600)
  [ ] No layout shift on font load (display: swap working)
  [ ] Font variables assigned to body and h1-h6

Utilities:
  [ ] cn() works correctly (test in page.tsx with a div)
  [ ] Providers.tsx wraps layout without errors
  [ ] TypeScript types file has NavItem, FeatureCard, StepCard, TestimonialCard
```

---

## Day 2 — Announcement Bar + Navigation + Hero Section

### Theme: First Impression
> Yeh puri landing page ka sabse zyada consequential din hai.
> Hero section first 5 seconds mein 40% log bounce karte hain.
> Agar hero nahi pakad ta attention — baaki kuch mayne nahi rakhta.
> Yeh din carefully complete karo.

---

### Work Hours Breakdown (8 Hours)

```
9:00 AM – 10:00 AM   → AnnouncementBar component + hook
10:00 AM – 11:30 AM  → MarketingNav component (desktop)
11:30 AM – 12:00 PM  → MobileMenuDrawer component
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 3:00 PM    → HeroSection component (full)
3:00 PM – 4:30 PM    → MarketingButton + SectionLabel UI components
4:30 PM – 5:30 PM    → Content files + hooks wiring
5:30 PM – 6:00 PM    → Responsive testing + checklist
```

---

### What Functionality to Build Today

**1. Announcement Bar:**
Ek full-width bar jo navigation ke upar aata hai. Isme koi beta announcement ya feature launch ka text hoga. Isko dismiss kiya ja sakta hai (× button se) aur yeh preference `localStorage` mein save hogi taki page reload pe dobara nahi aaye. Agar user ne pehle dismiss kar diya toh bar wapas nahi aayega.

Behavior details:
- Default state: visible, green-tinted background
- Dismiss state: `opacity: 0` animation se gayab hota hai (150ms), phir `display: none`
- Persistence: `localStorage.setItem('vocaply_announcement_dismissed', 'true')`
- On page load: pehle localStorage check karo — agar dismissed hai toh directly hidden
- Link: announcement ke andar ek "Join waitlist →" type link hoga jo kisi page pe jaata hai

**2. Navigation (Desktop):**
Sticky top navigation jo poore page pe visible rehti hai. Transparent initially, scroll karne pe frosted glass effect aata hai (backdrop-blur + border-bottom). Yeh effect JavaScript scroll event listener se handle hoga jo ek CSS class toggle karta hai.

Nav structure:
- Left: Vocaply logo wordmark
- Center/Right: Navigation links (How it works, Features, Integrations, Pricing, Blog)
- Far right: "Sign in" text link + "Start free trial" primary button

Scroll behavior:
- 0px scroll: background transparent/very light, no border, no shadow
- >10px scroll: `backdrop-filter: blur(12px)`, background semi-transparent, subtle border-bottom added via CSS class toggle
- Transition: 200ms ease on background-color and border

**3. Mobile Navigation Drawer:**
Mobile pe (< 768px) navigation links hidden ho jaate hain. Hamburger icon (teen lines) show hota hai. Click karne pe full-screen overlay nikalta hai jo saare nav links vertically stack karta hai. Ek "Start free trial" full-width button sabse neeche hoga.

Behaviors:
- Hamburger icon: 3 horizontal lines (2px each), 24px wide, 16px tall
- On open: overlay fades in + slides right to left (Framer Motion)
- Lines animate: top aur bottom lines "X" shape ban jaate hain
- Body scroll lock: body pe `overflow: hidden` aata hai when open
- Close triggers: × button click, kisi link pe click, keyboard Escape key
- Overlay background: `rgba(250,250,248,0.98)` with `backdrop-filter: blur(16px)`

**4. Hero Section:**
Poori landing page ka sabse important component. Yeh first viewport hai — jo user dekhe ga bina scroll kiye.

Layout (Desktop):
- Left column (55% width): Sab text content
- Right column (45% width): Product visual (aaj Day 3 placeholder hoga)
- Background: `#FAFAF8` with very subtle radial gradient center

Left column structure:
- Label pill (SectionLabel component): "AI Meeting Intelligence" — green, pulsing dot
- H1 headline: "Your team made promises in that meeting. Vocaply **remembers them.**" — Instrument Serif, "remembers them." italic green
- Subheadline paragraph: 19px, DM Sans 300 (light weight), #6B6A67 color
- CTA group: two buttons + trust note below them
- CTA 1 (Primary): "Start free trial →" — black bg, white text, radius 6px
- CTA 2 (Ghost): "See how it works ↓" — transparent, anchor link to #how-it-works
- Trust note: "Joins Zoom, Meet & Teams · No credit card · Set up in 5 minutes" — 12px, #9B9A96

Right column (placeholder today):
- Ek gray rounded rectangle div hoga (460px × 340px)
- Uske andar centered text: "Product visual — Day 3"
- Dashed border, #E4E3DF background
- Yeh Day 3 pe replace ho jayega real MockBrowserFrame se

Layout (Mobile, < 768px):
- Text stack first (upar)
- Placeholder rectangle neeche (full width)
- H1 font size chota: clamp(38px, 8vw, 52px)
- CTAs full-width stacked buttons

**5. MarketingButton Component:**
Reusable button component jo teen variants support kare:
- `primary`: black/dark background, white text, green on hover
- `ghost`: transparent, text link style, arrow suffix
- `outline`: border only, no fill, black border

Props: `variant`, `size` (default/lg), `href` (agar link hai), `children`

**6. SectionLabel Component:**
Small pill-shaped label jo har section ke upar hota hai. "The problem", "How it works", "Features" etc.

Design:
- Font: 11px, 600 weight, uppercase, letter-spacing 0.1em
- Color: #1A6B3C (accent)
- Background: none (just styled text, no pill background in most sections)
- Margin-bottom: 12px before the heading

---

### UI/UX Design Details

**Announcement Bar Design:**

```
Full viewport width
Height: 40px
Background: #E8F5EE (accent-light)
Border-bottom: 1px solid rgba(26,107,60,0.15)

Content (centered, horizontal flex):
  [✨ emoji] [Text: "Vocaply for Microsoft Teams — now in beta."] [Join waitlist →]
  
Text: 13px, DM Sans 500, color #1A6B3C
Link: underline on hover, same color
Arrow: → 

Dismiss button:
  Position: absolute right 20px
  Icon: × symbol, 16px, #1A6B3C
  Hover: opacity 0.7
  Click area: 32×32px minimum (accessibility)

Dismiss animation:
  Step 1: height shrinks from 40px to 0px (300ms ease)
  Step 2: opacity 0 (simultaneously)
  After animation: display none permanently (never show again in session)
```

**Navigation Design:**

```
Position: sticky, top: 0, z-index: 100
Height: 60px exactly
Max-width inner: 1120px, centered, horizontal padding: var(--pad)

DEFAULT STATE (at top of page):
  Background: rgba(250,250,248,0.92)
  Backdrop-filter: blur(12px)
  Border-bottom: none (invisible)
  Box-shadow: none

SCROLLED STATE (after 10px scroll):
  Background: rgba(250,250,248,0.95)
  Backdrop-filter: blur(12px)
  Border-bottom: 1px solid #E4E3DF
  Transition: all 200ms ease

LOGO (left side):
  "vocaply" — Instrument Serif, 22px
  "voca" in #0A0A0A, "ply" in #1A6B3C (green)
  No tagline beside logo
  Cursor: pointer, links to "/"

NAV LINKS (center-right):
  Items: "How it works" · "Features" · "Integrations" · "Pricing" · "Blog"
  Font: DM Sans, 14px, 400 weight
  Color: #6B6A67 (gray-4)
  Hover: color → #0A0A0A, transition 150ms
  Gap between items: 32px
  Underline: none (clean look)
  Active state: font-weight 500, color #0A0A0A

RIGHT SIDE ACTIONS:
  "Sign in" — text link, 14px, #6B6A67, hover → #0A0A0A
  Gap: 24px before button
  "Start free trial" button:
    Background: #0A0A0A
    Color: white
    Font: DM Sans 14px, 500
    Padding: 8px 18px
    Border-radius: 6px (--radius)
    Hover: background → #1A6B3C, translateY(-1px)
    Transition: all 200ms ease
```

**Hero Section Design:**

```
SECTION LAYOUT:
  Background: #FAFAF8
  Padding top: clamp(60px, 10vw, 120px)
  Padding bottom: 80px
  Max-width: 1120px centered
  Desktop: CSS Grid 2 columns (55% / 45%)
  Gap: 48px between columns
  Align-items: center

LABEL PILL (SectionLabel):
  "AI Meeting Intelligence"
  Display: inline-flex, align-items: center, gap: 8px
  Background: #E8F5EE
  Color: #1A6B3C
  Font: DM Sans 12px, 600, uppercase, letter-spacing 0.08em
  Padding: 5px 12px
  Border-radius: 100px
  Margin-bottom: 32px

  Pulsing dot:
    6×6px circle, bg #1A6B3C
    Animation: scale 1 → 0.8 → 1, opacity 1 → 0.4 → 1
    Duration: 2s, infinite loop
    Before the text content

HEADLINE (H1):
  Font: Instrument Serif
  Size: clamp(48px, 6vw, 78px)
  Line-height: 1.08
  Letter-spacing: -1.5px
  Color: #0A0A0A
  Margin-bottom: 24px
  Max-width: 820px

  "Your team made promises" → plain black
  "in that meeting." → plain black, line break before on desktop
  "Vocaply " → plain black, new line
  "remembers them." → Instrument Serif ITALIC, color #1A6B3C

  How italic green works:
    The word/phrase wrapped in <em> tag
    em { font-style: italic; color: #1A6B3C; }
    This creates visual emphasis AND brand moment simultaneously

SUBHEADLINE:
  Font: DM Sans, 300 weight (light)
  Size: clamp(16px, 2vw, 19px)
  Color: #6B6A67 (gray-4)
  Line-height: 1.65
  Max-width: 520px
  Margin-bottom: 40px
  Text: "AI that joins your standups, extracts every commitment, 
         and alerts your team when deadlines slip — without you lifting a finger."

CTA GROUP:
  Display: flex, align-items: center, gap: 16px
  Flex-wrap: wrap (mobile pe stack ho)
  Margin-bottom: 16px

  Button 1 — "Start free trial →":
    MarketingButton, variant="primary", size="lg"
    Padding: 13px 28px
    Font: 15px, 500
    Background: #0A0A0A
    Color: white
    Border-radius: 6px
    Hover: bg → #1A6B3C, translateY(-1px)

  Button 2 — "See how it works →":
    MarketingButton, variant="ghost"
    Color: #6B6A67
    Font: 14px, 400
    Hover: color → #0A0A0A
    Links to #how-it-works section (smooth scroll)

TRUST NOTE (below CTAs):
  Font: DM Sans 12px, 400
  Color: #9B9A96 (gray-3)
  Text: "Joins Zoom, Meet & Teams · No credit card · Set up in 5 minutes"
  Dot separators between items

HERO VISUAL (RIGHT COLUMN) — Day 2 placeholder:
  Height: 340px, width: 100%
  Background: #F2F1EE (gray-1)
  Border: 2px dashed #E4E3DF
  Border-radius: 12px
  Centered text: "Product showcase" in gray-3, 14px
  Note: This gets replaced Day 3 with real MockBrowserFrame
```

---

### Content Files — What Data Lives Where

**navigation.content.ts:**
```
navLinks array: each item has { label, href, isExternal? }
Items: How it works (#how-it-works), Features (#features), 
       Integrations (#integrations), Pricing (/pricing), Blog (/blog)
rightLinks: { signIn: '/login', trial: '/register' }
```

**hero.content.ts:**
```
announcementText: string
announcementLinkText: string
announcementLinkHref: string

heroBadgeText: "AI Meeting Intelligence"

heroHeadlinePart1: "Your team made promises in that meeting."
heroHeadlineAccent: "Vocaply remembers them."

heroSubheadline: full paragraph text

primaryCTA: { text, href }
secondaryCTA: { text, href }
trustNote: string
```

---

### Hooks — What Logic Lives Where

**useAnnouncementBar.ts:**
```
State: isVisible (boolean)
On mount: check localStorage for dismissed flag
  → if dismissed: set isVisible = false immediately (no flash)
  → if not dismissed: set isVisible = true
dismiss() function:
  → set isVisible = false (triggers CSS animation)
  → after 300ms (animation done): set localStorage flag
Return: { isVisible, dismiss }
```

**useNavScroll.ts:**
```
State: isScrolled (boolean) — starts false
Effect: window scroll event listener
  → if window.scrollY > 10: setIsScrolled(true)
  → else: setIsScrolled(false)
Cleanup: remove event listener on unmount
Return: { isScrolled }
Used in: MarketingNav to conditionally add scrolled CSS class
```

**useMobileMenu.ts:**
```
State: isOpen (boolean) — starts false
open() function: setIsOpen(true) + document.body.style.overflow = 'hidden'
close() function: setIsOpen(false) + document.body.style.overflow = ''
toggle() function: either open or close
Keyboard listener: Escape key → close()
Return: { isOpen, open, close, toggle }
```

**useMediaQuery.ts:**
```
Props: query string (e.g., "(max-width: 768px)")
State: matches (boolean)
Effect: window.matchMedia(query).addEventListener('change', handler)
Return: matches boolean
Used by: MarketingNav to know when to show hamburger vs full links
```

---

### Files to Create Today

```
CREATE:
  src/components/marketing/layout/AnnouncementBar.tsx
  src/components/marketing/layout/MarketingNav.tsx
  src/components/marketing/layout/MobileMenuDrawer.tsx
  src/components/marketing/sections/HeroSection.tsx
  src/components/marketing/ui/MarketingButton.tsx
  src/components/marketing/ui/SectionLabel.tsx
  src/hooks/marketing/useAnnouncementBar.ts
  src/hooks/marketing/useMobileMenu.ts
  src/hooks/marketing/useNavScroll.ts
  src/hooks/shared/useMediaQuery.ts
  src/lib/marketing/content/navigation.content.ts
  src/lib/marketing/content/hero.content.ts

UPDATE:
  src/app/(marketing)/page.tsx  → Import and render AnnouncementBar + MarketingNav + HeroSection
  src/app/(marketing)/layout.tsx → Add marketing layout structure
```

---

### Day 2 End-of-Day Checklist

```
Announcement Bar:
  [ ] Renders above nav with correct green background
  [ ] × button dismisses bar with animation (smooth height collapse)
  [ ] After dismiss: localStorage shows dismissed flag
  [ ] Page reload: bar does not reappear (localStorage respected)
  [ ] Link inside bar is clickable and correct color

Navigation:
  [ ] Logo renders "voca" black + "ply" green
  [ ] All 5 nav links visible with correct text
  [ ] Nav links hover: color changes to black (150ms)
  [ ] "Sign in" text link and "Start free trial" button both render
  [ ] Nav is sticky (stays at top on scroll)
  [ ] At page top: nav background is light/transparent
  [ ] After scroll: nav gets blur + border-bottom (200ms transition)
  [ ] CTA button hover: turns green, lifts 1px

Mobile (test at 375px):
  [ ] Nav links hidden on mobile
  [ ] Hamburger icon visible (3 lines)
  [ ] Hamburger click: overlay opens with animation
  [ ] Overlay has all nav links + "Start free trial" button
  [ ] Close button (×) in overlay corner works
  [ ] Body scroll locked when overlay open
  [ ] Escape key closes overlay
  [ ] Link click closes overlay + navigates

Hero:
  [ ] Headline renders in Instrument Serif at correct size
  [ ] "remembers them." renders italic + green
  [ ] Subheadline 300 weight (light) renders below
  [ ] Primary CTA button (dark) renders correctly
  [ ] Ghost CTA renders as text link
  [ ] Trust note (small gray text) below CTAs
  [ ] Hero placeholder gray rectangle (right column) visible
  [ ] Desktop: 2-column layout (text left, visual right)
  [ ] Mobile (375px): single column, text on top, visual below
  [ ] No horizontal overflow at any breakpoint
```

---

## Day 3 — Social Proof Bar + Product Showcase (Mock UI)

### Theme: Show Don't Tell
> Visitors jo product ka UI dekh lete hain woh 40% zyada signup karte hain
> un logon se jo sirf text padhte hain. Aaj ka din conversion pe
> direct impact karta hai. Yeh sab effort worth it hai.

---

### Work Hours Breakdown (8 Hours)

```
9:00 AM – 10:00 AM   → SocialProofBar component + content
10:00 AM – 11:00 AM  → MockBrowserFrame component
11:00 AM – 12:00 PM  → MockAppSidebar + MockCommitmentsView (main view)
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 2:00 PM    → MockMeetingView + MockTeamHealthView
2:00 PM – 3:30 PM    → ProductShowcase tab switcher + animation
3:30 PM – 4:30 PM    → StatusBadge + CommitmentRow + IntegrationPill UI
4:30 PM – 5:30 PM    → Wire into HeroSection (replace placeholder)
5:30 PM – 6:00 PM    → Responsive testing + checklist
```

---

### What Functionality to Build Today

**1. Social Proof Bar:**
Ek full-width band jo hero ke bilkul neeche aata hai. Isme integration names/logos dikhte hain. Yeh "borrowed trust" create karta hai — visitor sochta hai "yeh in sab tools ke saath kaam karta hai jo main already use karta hoon."

Functionality:
- Static component hai, koi interaction nahi
- Mobile pe horizontal scroll hoga (overflow-x: auto, scrollbar hidden)
- SVG icons load honge `/public/icons/` se
- Logos greyscale mein dikhenge (CSS filter: grayscale(1) opacity(0.6))
- Hover pe: opacity 1.0 (full color restore), 200ms transition

**2. MockBrowserFrame Component:**
Yeh reusable wrapper component hai. Iske andar koi bhi content pass kiya ja sakta hai as `children`. Bahar se yeh ek real browser window jaisa lagta hai.

Kya dikhta hai:
- Window chrome area (gray bar, top): teen colored dots (red, yellow, green), aur centered URL bar
- URL bar content: "app.vocaply.com/commitments" in monospace font
- Main content area: children render karte hain yahan
- Overall: box-shadow, border, rounded corners

**3. MockAppSidebar Component:**
Dashboard sidebar ka simplified version. Yeh MockBrowserFrame ke andar left side pe render hoga (desktop only — mobile pe hidden).

Content:
- 6 nav items vertically stacked: Dashboard, Commitments (ACTIVE), Action Items, Meetings, Analytics, Settings
- Each item: small icon (text emoji) + label text
- Active item (Commitments): white background, 2px left border green, black text, 500 weight
- Inactive items: gray text, transparent background, hover → lighter gray bg

**4. MockCommitmentsView (MOST IMPORTANT):**
Yeh actual Vocaply commitment tracker ka simplified version dikhata hai. Yeh hero visual ka center-piece hai aur sabse impactful element.

Content:
- Section heading: "TEAM COMMITMENTS · THIS WEEK"
- 4 CommitmentRow components (different statuses)
- Jab user scrolls aur section visible hota hai, rows stagger animate karke aate hain

**5. MockMeetingView:**
Post-meeting summary view jo second tab mein dikhta hai. Simpler hai.

Content:
- Meeting title: "Monday Standup"
- 3 extracted items: one commitment (Ahmed, login, Thursday), one action item (fix payment bug), one decision (use PostgreSQL)
- Each item has icon prefix, colored appropriately

**6. MockTeamHealthView:**
Team health dashboard view jo third tab mein dikhta hai.

Content:
- Three member rows: Ali Raza (92 score, green), Sara Khan (75, amber), Ahmed Hassan (62, red)
- Each row: avatar initial circle, name, score bar, score number

**7. ProductShowcase Section:**
Woh section hai jis mein upar 3 tabs hain aur neeche MockBrowserFrame hai.

Tab switcher:
- 3 buttons: "Commitments", "Meeting Detail", "Team Health"
- Active tab: white bg, subtle shadow, black text
- Inactive: transparent, gray text
- Tab container: gray pill background

Tab switching animation (Framer Motion `AnimatePresence`):
- Current view exits: opacity 0, y: -8px, 150ms
- New view enters: opacity 1, y: 0, 200ms, slight delay

Caption below browser:
"Everything your standup produced — automatically extracted, tracked, and followed up."

**8. StatusBadge Component:**
Reusable badge jo PENDING, MISSED, FULFILLED, DEFERRED status show karta hai. Har status ka apna background aur text color hoga.

**9. CommitmentRow Component:**
Single commitment list item jo MockCommitmentsView mein use hoga. Props: status, ownerName, commitmentText, sourceText.

**10. IntegrationPill Component:**
Social proof bar ke liye individual integration item. Logo image + name text, ek pill shape mein.

---

### UI/UX Design Details

**Social Proof Bar Design:**

```
Full-width band
Height: 60–70px
Background: #F2F1EE (gray-1)
Border-top: 1px solid #E4E3DF
Border-bottom: 1px solid #E4E3DF

Inner layout (centered, max-width 1120px):
  Display: flex, align-items: center, gap: 40px
  Flex-wrap: nowrap (logos stay in one line)

Label text (left):
  "Trusted by teams using"
  Font: DM Sans 12px, uppercase, letter-spacing 0.08em
  Color: #9B9A96 (gray-3)
  White-space: nowrap

Integration logos row:
  Display: flex, align-items: center, gap: 32px
  
  Each IntegrationPill:
    Display: flex, align-items: center, gap: 6px
    Logo SVG: 18px height, greyscale filter, opacity 0.6
    Name text: 13px, 600, #9B9A96
    Hover: opacity 1.0, filter none (200ms)
    No background, no border — clean

Tools: Jira · Linear · Slack · Notion · Zoom · Google Meet · MS Teams

Mobile behavior:
  Overflow-x: scroll, -webkit-overflow-scrolling: touch
  Scrollbar: hidden (scrollbar-width: none)
  Padding: 0 var(--pad)
```

**MockBrowserFrame Design:**

```
Outer container:
  Background: white (#FAFAF8)
  Border: 1px solid #E4E3DF
  Border-radius: 12px
  Box-shadow: 0 4px 40px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)
  Overflow: hidden (inner content clips to rounded corners)

Browser Chrome Bar:
  Height: 40px
  Background: #F2F1EE (gray-1)
  Border-bottom: 1px solid #E4E3DF
  Display: flex, align-items: center, padding: 0 16px

  Traffic Light Dots (left side, gap: 6px):
    Red dot: #FF5F56, 10px circle
    Yellow dot: #FFBD2E, 10px circle
    Green dot: #27C93F, 10px circle

  URL Bar (center):
    Flex: 1, text-align: center
    Font: monospace, 12px, color: #9B9A96
    Content: "app.vocaply.com/commitments"
    Text truncates if too narrow

Content Area:
  Display: flex (sidebar + main content side by side)
  Min-height: 480px
  Background: white

Desktop: sidebar (220px) + content area (flex: 1)
Mobile: sidebar hidden, only content area shown
```

**MockCommitmentsView Design:**

```
Padding: 28px
Heading: "TEAM COMMITMENTS · THIS WEEK"
  Font: DM Sans 13px, 600, uppercase, letter-spacing 0.06em
  Color: #9B9A96 (gray-3)
  Margin-bottom: 16px

Four CommitmentRow items:

ROW 1 — MISSED:
  Background: #FDECEA (warn-light)
  Left icon: ⚠ (warning emoji, 14px, color #C84B31)
  Owner + commitment: "Ahmed Hassan — 'Finish login feature by Thursday'"
    Font: DM Sans 14px, 500, color #0A0A0A
  Sub text: "Made in: Monday Standup · 2 days overdue · Jira: TECH-142"
    Font: DM Sans 11px, color #C84B31, opacity 0.7
  Badge: StatusBadge variant="MISSED"
  Animation delay: 0ms

ROW 2 — FULFILLED:
  Background: #E8F5EE (accent-light)
  Left icon: ✓ (check, color #1A6B3C)
  Owner: "Sara Khan — 'Send design file to client by Wednesday'"
  Sub: "Made in: Sprint Review · Completed on time · Notion updated"
  Badge: StatusBadge variant="FULFILLED"
  Animation delay: 100ms

ROW 3 — DUE TODAY:
  Background: #FFFBF0 (amber light)
  Left icon: ◔ (partial circle)
  Owner: "Ali Raza — 'Review all PRs before Friday EOD'"
  Sub: "Made in: Monday Standup · Due in 6 hours · Reminder sent"
  Badge: Custom "Due today" amber badge
  Animation delay: 200ms

ROW 4 — PENDING:
  Background: white
  Opacity: 0.6 (de-emphasized)
  Left icon: ○ (empty circle)
  Owner: "Zara Sheikh — 'Complete landing page by next Monday'"
  Sub: "Made in: 1:1 with Manager · Due in 3 days"
  Badge: StatusBadge variant="PENDING"
  Animation delay: 300ms

Each row:
  Border-radius: 6px
  Padding: 12px
  Margin-bottom: 8px
  Display: flex, gap: 10px, align-items: flex-start
  Entrance animation: fadeUp + opacity 0→1 (400ms, staggered)
```

**StatusBadge Component Design:**

```
All badges:
  Font: DM Sans 11px, 500
  Padding: 3px 8px
  Border-radius: 100px (pill)
  White-space: nowrap

Variants:
  MISSED:     bg #FDECEA, color #C84B31, text "Missed"
  FULFILLED:  bg #E8F5EE, color #1A6B3C, text "Fulfilled"
  PENDING:    bg #F2F1EE, color #6B6A67, text "Pending"
  DEFERRED:   bg #EEF2FF, color #4F46E5, text "Deferred"
  DUE_TODAY:  bg #FFFBF0, color #7A5C00, text "Due today"
  RECORDING:  bg #FDECEA + pulsing dot, color #C84B31, text "Recording"
```

**ProductShowcase Section Design:**

```
Section background: white (separates from hero and social proof)
Padding: clamp(60px, 8vw, 100px) var(--pad)
Max-width: 1120px

Tab Switcher:
  Container: inline-flex, bg #F2F1EE, border-radius 8px, padding 4px
  Centered above the browser frame
  Margin-bottom: 32px

  Each tab button:
    Font: DM Sans 13px, 500
    Padding: 7px 16px
    Border-radius: 6px
    Cursor: pointer

  Active tab:
    Background: white
    Color: #0A0A0A
    Box-shadow: 0 1px 4px rgba(0,0,0,0.08)

  Inactive tab:
    Background: transparent
    Color: #6B6A67
    Hover: color → #0A0A0A

Browser frame container:
  Max-width: 920px, centered (slightly narrower than section max)
  The frame itself has its own shadow + border

Caption below frame:
  Text: "Everything your standup produced — automatically extracted, tracked, and followed up."
  Font: DM Sans 14px, color #6B6A67, text-align center
  Margin-top: 20px
  Max-width: 600px, centered
```

---

### Content Files to Create Today

**social-proof.content.ts:**
```
integrations array: each item { name, iconPath, iconAlt }
Items: Jira, Linear, Slack, Notion, Zoom, Google Meet, MS Teams
```

**product-tabs.content.ts:**
```
tabs array: each item { id, label, component }
Tab IDs: "commitments", "meeting-detail", "team-health"
```

---

### Files to Create Today

```
CREATE:
  src/components/marketing/sections/SocialProofBar.tsx
  src/components/marketing/sections/ProductShowcase.tsx
  src/components/marketing/mock/MockBrowserFrame.tsx
  src/components/marketing/mock/MockAppSidebar.tsx
  src/components/marketing/mock/MockCommitmentsView.tsx
  src/components/marketing/mock/MockMeetingView.tsx
  src/components/marketing/mock/MockTeamHealthView.tsx
  src/components/marketing/ui/StatusBadge.tsx
  src/components/marketing/ui/CommitmentRow.tsx
  src/components/marketing/ui/IntegrationPill.tsx
  src/hooks/marketing/useProductShowcaseTabs.ts
  src/lib/marketing/content/social-proof.content.ts
  src/lib/marketing/content/product-tabs.content.ts

  public/icons/zoom.svg
  public/icons/slack.svg
  public/icons/jira.svg
  public/icons/linear.svg
  public/icons/notion.svg
  public/icons/google-meet.svg
  public/icons/teams.svg

UPDATE:
  src/components/marketing/sections/HeroSection.tsx
    → Replace placeholder gray div with <MockBrowserFrame>
       containing <MockCommitmentsView>
  src/app/(marketing)/page.tsx
    → Add <SocialProofBar /> and <ProductShowcase /> after hero
```

---

### Day 3 End-of-Day Checklist

```
Social Proof Bar:
  [ ] Renders below hero, full width
  [ ] All 7 integration names/icons visible
  [ ] Logos in greyscale, slight opacity
  [ ] Hover: logo restores color/opacity
  [ ] Mobile: horizontal scroll works, scrollbar hidden

MockBrowserFrame:
  [ ] Traffic light dots correct colors (red/yellow/green)
  [ ] URL bar shows "app.vocaply.com/commitments"
  [ ] Sidebar shows 6 nav items, "Commitments" active
  [ ] Sidebar hidden on mobile
  [ ] Overall drop shadow renders correctly

MockCommitmentsView:
  [ ] 4 commitment rows render with correct content
  [ ] MISSED row: red background, warning icon
  [ ] FULFILLED row: green background, check icon
  [ ] DUE TODAY row: amber background
  [ ] PENDING row: white background, de-emphasized
  [ ] Status badges correct colors for each

ProductShowcase:
  [ ] 3 tab buttons visible and styled correctly
  [ ] Active tab has white background + shadow
  [ ] Click tab: content switches with smooth animation (Framer Motion)
  [ ] MockMeetingView shows when "Meeting Detail" tab active
  [ ] MockTeamHealthView shows when "Team Health" tab active
  [ ] Caption text below browser frame
  [ ] Section centered and max-width constrained

HeroSection Updated:
  [ ] Placeholder gray rectangle REPLACED with real MockBrowserFrame
  [ ] Browser frame scales correctly at all breakpoints
  [ ] On mobile: browser frame full width below text
```

---

## Day 4 — Problem Statement + How It Works

### Theme: Build the Emotional Case
> Visitor ne product dekh liya. Ab unhe feel karwao ki yeh
> EXACTLY unka problem hai. Problem section = emotional resonance.
> How it works = logical clarity. Dono milke conversion ke liye
> critical path hain.

---

### Work Hours Breakdown (8 Hours)

```
9:00 AM – 10:00 AM   → useScrollReveal hook (IntersectionObserver)
10:00 AM – 12:00 PM  → ProblemStatement section (full UI)
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 2:30 PM    → HowItWorks section (full UI)
2:30 PM – 3:30 PM    → StepCard UI component
3:30 PM – 4:30 PM    → Scroll reveal animation integration
4:30 PM – 5:30 PM    → Framer Motion variants setup
5:30 PM – 6:00 PM    → Wire into page.tsx + responsive testing
```

---

### What Functionality to Build Today

**1. useScrollReveal Hook:**
Sabse pehle yeh hook banana hai kyunki aaj se har section pe scroll-triggered animations use karenge.

IntersectionObserver API use karta hai:
- Component mount pe observer create hota hai
- Ref element observe hota hai
- Jab element viewport mein 15% tak aata hai → `isVisible = true`
- Once visible ho jaye → observer disconnect ho jata hai (once: true behavior)
- `isVisible` boolean return karta hai component ko

**2. ProblemStatement Section:**
Yeh ek two-column contrast grid hai — left side shows "Without Vocaply" (pain), right side shows "With Vocaply" (solution). Yeh classic copywriting contrast technique hai jo emotionally resonant hai.

Architecture:
- Overall container: grid ya flex with 2 columns, 2px gap (gap color = #E4E3DF creates thin divider line)
- Left column: white background, 5 problem items
- Right column: #E8F5EE (accent-light) background, 5 solution items

**3. HowItWorks Section:**
Teen step cards horizontal row mein. Simple, numbered, clear. Har step ek concrete action explain karta hai.

Architecture:
- Section label + headline + subheadline upar
- 3 StepCard components below in grid

**4. StepCard UI Component:**
Reusable card component for the 3 steps. Large background number, icon box, title, description text.

**5. Framer Motion Scroll Animations:**
Har section ke liye animation variants define karne hain:
- `fadeUpVariant`: y: 20 → 0, opacity: 0 → 1
- `containerVariant`: stagger children 150ms
- `cardVariant`: same as fadeUp

Ye variants reusable honge — Day 5 aur aage bhi same variants use honge.

---

### UI/UX Design Details

**ProblemStatement Section Design:**

```
Section wrapper:
  Max-width: 1120px, centered, padding: clamp(60px, 8vw, 100px) var(--pad)

Section label: "The problem" — SectionLabel component
Headline: "Every standup has promises. Most of them disappear."
  Instrument Serif, h2 size
  Max-width: 600px
  Margin-bottom: 16px

Subheadline:
  "Meeting notes sit in Notion. Action items die in Slack threads.
   Nobody remembers what was said last Monday."
  DM Sans 17px, 300 weight, #6B6A67
  Max-width: 500px
  Margin-bottom: 56px

Two-column grid:
  Display: grid, grid-template-columns: 1fr 1fr
  Gap: 2px (yeh thin line create karta hai between columns)
  Background: #E4E3DF (jo gap mein show hota hai as divider)
  Border-radius: 10px, overflow: hidden
  Margin-top: 0

LEFT COLUMN — "Without Vocaply":
  Background: white
  Padding: 40px

  Column header:
    Display: flex, align-items: center, gap: 8px
    "✕" symbol: color #C84B31, font-size 16px
    Text: "Without Vocaply" — DM Sans 11px, 600, uppercase, #C84B31
    Margin-bottom: 28px

  5 Problem items (each):
    Display: flex, align-items: flex-start, gap: 12px
    Margin-bottom: 18px

    Icon column: emoji (16px), flex-shrink: 0, margin-top: 2px
    Text column: DM Sans 15px, line-height 1.5, color #6B6A67
      <strong> wrapping key phrase: color #0A0A0A, font-weight 500

  Items:
    😤 Manager spends 2–3 hours/week manually chasing team for updates
    💨 "I'll have it done by Friday" gets said and forgotten in every standup
    📋 Action items go into Notion and are never looked at again
    🔁 Same blocker gets mentioned in 3 different meetings
    📉 70% of meeting action items are never completed on time

RIGHT COLUMN — "With Vocaply":
  Background: #E8F5EE (accent-light)
  Padding: 40px

  Column header:
    "✓" symbol: color #1A6B3C
    Text: "With Vocaply" — DM Sans 11px, 600, uppercase, #1A6B3C

  5 Solution items matching 1:1 with problems:
    🤖 Bot joins your meeting. AI listens and extracts every promise automatically
    📌 Every commitment saved with owner, deadline, and linked to source meeting
    🎯 When Friday comes and work isn't done — Vocaply alerts person AND manager
    🔗 Jira tickets created automatically. Slack message sent after every meeting
    📊 Manager sees who keeps their word and who doesn't — with data to back it up

Mobile behavior:
  Stack: left column on top, right column below
  Both full width
  Border-radius maintained on each

Scroll reveal:
  Left column: fadeUp, delay 0ms
  Right column: fadeUp, delay 150ms
  Both triggered when section is 15% visible
```

**HowItWorks Section Design:**

```
Section wrapper:
  Background: white (clean break)
  Padding: clamp(60px, 8vw, 100px) var(--pad)
  Max-width: 1120px, centered

Section label: "How it works"
Headline: "Three steps. Zero manual work."
  Instrument Serif, h2 size
  Margin-bottom: 16px

Subheadline:
  "Vocaply runs in the background so your team focuses on the meeting,
   not on taking notes."
  DM Sans 17px, 300 weight, #6B6A67
  Max-width: 500px
  Margin-bottom: 56px

Three StepCards grid:
  Display: grid, grid-template-columns: repeat(3, 1fr)
  Gap: 2px
  Background: #E4E3DF (gap as divider)
  Border-radius: 10px, overflow: hidden
  
Scroll reveal:
  Container: stagger animation, 0/150ms/300ms delays
  Each card: fadeUp on entry
```

**StepCard Design:**

```
Individual card:
  Background: white
  Padding: 36px 32px
  Position: relative

  Background Number:
    Font: Instrument Serif italic, 48px, color #E4E3DF (very light)
    Line-height: 1
    Margin-bottom: 20px
    User-select: none
    Values: "01", "02", "03"

  Icon Box:
    Width: 44px, height: 44px
    Background: #E8F5EE (accent-light)
    Border-radius: 10px
    Display: flex, align-items center, justify-content: center
    Font-size: 20px (emoji icon)
    Margin-bottom: 20px

  Title:
    Font: DM Sans 17px, 600, color #0A0A0A
    Margin-bottom: 10px
    Letter-spacing: -0.3px

  Body text:
    Font: DM Sans 14px, color #6B6A67, line-height 1.65

  Hover:
    translateY(-2px)
    box-shadow: var(--shadow-sm) → var(--shadow-md)
    Transition: all 200ms ease

Step content:
  Step 01 — "Bot joins automatically" 🤖
    "Connect your Google Calendar. Vocaply detects every Zoom, Meet,
     and Teams meeting and sends a bot to join — 2 minutes before it starts.
     No setup per meeting. Ever."

  Step 02 — "AI extracts what matters" 🧠
    "When the meeting ends, Claude AI reads the full transcript and
     pulls out every commitment, action item, decision, and blocker —
     with the owner and deadline attached."

  Step 03 — "Accountability runs itself" 🔔
    "Deadlines approaching? Slack DM sent. Commitment missed? Manager
     alerted immediately. Jira tickets created. Your team stays
     accountable — without you chasing them."

Mobile:
  1 column, full width
  Each card full width, stacked vertically
  Padding slightly reduced: 28px 24px
```

---

### Animation Strategy

**Framer Motion Variants (create `lib/marketing/animations.ts`):**

```
fadeUpVariant:
  hidden: { opacity: 0, y: 20 }
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }
  }

containerVariant:
  hidden: {}
  visible: {
    transition: { staggerChildren: 0.15, delayChildren: 0 }
  }

cardVariant: (same as fadeUpVariant, used for individual cards)

These variants reusable raheenge Day 5 aur aage tak.
Har section mein: parent container = containerVariant,
                  children = cardVariant
```

**When to Trigger:**
- `useScrollReveal` hook se `isVisible` boolean milta hai
- `motion.div` ka `animate` prop switch hota hai `"hidden"` → `"visible"`
- `initial="hidden"` always, `animate={isVisible ? "visible" : "hidden"}`
- Once visible ho jaye, animate state nahi badalta (once behavior)

---

### Content Files to Create Today

**problem.content.ts:**
```
withoutVocaply array: 5 items, each { icon, text, highlightedText }
withVocaply array: 5 items, each { icon, text, highlightedText }
```

**how-it-works.content.ts:**
```
steps array: 3 items, each { number, icon, title, description }
```

Also create: `src/lib/marketing/animations.ts` — shared Framer Motion variants

---

### Files to Create Today

```
CREATE:
  src/components/marketing/sections/ProblemStatement.tsx
  src/components/marketing/sections/HowItWorks.tsx
  src/components/marketing/ui/StepCard.tsx
  src/hooks/marketing/useScrollReveal.ts
  src/lib/marketing/animations.ts
  src/lib/marketing/content/problem.content.ts
  src/lib/marketing/content/how-it-works.content.ts

UPDATE:
  src/app/(marketing)/page.tsx
    → Import and render ProblemStatement + HowItWorks
    → Sections must appear AFTER ProductShowcase
    → Add section IDs: id="how-it-works" on HowItWorks
```

---

### Day 4 End-of-Day Checklist

```
useScrollReveal:
  [ ] Returns false initially (not visible)
  [ ] Returns true when element enters viewport (15% threshold)
  [ ] Only triggers once (observer disconnects after first trigger)
  [ ] Test: open DevTools, scroll slowly — verify timing

ProblemStatement:
  [ ] Two columns side by side (equal width) on desktop
  [ ] 2px thin divider between columns (from grid gap technique)
  [ ] Left column: white bg, ✕ header in red
  [ ] Right column: green-tinted bg, ✓ header in green
  [ ] All 5 problem items render with emoji + text + bold phrase
  [ ] All 5 solution items render correctly
  [ ] Section label "The problem" above headline
  [ ] Headline in Instrument Serif
  [ ] Scroll reveal: both columns animate in on scroll (150ms stagger)
  [ ] Mobile: columns stack vertically (left on top, right below)
  [ ] Both columns same height (stretch on desktop)

HowItWorks:
  [ ] 3 StepCards in horizontal row on desktop
  [ ] Background numbers (01, 02, 03) visible but very light
  [ ] Icon boxes correct size (44×44px) with green-tinted bg
  [ ] Title 17px bold, body 14px gray
  [ ] Hover effect: subtle lift on each card
  [ ] Stagger animation: 0ms / 150ms / 300ms delays
  [ ] Mobile: single column, all 3 cards stacked
  [ ] Section appears at correct position in page flow

Page Flow Check:
  [ ] Hero → Social Proof → Product Showcase → Problem → How It Works
  [ ] All sections connected, no gaps, no overlaps
  [ ] Smooth visual flow between sections
  [ ] Section IDs present (for nav anchor links)
```

---

## Day 5 — Features Grid + AI Capabilities Section

### Theme: Product Depth
> Aaj ka visitor jo evaluation mode mein hai — jis ne hero dekha,
> product mock dekha, problem understand kiya, mechanism samjha —
> woh ab specific features dhundh raha hai. "Exactly yeh cheez karta
> hai kya?" Yeh question answer karna hai aaj.

---

### Work Hours Breakdown (8 Hours)

```
9:00 AM – 10:30 AM   → SectionHeading component + FeaturesGrid section
10:30 AM – 12:00 PM  → FeatureCard component + 6 cards layout
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 2:30 PM    → AICapabilities section (dark background)
2:30 PM – 4:00 PM    → AI extraction animation (sentence highlight)
4:00 PM – 5:00 PM    → Wire into page.tsx + animations
5:00 PM – 5:30 PM    → Full page responsive testing (Day 1–5 complete)
5:30 PM – 6:00 PM    → Final checklist + documentation
```

---

### What Functionality to Build Today

**1. SectionHeading Component:**
Reusable H2 component jo ek special feature support karta hai: headline mein certain words ko `|word|` syntax se mark karo aur wo automatically italic + green ho jaate hain.

Example: `"Built for how remote teams |actually work.|"` → "actually work." italic green mein render hoga.

Implementation logic:
- Component string parse karta hai `|` delimiters ke liye
- Normal text aur accented text alag `<span>` elements mein split karta hai
- Accented span: `font-style: italic, color: #1A6B3C`
- Normal span: regular Instrument Serif styling

**2. FeaturesGrid Section:**
6 feature cards ka 2×3 grid (2 columns, 3 rows on desktop; 1 column on mobile).

Architecture:
- Section label + SectionHeading + 6 FeatureCard components
- Grid: `grid-template-columns: repeat(2, 1fr)`, gap: 24px
- Each card individually animated on scroll reveal

**3. FeatureCard Component:**
Reusable card with icon, title, description. Hover state has green border + green shadow.

**4. AICapabilities Section:**
Yeh section visually DIFFERENT hai — pure dark background (`#0A0A0A`). Yeh visual variety create karta hai aur section ko memorable banata hai. Text white hai.

Isme ek interactive animation hai — ek sample sentence dikhati hai jo slowly highlight hoti hai jab section visible hota hai, dikhata hai ki AI kaise commitment parse karta hai.

Architecture:
- Full dark section
- Label + heading + subheadline (white text)
- Centered "extraction demo" animated card
- 4 AI claim items in 2×2 grid below
- Accuracy badge at bottom

**5. Extraction Animation:**
Yeh section ka centerpiece hai. Ek sentence dikhta hai: "I'll finish the login feature by Thursday". Jab section viewport mein aata hai, teen parts highlight hote hain sequence mein:

- 1.0s delay: "I'll" highlights green → "Owner" label appears below
- 1.5s delay: "finish the login feature" highlights blue/light → "Commitment" label
- 2.0s delay: "by Thursday" highlights amber → "May 15" label appears (parsed date)

Implementation: CSS class toggle using `useState` + `setTimeout` chain. Jab `useScrollReveal` `true` return kare → sequence start karo.

---

### UI/UX Design Details

**FeaturesGrid Section Design:**

```
Section wrapper:
  Background: white
  Padding: clamp(60px, 8vw, 100px) var(--pad)
  Max-width: 1120px, centered

Section label: "Features"
SectionHeading: "Built for how remote teams |actually work.|"
  "actually work." → italic green

Margin-bottom before grid: 56px

Cards grid:
  Display: grid
  Grid-template-columns: repeat(2, 1fr) — desktop
  Grid-template-columns: 1fr — mobile (< 768px)
  Gap: 24px

Scroll reveal: stagger 100ms between cards
  Top-left → top-right → mid-left → mid-right → bottom-left → bottom-right
```

**FeatureCard Design:**

```
Container:
  Background: white
  Border: 1px solid #E4E3DF
  Border-radius: 10px
  Padding: 32px
  Position: relative (for potential decorative elements)

  Transition: border-color 200ms, box-shadow 200ms
  
  Hover state:
    Border-color: #1A6B3C (accent)
    Box-shadow: var(--shadow-green) = 0 4px 24px rgba(26,107,60,0.08)
    No transform (cleaner, less distracting than lift)

Icon:
  Display: block
  Font-size: 28px (emoji)
  Margin-bottom: 16px

Title:
  Font: DM Sans 17px, 600, #0A0A0A
  Margin-bottom: 8px
  Letter-spacing: -0.3px

Description:
  Font: DM Sans 14px, #6B6A67, line-height 1.65

Six cards content:

Card 1 — 🎯 Cross-meeting memory
  "Links promises across multiple meetings. If Ahmed committed in
   Monday's standup and mentions it again Thursday, the system
   connects the dots and updates the status automatically."

Card 2 — 📊 Commitment scores
  "Every team member gets a commitment score calculated from
   their fulfillment rate over time. Managers get real data for
   1:1s instead of going by gut feeling."

Card 3 — ⚡ Auto Jira & Linear tickets
  "Every action item from your meeting becomes a Jira or Linear
   issue — assigned to the right person, with the right due date.
   Zero copy-paste after standups."

Card 4 — 🔍 Searchable transcripts
  '"What did we decide about the API last month?" Search across
   every meeting ever recorded and find the exact moment it was
   said — with who said it and when.'

Card 5 — 📬 Smart alerts, not noise
  "24 hours before a deadline: reminder to the owner. Deadline
   missed: alert to owner AND manager. Weekly digest for managers.
   No more manual follow-up emails."

Card 6 — 🔗 Works where you work
  "Slack, Jira, Linear, Notion, Google Calendar. Vocaply plugs
   into your existing tools. You don't change your workflow —
   Vocaply fits around it."
```

**AICapabilities Section Design:**

```
Section wrapper:
  Background: #0A0A0A (full black) — ENTIRE section dark
  Padding: clamp(60px, 8vw, 100px) var(--pad)
  Width: 100% (full viewport width, not constrained to max)
  
  Inner content:
    Max-width: 1120px, centered

Section label: "AI capabilities"
  Color: rgba(255,255,255,0.4)
  (Same SectionLabel component, different color passed as prop)

Headline:
  "Extraction that understands |what was actually said.|"
  SectionHeading component
  Color: white
  Accent words: #6ECC8E (lighter green — better on dark background)

Subheadline:
  "Not keyword matching. Not templated summaries. Vocaply uses
   Claude AI to understand context, intent, and meaning — so it
   catches the commitments others miss."
  Color: rgba(255,255,255,0.6)
  DM Sans 17px, 300 weight
  Max-width: 520px
  Margin-bottom: 48px


EXTRACTION ANIMATION CARD:
  Background: rgba(255,255,255,0.06)
  Border: 1px solid rgba(255,255,255,0.1)
  Border-radius: 10px
  Padding: 28px 32px
  Max-width: 640px, centered
  Margin-bottom: 48px

  Label above sentence (small):
    "Try it — watch how Vocaply parses this:"
    Font: 11px, rgba(255,255,255,0.4), uppercase, letter-spacing 0.1em
    Margin-bottom: 16px

  The sentence:
    Font: DM Sans 20px, 300 weight (light)
    Color: rgba(255,255,255,0.9)
    Line-height: 1.8

  Sentence parts (separate spans for animation):
    Span 1: "I'll "      → highlight: bg rgba(26,107,60,0.3), underline green
    Span 2: "finish the login feature " → highlight: bg rgba(59,130,246,0.25), underline blue
    Span 3: "by Thursday" → highlight: bg rgba(245,158,11,0.25), underline amber

  Labels appearing below each highlighted span (animation):
    Under "I'll": pill "owner" — green bg, white text, 11px
    Under commitment text: pill "commitment" — blue/light bg, white text
    Under date: pill "→ May 15" — amber bg, white text (shows parsed date)

  Animation sequence (triggered on scroll):
    T+0s: sentence shows (no highlights)
    T+1.0s: span 1 highlights, "owner" label fades in
    T+1.5s: span 2 highlights, "commitment" label fades in
    T+2.0s: span 3 highlights, "→ May 15" label fades in
    T+6.0s: reset all → restart loop
    (Loops every 6 seconds to engage visitors who spend time on section)


4 AI CLAIMS GRID:
  Display: grid
  Grid-template-columns: repeat(2, 1fr) — desktop
  Grid-template-columns: 1fr — mobile
  Gap: 24px
  Max-width: 800px, centered
  Margin-bottom: 40px

  Each AI claim item:
    Display: flex, gap: 16px, align-items: flex-start

    Icon circle:
      Width: 40px, height: 40px, flex-shrink: 0
      Background: rgba(255,255,255,0.08)
      Border-radius: 50%
      Emoji: 18px centered

    Text block:
      Title: DM Sans 15px, 600, white
      Description: DM Sans 14px, rgba(255,255,255,0.6), line-height 1.6

  4 claims:
    ① "Detects commitments, not just tasks"
       "I'll look into that" is not a commitment. "I'll have the API docs by Thursday"
       is. The AI knows the difference. Confidence scores tell you how certain.
    
    ② "Extracts who said it and when"
       Every commitment is linked to the speaker, the timestamp, and the meeting
       where it was made. Attribution is automatic.
    
    ③ "Understands natural language deadlines"
       "By end of sprint," "before the client call," "next Monday morning" —
       all translated to actual calendar dates. No ambiguity.
    
    ④ "Remembers across meetings"
       If the same commitment appears in three standups, the system recognizes
       it as one ongoing commitment — not three separate items.


ACCURACY BADGE:
  Position: centered, margin-top: 0, below 4 claims
  Style: inline-flex, align-items: center, gap: 8px
  Background: rgba(255,255,255,0.08)
  Border: 1px solid rgba(255,255,255,0.15)
  Border-radius: 100px
  Padding: 8px 16px
  
  Text: "93% extraction precision verified on 5,000+ standup transcripts"
  Font: DM Sans 13px, rgba(255,255,255,0.7)
  
  Small dot: 6px circle, #6ECC8E (light green)
  Position: left of text
```

---

### Animation: Extraction Demo — Timing Detail

```
State machine (useState in AICapabilities):
  stage: 0 = no highlights
         1 = "I'll" highlighted
         2 = commitment text highlighted
         3 = date highlighted + parsed date shown
         4 = reset (goes back to 0 after brief pause)

When useScrollReveal returns true:
  setTimeout → set stage to 1 (after 1000ms)
  setTimeout → set stage to 2 (after 1500ms)
  setTimeout → set stage to 3 (after 2000ms)
  setTimeout → set stage to 4 / 0 (after 5500ms) — reset
  setInterval → repeat every 6500ms total (continuous loop)

Cleanup: clear all timeouts + interval on unmount

CSS for each stage:
  Stage 1 active: .span-owner { background-color: rgba(26,107,60,0.3); }
  Stage 2 active: .span-commitment { background-color: rgba(59,130,246,0.25); }
  Stage 3 active: .span-date { background-color: rgba(245,158,11,0.25); }
  Label visibility: opacity: 0 → 1 when corresponding stage active
```

---

### Content Files to Create Today

**features.content.ts:**
```
features array: 6 items, each { icon, title, description }
```

**ai-capabilities.content.ts:**
```
claims array: 4 items, each { icon, title, description }
accuracyBadgeText: string
extractionSentence: { part1, part2, part3 } (the three spans)
```

---

### Files to Create Today

```
CREATE:
  src/components/marketing/sections/FeaturesGrid.tsx
  src/components/marketing/sections/AICapabilities.tsx
  src/components/marketing/ui/SectionHeading.tsx
  src/components/marketing/ui/FeatureCard.tsx
  src/lib/marketing/content/features.content.ts
  src/lib/marketing/content/ai-capabilities.content.ts

UPDATE:
  src/app/(marketing)/page.tsx
    → Add <FeaturesGrid id="features" /> after HowItWorks
    → Add <AICapabilities /> after FeaturesGrid
    → Verify all sections in correct order
    → Verify all section IDs present for anchor navigation
```

---

### Day 5 End-of-Day Checklist

```
SectionHeading Component:
  [ ] Renders plain text normally
  [ ] Text between | | markers renders italic green
  [ ] Works correctly in both light and dark backgrounds
  [ ] Used in FeaturesGrid AND AICapabilities sections

FeaturesGrid:
  [ ] 6 feature cards in 2×3 grid (desktop)
  [ ] Feature card hover: green border + subtle green shadow
  [ ] No hover transform (no lift on feature cards — intentional)
  [ ] Cards stagger animate in (100ms per card on scroll)
  [ ] Grid switches to 1-column on mobile
  [ ] Section label "Features" above heading
  [ ] All 6 cards have correct icon, title, description

AICapabilities:
  [ ] Full dark black background (not just a card — entire section)
  [ ] White/light text renders correctly on dark bg
  [ ] Section label in muted white/transparent
  [ ] Headline accent "what was actually said." in light green (#6ECC8E)
  [ ] Extraction animation card renders with dark bg + border
  [ ] Sample sentence visible with 3 distinct span elements
  [ ] Animation: Stage 1 — "I'll" highlights at 1s delay (green)
  [ ] Animation: Stage 2 — commitment text highlights at 1.5s (blue-ish)
  [ ] Animation: Stage 3 — date highlights at 2s + "May 15" label appears
  [ ] Animation resets after 5.5s and loops
  [ ] 4 AI claim items in 2×2 grid
  [ ] Accuracy badge at bottom (pill shape, muted)
  [ ] Mobile: 2×2 grid switches to 1 column

Full Page (Day 1–5 Complete):
  [ ] Page order: Announcement → Nav → Hero → Social Proof → 
      Product Showcase → Problem → How It Works → Features → AI Capabilities
  [ ] Smooth visual transitions between all sections
  [ ] No horizontal overflow at 375px, 768px, 1024px, 1440px
  [ ] All scroll reveals work correctly
  [ ] All section anchor links work (How it works, Features, etc.)
  [ ] No TypeScript errors
  [ ] No console errors or warnings
  [ ] Lighthouse score check: Performance > 80, No red accessibility
```

---

## Days 1–5 Summary

```
DAY  SECTIONS BUILT              FILES CREATED    KEY MILESTONE
─────────────────────────────────────────────────────────────────────────
 1   Design System Setup          10 files         Design tokens, fonts, routing
 2   Announcement + Nav + Hero    12 files         First impression complete
 3   Social Proof + Product Mock  15 files         Product visual in hero
 4   Problem + How It Works        7 files         Emotional + logical case
 5   Features + AI Capabilities    6 files         Product depth sections
─────────────────────────────────────────────────────────────────────────
Total:                            50+ files        First half of landing page
```

### Complete Sections Built After Day 5

```
✓ Announcement Bar (dismissible, localStorage)
✓ Navigation (sticky, scroll-aware, mobile drawer)
✓ Hero Section (headline, CTAs, product visual)
✓ Social Proof Bar (integration logos)
✓ Product Showcase (3-tab browser mock)
✓ Problem Statement (without/with contrast)
✓ How It Works (3-step cards)
✓ Features Grid (6 feature cards)
✓ AI Capabilities (dark section + extraction animation)
```

### Remaining Sections (Days 6–10)

```
Day 6  → Integrations section + Workflow Timeline
Day 7  → Benefits by Role + Use Cases + Testimonials + Customer Logos
Day 8  → Case Study + Security + Pricing Preview
Day 9  → FAQ + Final CTA + Footer + Mobile Polish
Day 10 → Animations + Performance + SEO + Analytics + Deploy
```

---

## Design System Reference Card

```
COLORS:
  black        #0A0A0A   Primary text, dark sections
  white        #FAFAF8   Background
  gray-1       #F2F1EE   Section backgrounds, card fills
  gray-2       #E4E3DF   Borders, dividers (gap trick)
  gray-3       #9B9A96   Muted labels, captions
  gray-4       #6B6A67   Body text, nav links
  accent       #1A6B3C   Brand green — CTAs, highlights
  accent-light #E8F5EE   Green tinted backgrounds
  accent-mid   #2D8A50   Hover on green elements
  warn         #C84B31   Missed, errors, overdue
  warn-light   #FDECEA   Warning backgrounds

TYPOGRAPHY:
  Display  78px  Instrument Serif  H1 hero, final CTA
  H2       52px  Instrument Serif  Section headlines
  H3       28px  DM Sans 600       Card titles
  Body-lg  19px  DM Sans 300       Hero sub, section intros
  Body     16px  DM Sans 400       Standard body
  SM       14px  DM Sans 400       Card descriptions
  XS       13px  DM Sans 400       Captions, metadata
  Label    11px  DM Sans 600 CAPS  Section labels

SPACING:
  --pad    clamp(20px, 5vw, 80px)  Horizontal padding
  --max    1120px                   Max content width
  Section vertical: clamp(60px, 8vw, 100px)
  Card padding: 32px (desktop) / 24px (mobile)

COMPONENT PATTERN:
  Every content section = section-label + SectionHeading + body + children
  All sections centered, max-width 1120px, horizontal --pad
  Mobile: 1-column, stacked layouts everywhere
```

---

*Plan: Landing Page Days 1–5 | Vocaply | Version 1.0 | May 2026*
*Stack: Next.js 14 · TypeScript · Tailwind CSS · Framer Motion*
*Rule: Landing page lives inside apps/web/ — same project as dashboard*
*No code written — pure detailed planning document*
