/**
 * benefits.content.ts
 * Data for BenefitsByRole section — 3 persona cards.
 * iconName maps to a lucide-react icon component name.
 */

export interface RoleCardData {
  iconName: string;          // lucide-react icon name, rendered dynamically in RoleCard
  roleLabel: string;
  headline: string;
  bullets: string[];
  ctaText: string;
  ctaHref: string;
}

export const roleCards: RoleCardData[] = [
  {
    iconName: "Users",
    roleLabel: "Engineering Managers",
    headline: "Stop spending Sunday nights writing follow-up emails.",
    bullets: [
      "Data for 1:1s: \"Ali's commitment rate: 65% this sprint\"",
      "Visibility before fires start, not after",
      "2+ hours/week back from manual follow-up",
    ],
    ctaText: "Start free for your team",
    ctaHref: "#",
  },
  {
    iconName: "Layers",
    roleLabel: "Product Managers",
    headline: "Never lose a cross-team commitment again.",
    bullets: [
      "Single source of truth for every cross-team agreement",
      "Proof for every stakeholder conversation — with timestamps",
      "Automated post-meeting summaries to all stakeholders",
    ],
    ctaText: "See how PMs use it",
    ctaHref: "#",
  },
  {
    iconName: "Rocket",
    roleLabel: "Founders",
    headline: "Run a company without hiring a PM yet.",
    bullets: [
      "Track what you promised investors and clients automatically",
      "Team accountability without micromanaging",
      "Scales to 25 people without changing anything",
    ],
    ctaText: "Start free for your team",
    ctaHref: "#",
  },
];
