import { QueryClient, InfiniteData } from "@tanstack/react-query";
import type { PaginatedMeetingsResponse, MeetingListItem, MeetingDetail, MeetingStatus } from "../../../features/meetings/types";

// Helper to patch a meeting's fields in the InfiniteQuery lists
function updateMeetingInLists(
  queryClient: QueryClient,
  meetingId: string,
  patches: Partial<MeetingListItem>
) {
  queryClient.setQueriesData<InfiniteData<PaginatedMeetingsResponse>>(
    { queryKey: ["meetings", "list"] },
    (oldData) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page) => ({
          ...page,
          meetings: page.meetings.map((meeting) => {
            if (meeting.id === meetingId) {
              return { ...meeting, ...patches };
            }
            return meeting;
          }),
        })),
      };
    }
  );
}

// Helper to patch a meeting's fields in the Detail query
function updateMeetingDetail(
  queryClient: QueryClient,
  meetingId: string,
  patches: Partial<MeetingDetail>
) {
  queryClient.setQueriesData<MeetingDetail>(
    { queryKey: ["meetings", "detail", meetingId] },
    (oldData) => {
      if (!oldData) return oldData;
      return { ...oldData, ...patches };
    }
  );
}

export type CachePatcher<T> = (queryClient: QueryClient, payload: T) => void;

export const patchMeetingBotJoining: CachePatcher<{ meetingId: string }> = (
  queryClient,
  payload
) => {
  const patches = { status: "BOT_JOINING" as MeetingStatus };
  updateMeetingInLists(queryClient, payload.meetingId, patches);
  updateMeetingDetail(queryClient, payload.meetingId, patches);
};

export const patchMeetingRecording: CachePatcher<{ meetingId: string; startedAt: string }> = (
  queryClient,
  payload
) => {
  const patches = {
    status: "RECORDING" as MeetingStatus,
    startedAt: payload.startedAt,
  };
  updateMeetingInLists(queryClient, payload.meetingId, patches);
  updateMeetingDetail(queryClient, payload.meetingId, {
    ...patches,
    recordingStartedAt: payload.startedAt,
  });
};

export const patchMeetingProcessing: CachePatcher<{ meetingId: string }> = (
  queryClient,
  payload
) => {
  const patches = { status: "PROCESSING" as MeetingStatus };
  updateMeetingInLists(queryClient, payload.meetingId, patches);
  updateMeetingDetail(queryClient, payload.meetingId, patches);
};

export const patchMeetingProcessed: CachePatcher<{
  meetingId: string;
  summary: string;
  commitmentCount?: number;
  actionItemCount?: number;
}> = (queryClient, payload) => {
  const patches = {
    status: "DONE" as MeetingStatus,
    summary: payload.summary,
    commitmentCount: payload.commitmentCount ?? 0,
    actionItemCount: payload.actionItemCount ?? 0,
  };
  updateMeetingInLists(queryClient, payload.meetingId, patches);
  updateMeetingDetail(queryClient, payload.meetingId, patches);
};

export const patchMeetingFailed: CachePatcher<{ meetingId: string; reason?: string }> = (
  queryClient,
  payload
) => {
  const patches = {
    status: "FAILED" as MeetingStatus,
  };
  updateMeetingInLists(queryClient, payload.meetingId, patches);
  updateMeetingDetail(queryClient, payload.meetingId, {
    ...patches,
    processingError: payload.reason || "Unknown processing error",
  });
};
