/**
 * integrations-page.content.ts
 * Content data for the marketing Integrations page.
 */

export type IntegrationCategory =
  | "Video Calls"
  | "Project Management"
  | "Communication"
  | "Calendar"
  | "Note Taking"
  | "Developer API";

export interface IntegrationItem {
  name: string;
  slug: string;
  categories: IntegrationCategory[];
  status: "live" | "coming_soon";
  logoPath: string;
  description: string;
  hasDeepDive: boolean;
  deepDiveAnchor?: string;
}

export interface CategoryTab {
  id: string;
  label: string;
  count: number;
}

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  "Video Calls",
  "Project Management",
  "Communication",
  "Calendar",
  "Note Taking",
  "Developer API",
];

export const integrationsData: IntegrationItem[] = [
  // FEATURED INTEGRATIONS
  {
    name: "Jira",
    slug: "jira",
    categories: ["Project Management"],
    status: "live",
    logoPath: "/icons/jira.svg",
    description: "Create Jira tickets automatically from meeting commitments and sync fulfillment statuses.",
    hasDeepDive: true,
    deepDiveAnchor: "jira-integration",
  },
  {
    name: "Slack",
    slug: "slack",
    categories: ["Communication"],
    status: "live",
    logoPath: "/icons/slack.svg",
    description: "Post automated standup summaries to channels and receive direct DMs for personal commitments.",
    hasDeepDive: true,
    deepDiveAnchor: "slack-integration",
  },
  {
    name: "Google Calendar",
    slug: "google-calendar",
    categories: ["Calendar"],
    status: "live",
    logoPath: "/icons/google-calender.svg", // Note: Spelled 'calender' in public/icons/google-calender.svg
    description: "Sync your meeting schedule automatically and invite the Vocaply bot with zero manual effort.",
    hasDeepDive: true,
    deepDiveAnchor: "calendar-integration",
  },
  // LIVE INTEGRATIONS
  {
    name: "Zoom",
    slug: "zoom",
    categories: ["Video Calls"],
    status: "live",
    logoPath: "/icons/zoom.svg",
    description: "Let Vocaply join your Zoom calls to record, transcribe, and extract accountability metrics.",
    hasDeepDive: false,
  },
  {
    name: "Google Meet",
    slug: "google-meet",
    categories: ["Video Calls"],
    status: "live",
    logoPath: "/icons/google-meet.svg",
    description: "Connect to Google Meet to capture transcriptions and auto-assign tasks directly from discussions.",
    hasDeepDive: false,
  },
  {
    name: "Microsoft Teams",
    slug: "microsoft-teams",
    categories: ["Video Calls"],
    status: "live",
    logoPath: "/icons/teams.svg",
    description: "Enable the Vocaply bot to attend Microsoft Teams meetings and build transcripts seamlessly.",
    hasDeepDive: false,
  },
  {
    name: "Linear",
    slug: "linear",
    categories: ["Project Management"],
    status: "live",
    logoPath: "/icons/linear.svg",
    description: "Streamline engineering standups by converting commitments directly into Linear issues.",
    hasDeepDive: false,
  },
  {
    name: "Notion",
    slug: "notion",
    categories: ["Note Taking"],
    status: "live",
    logoPath: "/icons/notion.svg",
    description: "Export full meeting transcripts, highlights, and action items directly to your Notion database.",
    hasDeepDive: false,
  },
  {
    name: "Outlook Calendar",
    slug: "outlook-calendar",
    categories: ["Calendar"],
    status: "live",
    logoPath: "/icons/outlook.svg",
    description: "Synchronize Outlook calendar events to ensure Vocaply is scheduled for every discussion.",
    hasDeepDive: false,
  },
  // COMING SOON INTEGRATIONS
  {
    name: "GitHub",
    slug: "github",
    categories: ["Developer API", "Project Management"],
    status: "coming_soon",
    logoPath: "/icons/github.svg",
    description: "Link meeting tasks to GitHub issues and pull requests to track development milestones.",
    hasDeepDive: false,
  },
  {
    name: "Asana",
    slug: "asana",
    categories: ["Project Management"],
    status: "coming_soon",
    logoPath: "/icons/asana.svg",
    description: "Keep non-technical teams aligned by porting commitments straight to Asana projects.",
    hasDeepDive: false,
  },
  {
    name: "ClickUp",
    slug: "clickup",
    categories: ["Project Management"],
    status: "coming_soon",
    logoPath: "/icons/clickup.svg",
    description: "Sync goals, tasks, and deadlines with ClickUp workflows directly from meeting transcripts.",
    hasDeepDive: false,
  },
  {
    name: "Webex",
    slug: "webex",
    categories: ["Video Calls"],
    status: "coming_soon",
    logoPath: "/icons/webex.svg",
    description: "Bring Vocaply automated note-taking and assignment features to Cisco Webex spaces.",
    hasDeepDive: false,
  },
  {
    name: "Zapier",
    slug: "zapier",
    categories: ["Developer API", "Communication"],
    status: "coming_soon",
    logoPath: "/icons/zapier.svg",
    description: "Trigger custom multi-step actions across thousands of applications when commitments change.",
    hasDeepDive: false,
  },
];
