"use client";

import React from "react";
import { useRealtimeStore } from "@/store/realtime.store";
import { cn } from "@/lib/utils";

interface ConnectionStatusDotProps {
  className?: string;
}

export function ConnectionStatusDot({ className }: ConnectionStatusDotProps) {
  const connectionStatus = useRealtimeStore((state) => state.connectionStatus);

  const statusConfig = {
    connected: {
      color: "bg-emerald-500 animate-heartbeat",
      label: "Connected",
    },
    connecting: {
      color: "bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.4)]",
      label: "Reconnecting",
    },
    disconnected: {
      color: "bg-muted-foreground/60",
      label: "Offline",
    },
  };

  const current = statusConfig[connectionStatus] || statusConfig.disconnected;

  return (
    <div
      className={cn("flex items-center gap-2 select-none", className)}
      title={`Realtime Status: ${current.label}`}
    >
      <span className={cn("h-2 w-2 rounded-full transition-all duration-300", current.color)} />
      <span className="text-[11px] font-medium text-muted-foreground font-sans">
        {current.label}
      </span>
    </div>
  );
}
