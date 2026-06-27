"use client";

import React from "react";
import { cn } from "@/lib/utils";

const PROVIDER_LOGOS: Record<string, string> = {
  SLACK: "/icons/slack.svg",
  JIRA: "/icons/jira.svg",
  LINEAR: "/icons/linear.svg",
  NOTION: "/icons/notion.svg",
  GOOGLE_CALENDAR: "/icons/google-calender.svg",
  GOOGLE_MEET: "/icons/google-meet.svg",
};

interface IntegrationIconProps {
  provider: string;
  className?: string;
}

export function IntegrationIcon({ provider, className }: IntegrationIconProps) {
  const src = PROVIDER_LOGOS[provider.toUpperCase()];

  return (
    <div
      className={cn(
        "w-6 h-6 rounded-md flex items-center justify-center bg-white border border-muted/30 shrink-0 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className
      )}
    >
      {src ? (
        <img
          src={src}
          alt={`${provider} logo`}
          className="w-3.5 h-3.5 object-contain select-none"
        />
      ) : (
        <div className="w-3.5 h-3.5 rounded bg-muted" />
      )}
    </div>
  );
}
