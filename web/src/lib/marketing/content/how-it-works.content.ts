/**
 * how-it-works.content.ts
 * 3-step walk-through content using Lucide icon names.
 * Used for the HowItWorks section cards.
 */

export const howItWorksHeaderLabel = "How it works";
export const howItWorksHeadline = "Three steps. Zero manual work.";
export const howItWorksSubheadline =
  "Rapto runs in the background so your team focuses on the meeting, not on taking notes.";

export interface StepItem {
  number: string;
  iconName: string;
  title: string;
  description: string;
}

export const steps: StepItem[] = [
  {
    number: "01",
    iconName: "CalendarRange",
    title: "Bot joins automatically",
    description:
      "Connect your Google Calendar. Rapto detects every Zoom, Meet, and Teams meeting and sends a bot to join 2 minutes before it starts. No setup per meeting. Ever.",
  },
  {
    number: "02",
    iconName: "Cpu",
    title: "AI extracts what matters",
    description:
      "When the meeting ends, Claude AI reads the full transcript and pulls out every commitment, action item, decision, and blocker — with the owner and deadline attached.",
  },
  {
    number: "03",
    iconName: "BellRing",
    title: "Accountability runs itself",
    description:
      "Deadlines approaching? Slack DM sent. Commitment missed? Manager alerted immediately. Jira tickets created. Your team stays accountable — without you chasing them.",
  },
];
