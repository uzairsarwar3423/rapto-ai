import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function CommitmentDetailLoading() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto py-2 px-4 font-sans animate-pulse">
      {/* Back Link Placeholder */}
      <div className="h-4 w-32 bg-border/40 rounded-sm" />

      {/* Main Two-Column Loading Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column Skeleton (Detail Header + Timeline) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Header Card Skeleton */}
          <div className="bg-surface/5 border border-border/60 p-6 rounded-md space-y-6">
            {/* Promise text */}
            <div className="space-y-2">
              <Skeleton className="h-6 w-3/4 bg-border/40" />
              <Skeleton className="h-6 w-1/2 bg-border/40" />
            </div>
            {/* Metadata row */}
            <div className="flex justify-between items-center pt-4 border-t border-border/40">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full bg-border/40" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-24 bg-border/40" />
                  <Skeleton className="h-3 w-16 bg-border/40" />
                </div>
              </div>
              <div className="flex gap-4">
                <Skeleton className="h-8 w-20 bg-border/40" />
                <Skeleton className="h-8 w-16 bg-border/40" />
              </div>
            </div>
          </div>

          {/* Timeline Card Skeleton */}
          <div className="bg-surface/5 border border-border/60 p-6 rounded-md space-y-6">
            <Skeleton className="h-4 w-36 bg-border/40" />
            
            <div className="space-y-6 pl-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4 items-start">
                  <Skeleton className="h-4 w-4 rounded-full bg-border/40 mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3 bg-border/40" />
                    <Skeleton className="h-8 w-full bg-border/40 max-w-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column Skeleton (Performance Score Gauge) */}
        <div>
          <div className="bg-surface/5 border border-border/60 p-6 rounded-md flex flex-col items-center justify-center space-y-6 min-h-[320px]">
            <div className="space-y-2 text-center w-full flex flex-col items-center">
              <Skeleton className="h-4 w-28 bg-border/40" />
              <Skeleton className="h-3 w-20 bg-border/40" />
            </div>

            {/* Gauge Circle Placeholder */}
            <Skeleton className="h-24 w-24 rounded-full bg-border/40" />

            {/* Legend Lines Placeholders */}
            <div className="w-full space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex justify-between items-center border-b border-border/40 pb-1.5 last:border-0">
                  <Skeleton className="h-3.5 w-24 bg-border/40" />
                  <Skeleton className="h-3.5 w-10 bg-border/40" />
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
