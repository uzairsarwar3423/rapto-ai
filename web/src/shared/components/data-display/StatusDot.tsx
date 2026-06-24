import React from "react";
import { cn } from "@/lib/utils";

const STATUS_DOT_MAP: Record<string, string> = {
  PENDING: "bg-muted-foreground",
  MISSED: "bg-error",
  FULFILLED: "bg-success",
  DEFERRED: "bg-warning",
  SCHEDULED: "bg-muted-foreground",
  BOT_JOINING: "bg-amber-500 animate-pulse",
  RECORDING: "bg-red-600 animate-pulse",
  PROCESSING: "bg-orange-500",
  DONE: "bg-emerald-600",
  FAILED: "bg-red-600",
  CANCELLED: "bg-muted-foreground/40",
};

interface StatusDotProps {
  status: string;
}

export function StatusDot({ status }: StatusDotProps) {
  const normalizedStatus = status ? status.toUpperCase() : "PENDING";
  const dotColorClass = STATUS_DOT_MAP[normalizedStatus] || "bg-muted-foreground";

  return (
    <span
      className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0", dotColorClass)}
      aria-hidden="true"
    />
  );
}
