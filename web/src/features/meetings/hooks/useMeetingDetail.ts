"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { fetchMeetingDetailClient } from "../api/meetings.queries";
import type { MeetingDetail } from "../types";

export function useMeetingDetail(meetingId: string, initialData?: MeetingDetail | null) {
  return useQuery<MeetingDetail>({
    queryKey: queryKeys.meetings.detail(meetingId),
    queryFn: () => fetchMeetingDetailClient(meetingId),
    initialData: initialData || undefined,
    staleTime: 30 * 1000,
    enabled: Boolean(meetingId),
  });
}
