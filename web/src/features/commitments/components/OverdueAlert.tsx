"use client";

import React from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { CommitmentStatusFilter } from "../hooks/useCommitmentFilters";

interface OverdueAlertProps {
  overdueCount: number;
  currentStatus: CommitmentStatusFilter;
  onStatusChange: (status: CommitmentStatusFilter) => void;
}

export function OverdueAlert({
  overdueCount,
  currentStatus,
  onStatusChange,
}: OverdueAlertProps) {
  if (overdueCount === 0 || currentStatus === "MISSED") return null;

  return (
    <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs font-sans px-4 py-2.5 rounded-lg flex items-center justify-between gap-3 animate-in fade-in-0 slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive/90" />
        <span className="font-medium">
          You have <strong className="font-semibold">{overdueCount}</strong> overdue {overdueCount === 1 ? "commitment" : "commitments"} that require attention.
        </span>
      </div>
      <button
        type="button"
        onClick={() => onStatusChange("MISSED")}
        className="flex items-center gap-1 font-semibold text-destructive hover:underline cursor-pointer select-none whitespace-nowrap"
      >
        <span>View missed</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
