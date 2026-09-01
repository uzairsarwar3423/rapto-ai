"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * NotificationPreferencesFormSkeleton — Day 45 §7
 *
 * Matches NotificationPreferencesForm's matrix structure:
 * - Status bar (Slack connection hint)
 * - Card with header + table: [event type 1fr] [email col 32] [slack col 32] [in-app col 32]
 * Dimension-matched to the real form's matrix for zero CLS on load.
 */
export function NotificationPreferencesFormSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in-0 duration-150" aria-busy="true">
      {/* Slack connection status bar */}
      <div className="min-h-[52px] rounded-lg border border-border/30 bg-muted/20 flex items-center gap-3 px-4 py-3">
        <Skeleton className="h-4 w-4 rounded-sm shrink-0" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>

      {/* Preferences matrix card */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        {/* Card header */}
        <div className="border-b border-border/40 bg-muted/20 px-4 sm:px-6 py-4 sm:py-5 space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>

        {/* Matrix table */}
        <div className="w-full overflow-x-auto">
          <div className="min-w-[580px]">
            {/* Column header row */}
            <div
              className="flex items-center px-4 sm:px-6 py-3.5 sm:py-4 border-b border-border/30"
              style={{ display: "grid", gridTemplateColumns: "1fr 128px 128px 128px" }}
            >
              <Skeleton className="h-3 w-32" />
              <div className="flex justify-center">
                <Skeleton className="h-3 w-12" />
              </div>
              <div className="flex justify-center">
                <Skeleton className="h-3 w-12" />
              </div>
              <div className="flex justify-center">
                <Skeleton className="h-3 w-14" />
              </div>
            </div>

            {/* Data rows — 8 rows matching NOTIFICATION_TYPES count */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="border-b border-border/20 last:border-b-0 px-4 sm:px-6 py-3.5 sm:py-4.5"
                style={{ display: "grid", gridTemplateColumns: "1fr 128px 128px 128px" }}
              >
                {/* Event type column */}
                <div className="space-y-1.5 pr-4">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-64" />
                </div>
                {/* Email toggle */}
                <div className="flex justify-center items-center">
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
                {/* Slack toggle */}
                <div className="flex justify-center items-center">
                  <Skeleton className="h-5 w-9 rounded-full opacity-40" />
                </div>
                {/* In-app toggle */}
                <div className="flex justify-center items-center">
                  <Skeleton className="h-5 w-9 rounded-full opacity-70" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
