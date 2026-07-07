import type { Metadata } from "next";
import { IntegrationsClientPage } from "./IntegrationsClientPage";

export const metadata: Metadata = {
  title: "Integrations — Rapto connects with Jira, Slack, Zoom & more",
  description:
    "Rapto integrates with 14+ tools your team already uses: Jira, Slack, Linear, Notion, Google Calendar, Zoom, Google Meet, and Microsoft Teams. One-click OAuth setup.",
  keywords: [
    "jira standup integration",
    "slack meeting accountability",
    "zoom meeting action items",
    "AI meeting notes jira",
    "standup tracker integrations",
    "meeting bot google calendar",
  ],
  openGraph: {
    title: "Rapto Integrations — Works with your entire stack",
    description:
      "Rapto integrates with 14+ tools your team already uses: Jira, Slack, Linear, Notion, Google Calendar, Zoom, Google Meet, and Microsoft Teams.",
    url: "https://rapto.ai/integrations",
    type: "website",
  },
};

export default function IntegrationsPage() {
  return <IntegrationsClientPage />;
}
