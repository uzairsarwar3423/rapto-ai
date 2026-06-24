/**
 * usecases.content.ts
 * Data for UseCases section — 2×2 grid of use case tiles.
 * iconName maps to a lucide-react component.
 */

export interface UseCaseTileData {
  iconName: string;
  title: string;
  caption: string;
  integrationTags: string[];
}

export const useCaseTiles: UseCaseTileData[] = [
  {
    iconName: "Mic",
    title: "Engineering Standups",
    caption: "Monday standup to Friday delivery — tracked automatically.",
    integrationTags: ["Zoom", "Jira", "Slack"],
  },
  {
    iconName: "GitPullRequest",
    title: "Sprint Reviews",
    caption: "Sprint commitments that don't disappear between sessions.",
    integrationTags: ["Google Meet", "Linear", "Notion"],
  },
  {
    iconName: "Handshake",
    title: "Client Calls",
    caption: "Proof of what was agreed. Protection from 'I never said that.'",
    integrationTags: ["MS Teams", "Notion", "Email"],
  },
  {
    iconName: "Megaphone",
    title: "All-Hands Meetings",
    caption: "Company commitments from leadership — visible to every team.",
    integrationTags: ["Zoom", "Slack", "Google Calendar"],
  },
];
