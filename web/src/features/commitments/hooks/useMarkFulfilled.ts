import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateCommitmentStatusClient } from "../api/commitments.queries";
import { useCommitmentMutationCache, CommitmentSnapshot } from "./useCommitmentMutationCache";
import { toast } from "sonner";
import type { Commitment } from "../types";

export function useMarkFulfilled(id: string) {
  const queryClient = useQueryClient();
  const { patchCommitment, restoreCommitment } = useCommitmentMutationCache();

  return useMutation<Commitment, Error, { note?: string }, { snapshot: CommitmentSnapshot }>({
    mutationFn: ({ note }) =>
      updateCommitmentStatusClient(id, "FULFILLED", note),
    onMutate: async ({ note }) => {
      // Apply optimistic update
      const now = new Date().toISOString();
      const snapshot = await patchCommitment(id, {
        status: "FULFILLED",
        resolvedAt: now,
        deferredNote: note || null,
      });

      return { snapshot };
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.snapshot) {
        restoreCommitment(context.snapshot);
      }
      toast.error(error.message || "Failed to mark commitment as fulfilled");
    },
    onSuccess: (data) => {
      toast.success("Commitment marked as fulfilled!");
      // Refetch stats, scores, and counts to keep page elements dynamically synced
      queryClient.invalidateQueries({ queryKey: ["commitments"] });
    },
  });
}
