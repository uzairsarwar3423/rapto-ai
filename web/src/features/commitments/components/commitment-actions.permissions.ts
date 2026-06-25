import type { CommitmentStatus } from "../types";
import type { UserRole } from "@/features/auth/types/auth.types";

export type CommitmentAction = "MARK_FULFILLED" | "DEFER" | "CANCEL" | "VIEW_HISTORY";

/**
 * Pure, framework-agnostic function to compute available actions for a commitment
 * based on its status, the current user's role, and commitment ownership.
 */
export function getAvailableActions(
  status: CommitmentStatus,
  currentUserRole: UserRole | undefined | null,
  currentUserId: string | undefined | null,
  ownerId: string
): CommitmentAction[] {
  const isOwner = currentUserId === ownerId;
  const isManager = currentUserRole === "ADMIN";
  const hasWritePermission = isOwner || isManager;

  switch (status) {
    case "PENDING":
      return hasWritePermission
        ? ["MARK_FULFILLED", "DEFER", "CANCEL", "VIEW_HISTORY"]
        : ["VIEW_HISTORY"];

    case "DEFERRED":
      return hasWritePermission
        ? ["MARK_FULFILLED", "CANCEL", "VIEW_HISTORY"]
        : ["VIEW_HISTORY"];

    case "FULFILLED":
    case "MISSED":
    case "CANCELLED":
    default:
      return ["VIEW_HISTORY"];
  }
}
