import React from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function TeamPulseWidgetSkeleton() {
  return (
    <Card className="col-span-12 md:col-span-4 bg-surface border-border/60">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <Skeleton className="h-4 w-24 bg-border/40" />
        <Skeleton className="h-4 w-12 bg-border/40" />
      </div>
      <div className="p-5 flex flex-col justify-between h-[135px]">
        <div>
          <Skeleton className="h-3 w-28 bg-border/40 mb-2" />
          <div className="flex items-baseline gap-2 mt-1">
            <Skeleton className="h-8 w-16 bg-border/40" />
            <Skeleton className="h-4 w-12 bg-border/40" />
          </div>
        </div>
        <div className="h-10 w-24 mt-2">
          <Skeleton className="h-full w-full bg-border/20 rounded" />
        </div>
      </div>
    </Card>
  );
}
