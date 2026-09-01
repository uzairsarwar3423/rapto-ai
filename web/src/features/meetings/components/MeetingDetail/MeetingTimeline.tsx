"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { Check, Loader2, AlertCircle } from "lucide-react";
import type { MeetingDetail, MeetingStatus } from "../../types";

const TIMELINE_STEPS: { status: MeetingStatus; label: string }[] = [
  { status: "SCHEDULED",   label: "Scheduled" },
  { status: "BOT_JOINING", label: "Bot joining" },
  { status: "RECORDING",   label: "Recording live" },
  { status: "PROCESSING",  label: "AI Processing" },
  { status: "DONE",        label: "Completed" },
];

function normalizeStatusIndex(status: string): number {
  const norm = (status || "").toUpperCase();
  switch (norm) {
    case "SCHEDULED": return 0;
    case "BOT_JOINING": return 1;
    case "RECORDING": return 2;
    case "PROCESSING":
    case "TRANSCRIBED":
    case "TRANSCRIPT_CLEANED": return 3;
    case "EXTRACTED":
    case "RESOLVED":
    case "DONE": return 4;
    default: return -1;
  }
}

function getTimestampForStep(meeting: MeetingDetail, stepStatus: MeetingStatus): string | null {
  switch (stepStatus) {
    case "SCHEDULED":
      return meeting.scheduledAt || null;
    case "BOT_JOINING":
      return meeting.botJoinedAt || null;
    case "RECORDING":
      return meeting.recordingStartedAt || meeting.startedAt || null;
    case "PROCESSING":
      return meeting.processingStartedAt || null;
    case "DONE":
      return meeting.completedAt || meeting.endedAt || null;
    default:
      return null;
  }
}

export function MeetingTimeline({ meeting }: { meeting: MeetingDetail }) {
  const currentStepIndex = normalizeStatusIndex(meeting.status);
  const isFailed = meeting.status === "FAILED";
  const isCancelled = meeting.status === "CANCELLED";

  return (
    <ol className="relative pl-1 select-none">
      {TIMELINE_STEPS.map((step, i) => {
        const timestamp = getTimestampForStep(meeting, step.status);
        const isCurrent = !isFailed && !isCancelled && currentStepIndex === i;
        const isPassed = !isFailed && !isCancelled && currentStepIndex > i;
        const isReached = isPassed || isCurrent || Boolean(timestamp);

        return (
          <li key={step.status} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Connecting vertical line */}
            {i < TIMELINE_STEPS.length - 1 && (
              <span
                className={cn(
                  "absolute left-[7px] top-4 h-full w-[2px] -ml-px transition-colors duration-300",
                  isPassed ? "bg-primary" : "bg-border"
                )}
              />
            )}

            {/* Step node icon / dot */}
            <div className="relative z-10 flex h-4 w-4 shrink-0 items-center justify-center">
              {isPassed ? (
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2 w-2 stroke-[3]" />
                </span>
              ) : isCurrent ? (
                <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
              ) : (
                <span
                  className={cn(
                    "h-2 w-2 rounded-full border transition-colors duration-300",
                    isReached ? "bg-primary border-primary" : "bg-background border-border"
                  )}
                />
              )}
            </div>

            {/* Step label & timestamp */}
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "text-xs transition-colors duration-300 flex items-center gap-1.5",
                  isCurrent
                    ? "font-semibold text-foreground"
                    : isReached
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <span>{step.label}</span>
                {isCurrent && (
                  <span className="text-[10px] uppercase tracking-wider text-primary font-bold animate-pulse">
                    Active
                  </span>
                )}
              </div>

              {timestamp && (
                <div
                  className="text-[11px] text-muted-foreground mt-0.5"
                  title={format(new Date(timestamp), "PPpp")}
                >
                  {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
                </div>
              )}
            </div>
          </li>
        );
      })}

      {isFailed && (
        <li className="relative flex gap-3 text-red-600 dark:text-red-400 mt-2 pt-2 border-t border-red-500/20">
          <div className="relative z-10 flex h-4 w-4 shrink-0 items-center justify-center">
            <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
          </div>
          <div className="text-xs">
            <span className="font-semibold">Pipeline Failed</span>
            {meeting.processingError && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {meeting.processingError}
              </p>
            )}
          </div>
        </li>
      )}
    </ol>
  );
}
