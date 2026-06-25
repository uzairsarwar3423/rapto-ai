"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { PlatformType } from "../types";
import { MeetingPlatformIcon } from "./MeetingPlatformIcon";

interface PlatformDetectBadgeProps {
  platform: PlatformType | null;
  isDetecting: boolean;
}

export function PlatformDetectBadge({ platform, isDetecting }: PlatformDetectBadgeProps) {
  // If no platform and not currently checking, show nothing
  if (!platform && !isDetecting) return null;

  const displayLabel = platform
    ? platform === "GOOGLE_MEET"
      ? "Google Meet"
      : platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase()
    : "";

  return (
    <div
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-border bg-card text-3xs font-mono font-medium text-foreground transition-all duration-140 ease-out animate-in fade-in-0 slide-in-from-bottom-0.5",
        isDetecting && "opacity-50"
      )}
    >
      {platform ? (
        <>
          <MeetingPlatformIcon platform={platform} className="border-0 p-0 h-3.5 w-3.5 bg-transparent shadow-none" />
          <span>Detected: {displayLabel}</span>
        </>
      ) : (
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 bg-foreground/60 rounded-full animate-pulse" />
          Detecting...
        </span>
      )}
    </div>
  );
}
