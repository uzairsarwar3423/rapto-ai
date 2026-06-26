import { api } from "@/lib/api/client";
import type { ActionItem } from "../types";

export interface FetchActionItemsFilters {
  assigneeId?: string;
  completed?: boolean;
  priority?: string[]; //LOW, MEDIUM, HIGH, URGENT
  meetingId?: string;
  hasJiraTicket?: boolean;
  hasLinearIssue?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
  sortBy?: "createdAt" | "dueDate" | "priority";
  sortOrder?: "asc" | "desc";
}

export interface FetchTeamActionItemsResponse {
  items: ActionItem[];
  nextCursor: string | null;
  hasMore: boolean;
  counts: {
    completed: number;
    incomplete: number;
  };
}

// Keep existing meeting-scoped action items fetcher intact
export async function fetchActionItemsClient(meetingId: string): Promise<ActionItem[]> {
  const response = await api.get<{ data: ActionItem[] }>("/action-items", {
    params: {
      meetingId,
      limit: 100, // retrieve all for this meeting
    },
  });
  return response.data.data || [];
}

// Add team-wide filtered list query fetcher
export async function fetchTeamActionItemsClient(
  filters: FetchActionItemsFilters
): Promise<FetchTeamActionItemsResponse> {
  const params: Record<string, any> = { ...filters };

  // Transform priority array to comma-separated string for query validation
  if (filters.priority && filters.priority.length > 0) {
    params.priority = filters.priority.join(",");
  } else {
    delete params.priority;
  }

  const response = await api.get<{ data: ActionItem[]; meta?: any }>("/action-items", {
    params,
  });

  const items = response.data.data || [];
  const meta = response.data.meta || {};

  return {
    items,
    nextCursor: meta.nextCursor || null,
    hasMore: !!meta.hasMore,
    counts: meta.counts || { completed: 0, incomplete: 0 },
  };
}

// Add single action item detail fetcher
export async function fetchActionItemDetailClient(actionItemId: string): Promise<ActionItem> {
  const response = await api.get<{ data: ActionItem }>(`/action-items/${actionItemId}`);
  return response.data.data;
}
