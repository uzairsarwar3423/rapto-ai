"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { syncActionItemClient } from "../api/action-items.mutations";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { useRef } from "react";
import { toast } from "sonner";

export function useSyncToJira(actionItemId: string) {
  const queryClient = useQueryClient();
  const teamId = useAuthStore((state) => state.user?.teamId) || "";
  const idempotencyKeyRef = useRef<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      // Key generated ONCE per logical "attempt," reused across retries of the SAME click
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }
      return syncActionItemClient(actionItemId, "JIRA", idempotencyKeyRef.current);
    },

    onSuccess: (data) => {
      // Reset key for the next actual user-initiated sync click
      idempotencyKeyRef.current = null;
      toast.success("Sync task successfully queued to Jira");
      
      // Invalidate both team action items and this detail query
      queryClient.invalidateQueries({ queryKey: queryKeys.actionItems.all(teamId) });
    },

    onError: (err: any) => {
      const errResponse = err?.response?.data;
      const errCode = errResponse?.error?.code;
      const status = err?.response?.status;

      // If it's a rate limit or concurrent sync, keep the key so a retry is treated
      // as the SAME attempt and is processed idempotently by the backend.
      const isRateLimited = errCode === "SYNC_IN_PROGRESS" || status === 429;
      if (!isRateLimited) {
        idempotencyKeyRef.current = null;
      }

      if (errCode === "INTEGRATION_NOT_CONNECTED") {
        // Handled inline in the component with popover settings links, do not double-toast
        return;
      }

      const errMsg = errResponse?.error?.message || "Downstream sync failed";
      toast.error(errMsg);
    },
  });

  return mutation;
}
