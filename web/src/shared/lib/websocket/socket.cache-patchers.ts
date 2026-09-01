import { QueryClient, InfiniteData } from "@tanstack/react-query";
import { queryKeys } from "../cache/query-keys";
import type {
  PaginatedMeetingsResponse,
  MeetingListItem,
  MeetingDetail,
  MeetingStatus,
  StructuredSummary,
} from "../../../features/meetings/types";

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

// Helper to prepend a newly created meeting to the InfiniteQuery lists
function addMeetingToLists(
  queryClient: QueryClient,
  newMeeting: MeetingListItem
) {
  queryClient.setQueriesData<InfiniteData<PaginatedMeetingsResponse>>(
    { queryKey: ["meetings", "list"] },
    (oldData) => {
      if (!oldData || !oldData.pages || oldData.pages.length === 0) return oldData;

      // Avoid adding duplicate if already in cache
      const exists = oldData.pages.some((page) =>
        page.meetings.some((m) => m.id === newMeeting.id)
      );
      if (exists) return oldData;

      const firstPage = oldData.pages[0];
      const updatedFirstPage = {
        ...firstPage,
        meetings: [newMeeting, ...firstPage.meetings],
      };

      return {
        ...oldData,
        pages: [updatedFirstPage, ...oldData.pages.slice(1)],
      };
    }
  );
}

// Helper to remove a deleted meeting from the InfiniteQuery lists
function removeMeetingFromLists(queryClient: QueryClient, meetingId: string) {
  queryClient.setQueriesData<InfiniteData<PaginatedMeetingsResponse>>(
    { queryKey: ["meetings", "list"] },
    (oldData) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page) => ({
          ...page,
          meetings: page.meetings.filter((m) => m.id !== meetingId),
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
    { queryKey: queryKeys.meetings.detail(meetingId) },
    (oldData) => {
      if (!oldData) return oldData;
      return { ...oldData, ...patches };
    }
  );
  // Also patch ["meeting", meetingId] for backward compatibility
  queryClient.setQueriesData<MeetingDetail>(
    { queryKey: ["meeting", meetingId] },
    (oldData) => {
      if (!oldData) return oldData;
      return { ...oldData, ...patches };
    }
  );
}

export type CachePatcher<T> = (queryClient: QueryClient, payload: T) => void;

export const patchMeetingCreated: CachePatcher<{ meeting: MeetingListItem }> = (
  queryClient,
  payload
) => {
  if (payload.meeting) {
    addMeetingToLists(queryClient, payload.meeting);
    queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all() });
  }
};

export const patchMeetingBotJoining: CachePatcher<{ meetingId: string }> = (
  queryClient,
  payload
) => {
  const patches = {
    status: "BOT_JOINING" as MeetingStatus,
    botJoinedAt: new Date().toISOString(),
  };
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
    recordingStartedAt: payload.startedAt,
  };
  updateMeetingInLists(queryClient, payload.meetingId, patches);
  updateMeetingDetail(queryClient, payload.meetingId, patches);
};

export const patchMeetingProcessing: CachePatcher<{ meetingId: string }> = (
  queryClient,
  payload
) => {
  const now = new Date().toISOString();
  const patches = {
    status: "PROCESSING" as MeetingStatus,
    processingStartedAt: now,
    endedAt: now,
    processingError: null,
  };
  updateMeetingInLists(queryClient, payload.meetingId, patches);
  updateMeetingDetail(queryClient, payload.meetingId, patches);
};

export const patchMeetingTranscriptCleaned: CachePatcher<{
  meetingId: string;
  cleanupSuccessful: boolean;
  fillersRemoved?: number;
}> = (queryClient, payload) => {
  queryClient.invalidateQueries({
    queryKey: queryKeys.meetings.transcript(payload.meetingId),
  });
};

export const patchMeetingExtracted: CachePatcher<{
  meetingId: string;
  summary: StructuredSummary | string | null;
  commitmentCount?: number;
  actionItemCount?: number;
  decisionCount?: number;
  blockerCount?: number;
  riskCount?: number;
  isPartial?: boolean;
}> = (queryClient, payload) => {
  const now = new Date().toISOString();
  const patches = {
    status: "DONE" as MeetingStatus,
    summary: payload.summary,
    commitmentCount: payload.commitmentCount ?? 0,
    actionItemCount: payload.actionItemCount ?? 0,
    decisionCount: payload.decisionCount ?? 0,
    completedAt: now,
    processingCompletedAt: now,
  };

  updateMeetingInLists(queryClient, payload.meetingId, patches);
  updateMeetingDetail(queryClient, payload.meetingId, patches);

  // Invalidate child collections so they seamlessly reload without user intervention
  queryClient.invalidateQueries({
    queryKey: queryKeys.meetings.transcript(payload.meetingId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.actionItems.byMeeting(payload.meetingId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.commitments.byMeeting(payload.meetingId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.meetings.detail(payload.meetingId),
  });
};

export const patchMeetingResolved: CachePatcher<{
  meetingId: string;
  newCount?: number;
  resolvedCount?: number;
  referencedCount?: number;
  isPartial?: boolean;
}> = (queryClient, payload) => {
  const patches = {
    status: "DONE" as MeetingStatus,
    resolutionComplete: !payload.isPartial,
  };

  updateMeetingInLists(queryClient, payload.meetingId, patches);
  updateMeetingDetail(queryClient, payload.meetingId, patches);

  // Invalidate commitments to show fulfilled statuses
  queryClient.invalidateQueries({
    queryKey: queryKeys.commitments.byMeeting(payload.meetingId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.commitments.all(),
  });
};

export const patchMeetingProcessed: CachePatcher<{
  meetingId: string;
  summary: StructuredSummary | string | null;
  commitmentCount?: number;
  actionItemCount?: number;
}> = (queryClient, payload) => {
  const now = new Date().toISOString();
  const patches = {
    status: "DONE" as MeetingStatus,
    summary: payload.summary,
    commitmentCount: payload.commitmentCount ?? 0,
    actionItemCount: payload.actionItemCount ?? 0,
    completedAt: now,
    processingCompletedAt: now,
  };

  updateMeetingInLists(queryClient, payload.meetingId, patches);
  updateMeetingDetail(queryClient, payload.meetingId, patches);

  // Invalidate child queries
  queryClient.invalidateQueries({
    queryKey: queryKeys.meetings.transcript(payload.meetingId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.actionItems.byMeeting(payload.meetingId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.commitments.byMeeting(payload.meetingId),
  });
};

export const patchMeetingFailed: CachePatcher<{ meetingId: string; reason?: string }> = (
  queryClient,
  payload
) => {
  const patches = {
    status: "FAILED" as MeetingStatus,
    processingError: payload.reason || "Unknown processing error",
  };
  updateMeetingInLists(queryClient, payload.meetingId, patches);
  updateMeetingDetail(queryClient, payload.meetingId, patches);
};

export const patchMeetingCancelled: CachePatcher<{ meetingId: string }> = (
  queryClient,
  payload
) => {
  const patches = {
    status: "CANCELLED" as MeetingStatus,
  };
  updateMeetingInLists(queryClient, payload.meetingId, patches);
  updateMeetingDetail(queryClient, payload.meetingId, patches);
};

export const patchMeetingDeleted: CachePatcher<{ meetingId: string }> = (
  queryClient,
  payload
) => {
  removeMeetingFromLists(queryClient, payload.meetingId);
  queryClient.invalidateQueries({
    queryKey: queryKeys.meetings.detail(payload.meetingId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.meetings.all(),
  });
};
