"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function MeetingListSkeleton() {
  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Header Skeleton */}
      <div className="grid grid-cols-[24px_1fr_90px_48px] sm:grid-cols-[24px_1fr_110px_110px_48px] md:grid-cols-[24px_1fr_110px_125px_100px_48px] gap-3 items-center px-4 py-2 bg-muted/20 border-b border-border">
        <div className="w-3" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16 hidden sm:block" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12 hidden md:block ml-auto" />
        <Skeleton className="h-3 w-4 ml-auto" />
      </div>

      {/* Row Skeletons */}
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[24px_1fr_90px_48px] sm:grid-cols-[24px_1fr_110px_110px_48px] md:grid-cols-[24px_1fr_110px_125px_100px_48px] gap-3 items-center px-4 h-12 border-b border-border last:border-none"
        >
          <div className="flex items-center justify-start pl-0.5">
            <Skeleton className="h-1.5 w-1.5 rounded-full" />
          </div>
          <div className="flex items-center">
            <Skeleton className="h-3.5 w-1/2 rounded" />
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-3.5 w-12 rounded" />
          </div>
          <div>
            <Skeleton className="h-3 w-16 rounded" />
          </div>
          <div className="hidden md:flex items-center justify-end gap-1.5">
            <Skeleton className="h-3.5 w-7 rounded" />
            <Skeleton className="h-3.5 w-7 rounded" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-4 w-4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
