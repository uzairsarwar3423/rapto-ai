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
        "flex items-center justify-between gap-3 px-3 border-b border-border/40 w-full bg-background/50",
        isCompact ? "h-[36px]" : "h-[44px]",
        className
      )}
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        {/* Status indicator skeleton */}
        <Skeleton className="h-4 w-12 rounded-sm" />
        {/* Text line skeleton */}
        <Skeleton className="h-3 w-[60%] sm:w-[45%] shrink-0" />
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Due date skeleton */}
        <Skeleton className="h-3 w-16 rounded-sm font-mono" />
        {/* Owner initials avatar skeleton */}
        <Skeleton className="h-5 w-5 rounded-full" />
      </div>
    </div>
  );
}
