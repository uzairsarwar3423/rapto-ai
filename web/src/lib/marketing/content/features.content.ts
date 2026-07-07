/**
 * features.content.ts
 * 6 features grid content definitions with Lucide icon names.
 */

export interface FeatureItem {
  iconName: string;
  title: string;
  description: string;
}

export const features: FeatureItem[] = [
  {
    iconName: "GitMerge",
    title: "Cross-meeting memory",
    description:
      "Links promises across multiple meetings. If Ahmed committed in Monday's standup and mentions it again Thursday, the system connects the dots and updates the status automatically.",
  },
  {
    iconName: "Award",
    title: "Commitment scores",
    description:
      "Every team member gets a commitment score calculated from their fulfillment rate over time. Managers get real data for 1:1s instead of going by gut feeling.",
  },
  {
    iconName: "Ticket",
    title: "Auto Jira & Linear tickets",
    description:
      "Every action item from your meeting becomes a Jira or Linear issue — assigned to the right person, with the right due date. Zero copy-paste after standups.",
  },
  {
    iconName: "Search",
    title: "Searchable transcripts",
    description:
      "\"What did we decide about the API last month?\" Search across every meeting ever recorded and find the exact moment it was said — with who said it and when.",
  },
  {
    iconName: "Inbox",
    title: "Smart alerts, not noise",
    description:
      "24 hours before a deadline: reminder to the owner. Deadline missed: alert to owner AND manager. Weekly digest for managers. No more manual follow-up emails.",
  },
  {
    iconName: "Plug",
    title: "Works where you work",
    description:
      "Slack, Jira, Linear, Notion, Google Calendar. Rapto plugs into your existing tools. You don't change your workflow — Rapto fits around it.",
  },
];
