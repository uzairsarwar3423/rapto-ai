/**
 * security.content.ts
 * Data for SecuritySection — 4 cards + compliance badges.
 * iconName maps to lucide-react component.
 */

export interface SecurityClaim {
  iconName: string;
  title: string;
  description: string;
  hasNote?: string;
}

export const securityClaims: SecurityClaim[] = [
  {
    iconName: "Lock",
    title: "End-to-end encryption",
    description:
      "All meeting data encrypted in transit (TLS 1.3) and at rest (AES-256). Your transcripts are yours alone.",
  },
  {
    iconName: "ShieldOff",
    title: "No AI training on your data",
    description:
      "Vocaply never uses your meeting transcripts to train AI models. Your conversations stay private and are processed only for extraction.",
  },
  {
    iconName: "FileCheck",
    title: "GDPR compliant",
    description:
      "Data deletion on request. Data export available at any time. EU data residency options available on Business plan.",
  },
  {
    iconName: "BadgeCheck",
    title: "SOC 2 Type II",
    description:
      "Security audit underway. Expected certification Q3 2026.",
    hasNote: "(Certification in progress — expected Q3 2026)",
  },
];

export const complianceBadges = [
  { label: "GDPR", muted: false },
  { label: "TLS 1.3", muted: false },
  { label: "AES-256", muted: false },
  { label: "SOC 2 ↗", muted: true },
];
