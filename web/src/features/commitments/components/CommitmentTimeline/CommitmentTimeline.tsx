"use client";

import React, { useState, useEffect } from "react";
import { CommitmentTimelineEvent } from "./CommitmentTimelineEvent";
import type { CommitmentStatus } from "../../types";

export interface TimelineEventData {
  type: "created" | "referenced" | "resolved";
  meetingId: string;
  meetingTitle: string;
  occurredAt: string;
  excerpt?: string;
  resultingStatus?: CommitmentStatus;
}

export interface CommitmentTimelineProps {
  events: TimelineEventData[];
}

export function CommitmentTimeline({ events }: CommitmentTimelineProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!events || events.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        No history events recorded for this commitment.
      </div>
    );
  }

  return (
    <ol
      aria-label="Commitment history"
      className="relative pl-1 transition-opacity duration-150 ease-out"
      style={{
        opacity: mounted ? 1 : 0,
      }}
    >
      {events.map((event, idx) => (
        <CommitmentTimelineEvent
          key={`${event.type}-${event.meetingId}-${idx}`}
          type={event.type}
          meetingId={event.meetingId}
          meetingTitle={event.meetingTitle}
          occurredAt={event.occurredAt}
          excerpt={event.excerpt}
          resultingStatus={event.resultingStatus}
          isLast={idx === events.length - 1}
        />
      ))}
    </ol>
  );
}
