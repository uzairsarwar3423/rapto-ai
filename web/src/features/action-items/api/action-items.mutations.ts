import { api } from "@/lib/api/client";
import type { ActionItem, PriorityLevel } from "../types";

export interface ActionItemPatch {
  completed?: boolean;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority?: PriorityLevel;
  text?: string;
}

// Keep existing single toggle intact for backward compatibility
export async function toggleActionItemComplete(id: string, completed: boolean): Promise<ActionItem> {
  const response = await api.patch<{ data: ActionItem }>(`/action-items/${id}`, {
    completed,
  });
  return response.data.data;
}

// Single action item update (for inline click-to-edit detail header/metadata changes)
export async function updateActionItemClient(id: string, patch: ActionItemPatch): Promise<ActionItem> {
  const response = await api.patch<{ data: ActionItem }>(`/action-items/${id}`, patch);
  return response.data.data;
}

// Bulk update action items (completed state, assigneeId reassignment, priority updates, due dates)
export async function bulkUpdateActionItemsClient(
  ids: string[],
  patch: ActionItemPatch
): Promise<ActionItem[]> {
  const response = await api.patch<{ data: ActionItem[] }>("/action-items", {
    ids,
    patch,
  });
  return response.data.data || [];
}

// Sync action item with downstream system (e.g. Jira) with client-side idempotency
export async function syncActionItemClient(
  id: string,
  provider: "JIRA" | "LINEAR" | "NOTION",
  idempotencyKey: string
): Promise<{ provider: string; status: string; queuedAt: string }> {
  const response = await api.post<{ data: { provider: string; status: string; queuedAt: string } }>(
    `/action-items/${id}/sync`,
    { provider },
    {
      headers: {
        "X-Idempotency-Key": idempotencyKey,
      },
    }
  );
  return response.data.data;
}
