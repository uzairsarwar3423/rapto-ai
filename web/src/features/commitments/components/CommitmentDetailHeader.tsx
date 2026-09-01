import React from "react";
import { format } from "date-fns";
import { Calendar } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CommitmentStatusBadge } from "./CommitmentStatusBadge";
import { CommitmentActionsMenu } from "./CommitmentActionsMenu";
import type { CommitmentAction } from "./commitment-actions.permissions";
import type { Commitment } from "../types";

export interface CommitmentDetailHeaderProps {
  commitment: Commitment;
  onAction?: (action: CommitmentAction) => void;
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function CommitmentDetailHeader({
  commitment,
  onAction,
}: CommitmentDetailHeaderProps) {
  return (
    <div className="bg-surface/20 backdrop-blur-md border border-border/60 p-4 sm:p-6 rounded-xl space-y-4 sm:space-y-6 shadow-xs select-none">
      {/* Commitment Promise Text */}
      <h1 className="font-heading text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground leading-snug break-words">
        {commitment.text}
      </h1>

      {/* Profile & Metadata Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-border/40">
        <div className="flex items-center gap-3">
          {commitment.owner ? (
            <Avatar className="h-9 w-9 sm:h-10 sm:w-10 border border-border/60 hover:scale-[1.04] transition-transform duration-160 shrink-0">
              {commitment.owner.avatarUrl && (
                <AvatarImage src={commitment.owner.avatarUrl} alt={commitment.owner.name} />
              )}
              <AvatarFallback className="font-heading font-medium text-xs bg-muted text-muted-foreground flex items-center justify-center">
                {getInitials(commitment.owner.name)}
              </AvatarFallback>
            </Avatar>
          ) : commitment.ownerNameRaw ? (
            // External participant — not a registered team member
            <Avatar className="h-9 w-9 sm:h-10 sm:w-10 border border-dashed border-border/60 opacity-75 hover:scale-[1.04] transition-transform duration-160 shrink-0">
              <AvatarFallback
                className="font-heading font-medium text-xs bg-muted/40 text-muted-foreground/70 flex items-center justify-center"
                title={`External participant: ${commitment.ownerNameRaw}`}
              >
                {getInitials(commitment.ownerNameRaw)}
              </AvatarFallback>
            </Avatar>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-1.5">
              <span className="truncate max-w-[180px] sm:max-w-none">
                {commitment.owner?.name ?? commitment.ownerNameRaw ?? "Unassigned"}
              </span>
              {!commitment.owner && commitment.ownerNameRaw && (
                <span
                  className="font-mono text-3xs px-1.5 py-0.5 rounded-full border border-border bg-muted/50 text-muted-foreground/70 italic shrink-0"
                  title="This person is not a registered team member. Their name was extracted from the meeting transcript."
                >
                  External
                </span>
              )}
              {commitment.owner?.commitmentScore !== undefined && (
                <span
                  className="font-mono text-3xs px-1.5 py-0.5 rounded-full border border-border bg-muted/50 text-muted-foreground shrink-0"
                  title="Owner's commitment fulfillment score"
                >
                  Score: {commitment.owner.commitmentScore}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground/80 mt-0.5">
              Created {format(new Date(commitment.createdAt), "MMM d, yyyy")}
            </div>
          </div>
        </div>

        {/* Due Date & Current Status */}
        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-5 text-sm font-sans w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0 border-border/30">
          {commitment.dueDate && (
            <div className="text-left sm:text-right flex flex-col gap-0.5">
              <span className="text-3xs text-muted-foreground uppercase font-bold tracking-wider">Due Date</span>
              <span className="font-semibold text-foreground font-mono bg-muted/30 px-2 py-0.5 rounded border border-border/20 flex items-center gap-1 text-xs">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span>{format(new Date(commitment.dueDate), "MMM d, yyyy")}</span>
              </span>
            </div>
          )}
          <div className="text-right flex flex-col gap-0.5 ml-auto sm:ml-0">
            <span className="text-3xs text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Status</span>
            <div className="flex items-center gap-2">
              <CommitmentStatusBadge status={commitment.status} />
              {onAction && (
                <CommitmentActionsMenu
                  commitment={commitment}
                  onAction={onAction}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
