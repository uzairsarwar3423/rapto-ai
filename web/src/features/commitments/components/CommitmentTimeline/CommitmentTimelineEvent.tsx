import React from "react";
import Link from "next/link";
import { RelativeTime } from "@/shared/components/data-display/RelativeTime";
import { CommitmentStatusBadge } from "../CommitmentStatusBadge";
import { CommitmentTimelineEventIcon } from "./CommitmentTimelineEventIcon";
import type { CommitmentStatus } from "../../types";

export interface CommitmentTimelineEventProps {
  type: "created" | "referenced" | "resolved";
  meetingId: string;
  meetingTitle: string;
  occurredAt: string;
  excerpt?: string;
  resultingStatus?: CommitmentStatus;
  isLast?: boolean;
}

export function CommitmentTimelineEvent({
  type,
  meetingId,
  meetingTitle,
  occurredAt,
  excerpt,
  resultingStatus,
  isLast = false,
}: CommitmentTimelineEventProps) {
  const isReferenced = type === "referenced";
  const meetingUrl = `/meetings/${meetingId}`;

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0 font-sans group select-none">
      {/* Connector Line (runs from center of current dot to next item) */}
      {!isLast && (
        <span
          className="absolute left-[8px] top-4.5 bottom-0 w-0.5 bg-linear-to-b from-border via-border/60 to-transparent"
          aria-hidden="true"
        />
      )}

      {/* State Dot Icon */}
      <div className="relative z-10 shrink-0 mt-0.5 transition-transform duration-160 group-hover:scale-[1.08]">
        <CommitmentTimelineEventIcon type={type} />
      </div>

      {/* Row Content */}
      <div className="flex-1 min-w-0 transition-all duration-160 group-hover:translate-x-0.5">
        <div
          className={`text-sm flex flex-wrap items-center gap-1.5 leading-snug ${
            isReferenced ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {/* Action prefix label */}
          <span className="font-medium text-foreground/80">
            {type === "created" && "Extracted from"}
            {type === "referenced" && "Mentioned in"}
            {type === "resolved" && "Resolved in"}
          </span>

          {/* Source meeting link */}
          <Link
            href={meetingUrl}
            className={`font-semibold hover:underline hover:text-brand text-foreground transition-colors ${
              isReferenced ? "text-muted-foreground hover:text-brand" : ""
            }`}
          >
            {meetingTitle}
          </Link>

          {/* Resolved status badge */}
          {type === "resolved" && resultingStatus && (
            <CommitmentStatusBadge status={resultingStatus} className="ml-1" />
          )}

          {/* Dot separator and Relative time */}
          <span className="text-muted-foreground/45 px-0.5 font-sans text-xs">·</span>
          <RelativeTime
            date={occurredAt}
            className="text-xs text-muted-foreground/85 font-medium"
          />
        </div>

        {/* Optional Transcript Excerpt quote */}
        {excerpt && (
          <div className="mt-2.5 pl-3 border-l-2 border-border/80 font-sans text-xs text-muted-foreground/90 bg-surface/30 py-1.5 px-3 rounded-md max-w-xl shadow-3xs leading-relaxed border border-border/10">
            <span className="italic">“{excerpt}”</span>
          </div>
        )}
      </div>
    </li>
  );
}
