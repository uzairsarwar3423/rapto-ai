"use client";

import React, { createContext, useEffect } from "react";
import { socketManager } from "../lib/websocket/socket";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { useRealtimeStore } from "@/store/realtime.store";
import axios from "axios";

const WebSocketContext = createContext<null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const setAccessToken = useAuthStore((state) => state.setAccessToken);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const setSessionExpired = useAuthStore((state) => state.setSessionExpired);
  const setConnectionStatus = useRealtimeStore((state) => state.setConnectionStatus);

  useEffect(() => {
    if (!accessToken) {
      socketManager.disconnect();
      setConnectionStatus("disconnected");
      return;
    }

    setConnectionStatus("connecting");
    const socket = socketManager.connect(accessToken);

    const handleConnect = () => {
      setConnectionStatus("connected");
    };

    const handleDisconnect = (reason: string) => {
      // If server closed or client closed explicitly
      if (reason === "io server disconnect" || reason === "io client disconnect") {
        setConnectionStatus("disconnected");
      } else {
        // Reconnecting automatically by socket.io-client
        setConnectionStatus("connecting");
      }
    };

    const handleConnectError = async (err: Error) => {
      const isAuthError =
        err.message.toLowerCase().includes("auth") ||
        err.message.toLowerCase().includes("token") ||
        err.message.toLowerCase().includes("unauthorized") ||
        err.message === "TOKEN_EXPIRED";

      if (isAuthError) {
        setConnectionStatus("disconnected");

        // Silent refresh flow
        try {
          const response = await axios.post(
            "/api/v1/auth/refresh",
            {},
            {
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          const { accessToken: newToken } = response.data;
          if (newToken) {
            setAccessToken(newToken);
          } else {
            throw new Error("Token refresh returned empty token");
          }
        } catch (refreshError) {
          clearAuth();
          setSessionExpired(true);
        }
      } else {
        setConnectionStatus("disconnected");
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    // If it's already connected, sync the state immediately (Strict Mode guard recovery)
    if (socket.connected) {
      setConnectionStatus("connected");
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
    };
  }, [accessToken, setAccessToken, clearAuth, setSessionExpired, setConnectionStatus]);

  return (
    <WebSocketContext.Provider value={null}>
      {children}
    </WebSocketContext.Provider>
  );
}
