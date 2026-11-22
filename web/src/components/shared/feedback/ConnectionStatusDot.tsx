"use client";

import React from "react";
import { useRealtimeStore } from "@/store/realtime.store";
import { cn } from "@/lib/utils";

interface ConnectionStatusDotProps {
  className?: string;
  /** Dot only (with an accessible label) — for use as a badge on an avatar. */
  compact?: boolean;
}

const STATUS = {
  connected: { dot: "bg-emerald-500", ring: "bg-emerald-500/45", pulse: true, label: "Connected" },
  connecting: { dot: "bg-amber-500", ring: "bg-amber-500/45", pulse: true, label: "Reconnecting" },
  disconnected: { dot: "bg-muted-foreground/60", ring: "", pulse: false, label: "Offline" },
} as const;

export function ConnectionStatusDot({ className, compact = false }: ConnectionStatusDotProps) {
  const connectionStatus = useRealtimeStore((state) => state.connectionStatus);
  const current = STATUS[connectionStatus as keyof typeof STATUS] ?? STATUS.disconnected;

  // A soft ring slowly breathes out from the dot while live; it stops for offline and for reduced motion.
  const dot = (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
      {current.pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full motion-reduce:hidden",
            current.ring,
            connectionStatus === "connected" ? "animate-[ping_2.6s_cubic-bezier(0,0,0.2,1)_infinite]" : "animate-ping"
          )}
        />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full transition-colors duration-300", current.dot)} />
    </span>
  );

  if (compact) {
    return (
      <span
        role="status"
        title={`Realtime: ${current.label}`}
        className={cn("inline-flex", className)}
      >
        {dot}
        <span className="sr-only">Realtime status: {current.label}</span>
      </span>
    );
  }

  return (
    <div
      role="status"
      className={cn("flex items-center gap-2 select-none", className)}
      title={`Realtime Status: ${current.label}`}
    >
      {dot}
      <span className="text-[11px] font-medium text-muted-foreground font-sans">{current.label}</span>
    </div>
  );
}
