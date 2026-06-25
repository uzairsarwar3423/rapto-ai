import "server-only";

import { cache } from "react";
import { serverApiClient, handleServerQueryError } from "@/lib/api/server-client";
import type { MeetingListItem, MeetingFilters, MeetingDetail } from "../types";

/**
 * Server-side query for list of meetings (RSC context).
 * Uses serverApiClient which returns response.data.data (MeetingListItem[]).
 */
export async function getMeetings(
  filters: MeetingFilters,
  cursor?: string
): Promise<MeetingListItem[]> {
  try {
    const response = await serverApiClient.get<MeetingListItem[]>("/meetings", {
      params: {
        status: filters.status?.join(","),
        platform: filters.platform,
        from: filters.from,
        to: filters.to,
        search: filters.search,
        cursor,
        limit: 30,
      },
    });
    return response || [];
  } catch (error: any) {
    return handleServerQueryError(error, "getMeetings", []);
  }
}

export const getMeetingDetail = cache(async (meetingId: string): Promise<MeetingDetail | null> => {
  try {
    const response = await serverApiClient.get<MeetingDetail>(`/meetings/${meetingId}`, {
      params: { include: 'participants,decisions,blockers' },
    });
    // serverApiClient unwraps response.data.data
    return response as unknown as MeetingDetail;
  } catch (err: any) {
    return handleServerQueryError(err, "getMeetingDetail", null);
  }
});

export const getMeetingTranscript = cache(async (meetingId: string): Promise<any | null> => {
  try {
    const response = await serverApiClient.get<any>(`/meetings/${meetingId}/transcript`);
    return response;
  } catch (err: any) {
    return handleServerQueryError(err, "getMeetingTranscript", null);
  }
});


