import React from "react";
import { PageContainer } from "@/components/shared/layout/PageContainer";
import { MeetingListSkeleton } from "@/features/meetings/components/MeetingList/MeetingListSkeleton";

export default function MeetingsLoading() {
  return (
    <PageContainer>
      <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-sans">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-2">
            <div className="h-6 w-28 bg-muted animate-pulse rounded" />
            <div className="h-3 w-72 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-9 w-28 bg-muted animate-pulse rounded" />
        </div>

        {/* Filters Panel Skeleton */}
        <div className="h-[68px] bg-card border border-border rounded-lg p-4 shadow-xs flex items-center justify-between">
          <div className="h-8 w-64 bg-muted animate-pulse rounded" />
          <div className="flex gap-2">
            <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            <div className="h-8 w-24 bg-muted animate-pulse rounded" />
          </div>
        </div>

        {/* List Skeleton */}
        <MeetingListSkeleton />
      </div>
    </PageContainer>
  );
}
