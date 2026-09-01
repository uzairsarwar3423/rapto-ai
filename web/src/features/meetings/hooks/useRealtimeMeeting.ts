"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socketManager } from "@/shared/lib/websocket/socket";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/lib/websocket/socket.events";
import * as patchers from "@/shared/lib/websocket/socket.cache-patchers";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { toast } from "sonner";
import type { MeetingListItem, StructuredSummary } from "../types";

export function useRealtimeMeeting(meetingId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    // Join the meeting room if meetingId is provided
    if (meetingId) {
      socket.emit(CLIENT_EVENTS.JOIN_MEETING, { meetingId });
    }

    // Auto-heal cache on socket reconnection
    const handleReconnect = () => {
      if (meetingId) {
        socket.emit(CLIENT_EVENTS.JOIN_MEETING, { meetingId });
        queryClient.invalidateQueries({ queryKey: queryKeys.meetings.detail(meetingId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all() });
    };

    const handleCreated = (payload: { meeting: MeetingListItem }) => {
      patchers.patchMeetingCreated(queryClient, payload);
    };

    const handleBotJoining = (payload: { meetingId: string }) => {
      patchers.patchMeetingBotJoining(queryClient, payload);
      if (meetingId && meetingId === payload.meetingId) {
        toast.info("Rapto bot is joining the meeting...", { id: `bot-joining-${payload.meetingId}` });
      }
    };

    const handleRecording = (payload: { meetingId: string; startedAt: string }) => {
      patchers.patchMeetingRecording(queryClient, payload);
      if (meetingId && meetingId === payload.meetingId) {
        toast.success("Meeting recording is live", { id: `recording-started-${payload.meetingId}` });
      }
    };

    const handleProcessing = (payload: { meetingId: string }) => {
      patchers.patchMeetingProcessing(queryClient, payload);
      if (meetingId && meetingId === payload.meetingId) {
        toast.info("Meeting ended. AI transcription and analysis in progress...", {
          id: `processing-${payload.meetingId}`,
        });
      }
    };

    const handleTranscriptCleaned = (payload: {
      meetingId: string;
      cleanupSuccessful: boolean;
      fillersRemoved?: number;
    }) => {
      patchers.patchMeetingTranscriptCleaned(queryClient, payload);
    };

    const handleExtracted = (payload: {
      meetingId: string;
      summary: StructuredSummary | string | null;
      commitmentCount?: number;
      actionItemCount?: number;
      decisionCount?: number;
      blockerCount?: number;
      riskCount?: number;
      isPartial?: boolean;
    }) => {
      patchers.patchMeetingExtracted(queryClient, payload);
      if (meetingId && meetingId === payload.meetingId) {
        toast.success("AI insights & commitments extracted successfully!", {
          id: `extracted-${payload.meetingId}`,
        });
      }
    };

    const handleResolved = (payload: {
      meetingId: string;
      newCount?: number;
      resolvedCount?: number;
      referencedCount?: number;
      isPartial?: boolean;
    }) => {
      patchers.patchMeetingResolved(queryClient, payload);
    };

    const handleProcessed = (payload: {
      meetingId: string;
      summary: StructuredSummary | string | null;
      commitmentCount?: number;
      actionItemCount?: number;
    }) => {
      patchers.patchMeetingProcessed(queryClient, payload);
    };

    const handleFailed = (payload: { meetingId: string; reason?: string }) => {
      patchers.patchMeetingFailed(queryClient, payload);
      if (meetingId && meetingId === payload.meetingId) {
        toast.error(`Meeting processing failed: ${payload.reason || "Unknown error"}`, {
          id: `failed-${payload.meetingId}`,
        });
      }
    };

    const handleCancelled = (payload: { meetingId: string }) => {
      patchers.patchMeetingCancelled(queryClient, payload);
      if (meetingId && meetingId === payload.meetingId) {
        toast.warning("Bot removed. Meeting cancelled.", { id: `cancelled-${payload.meetingId}` });
      }
    };

    const handleDeleted = (payload: { meetingId: string }) => {
      patchers.patchMeetingDeleted(queryClient, payload);
    };

    // Attach team-wide & meeting-specific lifecycle listeners
    socket.on("connect", handleReconnect);
    socket.on(SERVER_EVENTS.MEETING_CREATED, handleCreated);
    socket.on(SERVER_EVENTS.MEETING_BOT_JOINING, handleBotJoining);
    socket.on(SERVER_EVENTS.MEETING_RECORDING, handleRecording);
    socket.on(SERVER_EVENTS.MEETING_PROCESSING, handleProcessing);
    socket.on(SERVER_EVENTS.MEETING_TRANSCRIPT_CLEANED, handleTranscriptCleaned);
    socket.on(SERVER_EVENTS.MEETING_EXTRACTED, handleExtracted);
    socket.on(SERVER_EVENTS.MEETING_EXTRACTED_PARTIAL, handleExtracted);
    socket.on(SERVER_EVENTS.MEETING_RESOLVED, handleResolved);
    socket.on(SERVER_EVENTS.MEETING_RESOLVED_PARTIAL, handleResolved);
    socket.on(SERVER_EVENTS.MEETING_PROCESSED, handleProcessed);
    socket.on(SERVER_EVENTS.MEETING_FAILED, handleFailed);
    socket.on(SERVER_EVENTS.MEETING_CANCELLED, handleCancelled);
    socket.on(SERVER_EVENTS.MEETING_DELETED, handleDeleted);

    return () => {
      if (meetingId) {
        socket.emit(CLIENT_EVENTS.LEAVE_MEETING, { meetingId });
      }

      socket.off("connect", handleReconnect);
      socket.off(SERVER_EVENTS.MEETING_CREATED, handleCreated);
      socket.off(SERVER_EVENTS.MEETING_BOT_JOINING, handleBotJoining);
      socket.off(SERVER_EVENTS.MEETING_RECORDING, handleRecording);
      socket.off(SERVER_EVENTS.MEETING_PROCESSING, handleProcessing);
      socket.off(SERVER_EVENTS.MEETING_TRANSCRIPT_CLEANED, handleTranscriptCleaned);
      socket.off(SERVER_EVENTS.MEETING_EXTRACTED, handleExtracted);
      socket.off(SERVER_EVENTS.MEETING_EXTRACTED_PARTIAL, handleExtracted);
      socket.off(SERVER_EVENTS.MEETING_RESOLVED, handleResolved);
      socket.off(SERVER_EVENTS.MEETING_RESOLVED_PARTIAL, handleResolved);
      socket.off(SERVER_EVENTS.MEETING_PROCESSED, handleProcessed);
      socket.off(SERVER_EVENTS.MEETING_FAILED, handleFailed);
      socket.off(SERVER_EVENTS.MEETING_CANCELLED, handleCancelled);
      socket.off(SERVER_EVENTS.MEETING_DELETED, handleDeleted);
    };
  }, [meetingId, queryClient]);
}
