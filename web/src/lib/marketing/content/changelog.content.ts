/**
 * changelog.content.ts
 * Content data for the marketing Changelog page.
 */

export type ChangelogCategory =
  | "new-feature"
  | "improvement"
  | "bug-fix"
  | "api"
  | "performance"
  | "breaking-change";

export interface ChangelogLink {
  label: string;
  href: string;
}

export interface ChangelogEntry {
  date: string; // ISO format "YYYY-MM-DD"
  title: string;
  category: ChangelogCategory;
  body: string; // Markdown / HTML-safe content string
  imageUrl?: string;
  imageAlt?: string;
  isVideo?: boolean;
  links?: ChangelogLink[];
  isHighlight?: boolean;
  codeDiff?: string;
}

export const CHANGELOG_CATEGORY_LABELS: Record<
  ChangelogCategory,
  { label: string; emoji: string }
> = {
  "new-feature": { label: "New Feature", emoji: "✨" },
  improvement: { label: "Improvement", emoji: "⚡" },
  "bug-fix": { label: "Bug Fix", emoji: "🐛" },
  api: { label: "API", emoji: "🔌" },
  performance: { label: "Performance", emoji: "⚙️" },
  "breaking-change": { label: "Breaking Change", emoji: "⚠️" },
};

export const changelogEntries: ChangelogEntry[] = [
  {
    date: "2026-05-14",
    title: "Linear integration is now live",
    category: "new-feature",
    body: "Commitment action items from meetings now automatically create Linear issues. Assignees are matched by email, priority is mapped from AI extraction, and when an issue is closed in Linear, the commitment is auto-fulfilled in Vocaply. Complete your standup lifecycle without switching tabs.",
    imageUrl: "/images/changelog/linear-integration-launch.png",
    imageAlt: "Linear issue showing Vocaply integration integration details",
    links: [
      { label: "Set up Linear", href: "/settings/integrations#linear" }
    ],
    isHighlight: true,
  },
  {
    date: "2026-05-10",
    title: "Jira tickets now include meeting context in the description",
    category: "improvement",
    body: "Previously, Jira issues created by Vocaply had a minimal description. Now every ticket includes the meeting name, date, and a short quote from the transcript where the action item was mentioned, giving engineers instant context on why a ticket was generated.",
    isHighlight: true,
  },
  {
    date: "2026-05-07",
    title: "Fixed: Google Calendar sync missing meetings created outside working hours",
    category: "bug-fix",
    body: "A bug caused Vocaply to miss calendar events scheduled before 8 AM or after 6 PM UTC. This is now fixed. The sync window has been extended to cover 24 hours, ensuring late-night syncs or global team meetings are captured.",
  },
  {
    date: "2026-05-02",
    title: "New: GET /api/v1/commitments/stats endpoint",
    category: "api",
    body: "Fetch team commitment statistics programmatically. Returns fulfillment rate, missed count, and trend data for a configurable time period. Useful for building custom velocity dashboards or reporting summaries.",
    codeDiff: `// GET /api/v1/commitments/stats
{
  "success": true,
  "data": {
    "fulfillmentRate": 0.85,
    "completed": 34,
    "missed": 6,
    "pending": 8,
    "trend": "upward"
  }
}`,
  },
  {
    date: "2026-04-28",
    title: "Dashboard loads 40% faster on teams with 100+ meetings",
    category: "performance",
    body: "We re-indexed the commitments table and optimized the analytics query. Teams with large meeting histories will notice significantly faster page loads and smoother navigation between stats pages.",
  },
  {
    date: "2026-04-22",
    title: "Commitment score now updates in real time",
    category: "improvement",
    body: "When a commitment is marked fulfilled, your team accountability score updates immediately in the dashboard without requiring a page refresh. Powered by our WebSocket event system, the score ring animates fluidly to reflect achievements.",
    imageUrl: "/images/changelog/realtime-score-update.gif",
    imageAlt: "Score ring animating from 78 to 85 in real time",
  },
  {
    date: "2026-04-15",
    title: "Cross-meeting memory: Commitments now carry forward automatically",
    category: "new-feature",
    body: "This is our biggest feature update. When Ahmed says 'I finished the login feature' in this week's standup, Vocaply automatically links it to last week's promise and marks it fulfilled — without any manual intervention. We match context across meetings, linking follow-ups to original commitments.",
    imageUrl: "/images/changelog/cross-meeting-memory.png",
    imageAlt: "Commitment timeline view showing cross-meeting resolution",
    links: [
      { label: "Read documentation", href: "/docs/features/cross-meeting-memory" }
    ],
    isHighlight: true,
  },
];
