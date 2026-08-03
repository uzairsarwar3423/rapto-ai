import { api } from "@/lib/api/client";
import type { MeetingListItem, MeetingFilters, PaginatedMeetingsResponse } from "../types";

/**
 * Client-side query for list of meetings (Client context).
 * Uses client-side api Axios instance which returns the full AxiosResponse.
 */
export async function fetchMeetingsClient(
  filters: MeetingFilters,
  cursor?: string
): Promise<PaginatedMeetingsResponse> {
  const response = await api.get<{ data: MeetingListItem[]; meta: { nextCursor: string | null; hasMore: boolean } }>(
    "/meetings",
    {
      params: {
        status: filters.status?.join(","),
        platform: filters.platform,
        from: filters.from,
        to: filters.to,
        search: filters.search,
        cursor,
        limit: 30,
      },
    }
  );

  return {
    meetings: response.data.data || [],
    nextCursor: response.data.meta?.nextCursor ?? null,
    hasMore: response.data.meta?.hasMore ?? false,
  };
}

/**
 * Client-side query for meeting transcript.
 */
export async function fetchTranscriptClient(meetingId: string): Promise<any> {
  const response = await api.get<{ data: any }>(`/meetings/${meetingId}/transcript`);
  return response.data.data;
}

/**
 * Client-side mutation to reprocess a meeting transcript and AI extraction.
 */
export async function reprocessMeetingClient(meetingId: string): Promise<any> {
  const response = await api.post<{ data: any }>(`/meetings/${meetingId}/reprocess`);
  return response.data.data;
}

/**
 * Client-side mutation to remove bot / cancel recording for a meeting.
 */
export async function removeBotClient(meetingId: string): Promise<any> {
  const response = await api.delete<{ data: any }>(`/meetings/${meetingId}/bot`);
  return response.data.data;
}

/**
 * Client-side mutation to delete a meeting.
 */
export async function deleteMeetingClient(meetingId: string, deleteTranscript = false): Promise<any> {
  const response = await api.delete<{ data: any }>(`/meetings/${meetingId}`, {
    params: { deleteTranscript },
  });
  return response.data.data;
}


