"use client";

import React from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, ExternalLink, Video, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  meetingUrl: string | null;
  platform: string | null;
  isValid: boolean;
}

interface CalendarEventPreviewRowProps {
  event: CalendarEvent;
}

export function CalendarEventPreviewRow({ event }: CalendarEventPreviewRowProps) {
  const getPlatformLabel = (platform: string | null) => {
    if (!platform) return "Manual";
    return platform.toLowerCase().replace("_", " ");
  };

  const getFormattedTime = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, "MMM d, h:mm a");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="py-3 flex flex-col gap-1.5 border-b border-muted/10 last:border-0 font-sans">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-sans font-medium text-xs text-foreground leading-[18px]">
          {event.summary}
        </h4>
        <Badge
          variant="outline"
          className="text-[9px] font-sans font-medium capitalize px-1.5 py-0 h-4 bg-muted/30 border-muted/20 text-muted-foreground/80 select-none shrink-0"
        >
          {getPlatformLabel(event.platform)}
        </Badge>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground/60 leading-[16px]">
        <time className="tabular-nums font-normal">
          {getFormattedTime(event.start)}
        </time>

        <div className="flex items-center gap-1 select-none">
          {event.isValid ? (
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
              Auto Join
            </span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground/50 font-normal">
              <XCircle className="w-3 h-3" />
              No Link
            </span>
          )}
        </div>
      </div>

      {event.meetingUrl && (
        <a
          href={event.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 w-fit text-[11px] text-primary hover:underline font-normal select-all truncate mt-0.5"
        >
          <Video className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[280px]">{event.meetingUrl}</span>
          <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60" />
        </a>
      )}
    </div>
  );
}
