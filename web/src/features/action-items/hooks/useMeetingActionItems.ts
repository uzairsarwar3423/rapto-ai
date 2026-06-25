import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { fetchActionItemsClient } from "../api/action-items.queries";
import type { ActionItem } from "../types";

export function useMeetingActionItems(meetingId: string, initialData?: ActionItem[]) {
  return useQuery<ActionItem[]>({
    queryKey: queryKeys.actionItems.byMeeting(meetingId),
    queryFn: () => fetchActionItemsClient(meetingId),
    initialData: initialData && initialData.length > 0 ? initialData : undefined,
    staleTime: 30 * 1000,
  });
}
