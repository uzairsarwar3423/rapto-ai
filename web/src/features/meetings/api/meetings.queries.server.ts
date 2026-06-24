import "server-only";

import { cache } from "react";
import axios from "axios";
import { serverApiClient } from "@/lib/api/server-client";
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
    console.error("Error fetching meetings server-side:", error?.message || error);
    return [];
  }
}

import { redirect } from 'next/navigation';

export const getMeetingDetail = cache(async (meetingId: string): Promise<MeetingDetail | null> => {
  try {
    const response = await serverApiClient.get<MeetingDetail>(`/meetings/${meetingId}`, {
      params: { include: 'participants,decisions,blockers' },
    });
    // serverApiClient unwraps response.data.data
    return response as unknown as MeetingDetail;
  } catch (err: any) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 404 || err.response?.status === 403) {
        return null;
      }
      if (err.response?.status === 401) {
        redirect('/login');
      }
    }
    throw err;
  }
});

export const getMeetingTranscript = cache(async (meetingId: string): Promise<any | null> => {
  try {
    const response = await serverApiClient.get<any>(`/meetings/${meetingId}/transcript`);
    return response;
  } catch (err: any) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 404 || err.response?.status === 403) {
        return null;
      }
      if (err.response?.status === 401) {
        redirect('/login');
      }
    }
    throw err;
  }
});

