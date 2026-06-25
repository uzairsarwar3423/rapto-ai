import { api } from "@/lib/api/client";
import type { Commitment, CommitmentStatus } from "../types";
import type { CommitmentFiltersState } from "../hooks/useCommitmentFilters";

export interface PaginatedCommitmentsResponse {
  commitments: Commitment[];
  nextCursor: string | null;
  counts: Record<string, number>;
}

export async function fetchCommitmentsClient(meetingId: string): Promise<Commitment[]> {
  const response = await api.get<{ data: Commitment[] }>("/commitments", {
    params: {
      meetingId,
      limit: 100, // retrieve all for this meeting
    },
  });
  return response.data.data || [];
}

export async function fetchCommitmentsListClient(
  filters: Omit<CommitmentFiltersState, "status"> & { status?: string[] | string },
  cursor?: string,
  limit = 20
): Promise<PaginatedCommitmentsResponse> {
  const response = await api.get<{
    data: Commitment[];
    meta: { nextCursor: string | null; counts: Record<string, number> };
  }>("/commitments", {
    params: {
      status: filters.status,
      ownerId: filters.ownerIds?.length ? filters.ownerIds.join(",") : undefined,
      from: filters.from,
      to: filters.to,
      confidenceScore: filters.confidenceMin,
      cursor,
      limit,
    },
  });

  return {
    commitments: response.data.data || [],
    nextCursor: response.data.meta?.nextCursor ?? null,
    counts: response.data.meta?.counts || {},
  };
}

export async function fetchCommitmentCountsClient(): Promise<Record<string, number>> {
  const response = await api.get<{
    meta: { counts: Record<string, number> };
  }>("/commitments", {
    params: {
      limit: 1,
    },
  });

  return response.data.meta?.counts || {};
}

export async function fetchCommitmentDetailClient(id: string): Promise<Commitment> {
  const response = await api.get<{ data: Commitment }>(`/commitments/${id}`);
  return response.data.data;
}

export interface TeamStatsResponse {
  period: { from: string; to: string };
  team: {
    total: number;
    fulfilled: number;
    missed: number;
    pending: number;
    fulfillmentRate: number;
    avgDaysOverdue: number;
  };
  byMember: {
    userId: string;
    name: string;
    fulfillmentRate: number;
    score: number;
    trend: "improving" | "stable" | "declining";
  }[];
  trend: { week: string; fulfillmentRate: number; label: string }[];
}

export async function fetchCommitmentStatsClient(filters?: {
  from?: string;
  to?: string;
}): Promise<TeamStatsResponse> {
  const response = await api.get<TeamStatsResponse>("/commitments/stats", {
    params: filters,
  });
  return response.data;
}

export async function updateCommitmentStatusClient(
  id: string,
  status: CommitmentStatus,
  note?: string,
  newDueDate?: string
): Promise<Commitment> {
  const response = await api.patch<{ data: Commitment }>(`/commitments/${id}/status`, {
    status,
    note,
    newDueDate,
  });
  return response.data.data;
}
