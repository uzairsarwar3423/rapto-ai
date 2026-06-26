// web/src/features/team/components/MemberTable/MemberTableSkeleton.tsx

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function MemberTableSkeleton() {
  return (
    <div className="border border-border rounded-lg bg-surface/30 overflow-hidden">
      {/* Header Skeleton */}
      <div className="grid grid-cols-[1fr_100px_72px_140px_180px_90px_36px] h-10 items-center px-4 border-b border-border bg-surface-hover/30">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-12" />
        ))}
      </div>

      {/* Row Skeletons */}
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid grid-cols-[1fr_100px_72px_140px_180px_90px_36px] h-12 items-center px-4"
          >
            {/* Profile Avatar + Text */}
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-7 rounded-full shrink-0" />
              <div className="flex flex-col gap-1 w-24">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-2 w-24" />
              </div>
            </div>

            {/* Role Badge */}
            <div>
              <Skeleton className="h-5 w-16 rounded" />
            </div>

            {/* Commitment Gauge */}
            <div className="pl-2">
              <Skeleton className="size-8 rounded-full" />
            </div>

            {/* Rate bar */}
            <div className="pr-4">
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>

            {/* Numbers */}
            <div className="pr-6 flex justify-end">
              <Skeleton className="h-3 w-16" />
            </div>

            {/* Trend */}
            <div>
              <Skeleton className="h-4 w-12 rounded" />
            </div>

            {/* Actions */}
            <div className="flex justify-end">
              <Skeleton className="size-6 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
