import type { Metadata } from "next";
import { IntegrationsClientPage } from "./IntegrationsClientPage";

export const metadata: Metadata = {
  title: "Integrations — Vocaply connects with Jira, Slack, Zoom & more",
  description:
    "Vocaply integrates with 14+ tools your team already uses: Jira, Slack, Linear, Notion, Google Calendar, Zoom, Google Meet, and Microsoft Teams. One-click OAuth setup.",
  keywords: [
    "jira standup integration",
    "slack meeting accountability",
    "zoom meeting action items",
    "AI meeting notes jira",
    "standup tracker integrations",
    "meeting bot google calendar",
  ],
  openGraph: {
    title: "Vocaply Integrations — Works with your entire stack",
    description:
      "Vocaply integrates with 14+ tools your team already uses: Jira, Slack, Linear, Notion, Google Calendar, Zoom, Google Meet, and Microsoft Teams.",
    url: "https://vocaply.com/integrations",
    type: "website",
  },
};

export default function IntegrationsPage() {
  return <IntegrationsClientPage />;
}
