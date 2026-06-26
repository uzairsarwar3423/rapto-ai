"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { bulkUpdateActionItemsClient, ActionItemPatch } from "../api/action-items.mutations";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { toast } from "sonner";
import type { ActionItem } from "../types";

export function useBulkUpdateActionItems() {
  const queryClient = useQueryClient();
  const teamId = useAuthStore((state) => state.user?.teamId) || "";

  return useMutation({
    mutationFn: (payload: { ids: string[]; patch: ActionItemPatch }) =>
      bulkUpdateActionItemsClient(payload.ids, payload.patch),

    onMutate: async ({ ids, patch }) => {
      const idSet = new Set(ids);
      
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.actionItems.all(teamId) });

      // Snapshot the previous values
      const snapshot = queryClient.getQueriesData({ queryKey: queryKeys.actionItems.all(teamId) });

      // Optimistically patch list and detail queries
      queryClient.setQueriesData<any>(
        { queryKey: queryKeys.actionItems.all(teamId) },
        (old: any) => {
          if (!old) return old;

          // If it's a paginated list response (contains items and counts)
          if (typeof old === "object" && "items" in old) {
            const listData = old as { items: ActionItem[]; counts: { completed: number; incomplete: number } };
            
            // Recalculate counts if completed status changes
            let completedChange = 0;
            let incompleteChange = 0;
            
            const updatedItems = listData.items.map((item) => {
              if (idSet.has(item.id)) {
                if (patch.completed !== undefined && patch.completed !== item.completed) {
                  if (patch.completed) {
                    completedChange += 1;
                    incompleteChange -= 1;
                  } else {
                    completedChange -= 1;
                    incompleteChange += 1;
                  }
                }
                return { ...item, ...patch };
              }
              return item;
            });

            return {
              ...listData,
              items: updatedItems,
              counts: {
                completed: Math.max(0, listData.counts.completed + completedChange),
                incomplete: Math.max(0, listData.counts.incomplete + incompleteChange),
              },
            };
          }

          // If it's a single detail item response
          if (typeof old === "object" && "id" in old) {
            const detailData = old as ActionItem;
            if (idSet.has(detailData.id)) {
              return { ...detailData, ...patch };
            }
          }

          // If it's a list response from a different endpoint (e.g. array of action items)
          if (Array.isArray(old)) {
            return old.map((item) => (idSet.has(item.id) ? { ...item, ...patch } : item));
          }

          return old;
        }
      );

      return { snapshot };
    },

    onError: (err, variables, context) => {
      // Rollback to snapshot on failure
      if (context?.snapshot) {
        context.snapshot.forEach(([key, oldData]) => {
          queryClient.setQueryData(key, oldData);
        });
      }
      toast.error(`Failed to update ${variables.ids.length} item${variables.ids.length > 1 ? "s" : ""}`);
    },

    onSuccess: (data, variables) => {
      toast.success(`Successfully updated ${variables.ids.length} item${variables.ids.length > 1 ? "s" : ""}`);
    },

    onSettled: () => {
      // Refetch queries to ensure exact sync with server state
      queryClient.invalidateQueries({ queryKey: queryKeys.actionItems.all(teamId) });
    },
  });
}
