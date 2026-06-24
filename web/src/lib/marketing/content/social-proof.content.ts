/**
 * social-proof.content.ts
 * Integration logos for the SocialProofBar section.
 * Icons live in /public/icons/ — already present in the project.
 */

export interface Integration {
  name: string;
  iconPath: string;
  iconAlt: string;
}

export const integrations: Integration[] = [
  {
    name: "Jira",
    iconPath: "/icons/jira.svg",
    iconAlt: "Jira logo",
  },
  {
    name: "Linear",
    iconPath: "/icons/linear.svg",
    iconAlt: "Linear logo",
  },
  {
    name: "Slack",
    iconPath: "/icons/slack.svg",
    iconAlt: "Slack logo",
  },
  {
    name: "Notion",
    iconPath: "/icons/notion.svg",
    iconAlt: "Notion logo",
  },
  {
    name: "Zoom",
    iconPath: "/icons/zoom.svg",
    iconAlt: "Zoom logo",
  },
  {
    name: "Google Meet",
    iconPath: "/icons/google-meet.svg",
    iconAlt: "Google Meet logo",
  },
  {
    name: "MS Teams",
    iconPath: "/icons/teams.svg",
    iconAlt: "Microsoft Teams logo",
  },
];

export const socialProofLabel = "Trusted by teams using";
