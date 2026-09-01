import React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface CommitmentRowSkeletonProps {
  density?: "compact" | "comfortable";
  className?: string;
}

export function CommitmentRowSkeleton({
  density = "compact",
  className,
}: CommitmentRowSkeletonProps) {
  const isCompact = density === "compact";

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-0 border-b border-border/40 w-full bg-background/50",
        isCompact ? "min-h-[58px] sm:min-h-0 sm:h-[42px]" : "min-h-[66px] sm:min-h-0 sm:h-[50px]",
        className
      )}
    >
      <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
        {/* Status indicator skeleton */}
        <Skeleton className="h-5 w-14 rounded-full shrink-0" />
        {/* Text line skeleton */}
        <Skeleton className="h-3.5 w-[75%] sm:w-[50%] shrink-0 rounded" />
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 shrink-0 pl-[86px] sm:pl-0">
        {/* Due date skeleton */}
        <Skeleton className="h-4 w-20 sm:w-24 rounded font-mono shrink-0" />
        {/* Owner initials avatar skeleton */}
        <div className="w-7 flex items-center justify-center shrink-0">
          <Skeleton className="h-5.5 w-5.5 rounded-full" />
        </div>
      </div>
    </div>
  );
}
