import type { User } from "@/features/auth/types/auth.types";

export type CommitmentStatus = "PENDING" | "FULFILLED" | "MISSED" | "DEFERRED" | "CANCELLED";

export interface Commitment {
  id: string;
  teamId: string;
  meetingId: string;
  ownerId: string;
  text: string;
  normalizedText: string | null;
  dueDate: string | null;
  dueDateRaw: string | null;
  status: CommitmentStatus;
  confidenceScore: number;
  extractionModel: string | null;
  resolvedAt: string | null;
  resolvedInMeetingId: string | null;
  originalDueDate: string | null;
  deferredCount: number;
  deferredNote: string | null;
  reminderSentAt: string | null;
  missedAlertSentAt: string | null;
  managerAlertSentAt: string | null;
  manualStatusById: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: User | null;
  meeting?: {
    id: string;
    title: string;
  };
  resolvedInMeeting?: {
    id: string;
    title: string;
  } | null;
}
