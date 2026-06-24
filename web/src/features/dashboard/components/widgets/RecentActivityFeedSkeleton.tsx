import React from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function RecentActivityFeedSkeleton() {
  return (
    <Card className="col-span-12 md:col-span-8 bg-surface border-border/60">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <Skeleton className="h-4 w-28 bg-border/40" />
      </div>
      <div className="h-[280px] overflow-hidden">
        <ul className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="h-6 w-6 rounded bg-border/40 shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-3/4 bg-border/40" />
                <Skeleton className="h-3 w-1/4 bg-border/40" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
