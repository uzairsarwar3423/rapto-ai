/**
 * integrations.content.ts
 * Data for IntegrationsSection.
 * iconPath = path in /public/icons/ (null = use emoji fallback)
 */

export interface IntegrationItem {
  name: string;
  iconPath: string | null;  // e.g. "/icons/slack.svg" or null for emoji fallback
  emoji: string;            // always present as fallback
  comingSoon?: boolean;
}

export const activeIntegrations: IntegrationItem[] = [
  { name: "Slack",            iconPath: "/icons/slack.svg",       emoji: "💬" },
  { name: "Jira",             iconPath: "/icons/jira.svg",        emoji: "📋" },
  { name: "Linear",           iconPath: "/icons/linear.svg",      emoji: "△" },
  { name: "Notion",           iconPath: "/icons/notion.svg",      emoji: "📝" },
  { name: "Google Calendar",  iconPath: null,                     emoji: "📅" },
  { name: "Outlook Calendar", iconPath: null,                     emoji: "📅" },
  { name: "Zoom",             iconPath: "/icons/zoom.svg",        emoji: "📹" },
  { name: "Google Meet",      iconPath: "/icons/google-meet.svg", emoji: "🎥" },
  { name: "Microsoft Teams",  iconPath: "/icons/teams.svg",       emoji: "💼" },
];

export const comingSoonIntegrations: IntegrationItem[] = [
  { name: "Asana",  iconPath: null, emoji: "🔗", comingSoon: true },
  { name: "GitHub", iconPath: null, emoji: "⭕", comingSoon: true },
];

export const allIntegrations: IntegrationItem[] = [
  ...activeIntegrations,
  ...comingSoonIntegrations,
];
