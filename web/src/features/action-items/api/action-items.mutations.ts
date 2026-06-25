import { api } from "@/lib/api/client";
import type { ActionItem } from "../types";

export async function toggleActionItemComplete(id: string, completed: boolean): Promise<ActionItem> {
  const response = await api.patch<{ data: ActionItem }>(`/action-items/${id}`, {
    completed,
  });
  return response.data.data;
}
