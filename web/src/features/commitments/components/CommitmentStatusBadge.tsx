import React from "react";
import { cn } from "@/lib/utils";
import type { CommitmentStatus } from "../types";

interface CommitmentStatusBadgeProps {
  status: CommitmentStatus;
  className?: string;
}

const BADGE_STYLES: Record<CommitmentStatus, string> = {
  PENDING: "bg-pending-bg text-pending-text border-pending-text/25",
  FULFILLED: "bg-fulfilled-bg text-fulfilled-text border-fulfilled-text/25",
  MISSED: "bg-missed-bg text-missed-text border-missed-text/25 font-semibold",
  DEFERRED: "bg-deferred-bg text-deferred-text border-deferred-text/25 flex items-center gap-1",
  CANCELLED: "bg-muted/10 text-muted-foreground/60 border-muted-foreground/20 line-through",
};

export function CommitmentStatusBadge({
  status,
  className,
}: CommitmentStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center text-3xs px-2 py-0.5 h-5 rounded-full tracking-wider uppercase font-mono select-none border backdrop-blur-xs shadow-xs transition-all duration-160 hover:scale-[1.02]",
        BADGE_STYLES[status],
        className
      )}
      aria-label={`Status: ${status.toLowerCase()}`}
    >
      {status === "DEFERRED" && <span className="text-[9px] animate-spin-slow" aria-hidden="true">↻</span>}
      {status}
    </span>
  );
}
