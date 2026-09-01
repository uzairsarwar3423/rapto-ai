"use client";

import React from "react";
import { MoreVertical, Check, Calendar, Ban, History } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import {
  getAvailableActions,
  CommitmentAction,
} from "./commitment-actions.permissions";
import type { Commitment } from "../types";

interface CommitmentActionsMenuProps {
  commitment: Commitment;
  onAction: (action: CommitmentAction) => void;
}

export function CommitmentActionsMenu({
  commitment,
  onAction,
}: CommitmentActionsMenuProps) {
  const { user } = useAuth();

  const availableActions = getAvailableActions(
    commitment.status,
    user?.role,
    user?.id,
    commitment.ownerId
  );

  // Canonical order: Fulfill -> Defer -> Cancel -> History
  const showFulfill = availableActions.includes("MARK_FULFILLED");
  const showDefer = availableActions.includes("DEFER");
  const showCancel = availableActions.includes("CANCEL");
  const showHistory = availableActions.includes("VIEW_HISTORY");

  // Determine if only history is available
  const isOnlyHistory =
    showHistory && !showFulfill && !showDefer && !showCancel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Kebab trigger with 28px hit target (h-7 w-7), ghost variant */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 pointer-events-auto select-none rounded-md hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-ring outline-hidden"
          aria-label="Commitment actions"
        >
          <MoreVertical className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-40 font-sans p-1 rounded-lg border border-border bg-white dark:bg-zinc-950 text-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-100"
      >
        {/* 1. Mark Fulfilled */}
        {showFulfill && (
          <DropdownMenuItem
            onClick={() => onAction("MARK_FULFILLED")}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer rounded-md text-foreground hover:bg-muted/80 focus:bg-muted/80 transition-colors duration-100"
          >
            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Mark fulfilled</span>
          </DropdownMenuItem>
        )}

        {/* 2. Defer */}
        {showDefer && (
          <DropdownMenuItem
            onClick={() => onAction("DEFER")}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer rounded-md text-foreground hover:bg-muted/80 focus:bg-muted/80 transition-colors duration-100"
          >
            <Calendar className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span>Defer</span>
          </DropdownMenuItem>
        )}

        {/* Separator before destructive action */}
        {showCancel && (showFulfill || showDefer) && <DropdownMenuSeparator className="my-1 bg-border/60" />}

        {/* 3. Cancel */}
        {showCancel && (
          <DropdownMenuItem
            onClick={() => onAction("CANCEL")}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer rounded-md text-foreground hover:bg-muted/80 focus:bg-muted/80 transition-colors duration-100"
          >
            <Ban className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Cancel</span>
          </DropdownMenuItem>
        )}

        {/* Separator before history if other items exist */}
        {showHistory && !isOnlyHistory && <DropdownMenuSeparator className="my-1 bg-border/60" />}

        {/* 4. View History */}
        {showHistory && (
          <DropdownMenuItem
            onClick={() => onAction("VIEW_HISTORY")}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer rounded-md text-foreground hover:bg-muted/80 focus:bg-muted/80 transition-colors duration-100"
          >
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            <span>View history</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
