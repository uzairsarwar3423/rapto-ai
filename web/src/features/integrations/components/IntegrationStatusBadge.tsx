"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";

export type IntegrationBadgeStatus = "NOT_CONNECTED" | "CONNECTED" | "NEEDS_REAUTH" | "SYNCING";

interface IntegrationStatusBadgeProps {
  status: IntegrationBadgeStatus;
}

const STATUS_LABELS: Record<IntegrationBadgeStatus, string> = {
  NOT_CONNECTED: "Not connected",
  CONNECTED: "Connected",
  NEEDS_REAUTH: "Needs reauth",
  SYNCING: "Syncing…",
};

export function IntegrationStatusBadge({ status }: IntegrationStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className="text-[11px] font-sans font-medium uppercase tracking-[0.02em] text-muted-foreground/80 border-muted/30 px-2 py-0.5 h-5 rounded-md select-none inline-flex items-center justify-center"
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}
