"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, AlertCircle, Calendar, Radio, Ban } from "lucide-react";
import type { MeetingStatus } from "../types";

interface StatusConfig {
  label: string;
  className: string;
  dotClassName?: string;
  icon?: React.ReactNode;
  isLive?: boolean;
  isSpinning?: boolean;
}

function getStatusConfig(status: string): StatusConfig {
  const norm = (status || "").toUpperCase();

  switch (norm) {
    case "BOT_JOINING":
      return {
        label: "Joining Call",
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
        dotClassName: "bg-amber-500",
        isLive: true,
      };
    case "RECORDING":
      return {
        label: "Recording Live",
        className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/35 font-semibold shadow-xs shadow-red-500/10",
        dotClassName: "bg-red-600 dark:bg-red-500",
        icon: <Radio className="h-2.5 w-2.5 shrink-0 animate-pulse text-red-600 dark:text-red-400" />,
        isLive: true,
      };
    case "PROCESSING":
    case "TRANSCRIBED":
    case "TRANSCRIPT_CLEANED":
      return {
        label: "AI Processing",
        className: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
        icon: <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-indigo-600 dark:text-indigo-400" />,
        isSpinning: true,
      };
    case "DONE":
    case "RESOLVED":
    case "EXTRACTED":
      return {
        label: "Done",
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        icon: <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />,
      };
    case "FAILED":
    case "EXTRACTION_FAILED":
    case "RESOLUTION_FAILED":
      return {
        label: "Failed",
        className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
        icon: <AlertCircle className="h-2.5 w-2.5 shrink-0 text-red-600 dark:text-red-400" />,
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        className: "bg-muted/40 text-muted-foreground/70 border-border/50 line-through",
        icon: <Ban className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />,
      };
    case "SCHEDULED":
    default:
      return {
        label: "Scheduled",
        className: "bg-muted/30 text-muted-foreground border-border/80",
        icon: <Calendar className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />,
      };
  }
}

interface MeetingStatusBadgeProps {
  status: MeetingStatus | string;
  className?: string;
  size?: "sm" | "md";
  showIcon?: boolean;
}

export function MeetingStatusBadge({
  status,
  className,
  size = "sm",
  showIcon = true,
}: MeetingStatusBadgeProps) {
  const config = getStatusConfig(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium tracking-wide uppercase border transition-all duration-300 select-none",
        size === "sm"
          ? "px-2 py-0.5 text-[9px]"
          : "px-2.5 py-1 text-[11px]",
        config.className,
        className
      )}
    >
      {config.isLive && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span
            className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              config.dotClassName
            )}
          />
          <span
            className={cn(
              "relative inline-flex rounded-full h-1.5 w-1.5",
              config.dotClassName
            )}
          />
        </span>
      )}

      {showIcon && !config.isLive && config.icon}

      <span>{config.label}</span>
    </span>
  );
}
