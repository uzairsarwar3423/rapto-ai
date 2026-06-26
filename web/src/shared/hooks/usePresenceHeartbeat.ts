"use client";

import { useEffect } from "react";
import { socketManager } from "@/shared/lib/websocket/socket";
import { CLIENT_EVENTS } from "@/shared/lib/websocket/socket.events";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useRealtimeStore } from "@/store/realtime.store";

export function usePresenceHeartbeat(intervalMs = 25000) {
  const { user } = useAuth();
  const connectionStatus = useRealtimeStore((state) => state.connectionStatus);

  // Send heartbeat pings to the server
  useEffect(() => {
    if (connectionStatus !== "connected" || !user) return;
    const socket = socketManager.getSocket();
    if (!socket) return;

    const send = () => {
      socket.emit(CLIENT_EVENTS.PRESENCE_PING);
    };

    send(); // Immediate first beat on connection
    const id = setInterval(send, intervalMs);

    return () => clearInterval(id);
  }, [connectionStatus, user, intervalMs]);

  // Listen for incoming presence pings from other team members
  useEffect(() => {
    if (connectionStatus !== "connected") return;
    const socket = socketManager.getSocket();
    if (!socket) return;

    const handlePresencePing = (payload: { userId: string }) => {
      if (payload?.userId) {
        useRealtimeStore.getState().recordPresence(payload.userId, Date.now());
      }
    };

    socket.on(CLIENT_EVENTS.PRESENCE_PING, handlePresencePing);

    return () => {
      socket.off(CLIENT_EVENTS.PRESENCE_PING, handlePresencePing);
    };
  }, [connectionStatus]);

  // Periodic pruning of stale presence mappings
  useEffect(() => {
    const prune = () => {
      // 60-second grace window to absorb transient missed pings
      useRealtimeStore.getState().prunePresence(60000);
    };
    
    prune();
    const id = setInterval(prune, 10000); // Check and prune every 10 seconds

    return () => clearInterval(id);
  }, []);
}
