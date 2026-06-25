import { api } from "@/lib/api/client";
import type { ActionItem } from "../types";

export async function fetchActionItemsClient(meetingId: string): Promise<ActionItem[]> {
  const response = await api.get<{ data: ActionItem[] }>("/action-items", {
    params: {
      meetingId,
      limit: 100, // retrieve all for this meeting
    },
  });
  return response.data.data || [];
}
