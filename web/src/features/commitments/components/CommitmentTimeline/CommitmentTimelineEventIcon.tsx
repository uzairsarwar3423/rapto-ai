"use client";

import React from "react";

export interface CommitmentTimelineEventIconProps {
  type: "created" | "referenced" | "resolved";
}

export function CommitmentTimelineEventIcon({ type }: CommitmentTimelineEventIconProps) {
  switch (type) {
    case "created":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="text-foreground"
          aria-hidden="true"
        >
          {/* Solid 8px diameter dot */}
          <circle cx="8" cy="8" r="4" fill="currentColor" />
        </svg>
      );
    case "referenced":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="text-muted-foreground"
          aria-hidden="true"
        >
          {/* Hollow 8px diameter dot */}
          <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
      );
    case "resolved":
    default:
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="text-foreground"
          aria-hidden="true"
        >
          {/* 30% opacity halo ring around the dot */}
          <circle
            cx="8"
            cy="8"
            r="7"
            stroke="currentColor"
            strokeWidth="1"
            strokeOpacity="0.3"
            fill="currentColor"
            fillOpacity="0.1"
          />
          {/* Inner solid dot */}
          <circle cx="8" cy="8" r="3" fill="currentColor" />
        </svg>
      );
  }
}
