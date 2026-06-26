import { useCommitments } from "@/features/commitments/hooks/useCommitments";
import type { CommitmentStatusFilter } from "@/features/commitments/hooks/useCommitmentFilters";

export function useMemberCommitments(memberId: string, status: CommitmentStatusFilter = "ALL") {
  return useCommitments({
    status,
    ownerIds: [memberId],
  });
}
