import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import axios from "axios";
import { serverApiClient, handleServerQueryError } from "@/lib/api/server-client";
import type { Commitment } from "../types";
import type { CommitmentFiltersState } from "../hooks/useCommitmentFilters";
import type { TeamStatsResponse } from "./commitments.queries";

const backendUrl = process.env.API_URL || "http://localhost:5000";

export interface PaginatedCommitmentsServerResponse {
  commitments: Commitment[];
  nextCursor: string | null;
  counts: Record<string, number>;
}

export const getMeetingCommitmentsServer = cache(async (meetingId: string): Promise<Commitment[]> => {
  try {
    const response = await serverApiClient.get<Commitment[]>("/commitments", {
      params: { meetingId, limit: 100 },
    });
    return response || [];
  } catch (err: any) {
    return handleServerQueryError(err, "getMeetingCommitmentsServer", []);
  }
});

/**
 * Server-side list query to fetch commitments with metadata (nextCursor, counts).
 */
export const getCommitmentsListServer = cache(async (
  filters: Omit<CommitmentFiltersState, "status"> & { status?: string[] | string },
  limit = 20
): Promise<PaginatedCommitmentsServerResponse> => {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("rapto_access")?.value;

    const response = await axios.get(`${backendUrl}/api/v1/commitments`, {
      params: {
        status: filters.status,
        ownerId: filters.ownerIds?.length ? filters.ownerIds.join(",") : undefined,
        from: filters.from,
        to: filters.to,
        confidenceScore: filters.confidenceMin,
        limit,
      },
      headers: {
        Authorization: accessToken ? `Bearer ${accessToken}` : "",
      },
    });

    return {
      commitments: response.data?.data || [],
      nextCursor: response.data?.meta?.nextCursor ?? null,
      counts: response.data?.meta?.counts || {},
    };
  } catch (err: any) {
    return handleServerQueryError(err, "getCommitmentsListServer", {
      commitments: [],
      nextCursor: null,
      counts: {},
    });
  }
});

/**
 * Server-side counts query to fetch team counts for commitments.
 */
export const getCommitmentCountsServer = cache(async (): Promise<Record<string, number>> => {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("rapto_access")?.value;

    const response = await axios.get(`${backendUrl}/api/v1/commitments`, {
      params: {
        limit: 1,
      },
      headers: {
        Authorization: accessToken ? `Bearer ${accessToken}` : "",
      },
    });

    return response.data?.meta?.counts || {};
  } catch (err: any) {
    return handleServerQueryError(err, "getCommitmentCountsServer", {});
  }
});

export const getCommitmentDetailServer = cache(async (id: string): Promise<Commitment | null> => {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("rapto_access")?.value;

    const response = await axios.get(`${backendUrl}/api/v1/commitments/${id}`, {
      headers: {
        Authorization: accessToken ? `Bearer ${accessToken}` : "",
      },
    });
    return response.data?.data || null;
  } catch (err: any) {
    return handleServerQueryError(err, "getCommitmentDetailServer", null);
  }
});

export const getCommitmentStatsServer = cache(async (filters?: {
  from?: string;
  to?: string;
}): Promise<TeamStatsResponse | null> => {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("rapto_access")?.value;

    const response = await axios.get(`${backendUrl}/api/v1/commitments/stats`, {
      params: filters,
      headers: {
        Authorization: accessToken ? `Bearer ${accessToken}` : "",
      },
    });
    return response.data || null;
  } catch (err: any) {
    return handleServerQueryError(err, "getCommitmentStatsServer", null);
  }
});
