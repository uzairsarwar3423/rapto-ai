"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRealtimeStore } from "@/store/realtime.store";

export function useSocketReconnectToast() {
  const connectionStatus = useRealtimeStore((state) => state.connectionStatus);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isToastActiveRef = useRef(false);

  useEffect(() => {
    if (connectionStatus === "connected") {
      // Clear any pending triggers
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Dismiss active toast
      if (isToastActiveRef.current) {
        toast.dismiss("socket-reconnect");
        isToastActiveRef.current = false;
      }
      return;
    }

    // If disconnected/connecting, set a 3-second debounce before showing the toast
    if (
      (connectionStatus === "disconnected" || connectionStatus === "connecting") &&
      !timeoutRef.current &&
      !isToastActiveRef.current
    ) {
      timeoutRef.current = setTimeout(() => {
        toast.loading("Reconnecting to live sync...", {
          id: "socket-reconnect",
          duration: Infinity,
        });
        isToastActiveRef.current = true;
        timeoutRef.current = null;
      }, 3000);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [connectionStatus]);
}
