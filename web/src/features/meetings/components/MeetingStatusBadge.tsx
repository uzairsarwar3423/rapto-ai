"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, AlertCircle, Calendar, Radio, Ban } from "lucide-react";
import type { MeetingStatus } from "../types";
import { getMeetingStatusLabel } from "../lib/meetingFormat";

interface StatusConfig {
  label: string;
  className: string;
  dotClassName?: string;
  icon?: React.ReactNode;
  isLive?: boolean;
  isSpinning?: boolean;
  /** Text colour for the quiet variant */
  quietClassName: string;
  /** Dot colour for the quiet variant */
  quietDot: string;
}

function getStatusConfig(status: string): StatusConfig {
  const norm = (status || "").toUpperCase();

  switch (norm) {
    case "BOT_JOINING":
      return {
        label: getMeetingStatusLabel(norm),
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
        dotClassName: "bg-amber-500",
        quietClassName: "text-amber-600 dark:text-amber-400",
        quietDot: "bg-amber-500",
        isLive: true,
      };
    case "RECORDING":
      return {
        label: getMeetingStatusLabel(norm),
        className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/35 font-semibold shadow-xs shadow-red-500/10",
        dotClassName: "bg-red-600 dark:bg-red-500",
        quietClassName: "text-red-600 dark:text-red-400",
        quietDot: "bg-red-500",
        icon: <Radio className="h-2.5 w-2.5 shrink-0 animate-pulse text-red-600 dark:text-red-400" />,
        isLive: true,
      };
    case "PROCESSING":
    case "TRANSCRIBED":
    case "TRANSCRIPT_CLEANED":
      return {
        label: getMeetingStatusLabel(norm),
        className: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
        icon: <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-indigo-600 dark:text-indigo-400" />,
        isSpinning: true,
        quietClassName: "text-indigo-600 dark:text-indigo-400",
        quietDot: "bg-indigo-500",
      };
    case "DONE":
    case "RESOLVED":
    case "EXTRACTED":
      return {
        label: getMeetingStatusLabel(norm),
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        icon: <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />,
        quietClassName: "text-foreground/80",
        quietDot: "bg-brand",
      };
    case "FAILED":
    case "EXTRACTION_FAILED":
    case "RESOLUTION_FAILED":
      return {
        label: getMeetingStatusLabel(norm),
        className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
        icon: <AlertCircle className="h-2.5 w-2.5 shrink-0 text-red-600 dark:text-red-400" />,
        quietClassName: "text-red-600 dark:text-red-400",
        quietDot: "bg-red-500",
      };
    case "CANCELLED":
      return {
        label: getMeetingStatusLabel(norm),
        className: "bg-muted/40 text-muted-foreground/70 border-border/50 line-through",
        icon: <Ban className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />,
        quietClassName: "text-muted-foreground line-through",
        quietDot: "bg-muted-foreground/40",
      };
    case "SCHEDULED":
    default:
      return {
        label: getMeetingStatusLabel(norm),
        className: "bg-muted/30 text-muted-foreground border-border/80",
        icon: <Calendar className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />,
        quietClassName: "text-muted-foreground",
        quietDot: "bg-muted-foreground/50",
      };
  }
}

interface MeetingStatusBadgeProps {
  status: MeetingStatus | string;
  className?: string;
  size?: "sm" | "md";
  showIcon?: boolean;
  /**
   * "pill" (default): the bordered, tinted badge used in lists.
   * "quiet": a dot + label with no container, for page headers.
   */
  variant?: "pill" | "quiet";
}

export function MeetingStatusBadge({
  status,
  className,
  size = "sm",
  showIcon = true,
  variant = "pill",
}: MeetingStatusBadgeProps) {
  const config = getStatusConfig(status);

  if (variant === "quiet") {
    return (
      <span
        className={cn(
          "inline-flex select-none items-center gap-1.5 text-[13px] font-medium",
          config.quietClassName,
          className
        )}
      >
        <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
          {config.isLive && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden",
                config.quietDot
              )}
            />
          )}
          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", config.quietDot)} />
        </span>
        <span>{config.label}</span>
      </span>
    );
  }

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
