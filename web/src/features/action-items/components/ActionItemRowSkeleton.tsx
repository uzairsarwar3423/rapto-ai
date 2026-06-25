import React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface ActionItemRowSkeletonProps {
  density?: "compact" | "comfortable";
  className?: string;
}

export function ActionItemRowSkeleton({
  density = "compact",
  className,
}: ActionItemRowSkeletonProps) {
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
        {/* Checkbox skeleton */}
        <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
        {/* Text line skeleton */}
        <Skeleton className="h-3 w-[60%] sm:w-[40%] shrink-0" />
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Priority badge skeleton */}
        <Skeleton className="h-4 w-12 rounded-sm" />
        {/* Due date skeleton */}
        <Skeleton className="h-3 w-16 rounded-sm font-mono" />
        {/* Assignee avatar skeleton */}
        <Skeleton className="h-5 w-5 rounded-full" />
      </div>
    </div>
  );
}
