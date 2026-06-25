import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateCommitmentStatusClient } from "../api/commitments.queries";
import { useCommitmentMutationCache, CommitmentSnapshot } from "./useCommitmentMutationCache";
import { toast } from "sonner";
import type { Commitment } from "../types";

export function useCancelCommitment(id: string) {
  const queryClient = useQueryClient();
  const { patchCommitment, restoreCommitment } = useCommitmentMutationCache();

  return useMutation<Commitment, Error, { note: string }, { snapshot: CommitmentSnapshot }>({
    mutationFn: ({ note }) =>
      updateCommitmentStatusClient(id, "CANCELLED", note),
    onMutate: async ({ note }) => {
      // Apply optimistic update
      const now = new Date().toISOString();
      const snapshot = await patchCommitment(id, {
        status: "CANCELLED",
        resolvedAt: now,
        deferredNote: note,
      });

      return { snapshot };
    },
    onError: (error, variables, context) => {
      if (context?.snapshot) {
        restoreCommitment(context.snapshot);
      }
      toast.error(error.message || "Failed to cancel commitment");
    },
    onSuccess: (data) => {
      toast.success("Commitment cancelled.");
      queryClient.invalidateQueries({ queryKey: ["commitments"] });
    },
  });
}
