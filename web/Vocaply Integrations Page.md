# Vocaply — Integrations Page & Changelog Page
## Full Industry-Level UI/UX Build Plan
> Senior Product Designer + Frontend Architect Edition
> No code — Pure planning document
> Version: 1.0 | June 2026

---

## Table of Contents

1. [Design Philosophy & System Context](#1-design-philosophy--system-context)
2. [Who These Pages Attract (Audience Analysis)](#2-who-these-pages-attract)
3. [Integrations Page — Full Plan](#3-integrations-page--full-plan)
   - 3.1 Page Goal & Conversion Intent
   - 3.2 Information Architecture
   - 3.3 Section-by-Section UI/UX Breakdown
   - 3.4 Visual Assets — Pictures & Icons (What, Where, Source)
   - 3.5 Component Architecture
   - 3.6 Interaction & Animation Patterns
   - 3.7 Mobile Strategy
4. [Changelog Page — Full Plan](#4-changelog-page--full-plan)
   - 4.1 Page Goal & Audience
   - 4.2 Information Architecture
   - 4.3 Section-by-Section UI/UX Breakdown
   - 4.4 Visual Assets — Pictures & Icons (What, Where, Source)
   - 4.5 Component Architecture
   - 4.6 Interaction & Animation Patterns
   - 4.7 Mobile Strategy
5. [Shared Design System Tokens](#5-shared-design-system-tokens)
6. [SEO & Metadata Strategy](#6-seo--metadata-strategy)
7. [File Structure in Monorepo](#7-file-structure-in-monorepo)
8. [Implementation Order](#8-implementation-order)

---

## 1. Design Philosophy & System Context

### Vocaply's Existing Visual DNA

Before planning anything new, these pages MUST feel like they belong to the same system:

```
Font Stack:
  Display/Headlines:  Instrument Serif (400, italic)
  Body/UI:            DM Sans (300, 400, 500, 600)

Color System:
  background:   #FAFAF8   (warm off-white)
  text:         #0A0A0A   (near-black)
  brand-green:  #1A6B3C   (primary accent — CTAs, active states)
  brand-subtle: #E8F5EE   (green tint backgrounds)
  gray-1:       #F2F1EE   (section backgrounds)
  gray-2:       #E4E3DF   (borders)
  gray-3:       #9B9A96   (muted labels)
  gray-4:       #6B6A67   (secondary text)

Design Characteristics:
  → Minimal, slightly editorial feel
  → White + gray-1 alternating section backgrounds
  → Green used sparingly (high signal value)
  → Round corners (6px–12px), never sharp
  → Soft shadows (no hard drop shadows)
  → Horizontal rule separators = 1px, gray-2
```

### Design Principle for These Two Pages

The **Integrations page** is a trust-builder and objection-remover. Visitors arrive asking "does it work with my tools?" The design must answer that within 3 seconds, then build confidence through specificity and depth.

The **Changelog page** is a credibility signal. Developers and power users judge a product's seriousness by how it communicates progress. The design must feel like a publication — organized, dateable, browsable.

Both pages share one rule: **show, don't just tell**. Every claim needs a visual proof — a real UI screenshot, a connection flow diagram, or a concrete before/after.

---

## 2. Who These Pages Attract

### Integrations Page — Primary Visitors

**Persona 1 — The Evaluating Engineering Manager**
- Arrived from Google: "AI standup tracker Jira integration"
- Question: "Will this create Jira tickets automatically from my standups?"
- Decision criterion: Must see a real screenshot of Jira ticket creation, not just a logo
- Fear: Another tool that says "integration" but means "export to CSV"
- Win condition: Step-by-step flow showing how Recall bot → extraction → Jira ticket

**Persona 2 — The Technical Due-Diligence Buyer**
- Arrived via Product Hunt or Indie Hackers
- Question: "How deep is the Slack integration? Does it just post a summary or does it DM individuals?"
- Decision criterion: Needs to see the ACTUAL Slack message format (Block Kit example)
- Fear: Shallow integrations that create noise without signal
- Win condition: Show the exact Slack DM format + channel posting format

**Persona 3 — The Operations Lead**
- Arrived from a competitor comparison page
- Question: "Do I need to give up Google Calendar? Can this run alongside our current system?"
- Decision criterion: Zero-disruption setup
- Fear: Replacing existing tools instead of layering on top
- Win condition: "Works alongside your existing stack" framing

**Persona 4 — The Developer / API Seeker**
- Arrived from the docs or GitHub
- Question: "Do they have an API? Can I build my own integration?"
- Decision criterion: Sees API documentation linked from this page
- Fear: Walled garden, no extensibility
- Win condition: API section with code snippet teaser

### Changelog Page — Primary Visitors

**Persona 1 — The Existing Customer (Retention)**
- Arrives from email newsletter link or in-app "What's new" link
- Question: "What changed since I last checked?"
- Need: Quick scan of what's new, nothing buried
- Design need: Most recent entry at top, scannable titles

**Persona 2 — The Returning Evaluator (Trust Signal)**
- Arrives during a 14-day trial, checking if product is actively maintained
- Question: "Is this team shipping? Or did they build it and move on?"
- Need: See consistent shipping cadence — several entries with real dates
- Design need: Visible dates, visible frequency

**Persona 3 — The Technical Buyer / Procurement**
- Arrives when deciding between Vocaply and a competitor
- Question: "How fast do they ship fixes? How do they communicate breaking changes?"
- Need: Categories (bug fixes, new features, deprecations)
- Design need: Tags/badges per entry, filtering capability

**Persona 4 — The Developer Using the API**
- Arrives specifically looking for API or breaking changes
- Question: "Did anything in the API change that breaks my integration?"
- Need: API changelog section specifically
- Design need: Dedicated filter or category for API changes

---

## 3. Integrations Page — Full Plan

### 3.1 Page Goal & Conversion Intent

```
PRIMARY GOAL:    Remove "does it integrate?" as a purchase objection
SECONDARY GOAL:  Show the DEPTH of each integration (not just that it exists)
CONVERSION:      "Start free trial" CTA after each integration deep-dive

URL:             vocaply.com/integrations
ROUTE:           app/(marketing)/integrations/page.tsx
RENDER:          SSG + ISR (revalidate every hour)
                 Integration partners rarely change — caching is fine
```

### 3.2 Information Architecture

```
PAGE SECTIONS (top to bottom):

1. HERO — "Every tool your team already uses"
   Short, direct, no fluff. Logo grid visible immediately.

2. CATEGORY TABS — Filter integrations by type
   [All] [Video Calls] [Project Management] [Communication]
   [Calendar] [Note Taking] [Developer API]

3. INTEGRATION GRID — All integrations in card format
   Filterable by tab above. Each card links to deep-dive section.

4. DEEP-DIVE SECTIONS — One per major integration (Jira, Slack, Google Calendar)
   Real screenshots, step-by-step flow diagrams, exact behavior shown.

5. HOW CONNECTION WORKS — Generic connection flow (OAuth, one-click)
   Reassures security-conscious buyers: "What data do you access?"

6. API SECTION — For developers
   Code snippet, link to full docs.

7. MISSING AN INTEGRATION? — Request form teaser
   Honest: "Don't see yours? Tell us." + link to roadmap/request form.

8. FINAL CTA — Dark section
   "Connect your first meeting in 5 minutes."
```

### 3.3 Section-by-Section UI/UX Breakdown

---

#### SECTION 1: Hero

**Visual Design:**
```
Background: white (#FAFAF8)
Padding: clamp(80px, 10vw, 120px) horizontal padding

Layout: centered, max-width 800px

Eyebrow label:
  "Integrations"
  DM Sans, 11px, 600, uppercase, letter-spacing 0.1em
  Color: #1A6B3C (brand green)
  Margin-bottom: 16px

Headline (Instrument Serif, display size):
  "Your stack. Vocaply learns it."
  Two-line, italic emphasis on "learns it"
  "learns it." → italic + green #1A6B3C
  Size: clamp(48px, 5.5vw, 70px)
  Letter-spacing: -1.5px
  Margin-bottom: 20px

Subheadline (DM Sans, 300 weight):
  "Vocaply connects to the platforms where your team already works.
   No ripping out tools. No new workflows. Just accountability — added on top."
  Size: clamp(16px, 2vw, 19px), #6B6A67, line-height 1.65
  Margin-bottom: 48px

LOGO MARQUEE (scrolling strip, not static grid):
  Two rows, scrolling in opposite directions, slow speed (60s loop)
  Row 1 (left to right): Zoom, Google Meet, Teams, Webex, Slack, Jira
  Row 2 (right to left): Linear, Notion, Google Calendar, Outlook, GitHub, Asana
  Each logo: grayscale normally, color on hover (200ms transition)
  Logo strip: 80px height, 32px logo max-height
  Separator: subtle 1px border top and bottom of strip
  Background of strip: #F2F1EE

  VISUAL DETAIL: Logos fade out at edges using CSS mask-image gradient
    mask-image: linear-gradient(to right, transparent, black 15%, black 85%, transparent)
    This creates a "scrolling into view" effect, looks professional

CTA BELOW MARQUEE:
  "14 integrations connected. More being added every month."
  DM Sans 13px, italic, #9B9A96
  Text-align: center
```

**Why this works:**
The scrolling marquee immediately answers "does it work with X?" before the visitor even reads the headline. Moving logos grab attention better than static ones. The fade-edge technique makes it feel polished, not like a basic carousel.

---

#### SECTION 2: Category Tab Filter

**Visual Design:**
```
Background: white
Sticky: position sticky, top: 60px (below topbar when scrolled)
Z-index: 10
Border-bottom: 1px solid #E4E3DF
Box-shadow: 0 2px 8px rgba(0,0,0,0.04) when sticky

Tab strip:
  Padding: 0 var(--pad-x)
  Max-width: 1120px, centered
  Display: flex, gap: 4px
  Overflow-x: auto (mobile horizontal scroll)

Each Tab:
  DM Sans, 13px, 500
  Padding: 10px 18px
  Border-radius: 6px
  Cursor: pointer

  DEFAULT state:
    Color: #6B6A67
    Background: transparent

  ACTIVE state:
    Color: #0A0A0A
    Background: #F2F1EE
    Font-weight: 600

  HOVER state:
    Background: #F2F1EE
    Color: #0A0A0A
    Transition: 150ms

Tab labels with counts:
  "All (14)"
  "Video Calls (4)"
  "Project Management (4)"
  "Communication (2)"
  "Calendar (2)"
  "Note Taking (1)"
  "API" ← no count, just the label

Active tab gets a 2px brand-green underline:
  border-bottom: 2px solid #1A6B3C
  (NOT background color — underline is more editorial)

FILTER BEHAVIOR:
  Clicking a tab filters the grid below with fade + slight downward motion
  Framer Motion: layoutId animation on the cards
  Non-matching cards: opacity 0 + height 0 (not removed from DOM — avoids layout jump)
```

**Pattern:** This is the same pattern used by Zapier's integration directory and Linear's changelog filters. It works because it respects the user's decision — they came here knowing what they need. The sticky behavior keeps the filter accessible while scrolling through a long grid.

---

#### SECTION 3: Integration Grid

**Visual Design:**
```
Background: white
Padding: 48px 0

Grid:
  Display: grid
  Grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))
  Gap: 20px
  Max-width: 1120px, centered

INTEGRATION CARD:
  Background: white
  Border: 1px solid #E4E3DF
  Border-radius: 10px
  Padding: 28px
  Display: flex, flex-direction: column
  Cursor: pointer (links to deep-dive anchor)
  Position: relative

  HOVER:
    Border-color: #1A6B3C (green border instead of lifting)
    Box-shadow: 0 0 0 1px #1A6B3C (double border effect — looks premium)
    Transition: 200ms

  CARD LAYOUT (top to bottom):

    Row 1 — Logo + Status badge:
      Logo container: 48px × 48px
        Background: white
        Border: 1px solid #E4E3DF
        Border-radius: 10px
        Padding: 8px
        Flex-shrink: 0
        Logo image: 32px × 32px, contain

      Status badge (top-right corner, absolute positioned):
        "Live" badge:
          Background: #E8F5EE, color: #1A6B3C
          Font: DM Sans 10px, 600, uppercase
          Padding: 3px 8px
          Border-radius: 100px
          Includes 6px pulsing dot before text (same as recording pill)

        "Coming soon" badge:
          Background: #F2F1EE, color: #9B9A96
          Font: DM Sans 10px, 600, uppercase
          No pulsing dot

    Row 2 — Name:
      Integration name: DM Sans 15px, 600, #0A0A0A
      Margin-top: 16px

    Row 3 — Category tag:
      Small pill: "Project Management", "Communication", etc.
      DM Sans 11px, #9B9A96, background: #F2F1EE
      Border-radius: 4px, padding: 3px 8px
      Margin-top: 6px

    Row 4 — Description:
      2-line max description
      DM Sans 13px, #6B6A67, line-height 1.6
      Margin-top: 12px

    Row 5 — "See how it works →" link:
      Margin-top: auto (pushes to bottom)
      DM Sans 13px, #1A6B3C
      Display: flex, align-items: center, gap: 4px
      Hover: gap → 8px (arrow moves right, 150ms)

  FEATURED CARD (Jira, Slack, Google Calendar):
    These 3 are the most important — they get a special treatment
    Background: #FAFAF8 instead of white
    Border: 1px solid #1A6B3C (already green, not on hover)
    Small "Popular" badge in top corner
    → 3 columns on desktop: these 3 cards in the first row
```

**Cards in order:**

```
LIVE INTEGRATIONS (9 cards, featured 3 first):
  1. Jira ← FEATURED
  2. Slack ← FEATURED
  3. Google Calendar ← FEATURED
  4. Zoom
  5. Google Meet
  6. Microsoft Teams
  7. Linear
  8. Notion
  9. Outlook Calendar

COMING SOON (5 cards, greyed out, badge says "Coming Soon"):
  10. GitHub
  11. Asana
  12. ClickUp
  13. Webex
  14. Zapier
```

---

#### SECTION 4: Deep-Dive Sections (One Per Major Integration)

These are the MOST IMPORTANT sections on the page. This is where the conversion happens.

**Structure for each deep-dive:**
```
Layout: 2-column grid (60% text left, 40% visual right) on desktop
        Single column on mobile (visual goes below text)

Background: alternating
  Jira:             white
  Slack:            #F2F1EE
  Google Calendar:  white

Anchor IDs:
  <section id="jira-integration">
  <section id="slack-integration">
  <section id="calendar-integration">
  (Tab filter cards link to these anchors via smooth scroll)
```

**JIRA DEEP-DIVE:**

```
SECTION LABEL:
  "Jira Integration"
  Green label, uppercase, 11px

HEADLINE:
  "Standups that write |their own Jira tickets.|"
  Instrument Serif, H2 size
  Accent phrase in italic green

DESCRIPTION (3 bullet points, not paragraphs):
  ✓ Action items from standups automatically create Jira issues
  ✓ Assignees matched to Jira users by email — no manual linking
  ✓ When Jira issue is marked "Done" → Vocaply commitment auto-fulfilled

STEP FLOW (small visual inside the left column):
  Shows 3 steps as horizontal connector:
  [Bot joins standup] → [Action item extracted] → [Jira ticket created]
  Each step: 32px circle icon + label below
  Connector line: 1px dashed #E4E3DF
  Active step accent: green circle with white icon

RIGHT SIDE — SCREENSHOT:
  Shows a real mockup of a Jira ticket
  Ticket title: "Fix payment bug in checkout flow"
  Reporter: "Vocaply (via standup)"
  Priority: High
  Due date: Thursday, May 15
  Comment: "Created automatically from Monday Standup meeting. Extracted by Vocaply AI."
  
  This screenshot is the KEY selling point.
  Frame: MockBrowserFrame component (same as product showcase)
  Shadow: --shadow-lg
  Border-radius: 12px

CONFIGURATION SHOWN:
  Small config snippet below the screenshot (accordion, collapsed by default):
  Shows: "What settings you can configure"
    → Project key (e.g., TECH)
    → Default issue type (Task, Bug, Story)
    → Default priority
    → Auto-sync toggle: ON/OFF

CTA:
  "Connect Jira →" button (outline style)
  Links to: /settings/integrations or triggers OAuth flow
```

**SLACK DEEP-DIVE:**

```
HEADLINE:
  "Your team sees every commitment — |in Slack.|"

DESCRIPTION:
  ✓ Meeting summary posted to your designated channel after every standup
  ✓ Missed commitments trigger a personal Slack DM to the owner
  ✓ Managers get separate DM alerts — not noise in the channel

RIGHT SIDE — SCREENSHOT:
  DUAL SCREENSHOT (two phone-style frames side by side):

  Frame 1 — Channel message (Block Kit format):
    Shows #engineering channel
    "📋 Monday Standup — Summary"
    "28 min · 5 participants · 3 commitments"
    List of commitments with owner name, due date, green circle icon
    "View full summary →" button link

  Frame 2 — Personal DM:
    Shows DM from "Vocaply" bot
    "Hi Ahmed, your commitment is due tomorrow:"
    "→ Fix payment bug in checkout flow"
    "Due: Thursday, May 15"
    Two buttons: [Mark fulfilled] [Snooze 1 day]
    
    This DM frame is the KEY differentiator.
    No competitor shows this level of specificity.

CONFIGURATION SHOWN:
  Toggle list (visual toggles, not functional):
  [✓] Post meeting summary to channel
  [✓] Send personal DM reminders
  [✓] Alert managers when commitment missed
  [ ] Daily digest (off by default)
```

**GOOGLE CALENDAR DEEP-DIVE:**

```
HEADLINE:
  "It knows your meetings |before they happen.|"

DESCRIPTION:
  ✓ Syncs with Google Calendar automatically — no manual meeting entry
  ✓ Bot is scheduled 2 minutes before meeting starts
  ✓ Works with Zoom, Meet, and Teams links in calendar events

RIGHT SIDE — SCREENSHOT:
  Shows Google Calendar event view with Vocaply bot listed as attendee
  Event: "Monday Engineering Standup"
  Time: 9:00 AM – 9:30 AM
  Attendees: Ali Raza, Ahmed Hassan, Sara Khan, Vocaply (bot)
  Bottom of card: green banner "Vocaply will join automatically"

  This visual immediately answers "how does the bot join?"
  without requiring the user to read anything.

PRIVACY NOTE (important trust signal):
  Small info box below the screenshot:
  Icon: 🔒 padlock
  "Vocaply only reads calendar event titles and meeting URLs.
   It never accesses event details, attendee emails, or calendar data beyond what's needed."
  Background: #E8F5EE, border: 1px solid #1A6B3C/20
  This preempts the #1 security objection for calendar integrations.
```

---

#### SECTION 5: How the Connection Works

```
Background: #F2F1EE
Padding: clamp(60px, 8vw, 100px)

HEADLINE:
  "One click to connect. Zero data risk."
  DM Sans 28px, 600, centered

SUBHEADLINE:
  "All integrations use OAuth 2.0 — you authorize, we connect.
   Vocaply never stores your passwords."

3-COLUMN VISUAL FLOW:

  Column 1 — "Click Connect"
    Icon: Large rounded square, 56px, background #E8F5EE
    Icon inside: plug icon (Lucide: Plug), 28px, #1A6B3C
    Title: "Click Connect"
    Description: "Find the integration in Settings and click the Connect button."

  Column 2 — "Authorize on Their Site"
    Icon: globe icon (Lucide: Globe2)
    Title: "Authorize on Their Site"
    Description: "You're redirected to Jira/Slack/Google's own login page. We never see your password."

  Column 3 — "Vocaply Connects"
    Icon: check-circle icon (Lucide: CheckCircle2)
    Title: "Active in Under a Minute"
    Description: "You're redirected back. The integration is live. No configuration required."

Connecting arrow between columns:
  SVG dashed arrow, 1px, #E4E3DF, horizontal
  Only visible on desktop

TRUST BADGES ROW (below the columns):
  SOC 2 (in progress) · OAuth 2.0 · TLS 1.3 · AES-256
  Small pill badges, DM Sans monospace, 11px
  Background: white, border: 1px solid #E4E3DF
```

---

#### SECTION 6: API Section

```
Background: #0A0A0A (dark)
Padding: clamp(60px, 8vw, 100px)

EYEBROW:
  "For Developers"
  DM Sans 11px, uppercase, rgba(255,255,255,0.4)

HEADLINE:
  "Build your own on top of Vocaply."
  Instrument Serif, white

SUBHEADLINE:
  "Use the Vocaply API to pull commitment data into your own tools,
   dashboards, or automations. Full REST API with webhook support."
  DM Sans, rgba(255,255,255,0.6)

CODE SNIPPET (left side, 55% width):
  Styled code block
  Background: rgba(255,255,255,0.06)
  Border: 1px solid rgba(255,255,255,0.10)
  Border-radius: 8px
  Font: JetBrains Mono or Fira Code, 13px
  Color: syntax highlighted (green for strings, white for keys)

  Content:
  curl https://api.vocaply.com/api/v1/commitments \
    -H "Authorization: Bearer vply_live_..." \
    -H "Content-Type: application/json"

  Response preview below (collapsed, shown on hover):
  {
    "success": true,
    "data": [
      {
        "id": "com_abc123",
        "text": "Finish login feature",
        "status": "PENDING",
        "owner": { "name": "Ahmed Hassan" },
        "dueDate": "2026-05-15T23:59:59Z"
      }
    ]
  }

RIGHT SIDE (45% width):
  "What you can build:"
  List of 4 use cases:
  → Custom Slack bots that query commitment data
  → BI dashboard integration (Metabase, Tableau)
  → Automated weekly reports sent to your inbox
  → Custom accountability scoring models

CTA:
  "View API Docs →" (text link, light green)
  "Create API Key" (button, white bg)
```

---

#### SECTION 7: Missing an Integration?

```
Background: white
Padding: 48px var(--pad-x)
Max-width: 600px, centered
Text-align: center
Border-top: 1px solid #E4E3DF
Border-bottom: 1px solid #E4E3DF

Icon: 32px emoji or Lucide PlusCircle, 32px, #1A6B3C, margin-bottom 16px

HEADLINE:
  "Don't see your tool here?"
  DM Sans 20px, 600

BODY:
  "We add new integrations based on what teams actually need.
   Tell us what you're using and we'll prioritize it."
  DM Sans 14px, #6B6A67

INPUT ROW:
  Text input: "Name your integration..." placeholder
  Submit button: "Request it"
  Display: flex, gap: 8px
  Input: flex 1, border: 1px solid #E4E3DF, border-radius: 6px
  Button: brand green, DM Sans 14px, 500

BELOW INPUT:
  "Requested by 200+ teams: Asana · ClickUp · Zapier · HubSpot"
  DM Sans 12px, italic, #9B9A96
```

---

#### SECTION 8: Final CTA

```
(Reuse FinalCTA component from landing page)
Background: #0A0A0A
Headline: "Connect your tools. |Start free.|"
Subheadline: "14-day free trial. All integrations included. No credit card."
```

---

### 3.4 Visual Assets — Pictures, Icons & Sources

#### WHAT PICTURES ARE NEEDED AND WHERE

```
SECTION 1 — Hero Marquee:
  TYPE:         SVG logo files
  WHAT:         Official logos of all 14 integrations
  WHERE:        /public/icons/ directory (already planned in file structure)
  SOURCE:       Official brand resource pages:
    Zoom:               zoom.us/en/media-kit/
    Google Meet:        developers.google.com/meet/api/logos
    Teams:              microsoft.com/en-us/accessibility/resources
    Slack:              slack.com/media-kit
    Jira:               atlassian.design/resources/logo-library
    Linear:             linear.app/brand
    Notion:             notion.com/about (brand kit)
    GitHub:             github.com/logos
    Google Calendar:    developers.google.com/identity/branding
    Outlook:            microsoft.com/en-us/accessibility/resources
    Asana:              asana.com/press
    ClickUp:            clickup.com/brand
    Webex:              cisco.com/c/en/us/about/brand-guidelines.html
  
  SPECIFICATIONS:
    Format: SVG preferred (scalable, small file size)
    Size: 200×200px canvas, logo centered
    Colors: Full color version for hover state, grayscale CSS filter for default
    
    CSS for grayscale:
      .logo-icon { filter: grayscale(1) opacity(0.6); }
      .logo-icon:hover { filter: none; transition: 200ms; }
```

```
SECTION 4 — Jira Deep-Dive Screenshot:
  TYPE:         Static UI mockup (NOT a real Jira screenshot)
  WHY MOCKUP:   Real screenshots require user data. Mockups stay fresh.
  WHAT:         Jira-style ticket interface showing Vocaply-created ticket
  
  CONTENT TO SHOW:
    Project: TECH (TechFlow Engineering)
    Issue type: Task icon (blue square with checkmark)
    Title: "Fix payment bug in checkout flow"
    Status: "To Do" (Jira blue pill)
    Assignee: Ahmed Hassan (avatar + name)
    Reporter: "Vocaply (AI)" with small Vocaply logomark
    Priority: High (orange arrow icon)
    Due date: Thursday, May 15
    Labels: "vocaply", "meeting-action-item" (small gray pills)
    Activity comment: "Created automatically from Monday Standup (May 12, 9:28 AM). Extracted by Vocaply AI."
  
  HOW TO CREATE:
    Option A (Recommended): Build as HTML/CSS inside MockBrowserFrame component
    → Gives full control, looks pixel-perfect, zero legal risk
    → Matches exactly the Vocaply design system
    
    Option B: Use Figma, export as PNG
    → If real screenshot needed, use dummy Jira account with fake data
  
  DIMENSIONS: 720px wide × 480px tall (16:9.5 ratio)
  FILE: /public/images/integrations/jira-ticket-mockup.png
```

```
SECTION 4 — Slack Deep-Dive Screenshots:
  TYPE:         Static UI mockup (same approach as Jira)
  WHAT:         Two mobile phone frames side by side
    
    Frame 1 — Channel message mockup:
      Slack's dark theme UI
      App name: "Vocaply" with Vocaply logo as app icon
      Channel: #engineering
      Content: Block Kit formatted meeting summary
      
      EXACT MESSAGE CONTENT TO SHOW:
        📋 Monday Standup — Summary
        ─────────────────────
        28 min · 5 participants · 3 commitments extracted
        
        ✅ 3 New Commitments:
        • Ahmed Hassan → Fix payment bug (Thu, May 15)
        • Sara Khan → Send design files (Wed, May 14)
        • Ali Raza → Review PRs (Today EOD)
        
        [View full summary]
    
    Frame 2 — DM from Vocaply:
      Slack light theme UI (contrast with frame 1)
      DM from "Vocaply" bot
      "Your deadline is tomorrow:"
      "→ Fix payment bug in checkout flow"
      "Due: Thursday, May 15"
      [Mark fulfilled] [Snooze 1 day]
  
  PHONE FRAME: Use CSS browser frame or phone mockup SVG (no royalty issues)
  SOURCE FOR PHONE FRAME SVGs: unDraw.co (open license) or custom CSS
  FILE: /public/images/integrations/slack-channel-mockup.png
          /public/images/integrations/slack-dm-mockup.png
```

```
SECTION 4 — Google Calendar Deep-Dive Screenshot:
  TYPE:         Static UI mockup
  WHAT:         Google Calendar event detail view
  
  CONTENT TO SHOW:
    Event name: "Monday Engineering Standup"
    Date: Monday, May 12 · 9:00 – 9:30 AM
    Location: Zoom (with Zoom icon)
    Attendees: 4 people + "Vocaply" as attendee with small green dot
    Description area: Zoom link
    Bottom banner (custom, not real Calendar): 
      Green pill: "● Vocaply will join and take notes automatically"
  
  DIMENSIONS: 600px wide × 380px tall
  FILE: /public/images/integrations/calendar-event-mockup.png
```

#### ICONS USED ON THIS PAGE

```
INTEGRATION LOGOS:
  Source: Official brand kits (listed above)
  All stored as: /public/icons/{integration-name}.svg

LUCIDE REACT ICONS (consistent with landing page):
  Plug2        → Connection icon in "How it Works" section
  Globe2       → OAuth redirect step
  CheckCircle2 → "Live" status, success states
  Lock         → Privacy/security reassurance
  Code2        → API section header icon
  PlusCircle   → "Request an integration" section
  ArrowRight   → All "→" CTAs
  ExternalLink → "View Docs" links
  Zap          → "Quick setup" feature callout
  Shield       → Security badges section
  Clock        → "Sets up in under 2 minutes"

STATUS ICONS:
  Live status dot:   Custom SVG pulsing circle, 6px, #1A6B3C fill
  Coming soon:       Static gray circle, 6px, #9B9A96 fill
  Error state:       #C84B31 circle

CATEGORY ICONS (small, inside tab labels or cards):
  Video:              Lucide Video
  Project Mgmt:       Lucide Kanban
  Communication:      Lucide MessageSquare
  Calendar:           Lucide Calendar
  Notes:              Lucide FileText
  API:                Lucide Code2
```

---

### 3.5 Component Architecture

```
PAGE FILE:
  app/(marketing)/integrations/page.tsx
    → Imports all section components
    → JSON data file: lib/marketing/content/integrations-page.content.ts

COMPONENTS TO BUILD:
  components/marketing/sections/
    IntegrationsHero.tsx
    IntegrationsTabFilter.tsx          ← Sticky, filterable
    IntegrationsGrid.tsx               ← Filtered grid container
    IntegrationDeepDive.tsx            ← Reusable for each integration deep-dive
    IntegrationsAPISection.tsx
    IntegrationRequest.tsx
    IntegrationsHowItWorks.tsx

  components/marketing/ui/
    IntegrationCard.tsx                ← Card in the grid
    IntegrationCategoryBadge.tsx       ← Category pill tag
    LiveStatusBadge.tsx               ← "Live" or "Coming Soon" badge
    MockJiraTicket.tsx                 ← Jira UI mockup component
    MockSlackMessage.tsx               ← Slack message mockup component
    MockCalendarEvent.tsx              ← Calendar event mockup component
    CodeBlock.tsx                      ← Syntax-highlighted API code snippet
    ConnectionFlowStep.tsx             ← Step in "How Connection Works" flow

HOOKS:
  hooks/marketing/useIntegrationFilter.ts
    → State: activeCategory (string)
    → Derived: filteredIntegrations (from full list, filtered by category)
    → Handler: setCategory (with URL param sync: ?category=jira)

DATA FILE:
  lib/marketing/content/integrations-page.content.ts
    IntegrationItem type:
      name, slug, category[], status, logoPath, description,
      hasDeepDive, deepDiveAnchor, comingSoon

    CATEGORIES type:
      id, label, icon, count
```

---

### 3.6 Interaction & Animation Patterns

```
SCROLLING LOGO MARQUEE:
  Implementation: CSS animation (NOT JavaScript — zero performance cost)
    @keyframes scroll-left { from { transform: translateX(0) } to { transform: translateX(-50%) } }
    @keyframes scroll-right { from { transform: translateX(-50%) } to { transform: translateX(0) } }
    Duplicate logos (2× full set) so loop is seamless
  Speed: 60s for full cycle (slow, professional, not distracting)
  Pause on hover: animation-play-state: paused on :hover

TAB FILTER:
  Animation: Framer Motion layout animations
    Each card has layoutId={integration.slug}
    Filtering re-renders the grid; Framer Motion animates position changes
    Duration: 300ms, ease: easeInOut
    Cards that exit: opacity 0 + scale 0.95 (100ms)
    Cards that enter: opacity 1 + scale 1 (200ms, with slight delay)

SCROLL REVEAL:
  Each deep-dive section fades up as it enters viewport
  Same useScrollReveal hook from landing page
  Threshold: 0.15

STICKY TAB BEHAVIOR:
  JavaScript: IntersectionObserver watches each deep-dive section
  As sections cross 50% viewport → corresponding tab becomes highlighted
  This creates a "reading progress" indicator without custom scroll logic

CODE BLOCK:
  On hover: "Copy" button appears top-right corner (opacity 0 → 1, 150ms)
  On copy: Button text changes to "Copied!" with checkmark, green, 2s, then reverts

CARD HOVER:
  Border changes to green + double border (box-shadow technique)
  Duration: 150ms ease
  No translateY (cards don't lift — more professional than bouncy)

ANCHOR SCROLL:
  Cards in grid link to deep-dive sections via anchor (#jira-integration)
  Smooth scroll: scroll-behavior: smooth on html element
  Offset: 80px (accounts for sticky nav + sticky tab filter)
  Implementation: Use scrollIntoView with block: 'start' + manual offset calculation
```

---

### 3.7 Mobile Strategy

```
HERO:
  Marquee still works at 375px (same CSS, just smaller logos)
  Headline: clamp handles font size
  No layout change needed

TAB FILTER:
  overflow-x: auto (horizontal scroll)
  scroll-snap-type: x mandatory, snap-align: start
  No scrollbar visible: scrollbar-width: none
  Show "→" indicator at right edge to hint scrollability

INTEGRATION GRID:
  grid-template-columns: 1fr (single column on mobile < 640px)
  Cards: full width, same visual design

DEEP-DIVE SECTIONS:
  2-column → single column
  Screenshot/mockup: ABOVE the text (visual first on mobile)
  Screenshot width: 100% (full bleed to edges on very small screens)

API SECTION:
  Code block: full width, horizontal scroll enabled
  overflow-x: auto

"HOW IT WORKS" 3 COLUMNS:
  → Stack vertically
  Connecting arrows: hidden on mobile (irrelevant when stacked)
```

---

## 4. Changelog Page — Full Plan

### 4.1 Page Goal & Audience

```
PRIMARY GOAL:    Demonstrate active shipping cadence (trust/credibility)
SECONDARY GOAL:  Reduce support load (answers "is X fixed?")
TERTIARY GOAL:   SEO for "[Vocaply] what's new" / "[Vocaply] changelog" searches

URL:             vocaply.com/changelog
ROUTE:           app/(marketing)/changelog/page.tsx
RENDER:          SSG + ISR (revalidate every hour)
                 New entries added → ISR picks them up without full rebuild

CMS APPROACH:    Entries stored as MDX files in content/changelog/
                 Each file: YYYY-MM-DD.mdx with frontmatter
                 Build process: sort by date, parse MDX, generate page
                 
                 OR: Simple TypeScript content files (simpler, no CMS needed early on)
                 lib/marketing/content/changelog.content.ts
```

### 4.2 Information Architecture

```
PAGE SECTIONS (top to bottom):

1. HERO — Minimal, editorial
   "Changelog" as headline. Short description. Subscribe to updates button.

2. FILTER BAR — Filter by category
   [All Updates] [New Features] [Improvements] [Bug Fixes] [API] [Performance]

3. CHANGELOG FEED — Timeline of all entries
   Most recent at top. Grouped by month.
   Each entry: date, category badge, headline, description, optional screenshot.

4. SUBSCRIBE SECTION — Email updates
   Small, unobtrusive. "Get new releases in your inbox."

5. RSS LINK — For developers who prefer RSS
   Subtle, at bottom. "Subscribe via RSS"
```

### 4.3 Section-by-Section UI/UX Breakdown

---

#### SECTION 1: Hero

```
Background: white
Padding: clamp(60px, 8vw, 100px) top, clamp(32px, 5vw, 64px) bottom
Max-width: 720px, centered

EYEBROW:
  "Changelog"
  DM Sans 11px, 600, uppercase, #1A6B3C, letter-spacing 0.1em

HEADLINE:
  "What's new in Vocaply"
  Instrument Serif, clamp(40px, 5vw, 60px)
  NOT italic — this is more editorial/matter-of-fact than the landing page

SUBHEADLINE:
  "Every improvement, fix, and new feature — documented as it ships."
  DM Sans 17px, 300, #6B6A67, line-height 1.6

SUBSCRIBE ROW (below headline):
  Email input + "Subscribe" button
  Display: flex, gap: 8px, max-width: 400px
  Input: DM Sans 14px, placeholder "Your email address"
  Button: filled green, "Get release notes"
  Below: "No spam. Release notes only. Unsubscribe anytime."
  DM Sans 12px, #9B9A96, italic

RSS LINK (far right, subtle):
  "RSS" text + Lucide Rss icon, 14px, #9B9A96
  Hover: color → #0A0A0A
  Aligns top-right of hero area

VERSION DISPLAY (optional, sophisticated touch):
  "Current version: v1.4.2"
  DM Sans 12px, monospace, #9B9A96
  Small badge style
```

---

#### SECTION 2: Filter Bar

```
Background: white
Sticky: position sticky, top: 60px (below nav)
Border-bottom: 1px solid #E4E3DF
Padding: 0 var(--pad-x)

FILTER PILLS:
  Horizontal scrollable row (mobile)
  Gap: 8px, overflow-x: auto

  Categories with count:
    [All (24)]
    [✨ New Feature (8)]
    [⚡ Improvement (10)]
    [🐛 Bug Fix (5)]
    [🔌 API (3)]
    [⚙️ Performance (2)]
    [⚠️ Breaking Change (1)]    ← Always visible even if count is 0

  PILL DESIGN (different from tab — use pill not underline):
    Default: #F2F1EE background, #6B6A67 text, border-radius: 100px
    Active: Color-coded by category (see below)

  CATEGORY COLORS:
    New Feature:    #E8F5EE bg / #1A6B3C text (green)
    Improvement:    #EEF2FF bg / #4F46E5 text (indigo)
    Bug Fix:        #FDECEA bg / #C84B31 text (red)
    API:            #F0F9FF bg / #0369A1 text (blue)
    Performance:    #FFF7ED bg / #C2410C text (orange)
    Breaking Change: #FEF2F2 bg / #991B1B text (dark red)

SEARCH INPUT (right side of filter bar):
  Lucide Search icon + "Search changelog..." placeholder
  DM Sans 13px, border: 1px solid #E4E3DF
  Width: 200px, collapses to icon-only on mobile
  Real-time filter: debounced 300ms, matches against entry titles + descriptions
```

---

#### SECTION 3: Changelog Feed (Main Content)

**Layout Concept: Publication Timeline**

```
The changelog uses a LEFT RAIL TIMELINE design.
This is the same pattern used by:
  → GitHub releases page
  → Vercel changelog
  → Linear's changelog
  → Stripe's API changelog

WHY THIS PATTERN:
  → Date is always visible (answers "when was this?")
  → Category is always visible (answers "what type of change?")
  → Can scan quickly by looking only at the left rail
  → Scales infinitely (just add more entries)
  → Mobile degrades gracefully (rail moves to top)

LAYOUT:
  Max-width: 1000px, centered
  2-column grid:
    Left rail: 200px fixed width
    Right content: flex 1

  LEFT RAIL (date + metadata):
    Sticky per month header
    Date: DM Sans 13px, 600, #0A0A0A
    Month label: DM Sans 11px, uppercase, #9B9A96, margin-bottom: 8px

    TIMELINE LINE:
      2px wide vertical line, #E4E3DF
      Runs the full height of the rail
      At each entry: 8px circle dot on the line, white fill, 2px brand-green border
      
    CATEGORY BADGE:
      Below date in the left rail
      Pill badge: "✨ New Feature" with color coding (see above)
      Font: DM Sans 11px, 600

  RIGHT CONTENT:
    Padding-left: 40px
    Padding-bottom: 48px (separation between entries)
    Border-left: 2px solid #E4E3DF (matches the timeline line)

ENTRY ANATOMY:
  ┌─────────────────┬──────────────────────────────────────────┐
  │  May 14, 2026   │  ⚡ Improvement                           │
  │                 ├──────────────────────────────────────────┤
  │  (timeline dot) │  HEADLINE                                 │
  │                 │  Jira integration now auto-matches        │
  │                 │  assignees by email                       │
  │                 │                                           │
  │                 │  BODY                                     │
  │                 │  Previously, Jira tickets were created    │
  │                 │  without an assignee unless you manually  │
  │                 │  configured the mapping. Now Vocaply      │
  │                 │  automatically matches team member emails  │
  │                 │  to Jira user accounts...                 │
  │                 │                                           │
  │                 │  [SCREENSHOT if applicable]               │
  │                 │                                           │
  │                 │  BEFORE/AFTER or CODE DIFF if applicable  │
  └─────────────────┴──────────────────────────────────────────┘

ENTRY HEADLINE:
  DM Sans 18px, 600, #0A0A0A
  Margin-bottom: 8px

ENTRY BODY:
  DM Sans 14px, #6B6A67, line-height 1.7
  Max 4-5 sentences. Changelog entries are short and specific.
  Links within body: #1A6B3C, underline on hover

ENTRY SCREENSHOTS (when applicable):
  Present for: New Feature entries, major UI changes
  Absent for: Bug fixes, performance improvements, minor tweaks
  
  Format:
    Inline, full width of right column
    Border: 1px solid #E4E3DF
    Border-radius: 8px
    Margin-top: 16px
    Box-shadow: --shadow-sm
    Max-height: 400px, object-fit: contain (no cropping)
    Lazy loading: loading="lazy"

ENTRY CODE DIFF (for API changes):
  Small code block
  Background: #F2F1EE
  Removed lines: red left border + red background tint
  Added lines: green left border + green background tint
  Font: Fira Code or JetBrains Mono, 12px

ENTRY LINKS:
  Below body text:
  "→ See documentation" (if links to docs)
  "→ View in dashboard" (if links to specific dashboard feature)
  DM Sans 13px, #1A6B3C

MONTH GROUPING:
  Between entries from different months:
  Month separator: DM Sans 12px, 600, uppercase, #9B9A96
  Left-aligned in the left rail
  "May 2026" / "April 2026" etc.
  Not a visual divider line — just a label change in the rail
```

---

**ACTUAL CHANGELOG ENTRIES (mock content for design):**

These entries define what the page will actually look like when built:

```
ENTRY 1 — May 14, 2026 — New Feature:
  Headline: "Linear integration is now live"
  Body: "Commitment action items from meetings now automatically create Linear issues.
         Assignees are matched by email, priority is mapped from AI extraction,
         and when an issue is closed in Linear, the commitment is auto-fulfilled in Vocaply."
  Screenshot: Linear issue showing Vocaply attribution
  Link: "→ Set up Linear"

ENTRY 2 — May 10, 2026 — Improvement:
  Headline: "Jira tickets now include meeting context in the description"
  Body: "Previously, Jira issues created by Vocaply had a minimal description.
         Now every ticket includes the meeting name, date, and a short quote from
         the transcript where the action item was mentioned."
  No screenshot (minor improvement, text description sufficient)

ENTRY 3 — May 7, 2026 — Bug Fix:
  Headline: "Fixed: Google Calendar sync missing meetings created outside working hours"
  Body: "A bug caused Vocaply to miss calendar events scheduled before 8 AM or after 6 PM UTC.
         This is now fixed. The sync window is 24 hours."
  No screenshot

ENTRY 4 — May 2, 2026 — API:
  Headline: "New: GET /api/v1/commitments/stats endpoint"
  Body: "Fetch team commitment statistics programmatically. Returns fulfillment rate,
         missed count, and trend data for a configurable time period."
  Code block: shows the endpoint + response schema

ENTRY 5 — April 28, 2026 — Performance:
  Headline: "Dashboard loads 40% faster on teams with 100+ meetings"
  Body: "We re-indexed the commitments table and optimized the analytics query.
         Teams with large meeting histories will notice significantly faster load times."
  No screenshot

ENTRY 6 — April 22, 2026 — Improvement:
  Headline: "Commitment score now updates in real time"
  Body: "When a commitment is marked fulfilled, your score updates immediately in the
         dashboard without requiring a page refresh. Powered by our WebSocket event system."
  Screenshot: Score ring animating up (GIF/video)

ENTRY 7 — April 15, 2026 — New Feature:
  Headline: "Cross-meeting memory: Commitments now carry forward automatically"
  Body: "This is our biggest feature yet. When Ahmed says 'I finished the login feature'
         in this week's standup, Vocaply automatically links it to last week's promise
         and marks it fulfilled — without any manual intervention."
  Screenshot: Commitment timeline view showing cross-meeting resolution
  Link: "→ How it works"
```

---

#### SECTION 4: Subscribe Block

```
Background: #F2F1EE
Padding: 48px var(--pad-x)
Max-width: 600px, centered
Border-radius: 12px
Margin: 64px auto

Icon: Lucide Mail, 32px, #1A6B3C
HEADLINE: "Stay up to date"
  DM Sans 20px, 600

BODY:
  "New releases directly to your inbox. No marketing emails, just changelog updates."
  DM Sans 14px, #6B6A67

INPUT ROW:
  Same as hero subscribe (email + button)
  Input: full width
  Button: "Subscribe to changelog"

SOCIAL OPTION:
  "Or follow on X (Twitter) →"
  DM Sans 13px, #9B9A96, linked
```

---

#### SECTION 5: RSS + Developer Footer

```
Background: white
Border-top: 1px solid #E4E3DF
Padding: 24px var(--pad-x)
Display: flex, justify-content: space-between

Left:
  "© 2026 Vocaply"
  DM Sans 12px, #9B9A96

Right:
  "RSS Feed" → Lucide Rss icon + text, link to /changelog/feed.xml
  DM Sans 13px, #9B9A96, hover → #0A0A0A
  "API Changelog" → links to /docs/api-changelog (separate page)
```

---

### 4.4 Visual Assets — Pictures, Icons & Sources

#### WHAT SCREENSHOTS ARE NEEDED AND WHERE

```
ENTRY: "Linear integration is now live" (May 14):
  TYPE:         UI mockup of Linear issue
  WHAT SHOWS:   Linear issue "Fix payment bug" created by Vocaply
                Shows: Title, Assignee (Ahmed Hassan), Priority (High),
                       Status (Todo), Label: "from-standup", Comment from Vocaply
  FILE:         /public/images/changelog/linear-integration-launch.png
  HOW TO CREATE: HTML/CSS mockup OR Figma export
                 Linear's UI uses Inter font + very clean minimalist design
                 Easy to recreate accurately in HTML/CSS

ENTRY: "Commitment score updates in real time" (April 22):
  TYPE:         Animated GIF or short MP4 video (< 2MB)
  WHAT SHOWS:   Score ring (0-100 donut gauge) animating from 78 → 85
                Side panel shows "Ahmed Hassan marked commitment fulfilled"
                Score updates without page reload
  FILE:         /public/images/changelog/realtime-score-update.gif
  HOW TO CREATE: Screen record of actual dashboard feature once built
                 OR: CSS animation exported as GIF using screen recording
                 Tool: Kap (macOS, free) for GIF recording at 15fps

ENTRY: "Cross-meeting memory" (April 15):
  TYPE:         Static screenshot, most important visual asset on changelog
  WHAT SHOWS:   Commitment timeline component
                Timeline shows: "Committed (Monday)" → "Mentioned (Wednesday)" → "Fulfilled (Thursday)"
                Green line connecting the three meetings
                Small meeting thumbnails at each point
  FILE:         /public/images/changelog/cross-meeting-memory.png
  HOW TO CREATE: Build the CommitmentTimeline component first, screenshot it
                 OR: Figma mockup of the component
  SIZE:         1200px wide (retina: 2400px, served at 1200px display size)

HERO SECTION — No image needed:
  Intentionally image-free. Editorial style. Text is the hero.
  A changelog page with a hero image looks like marketing, not documentation.
  Reference: Vercel changelog, Linear changelog — both text-only heroes.
```

#### WHERE TO SOURCE BACKGROUND ILLUSTRATIONS (if needed)

```
If any section needs a decorative background pattern:
  Source: Hero Patterns (heropatterns.com) — free SVG patterns
  Alternative: CSS-only dot grid pattern (no external dependency)
  
  CSS dot grid:
    background-image: radial-gradient(#E4E3DF 1px, transparent 1px);
    background-size: 24px 24px;
  
  Used subtly behind the subscribe block or API section.
  NOT used on the main feed (would distract from content).

For any illustration (if added):
  Source: unDraw.co — free, open-source illustrations
  Style: Flat, geometric, professional
  Color: Set primary color to #1A6B3C before downloading
  Specific illustration: "product changelog" or "notification" style
```

#### ICONS USED ON CHANGELOG PAGE

```
LUCIDE REACT ICONS:
  Rss            → RSS feed link
  Mail           → Subscribe section
  Search         → Filter bar search input
  ExternalLink   → "View in dashboard" links
  ChevronDown    → Expand long entries (if truncated)
  ArrowLeft      → Back button on individual entry permalink page
  Tag            → Category filter section header
  Calendar       → Date display
  GitCommit      → Timeline dot icon (optional — instead of generic circle)
  Sparkles       → "New Feature" category icon (✨ equivalent)
  Bug            → "Bug Fix" category icon
  Zap            → "Improvement" category icon
  Code2          → "API" category icon
  Gauge          → "Performance" category icon
  AlertTriangle  → "Breaking Change" category icon

CATEGORY EMOJI ICONS (alternative to Lucide, more visual personality):
  ✨ New Feature
  ⚡ Improvement
  🐛 Bug Fix
  🔌 API
  ⚙️ Performance
  ⚠️ Breaking Change
  
  These emoji work well at small sizes in category badges.
  They add personality without requiring custom icon design.
  Consistent with how Vercel and Linear's changelog uses emojis.
```

---

### 4.5 Component Architecture

```
PAGE FILE:
  app/(marketing)/changelog/page.tsx
    → Generates page from content data
    → Passes sorted entries to ChangelogFeed

COMPONENTS TO BUILD:
  components/marketing/sections/
    ChangelogHero.tsx              ← Hero with subscribe input + version badge
    ChangelogFilterBar.tsx         ← Sticky category filter + search
    ChangelogFeed.tsx              ← Full timeline feed
    ChangelogSubscribeBlock.tsx    ← Mid-page email subscribe CTA

  components/marketing/ui/
    ChangelogEntry.tsx             ← Single changelog entry (reusable)
    ChangelogEntryHeader.tsx       ← Date + category badge + headline
    ChangelogCategoryBadge.tsx     ← Color-coded pill badge per category
    ChangelogTimelineDot.tsx       ← Dot on the vertical timeline line
    ChangelogMonthDivider.tsx      ← "May 2026" section separator in rail
    ChangelogCodeDiff.tsx          ← For API changes: red/green code diff
    ChangelogScreenshot.tsx        ← Image with border + lazy load + lightbox
    ChangelogEntrySearch.tsx       ← Debounced search input in filter bar

HOOKS:
  hooks/marketing/useChangelogFilter.ts
    State:   activeCategory (string), searchQuery (string)
    Derived: filteredEntries (array)
    URL sync: ?category=new-feature&q=jira (bookmarkable filtered view)

  hooks/marketing/useChangelogIntersection.ts
    Watches month sections via IntersectionObserver
    Updates URL hash as user scrolls through months (#may-2026)

DATA FILE:
  lib/marketing/content/changelog.content.ts
    ChangelogEntry type:
      date: string (ISO: "2026-05-14")
      title: string
      category: ChangelogCategory enum
      body: string (can include markdown)
      imageUrl?: string
      imageAlt?: string
      isVideo?: boolean
      links?: Array<{ label: string; href: string }>
      isHighlight?: boolean   (first 2-3 entries are highlighted more prominently)

FUTURE: RSS FEED GENERATION
  app/(marketing)/changelog/feed.xml/route.ts
    → Server-side RSS XML generator
    → Uses same content data file
    → Returns: application/rss+xml
    → Listed in <head>: <link rel="alternate" type="application/rss+xml" href="/changelog/feed.xml">
```

---

### 4.6 Interaction & Animation Patterns

```
FILTER / SEARCH:
  Category pill click: 
    Active category highlighted (150ms color transition)
    Entries filter with Framer Motion layout animations (same as Integrations page)
    Filtered-out entries: opacity 0 + height 0 over 200ms
    Count in pill badge updates (e.g., "Bug Fix (5)" → just "Bug Fix (5)" active)

  Search input:
    Debounced 300ms
    Real-time highlight: matching text in entry titles gets <mark> styling
    mark { background: #FEF9C3; border-radius: 2px; padding: 0 2px; }
    "No results" empty state if no entries match

TIMELINE SCROLL BEHAVIOR:
  As user scrolls down the timeline:
    IntersectionObserver detects which entries are visible
    URL hash updates silently: #may-2026 → #april-2026
    Allows bookmarking a specific month without losing filter state

ENTRY REVEAL:
  Each entry fades up as it enters viewport
  Timing: 300ms, ease: easeOut
  Stagger: 50ms between consecutive entries (subtle — they're close together)
  Timeline dot: scales from 0 → 1 when entry enters viewport (200ms, bounce easing)

SCREENSHOT LIGHTBOX:
  Clicking a changelog screenshot opens it full-screen
  Dark overlay: rgba(0,0,0,0.8)
  Image: max-width 90vw, max-height 90vh, centered
  Close: click outside, press Escape, or × button
  No third-party library needed — custom implementation with Framer Motion
  Image gets a subtle zoom: scale(1) on click → scale(1.02) in lightbox (100ms)

SUBSCRIBE FORM:
  On submit: button text changes to "Sending..." with spinner
  On success: form replaced with "You're subscribed! 🎉" + green checkmark
  On error: red inline error message below input

VERSION BADGE (in hero):
  Subtle hover: shows tooltip "Latest release date: May 14, 2026"
  No animation needed — just a title attribute or Tooltip component
```

---

### 4.7 Mobile Strategy

```
HERO:
  Subscribe input: stacks to full-width input above button
  RSS link: moves below subscribe form
  Version badge: visible, same size

FILTER BAR:
  Horizontal scroll (same pattern as Integrations page tabs)
  Search input: icon-only button that expands to full search on tap
    (saves horizontal space on mobile)
  No sticky on mobile (wastes too much screen height)

FEED — Timeline:
  CRITICAL CHANGE: Rail layout collapses on mobile
  
  Mobile layout (< 768px):
    Timeline line: hidden (too narrow to be useful)
    Date + category badge: above headline (not in side rail)
    Content: full width
    
    Entry structure on mobile:
      [Date] [Category badge]
      [Headline]
      [Body]
      [Screenshot]
      [Links]
    
    Separator between entries: 1px border-bottom

SCREENSHOTS:
  Full width on mobile (no max-width constraint)
  Swipeable if multiple screenshots in one entry (swipe gesture, no library)

SUBSCRIBE BLOCK:
  Full width, no border-radius on mobile (edge-to-edge feel)
```

---

## 5. Shared Design System Tokens

Both pages use Vocaply's existing tokens. These are additions/reminders:

```
NEW TOKEN: changelog category colors (add to globals.css)
  --category-new-feature:  #1A6B3C    (green, same as brand)
  --category-improvement:  #4F46E5    (indigo)
  --category-bug-fix:      #C84B31    (red, same as error)
  --category-api:          #0369A1    (blue)
  --category-performance:  #C2410C    (orange)
  --category-breaking:     #991B1B    (dark red)

  --category-new-feature-bg:  #E8F5EE
  --category-improvement-bg:  #EEF2FF
  --category-bug-fix-bg:      #FDECEA
  --category-api-bg:          #F0F9FF
  --category-performance-bg:  #FFF7ED
  --category-breaking-bg:     #FEF2F2

NEW COMPONENT PATTERN: Lightbox overlay
  --lightbox-bg: rgba(0, 0, 0, 0.85)
  Standard close button: white ×, 24px, top-right corner

RETAINED PATTERNS:
  → Section alternating backgrounds (white / #F2F1EE)
  → Sticky elements at top: 60px (below topbar)
  → Max-width: 1120px for main content, 600px for narrow sections
  → Section padding: clamp(60px, 8vw, 100px)
  → Border-radius: 10px for cards, 100px for pills
```

---

## 6. SEO & Metadata Strategy

### Integrations Page

```
<title>Integrations — Vocaply connects with Jira, Slack, Zoom & more</title>

<meta name="description" content="Vocaply integrates with 14+ tools your team already uses:
Jira, Slack, Linear, Notion, Google Calendar, Zoom, Google Meet, and Microsoft Teams.
One-click OAuth setup.">

Open Graph:
  og:title:   "Vocaply Integrations — Works with your entire stack"
  og:image:   /public/og-images/integrations.png
              (Custom OG image: logos of top 6 integrations in a grid)
  og:type:    website

Keywords targeted:
  "jira standup integration"
  "slack meeting accountability"
  "zoom meeting action items"
  "AI meeting notes jira"
  "standup tracker integrations"
  "meeting bot google calendar"

JSON-LD (SoftwareApplication integration list):
  @type: SoftwareApplication
  applicationSubCategory: [
    "Jira Integration", "Slack Integration", "Google Calendar Integration"
  ]
  offers: { ... }

Per-integration anchor metadata:
  Each deep-dive section gets its own headings structure:
  <h2 id="jira-integration">Jira Integration</h2>
  → Enables direct Google links to specific integrations
  → Competitive terms: "Vocaply Jira" will index to this section
```

### Changelog Page

```
<title>Changelog — What's new in Vocaply</title>

<meta name="description" content="Follow every improvement, bug fix, and new feature
in Vocaply. Updated with each release.">

RSS Autodiscovery (in <head>):
  <link rel="alternate" type="application/rss+xml"
        title="Vocaply Changelog"
        href="https://vocaply.com/changelog/feed.xml">

robots meta:
  <meta name="robots" content="index, follow">
  → Changelog should be fully indexed (trust signal for Google)

JSON-LD (Blog/Article list):
  @type: Blog
  blogPost: [array of recent entries as Article type]
  → Enables rich results for recent changelog entries in search

Canonical URL per month:
  When URL contains hash (#may-2026):
  canonical: https://vocaply.com/changelog (not the hash version)

Sitemap entry:
  <url>
    <loc>https://vocaply.com/changelog</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
```

---

## 7. File Structure in Monorepo

```
apps/web/
│
├── src/
│   ├── app/
│   │   └── (marketing)/
│   │       ├── integrations/
│   │       │   └── page.tsx                   ← Integrations page (SSG + ISR)
│   │       └── changelog/
│   │           ├── page.tsx                   ← Changelog main page
│   │           └── feed.xml/
│   │               └── route.ts               ← RSS feed generator
│   │
│   ├── components/
│   │   └── marketing/
│   │       ├── sections/
│   │       │   ├── IntegrationsHero.tsx
│   │       │   ├── IntegrationsTabFilter.tsx
│   │       │   ├── IntegrationsGrid.tsx
│   │       │   ├── IntegrationDeepDive.tsx    ← Reusable (pass props per integration)
│   │       │   ├── IntegrationsAPISection.tsx
│   │       │   ├── IntegrationsHowItWorks.tsx
│   │       │   ├── IntegrationRequestForm.tsx
│   │       │   ├── ChangelogHero.tsx
│   │       │   ├── ChangelogFilterBar.tsx
│   │       │   ├── ChangelogFeed.tsx
│   │       │   └── ChangelogSubscribeBlock.tsx
│   │       │
│   │       └── ui/
│   │           ├── IntegrationCard.tsx
│   │           ├── IntegrationCategoryBadge.tsx
│   │           ├── LiveStatusBadge.tsx
│   │           ├── MockJiraTicket.tsx
│   │           ├── MockSlackMessage.tsx
│   │           ├── MockCalendarEvent.tsx
│   │           ├── CodeBlock.tsx
│   │           ├── ConnectionFlowStep.tsx
│   │           ├── ChangelogEntry.tsx
│   │           ├── ChangelogCategoryBadge.tsx
│   │           ├── ChangelogTimelineDot.tsx
│   │           ├── ChangelogMonthDivider.tsx
│   │           ├── ChangelogCodeDiff.tsx
│   │           └── ChangelogScreenshot.tsx    ← With built-in lightbox
│   │
│   ├── hooks/
│   │   └── marketing/
│   │       ├── useIntegrationFilter.ts
│   │       ├── useChangelogFilter.ts
│   │       └── useChangelogIntersection.ts
│   │
│   └── lib/
│       └── marketing/
│           └── content/
│               ├── integrations-page.content.ts  ← All integration data
│               └── changelog.content.ts           ← All changelog entries
│
└── public/
    ├── icons/
    │   ├── zoom.svg
    │   ├── google-meet.svg
    │   ├── teams.svg
    │   ├── slack.svg
    │   ├── jira.svg
    │   ├── linear.svg
    │   ├── notion.svg
    │   ├── google-calendar.svg
    │   ├── outlook.svg
    │   ├── github.svg
    │   ├── asana.svg
    │   ├── clickup.svg
    │   ├── webex.svg
    │   └── zapier.svg
    │
    ├── images/
    │   ├── integrations/
    │   │   ├── jira-ticket-mockup.png           ← Build in HTML/CSS, screenshot
    │   │   ├── slack-channel-mockup.png
    │   │   ├── slack-dm-mockup.png
    │   │   ├── calendar-event-mockup.png
    │   │   └── api-response-example.png
    │   │
    │   └── changelog/
    │       ├── linear-integration-launch.png
    │       ├── realtime-score-update.gif
    │       └── cross-meeting-memory.png
    │
    └── og-images/
        ├── integrations.png                     ← 1200×630 OG image
        └── changelog.png                        ← 1200×630 OG image
```

---

## 8. Implementation Order

### Day 1: Setup & Content Files

```
Priority: Foundation before UI

1.1  Create content data file for integrations:
     lib/marketing/content/integrations-page.content.ts
     → Define IntegrationItem type
     → Add all 14 integrations with metadata

1.2  Create content data file for changelog:
     lib/marketing/content/changelog.content.ts
     → Define ChangelogEntry type with category enum
     → Write 7–10 realistic changelog entries (mock content)

1.3  Download and optimize all integration logos:
     → Get from official brand kits (sources listed above)
     → Optimize SVGs: remove unnecessary metadata (SVGO)
     → Store in /public/icons/

1.4  Create page route files (empty stubs):
     app/(marketing)/integrations/page.tsx
     app/(marketing)/changelog/page.tsx
```

### Day 2: Integrations Page Core Components

```
2.1  IntegrationCard.tsx + LiveStatusBadge.tsx
     → Card grid item with logo, name, category, description, status
     → Test with 3 example cards, verify hover states

2.2  IntegrationsGrid.tsx
     → Grid container with auto-fill columns
     → Accepts filtered array of IntegrationItem

2.3  IntegrationsTabFilter.tsx
     → Tab strip with sticky behavior
     → Filter state via useIntegrationFilter hook
     → URL param sync (?category=jira)

2.4  IntegrationsHero.tsx
     → Eyebrow, headline, subheadline
     → Logo marquee (CSS animation, not JS)
     → Fade-edge mask CSS

2.5  Wire together in integrations/page.tsx
     → Verify SSG render
     → Lighthouse pass
```

### Day 3: Integration Deep-Dive Components

```
3.1  MockJiraTicket.tsx
     → HTML/CSS recreation of Jira ticket UI
     → NOT a screenshot (CSS is better for scalability)
     → Screenshot via MockBrowserFrame wrapper

3.2  MockSlackMessage.tsx
     → Block Kit-style Slack channel message
     → Separate component: SlackDMMessage
     → Both in phone-style frame (CSS, not image)

3.3  MockCalendarEvent.tsx
     → Google Calendar event card
     → Vocaply bot listed as attendee
     → Privacy notice banner below

3.4  IntegrationDeepDive.tsx
     → 2-column layout (text left, visual right)
     → Props: headline, bullets, visual, config preview
     → Reused 3 times with different props

3.5  IntegrationsHowItWorks.tsx + IntegrationsAPISection.tsx
     → 3-step connection flow
     → Code block with syntax highlighting
```

### Day 4: Changelog Page Core Components

```
4.1  ChangelogCategoryBadge.tsx
     → Color-coded pill with emoji icon
     → All 6 categories with correct colors

4.2  ChangelogEntry.tsx
     → Full entry layout (date, badge, headline, body, screenshot, links)
     → Screenshot component with lightbox trigger
     → Code diff component (red/green)

4.3  ChangelogTimelineDot.tsx + ChangelogMonthDivider.tsx
     → Timeline dot that animates on entry into viewport
     → Month label for the left rail

4.4  ChangelogFeed.tsx
     → Full feed with 2-column timeline layout
     → Group entries by month
     → Pass to ChangelogEntry components

4.5  ChangelogFilterBar.tsx + useChangelogFilter hook
     → Category filter + search
     → Debounced search (300ms)
     → URL param sync
```

### Day 5: Polish, Animations & SEO

```
5.1  Add Framer Motion layout animations to IntegrationsGrid
     → Cards animate position when filtered
     → Test at 375px, 768px, 1440px

5.2  Add scroll reveals to all deep-dive sections
     → useScrollReveal hook (already built)
     → Verify threshold and timing

5.3  Add lightbox to ChangelogScreenshot
     → Framer Motion modal
     → Keyboard: Escape to close

5.4  SEO metadata for both pages
     → <title>, <meta description>, OG tags
     → JSON-LD
     → Sitemap entries

5.5  RSS feed route
     → app/(marketing)/changelog/feed.xml/route.ts
     → Returns valid RSS XML

5.6  Accessibility pass:
     → Tab navigation through filter tabs
     → Lightbox focus trap
     → Logo marquee: prefers-reduced-motion stops animation
     → aria-label on icon-only buttons

5.7  Lighthouse check on both pages
     → Target: Performance ≥ 90, SEO = 100, Accessibility ≥ 95
```

---

## Summary: Pages at a Glance

```
INTEGRATIONS PAGE:
  Purpose:        Remove purchase objection "does it work with X?"
  Target users:   Engineering managers, CTOs, Operations leads, Developers
  Key visual:     Scrolling logo marquee + 3 deep-dive mockup screenshots
  Conversion:     CTA after each integration deep-dive → "Start free trial"
  Sections:       8 (Hero, Tab Filter, Grid, 3 Deep-Dives, How It Works, API, Request)
  Components:     14 new components
  Images needed:  4 UI mockups (Jira ticket, Slack channel, Slack DM, Calendar event)
  Icons:          14 integration SVG logos + 8 Lucide icons
  Sources:        Official brand kits (linked above)

CHANGELOG PAGE:
  Purpose:        Build credibility through shipping frequency transparency
  Target users:   Existing customers, trial users evaluating, developers
  Key visual:     Left-rail timeline — editorial, publication-style
  Conversion:     Subscribe CTA → email list growth, retention
  Sections:       5 (Hero, Filter Bar, Feed, Subscribe, Footer)
  Components:     9 new components
  Images needed:  3 screenshots (Linear launch, score animation GIF, memory feature)
  Icons:          6 category emoji + 7 Lucide icons
  Animation:      Subtle — timeline dots, entry reveals, no page-load sequences

SHARED PATTERNS:
  → Same tab/filter UX pattern (reduces cognitive load across pages)
  → Same sticky behavior at 60px from top
  → Same Framer Motion layout animation for filtering
  → Same scroll reveal behavior
  → Same mobile collapse rules

BUILD TIME ESTIMATE:
  Integrations page:  4 days (heavy on mock UI components)
  Changelog page:     2 days (simpler component structure, data-driven)
  Polish & SEO:       1 day (shared across both)
  Total:              7 days working solo at 8h/day
```

---

*Document: UI-PLAN-003 | Vocaply | Integrations & Changelog Pages*
*Version: 1.0 | June 2026 | Solo Developer Edition*
*Design system: Instrument Serif + DM Sans | Brand green: #1A6B3C | Stack: Next.js 14 + Tailwind + Framer Motion*
