"use client";

import React, { useEffect, useState } from "react";
import { useRealtimeStore } from "@/store/realtime.store";

export function OfflineBanner() {
  const connectionStatus = useRealtimeStore((state) => state.connectionStatus);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (connectionStatus === "disconnected") {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShowBanner(false);
    }
  }, [connectionStatus]);

  if (!showBanner) return null;

  return (
    <div className="w-full bg-muted border-b border-border text-muted-foreground text-[12px] font-medium py-1.5 px-4 text-center flex items-center justify-center gap-2 select-none animate-in slide-in-from-top duration-300">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
      Connection lost — reconnecting to live sync...
    </div>
  );
}
