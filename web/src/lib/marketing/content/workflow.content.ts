/**
 * workflow.content.ts
 * Data for the WorkflowTimeline section — 5 story nodes from Monday standup
 * through the following Monday, showing Vocaply's accountability loop.
 */

export type CalloutType =
  | "recording-pill"
  | "commitment-row"
  | "slack-bubble"
  | "missed-badge"
  | "summary-snippet";

export interface WorkflowStep {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  calloutType: CalloutType;
}

export const workflowSteps: WorkflowStep[] = [
  {
    id: "node-1",
    timestamp: "Monday · 9:00 AM",
    title: "Bot joins your standup",
    description:
      "Ali says 'I'll finish login by Thursday.' Vocaply bot is in the meeting, silent.",
    calloutType: "recording-pill",
  },
  {
    id: "node-2",
    timestamp: "Monday · 9:35 AM",
    title: "Commitment extracted automatically",
    description:
      "Meeting ends. 3 new commitments appear in dashboard. Slack message sent.",
    calloutType: "commitment-row",
  },
  {
    id: "node-3",
    timestamp: "Wednesday · 9:00 AM",
    title: "Reminder sent to Ali",
    description:
      "Slack DM: 'Your login feature deadline is tomorrow. Any update?'",
    calloutType: "slack-bubble",
  },
  {
    id: "node-4",
    timestamp: "Thursday · 6:00 PM",
    title: "Deadline passed. No update.",
    description:
      "Commitment auto-marked MISSED. Manager alerted via Slack instantly.",
    calloutType: "missed-badge",
  },
  {
    id: "node-5",
    timestamp: "Next Monday · 9:00 AM",
    title: "Carried into the next standup",
    description:
      "New meeting summary includes: '2 commitments from last week are still open.'",
    calloutType: "summary-snippet",
  },
];
