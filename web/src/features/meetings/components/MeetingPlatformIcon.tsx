"use client";

import React from "react";
import { Calendar, Laptop } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformType } from "../types";

const PLATFORM_MAP: Record<
  PlatformType,
  {
    icon?: React.ComponentType<{ className?: string }>;
    svgPath?: string;
    label: string;
    className: string;
  }
> = {
  ZOOM: {
    svgPath: "/icons/zoom1.svg",
    label: "Zoom",
    className: "bg-transparent border-transparent p-0",
  },
  GOOGLE_MEET: {
    svgPath: "/icons/google-meet.svg",
    label: "Google Meet",
    className: "bg-transparent border-transparent p-0",
  },
  TEAMS: {
    svgPath: "/icons/teams.svg",
    label: "Teams",
    className: "bg-transparent border-transparent p-0",
  },
  WEBEX: {
    svgPath: "/icons/webex.svg",
    label: "Webex",
    className: "bg-transparent border-transparent p-0",
  },
  MANUAL: {
    icon: Calendar,
    label: "Manual",
    className: "text-muted-foreground bg-muted/10 border-border/50 p-1",
  },
};

interface MeetingPlatformIconProps {
  platform: PlatformType;
  showLabel?: boolean;
  className?: string;
}

export function MeetingPlatformIcon({
  platform,
  showLabel = false,
  className,
}: MeetingPlatformIconProps) {
  const config = PLATFORM_MAP[platform] || {
    icon: Laptop,
    label: platform,
    className: "text-muted-foreground border-border p-1",
  };

  const renderIcon = () => {
    if (config.svgPath) {
      return (
        <img
          src={config.svgPath}
          className="h-4 w-4 object-contain shrink-0"
          alt={config.label}
        />
      );
    }
    if (config.icon) {
      const Icon = config.icon;
      return <Icon className="h-3 w-3 shrink-0" />;
    }
    return null;
  };

  if (showLabel) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-foreground", className)}>
        <span className={cn("flex items-center justify-center rounded border", config.className)}>
          {renderIcon()}
        </span>
        <span>{config.label}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex items-center justify-center rounded border",
        config.className,
        className
      )}
      title={config.label}
    >
      {renderIcon()}
    </span>
  );
}
