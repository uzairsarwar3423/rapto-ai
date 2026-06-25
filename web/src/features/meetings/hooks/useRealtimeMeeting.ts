"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socketManager } from "@/shared/lib/websocket/socket";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/lib/websocket/socket.events";
import * as patchers from "@/shared/lib/websocket/socket.cache-patchers";

export function useRealtimeMeeting(meetingId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    // Join the meeting room if meetingId is provided
    if (meetingId) {
      socket.emit(CLIENT_EVENTS.JOIN_MEETING, { meetingId });
    }

    const handleBotJoining = (payload: { meetingId: string }) => {
      patchers.patchMeetingBotJoining(queryClient, payload);
    };

    const handleRecording = (payload: { meetingId: string; startedAt: string }) => {
      patchers.patchMeetingRecording(queryClient, payload);
    };

    const handleProcessing = (payload: { meetingId: string }) => {
      patchers.patchMeetingProcessing(queryClient, payload);
    };

    const handleProcessed = (payload: {
      meetingId: string;
      summary: string;
      commitmentCount?: number;
      actionItemCount?: number;
    }) => {
      patchers.patchMeetingProcessed(queryClient, payload);
    };

    const handleFailed = (payload: { meetingId: string; reason?: string }) => {
      patchers.patchMeetingFailed(queryClient, payload);
    };

    // Attach team-wide meeting lifecycle listeners
    socket.on(SERVER_EVENTS.MEETING_BOT_JOINING, handleBotJoining);
    socket.on(SERVER_EVENTS.MEETING_RECORDING, handleRecording);
    socket.on(SERVER_EVENTS.MEETING_PROCESSING, handleProcessing);
    socket.on(SERVER_EVENTS.MEETING_PROCESSED, handleProcessed);
    socket.on(SERVER_EVENTS.MEETING_FAILED, handleFailed);

    return () => {
      if (meetingId) {
        socket.emit(CLIENT_EVENTS.LEAVE_MEETING, { meetingId });
      }

      socket.off(SERVER_EVENTS.MEETING_BOT_JOINING, handleBotJoining);
      socket.off(SERVER_EVENTS.MEETING_RECORDING, handleRecording);
      socket.off(SERVER_EVENTS.MEETING_PROCESSING, handleProcessing);
      socket.off(SERVER_EVENTS.MEETING_PROCESSED, handleProcessed);
      socket.off(SERVER_EVENTS.MEETING_FAILED, handleFailed);
    };
  }, [meetingId, queryClient]);
}
