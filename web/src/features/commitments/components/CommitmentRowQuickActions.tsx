"use client";

import React from "react";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getAvailableActions } from "./commitment-actions.permissions";
import { cn } from "@/lib/utils";
import type { Commitment } from "../types";

interface CommitmentRowQuickActionsProps {
  commitment: Commitment;
  onAction: (action: "MARK_FULFILLED" | "DEFER") => void;
  className?: string;
}

export function CommitmentRowQuickActions({
  commitment,
  onAction,
  className,
}: CommitmentRowQuickActionsProps) {
  const { user } = useAuth();

  const availableActions = getAvailableActions(
    commitment.status,
    user?.role,
    user?.id,
    commitment.ownerId
  );

  const canFulfill = availableActions.includes("MARK_FULFILLED");
  const canDefer = availableActions.includes("DEFER");

  if (!canFulfill && !canDefer) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1 shrink-0 pointer-events-auto select-none",
        className
      )}
    >
      {/* 1. Fulfill quick action */}
      {canFulfill && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onAction("MARK_FULFILLED");
          }}
          className="h-6 w-6 p-0 rounded-md hover:bg-accent/60 text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring outline-hidden"
          aria-label="Mark commitment as fulfilled"
        >
          <Check className="h-4 w-4" />
        </Button>
      )}

      {/* 2. Defer quick action */}
      {canDefer && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onAction("DEFER");
          }}
          className="h-6 w-6 p-0 rounded-md hover:bg-accent/60 text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring outline-hidden"
          aria-label="Defer commitment"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
