import React from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function UpcomingMeetingsWidgetSkeleton() {
  return (
    <Card className="col-span-12 md:col-span-6 bg-surface border-border/60">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <Skeleton className="h-4 w-28 bg-border/40" />
        <Skeleton className="h-4 w-12 bg-border/40" />
      </div>
      <ul className="divide-y divide-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2.5">
            <Skeleton className="h-4 w-4 bg-border/40 shrink-0 rounded" />
            <Skeleton className="h-4 flex-1 bg-border/40" />
            <Skeleton className="h-4 w-16 shrink-0 bg-border/40 rounded-full" />
            <Skeleton className="h-4 w-16 shrink-0 bg-border/40 text-right" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
