"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle } from "lucide-react";

export type IntegrationBadgeStatus =
  | "NOT_CONNECTED"
  | "SETUP_REQUIRED"
  | "CONNECTED"
  | "NEEDS_REAUTH"
  | "SYNCING";

interface IntegrationStatusBadgeProps {
  status: IntegrationBadgeStatus;
}

export function IntegrationStatusBadge({ status }: IntegrationStatusBadgeProps) {
  switch (status) {
    case "NOT_CONNECTED":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-sans font-medium uppercase tracking-[0.02em] text-muted-foreground/80 border-muted/30 px-2 py-0.5 h-5 rounded-md select-none inline-flex items-center justify-center"
        >
          Not connected
        </Badge>
      );
    case "SETUP_REQUIRED":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-sans font-medium uppercase tracking-[0.02em] border-amber-300 text-amber-700 bg-amber-50/60 dark:border-amber-700 dark:text-amber-400 dark:bg-amber-950/30 px-2 py-0.5 h-5 rounded-md select-none inline-flex items-center justify-center gap-1"
        >
          <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          Setup required
        </Badge>
      );
    case "CONNECTED":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-sans font-medium uppercase tracking-[0.02em] border-emerald-300 text-emerald-700 bg-emerald-50/60 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/30 px-2 py-0.5 h-5 rounded-md select-none inline-flex items-center justify-center gap-1"
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          Connected
        </Badge>
      );
    case "NEEDS_REAUTH":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-sans font-medium uppercase tracking-[0.02em] border-destructive/40 text-destructive bg-destructive/10 px-2 py-0.5 h-5 rounded-md select-none inline-flex items-center justify-center"
        >
          Needs reauth
        </Badge>
      );
    case "SYNCING":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-sans font-medium uppercase tracking-[0.02em] text-primary border-primary/30 bg-primary/5 px-2 py-0.5 h-5 rounded-md select-none inline-flex items-center justify-center"
        >
          Syncing…
        </Badge>
      );
  }
}
