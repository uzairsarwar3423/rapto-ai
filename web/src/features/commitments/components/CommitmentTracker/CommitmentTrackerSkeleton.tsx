"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function CommitmentTrackerSkeleton() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-sans">
      {/* Header section skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      {/* Segmented tabs skeleton */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-[380px]" />
      </div>

      {/* Filter panel skeleton */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>

      {/* List content skeleton */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        {/* Table header skeleton */}
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-24" />
        </div>
        
        {/* Rows skeleton */}
        <div className="divide-y divide-border/40">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center justify-between h-[36px] px-3">
              <div className="flex items-center gap-2.5 w-full">
                <Skeleton className="h-4 w-16 shrink-0" />
                <Skeleton className="h-4 w-3/4 max-w-md" />
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
