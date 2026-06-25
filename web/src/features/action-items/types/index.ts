import type { User } from "@/features/auth/types/auth.types";

export type PriorityLevel = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface ActionItem {
  id: string;
  teamId: string;
  meetingId: string;
  assigneeId: string | null;
  assigneeNameRaw: string | null;
  text: string;
  dueDate: string | null;
  dueDateRaw: string | null;
  priority: PriorityLevel;
  completed: boolean;
  completedAt: string | null;
  completedById: string | null;
  jiraIssueId: string | null;
  jiraIssueUrl: string | null;
  jiraIssueSyncedAt: string | null;
  linearIssueId: string | null;
  linearIssueUrl: string | null;
  linearIssueSyncedAt: string | null;
  notionPageId: string | null;
  notionPageUrl: string | null;
  notionPageSyncedAt: string | null;
  confidenceScore: number;
  createdAt: string;
  updatedAt: string;
  assignee?: User | null;
  meeting?: {
    id: string;
    title: string;
  };
}
