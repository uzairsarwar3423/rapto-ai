import type { HeroContent } from "@/types/marketing.types";

export const heroContent: HeroContent = {
  // ── Announcement bar ────────────────────────────────────────
  announcementText:     "Vocaply for Microsoft Teams — now in beta.",
  announcementLinkText: "Join waitlist →",
  announcementLinkHref: "/waitlist",

  // ── Hero badge ───────────────────────────────────────────────
  badgeText: "AI Meeting Intelligence",

  // ── Headline (rendered as two parts) ────────────────────────
  headlinePart1:  "Your team made promises in that meeting.",
  headlineAccent: "Vocaply remembers them.",

  // ── Subheadline ──────────────────────────────────────────────
  subheadline:
    "AI that joins your standups, extracts every commitment, and alerts your team when deadlines slip — without you lifting a finger.",

  // ── CTAs ─────────────────────────────────────────────────────
  primaryCTA: {
    text: "Start free trial →",
    href: "/register",
  },
  secondaryCTA: {
    text: "See how it works ↓",
    href: "#how-it-works",
  },

  // ── Trust note below CTAs ────────────────────────────────────
  trustNote: "Joins Zoom, Meet & Teams · No credit card · Set up in 5 minutes",
};
