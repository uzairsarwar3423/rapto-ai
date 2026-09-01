"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function MeetingListSkeleton() {
  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden shadow-xs">
      {/* Desktop Header Skeleton */}
      <div className="hidden sm:grid sm:grid-cols-[28px_1fr_110px_110px_48px] md:grid-cols-[28px_1fr_110px_125px_110px_48px] lg:grid-cols-[28px_1fr_120px_135px_140px_56px] gap-3 items-center px-4 py-2.5 bg-muted/20 border-b border-border">
        <div className="w-3" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16 hidden md:block ml-auto" />
        <Skeleton className="h-3 w-4 ml-auto" />
      </div>

      {/* Row Skeletons */}
      <div className="divide-y divide-border/70">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index}>
            {/* Desktop Row Skeleton */}
            <div className="hidden sm:grid sm:grid-cols-[28px_1fr_110px_110px_48px] md:grid-cols-[28px_1fr_110px_125px_110px_48px] lg:grid-cols-[28px_1fr_120px_135px_140px_56px] gap-3 items-center px-4 h-12.5">
              <div className="flex items-center justify-start pl-0.5">
                <Skeleton className="h-2 w-2 rounded-full" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-1/2 rounded" />
                <Skeleton className="h-4 w-14 rounded-full" />
              </div>
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-3.5 w-12 rounded" />
              </div>
              <div>
                <Skeleton className="h-3 w-16 rounded" />
              </div>
              <div className="hidden md:flex items-center justify-end gap-1.5">
                <Skeleton className="h-4 w-8 rounded" />
                <Skeleton className="h-4 w-8 rounded" />
              </div>
              <div className="flex justify-end">
                <Skeleton className="h-4 w-4 rounded" />
              </div>
            </div>

            {/* Mobile Row Skeleton */}
            <div className="sm:hidden flex flex-col gap-2.5 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <Skeleton className="h-2 w-2 rounded-full shrink-0" />
                  <Skeleton className="h-4 w-4 rounded shrink-0" />
                  <Skeleton className="h-3.5 w-3/5 rounded" />
                </div>
                <Skeleton className="h-4 w-14 rounded-full shrink-0" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-20 rounded" />
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3.5 w-8 rounded" />
                  <Skeleton className="h-3.5 w-8 rounded" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
