export interface IntegrationProviderConfig {
  id: string;
  scope: "team" | "personal";
  name: string;
  description: string;
  icon: string;
  consentCopy: string;
  docsUrl: string;
  disconnectConsequence: string;
  comingSoon?: boolean;
  synonyms: readonly string[];
}

export const INTEGRATION_PROVIDERS: readonly IntegrationProviderConfig[] = [
  {
    id: "SLACK",
    scope: "team",
    name: "Slack",
    description: "Broadcast meeting insights and key action items to designated channels automatically.",
    icon: "slack",
    consentCopy: "Vocaply will post summaries, action items, and alerts to Slack channels you specify. We never read messages from your workspace.",
    docsUrl: "/docs/integrations/slack",
    disconnectConsequence: "Disconnecting Slack will stop all meeting insights and action item updates from being posted to your channels.",
    synonyms: ["chat", "slack", "broadcast", "channel"],
  },
  {
    id: "JIRA",
    scope: "team",
    name: "Jira",
    description: "Create and sync tickets from action items.",
    icon: "jira",
    consentCopy: "Vocaply will create Jira tickets from action items and update them when marked complete. We never read other Jira issues.",
    docsUrl: "/docs/integrations/jira",
    disconnectConsequence: "Disconnecting Jira will stop new action items from creating tickets in Jira and break active issue synchronization.",
    synonyms: ["issue tracker", "jira", "tickets", "bugs"],
  },
  {
    id: "LINEAR",
    scope: "team",
    name: "Linear",
    description: "Sync action items directly to Linear teams for issues tracking and project progress.",
    icon: "linear",
    consentCopy: "Vocaply will create issues in your Linear teams and update their status. We only access teams you select.",
    docsUrl: "/docs/integrations/linear",
    disconnectConsequence: "Disconnecting Linear will prevent meeting action items from syncing to your Linear team boards.",
    synonyms: ["issue tracker", "linear", "board", "tasks"],
  },
  {
    id: "NOTION",
    scope: "team",
    name: "Notion",
    description: "Sync structured database minutes and catalog action lists in Notion workspaces.",
    icon: "notion",
    consentCopy: "Vocaply will create pages and sync databases in your Notion workspace. We only read databases you explicitly share with us.",
    docsUrl: "/docs/integrations/notion",
    disconnectConsequence: "Disconnecting Notion will prevent Vocaply from cataloging meeting transcripts or syncing action lists into your Notion database.",
    synonyms: ["notes", "database", "notion", "docs"],
  },
  {
    id: "GOOGLE_CALENDAR",
    scope: "personal",
    name: "Google Calendar",
    description: "Automate meeting parsing. Reads calendar events to join calls and capture transcriptions.",
    icon: "google_calendar",
    consentCopy: "Vocaply will scan your upcoming calendar events to automatically identify and join scheduled video calls. We never modify your calendar.",
    docsUrl: "/docs/integrations/google-calendar",
    disconnectConsequence: "Disconnecting Google Calendar will prevent the Vocaply bot from automatically joining and transcribing your scheduled calls.",
    synonyms: ["schedule", "calendar", "meetings", "google"],
  },
  {
    id: "OUTLOOK_CALENDAR",
    scope: "personal",
    name: "Outlook Calendar",
    description: "Sync Outlook events and join links seamlessly. Coming in a future update.",
    icon: "outlook_calendar",
    consentCopy: "Vocaply will scan your upcoming Outlook calendar events to automatically identify and join scheduled video calls.",
    docsUrl: "/docs/integrations/outlook-calendar",
    disconnectConsequence: "Disconnecting Outlook Calendar will prevent automatic event and meeting synchronization.",
    comingSoon: true,
    synonyms: ["schedule", "calendar", "meetings", "outlook"],
  },
] as const;
