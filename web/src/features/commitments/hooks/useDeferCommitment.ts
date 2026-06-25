import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateCommitmentStatusClient } from "../api/commitments.queries";
import { useCommitmentMutationCache, CommitmentSnapshot } from "./useCommitmentMutationCache";
import { toast } from "sonner";
import type { Commitment } from "../types";

export function useDeferCommitment(id: string) {
  const queryClient = useQueryClient();
  const { patchCommitment, restoreCommitment } = useCommitmentMutationCache();

  return useMutation<
    Commitment,
    Error,
    { newDueDate: string; note?: string },
    { snapshot: CommitmentSnapshot }
  >({
    mutationFn: ({ newDueDate, note }) =>
      updateCommitmentStatusClient(id, "DEFERRED", note, newDueDate),
    onMutate: async ({ newDueDate, note }) => {
      // Find current deferredCount from cache to increment it
      let currentDeferredCount = 0;
      const queries = queryClient.getQueryCache().getAll();
      for (const query of queries) {
        const data = query.state.data as Record<string, any> | undefined;
        if (!data) continue;

        if (data && typeof data === "object" && (data as any).id === id) {
          currentDeferredCount = (data as any).deferredCount ?? 0;
          break;
        }
        if (Array.isArray(data)) {
          const found = data.find((item: any) => item && item.id === id);
          if (found) {
            currentDeferredCount = found.deferredCount ?? 0;
            break;
          }
        }
        if (data && typeof data === "object" && Array.isArray((data as any).pages)) {
          let found = false;
          for (const page of (data as any).pages) {
            if (page && Array.isArray(page.commitments)) {
              const item = page.commitments.find((c: any) => c && c.id === id);
              if (item) {
                currentDeferredCount = item.deferredCount ?? 0;
                found = true;
                break;
              }
            }
          }
          if (found) break;
        }
      }

      // Apply optimistic update
      const snapshot = await patchCommitment(id, {
        status: "DEFERRED",
        dueDate: newDueDate,
        deferredCount: currentDeferredCount + 1,
        deferredNote: note || null,
      });

      return { snapshot };
    },
    onError: (error, variables, context) => {
      if (context?.snapshot) {
        restoreCommitment(context.snapshot);
      }
      toast.error(error.message || "Failed to defer commitment");
    },
    onSuccess: (data) => {
      toast.success("Commitment deferred successfully.");
      queryClient.invalidateQueries({ queryKey: ["commitments"] });
    },
  });
}
