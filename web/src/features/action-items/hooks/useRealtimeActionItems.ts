"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socketManager } from "@/shared/lib/websocket/socket";
import { SERVER_EVENTS } from "@/shared/lib/websocket/socket.events";
import { useAuth } from "@/features/auth/hooks/useAuth";

export function useRealtimeActionItems() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.teamId) return;
    const socket = socketManager.getSocket();
    if (!socket) return;

    const handleSynced = (payload: { actionItemId: string; provider: string; success: boolean }) => {
      // Invalidate all action items queries for this team
      queryClient.invalidateQueries({
        queryKey: ["teams", user.teamId, "action-items"],
      });
      // Invalidate meeting-scoped action items queries
      queryClient.invalidateQueries({
        queryKey: ["actionItems", "byMeeting"],
      });
    };

    const handleCompleted = (payload: { actionItemId: string; completed: boolean; source: string }) => {
      queryClient.invalidateQueries({
        queryKey: ["teams", user.teamId, "action-items"],
      });
      queryClient.invalidateQueries({
        queryKey: ["actionItems", "byMeeting"],
      });
    };

    socket.on(SERVER_EVENTS.ACTION_ITEM_SYNCED, handleSynced);
    socket.on(SERVER_EVENTS.ACTION_ITEM_COMPLETED, handleCompleted);

    return () => {
      socket.off(SERVER_EVENTS.ACTION_ITEM_SYNCED, handleSynced);
      socket.off(SERVER_EVENTS.ACTION_ITEM_COMPLETED, handleCompleted);
    };
  }, [queryClient, user?.teamId]);
}
