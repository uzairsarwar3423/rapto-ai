import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toggleActionItemComplete } from "../api/action-items.mutations";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import type { ActionItem } from "../types";

export function useToggleActionItemComplete(meetingId: string) {
  const queryClient = useQueryClient();
  const byMeetingKey = queryKeys.actionItems.byMeeting(meetingId);
  const allItemsKey = queryKeys.actionItems.all();

  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      toggleActionItemComplete(id, completed),
    
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: byMeetingKey });
      await queryClient.cancelQueries({ queryKey: allItemsKey });

      const prevMeetingData = queryClient.getQueryData<ActionItem[]>(byMeetingKey);
      const prevAllData = queryClient.getQueryData<ActionItem[]>(allItemsKey);

      queryClient.setQueryData<ActionItem[]>(byMeetingKey, (old) =>
        old ? old.map((item) => (item.id === id ? { ...item, completed } : item)) : []
      );

      if (prevAllData) {
        queryClient.setQueryData<ActionItem[]>(allItemsKey, (old) =>
          old ? old.map((item) => (item.id === id ? { ...item, completed } : item)) : []
        );
      }

      return { prevMeetingData, prevAllData };
    },

    onError: (err, variables, context) => {
      if (context?.prevMeetingData) {
        queryClient.setQueryData(byMeetingKey, context.prevMeetingData);
      }
      if (context?.prevAllData) {
        queryClient.setQueryData(allItemsKey, context.prevAllData);
      }
      toast.error("Couldn't update status. Please try again.");
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: byMeetingKey });
      queryClient.invalidateQueries({ queryKey: allItemsKey });
    },
  });
}
