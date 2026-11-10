import { api } from "@/lib/api/client";
import type {
  MeetingListItem,
  MeetingFilters,
  PaginatedMeetingsResponse,
  MeetingTranslation,
  TranscriptLanguage,
  TranscriptTranslation,
} from "../types";

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
 * Client-side query for single meeting detail.
 */
export async function fetchMeetingDetailClient(meetingId: string): Promise<any> {
  const response = await api.get<{ data: any }>(`/meetings/${meetingId}`, {
    params: { include: "participants,decisions,blockers" },
  });
  return response.data.data;
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



/**
 * Client-side mutation-style query: translate a meeting's generated content (summary,
 * action items, commitments) into `targetLanguage`. The API caches per meeting+language,
 * so repeat calls are cheap; the original data is never modified.
 */
export async function translateMeetingClient(
  meetingId: string,
  targetLanguage: "en"
): Promise<MeetingTranslation> {
  const response = await api.post<{ data: MeetingTranslation }>(
    `/meetings/${meetingId}/translate`,
    { targetLanguage }
  );
  return response.data.data;
}

/**
 * Translate the transcript (whole, or only `speaker`'s segments) into `targetLanguage`.
 * Result is keyed by original segment id; the original transcript is never modified.
 */
export async function translateTranscriptClient(
  meetingId: string,
  targetLanguage: TranscriptLanguage,
  speaker?: string
): Promise<TranscriptTranslation> {
  const response = await api.post<{ data: TranscriptTranslation }>(
    `/meetings/${meetingId}/transcript/translate`,
    { targetLanguage, ...(speaker ? { speaker } : {}) }
  );
  return response.data.data;
}
