"use client";

import { useMutation, useQueryClient, InfiniteData } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import type { MeetingListItem, PaginatedMeetingsResponse, PlatformType } from "../types";

export interface CreateMeetingPayload {
  title: string;
  platform: PlatformType;
  meetingUrl: string;
  scheduledAt: string; // ISO string
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();

  return useMutation<MeetingListItem, any, CreateMeetingPayload>({
    mutationFn: async (payload) => {
      const response = await api.post<{ data: MeetingListItem }>("/meetings", payload);
      return response.data.data;
    },
    onSuccess: (newMeeting) => {
      // Confirmed-then-inject: Prepend the new meeting to all cached lists
      queryClient.setQueriesData<InfiniteData<PaginatedMeetingsResponse>>(
        { queryKey: queryKeys.meetings.all() },
        (oldData) => {
          if (!oldData) return oldData;
          
          return {
            ...oldData,
            pages: oldData.pages.map((page, index) => {
              // Prepend to the first page only
              if (index === 0) {
                return {
                  ...page,
                  meetings: [newMeeting, ...page.meetings],
                };
              }
              return page;
            }),
          };
        }
      );

      // Invalidate in background to ensure consistency and pull correct database page structure
      queryClient.invalidateQueries({
        queryKey: queryKeys.meetings.all(),
        refetchType: "none", // Avoid aggressive background refetching immediately
      });
    },
  });
}
