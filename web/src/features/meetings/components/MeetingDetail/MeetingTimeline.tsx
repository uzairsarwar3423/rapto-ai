"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict, format } from "date-fns";
import { AlertCircle } from "lucide-react";
import type { MeetingDetail, MeetingStatus } from "../../types";

const TIMELINE_STEPS: { status: MeetingStatus; label: string }[] = [
  { status: "SCHEDULED",   label: "Scheduled" },
  { status: "BOT_JOINING", label: "Bot joining" },
  { status: "RECORDING",   label: "Recording live" },
  { status: "PROCESSING",  label: "AI processing" },
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

/**
 * Vertical progress rail: a hairline that fills as the meeting advances, small nodes for
 * each stage, the label on the left and when it happened on the right.
 */
export function MeetingTimeline({ meeting }: { meeting: MeetingDetail }) {
  const currentStepIndex = normalizeStatusIndex(meeting.status);
  const isFailed = meeting.status === "FAILED";
  const isCancelled = meeting.status === "CANCELLED";

  return (
    <ol className="select-none">
      {TIMELINE_STEPS.map((step, i) => {
        const timestamp = getTimestampForStep(meeting, step.status);
        const isCurrent = !isFailed && !isCancelled && currentStepIndex === i;
        const isPassed = !isFailed && !isCancelled && currentStepIndex > i;
        const isReached = isPassed || isCurrent || Boolean(timestamp);
        const isLast = i === TIMELINE_STEPS.length - 1;

        return (
          <li
            key={step.status}
            className="relative flex gap-3.5 pb-[18px] last:pb-0"
            aria-current={isCurrent ? "step" : undefined}
          >
            {/* Rail segment to the next stage */}
            {!isLast && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute start-[5px] top-[15px] bottom-[-3px] w-px transition-colors duration-500",
                  isPassed ? "bg-foreground/30" : "bg-border"
                )}
              />
            )}

            {/* Node */}
            <span className="relative z-10 mt-[5px] flex h-[11px] w-[11px] shrink-0 items-center justify-center">
              {isCurrent ? (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/40 motion-reduce:hidden" />
                  <span className="relative h-[9px] w-[9px] rounded-full bg-brand ring-[3px] ring-brand/15" />
                </>
              ) : isPassed || isReached ? (
                <span className="h-[7px] w-[7px] rounded-full bg-foreground/70" />
              ) : (
                <span className="h-[7px] w-[7px] rounded-full border border-border bg-background" />
              )}
            </span>

            {/* Label + time */}
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
              <span
                className={cn(
                  "text-[13px] leading-tight transition-colors duration-300",
                  isCurrent
                    ? "font-medium text-foreground"
                    : isReached
                    ? "text-foreground/85"
                    : "text-muted-foreground/70"
                )}
              >
                {step.label}
              </span>
              {timestamp && (
                <time
                  dateTime={timestamp}
                  className="shrink-0 text-xs tabular-nums leading-tight text-muted-foreground"
                  title={format(new Date(timestamp), "PPpp")}
                >
                  {formatDistanceToNowStrict(new Date(timestamp), { addSuffix: true })}
                </time>
              )}
            </div>
          </li>
        );
      })}

      {isFailed && (
        <li className="mt-4 flex gap-3.5 border-t border-border/60 pt-4 text-red-600 dark:text-red-400">
          <AlertCircle className="mt-[2px] h-[11px] w-[11px] shrink-0" strokeWidth={2.25} aria-hidden="true" />
          <div className="min-w-0 text-[13px] leading-tight">
            <span className="font-medium">Pipeline failed</span>
            {meeting.processingError && (
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {meeting.processingError}
              </p>
            )}
          </div>
        </li>
      )}
    </ol>
  );
}
