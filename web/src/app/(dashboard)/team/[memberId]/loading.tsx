import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function MemberProfileLoading() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 select-none font-sans">
      {/* Breadcrumb Skeleton */}
      <div className="flex items-center gap-1.5 h-4">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-3" />
        <Skeleton className="h-3 w-20" />
      </div>

      {/* Header Skeleton */}
      <div className="flex items-center justify-between pb-6 border-b border-border">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4.5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        </div>
      </div>

      {/* Nav Skeleton */}
      <div className="flex gap-4 h-9 items-center border-b px-1">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Main Sections Stack Skeletons */}
      <div className="space-y-10 pt-2">
        {/* Summary Breakdown Card */}
        <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-6 items-center p-5 rounded-2xl border border-border">
          <div className="flex justify-center">
            <Skeleton className="size-28 rounded-full" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        </div>

        {/* Trend Card */}
        <div className="flex items-center justify-between p-5 rounded-2xl border border-border">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-12" />
          </div>
          <Skeleton className="h-[32px] w-[120px]" />
        </div>

        {/* History Skeleton */}
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-36" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
          <div className="border border-border rounded-lg p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
