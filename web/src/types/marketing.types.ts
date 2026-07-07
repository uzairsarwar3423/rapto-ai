// ============================================================
// Rapto Marketing — Shared TypeScript Types
// Used by: content files, UI components, section components
// ============================================================

// ── Navigation ───────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  isExternal?: boolean;
  isAnchor?: boolean;   // smooth scroll to section id
}

export interface NavConfig {
  links: NavItem[];
  rightLinks: {
    signIn: string;
    trial: string;
  };
}

// ── Hero ─────────────────────────────────────────────────────

export interface HeroContent {
  announcementText: string;
  announcementLinkText: string;
  announcementLinkHref: string;
  badgeText: string;
  headlinePart1: string;
  headlineAccent: string;
  subheadline: string;
  primaryCTA: CTAButton;
  secondaryCTA: CTAButton;
  trustNote: string;
}

export interface CTAButton {
  text: string;
  href: string;
}

// ── Social Proof ─────────────────────────────────────────────

export interface Integration {
  name: string;
  iconPath: string;
  iconAlt: string;
}

// ── Product Showcase ─────────────────────────────────────────

export type ProductTab = {
  id: "commitments" | "meeting-detail" | "team-health";
  label: string;
};

// ── Commitment Row (mock UI) ──────────────────────────────────

export type CommitmentStatus =
  | "MISSED"
  | "FULFILLED"
  | "PENDING"
  | "DEFERRED"
  | "DUE_TODAY"
  | "RECORDING";

export interface CommitmentItem {
  status: CommitmentStatus;
  ownerName: string;
  commitmentText: string;
  sourceText: string;
  icon: string;
  animationDelay?: number;
}

// ── Problem Statement ─────────────────────────────────────────

export interface ProblemItem {
  icon: string;
  text: string;
  highlightedText?: string;
}

// ── How It Works ─────────────────────────────────────────────

export interface StepItem {
  number: string;     // "01" | "02" | "03"
  icon: string;       // emoji
  title: string;
  description: string;
}

// ── Features ─────────────────────────────────────────────────

export interface FeatureCard {
  icon: string;       // emoji
  title: string;
  description: string;
}

// ── AI Capabilities ──────────────────────────────────────────

export interface AIClaim {
  icon: string;       // emoji
  title: string;
  description: string;
}

export interface ExtractionSentence {
  part1: string;      // "I'll "
  part2: string;      // "finish the login feature "
  part3: string;      // "by Thursday"
}

export interface AICapabilitiesContent {
  claims: AIClaim[];
  accuracyBadgeText: string;
  extractionSentence: ExtractionSentence;
}

// ── Team Health (mock UI) ─────────────────────────────────────

export interface TeamMember {
  name: string;
  initial: string;
  score: number;        // 0–100
  scoreColor: "green" | "amber" | "red";
}

// ── Testimonial ───────────────────────────────────────────────

export interface TestimonialCard {
  quote: string;
  authorName: string;
  authorRole: string;
  authorCompany: string;
  avatarInitial: string;
  rating?: number;      // 1–5 stars
}

// ── Section Heading ───────────────────────────────────────────

export interface SectionHeadingProps {
  text: string;         // Use |word| syntax for italic-green accent
  as?: "h1" | "h2" | "h3";
  className?: string;
  accentColor?: string; // defaults to accent green, use light green for dark bg
}

// ── Day 6: Integrations ──────────────────────────────────────

export interface IntegrationItem {
  name: string;
  emoji: string;
  comingSoon?: boolean;
}

// ── Day 6: Workflow Timeline ──────────────────────────────────

export type WorkflowCalloutType =
  | "recording-pill"
  | "commitment-row"
  | "slack-bubble"
  | "missed-badge"
  | "summary-snippet";

export interface WorkflowStep {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  calloutType: WorkflowCalloutType;
}
