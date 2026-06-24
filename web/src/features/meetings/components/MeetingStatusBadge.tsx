"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { MeetingStatus } from "../types";

const STATUS_BADGE_MAP: Record<
  MeetingStatus,
  { label: string; className: string }
> = {
  SCHEDULED: {
    label: "Scheduled",
    className: "text-muted-foreground border-border bg-muted/5",
  },
  BOT_JOINING: {
    label: "Joining",
    className: "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5 animate-pulse",
  },
  RECORDING: {
    label: "Recording",
    className: "text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/5 animate-pulse font-medium",
  },
  PROCESSING: {
    label: "Processing",
    className: "text-orange-600 dark:text-orange-400 border-orange-500/30 bg-orange-500/5",
  },
  DONE: {
    label: "Done",
    className: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
  },
  FAILED: {
    label: "Failed",
    className: "text-red-700 dark:text-red-400 border-red-500/30 bg-red-500/5",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "text-muted-foreground/50 border-border bg-muted/5 line-through",
  },
};

interface MeetingStatusBadgeProps {
  status: MeetingStatus;
}

export function MeetingStatusBadge({ status }: MeetingStatusBadgeProps) {
  const badgeConfig = STATUS_BADGE_MAP[status] || {
    label: status,
    className: "text-muted-foreground border-border",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase border",
        badgeConfig.className
      )}
    >
      {badgeConfig.label}
    </span>
  );
}
