/**
 * problem.content.ts
 * Pain points ("Without Rapto") vs Solutions ("With Rapto") content structures.
 * Designed for the ProblemStatement comparison grid using Lucide icon names.
 */

export const problemHeaderLabel = "The problem";
export const problemHeadline = "Every standup has promises. Most of them disappear.";
export const problemSubheadline =
  "Meeting notes sit in Notion. Action items die in Slack threads. Nobody remembers what was said last Monday.";

export interface ProblemItem {
  iconName: string;
  strongText: string;
  text: string;
}

export const withoutRapto: ProblemItem[] = [
  {
    iconName: "Clock",
    strongText: "Manager spends 2–3 hours/week",
    text: " manually chasing team members for updates on past commitments.",
  },
  {
    iconName: "FileX",
    strongText: "\"I'll have it done by Friday\"",
    text: " gets said and forgotten in every single standup meeting.",
  },
  {
    iconName: "ClipboardX",
    strongText: "Action items go into Notion",
    text: " or docs and are never looked at or followed up again.",
  },
  {
    iconName: "AlertTriangle",
    strongText: "Same blocker gets mentioned",
    text: " in 3 different meetings without any owner assigned or active resolution.",
  },
  {
    iconName: "TrendingDown",
    strongText: "70% of meeting action items",
    text: " are never completed on time due to lack of visibility.",
  },
];

export const withRapto: ProblemItem[] = [
  {
    iconName: "Bot",
    strongText: "Bot joins automatically.",
    text: " AI listens, transcribes, and extracts every single promise automatically.",
  },
  {
    iconName: "Pin",
    strongText: "Every commitment saved",
    text: " with its clear owner, deadline, and linked directly to the source meeting.",
  },
  {
    iconName: "BellRing",
    strongText: "Approaching deadlines",
    text: " trigger gentle reminders. Missed items alert the owner and manager.",
  },
  {
    iconName: "Slack",
    strongText: "Jira tickets created",
    text: " automatically, and a structured summary is pushed to Slack immediately.",
  },
  {
    iconName: "BarChart3",
    strongText: "Manager sees clear data",
    text: " on who keeps their word and who doesn't — with objective history.",
  },
];
