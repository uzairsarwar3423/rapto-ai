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
    <div className="bg-surface/20 backdrop-blur-md border border-border/60 p-6 rounded-xl space-y-6 shadow-xs select-none">
      {/* Commitment Promise Text */}
      <h1 className="font-heading text-xl md:text-2xl font-semibold tracking-tight text-foreground leading-snug">
        {commitment.text}
      </h1>

      {/* Profile & Metadata Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border/40">
        <div className="flex items-center gap-3">
          {commitment.owner && (
            <Avatar className="h-10 w-10 border border-border/60 hover:scale-[1.04] transition-transform duration-160">
              {commitment.owner.avatarUrl && (
                <AvatarImage src={commitment.owner.avatarUrl} alt={commitment.owner.name} />
              )}
              <AvatarFallback className="font-heading font-medium text-xs bg-muted text-muted-foreground flex items-center justify-center">
                {getInitials(commitment.owner.name)}
              </AvatarFallback>
            </Avatar>
          )}
          <div>
            <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span>{commitment.owner?.name}</span>
              {commitment.owner?.commitmentScore !== undefined && (
                <span
                  className="font-mono text-3xs px-1.5 py-0.5 rounded-full border border-border bg-muted/50 text-muted-foreground"
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
        <div className="flex items-center gap-5 text-sm font-sans">
          {commitment.dueDate && (
            <div className="text-right flex flex-col gap-0.5">
              <span className="text-3xs text-muted-foreground uppercase font-bold tracking-wider">Due Date</span>
              <span className="font-semibold text-foreground font-mono bg-muted/30 px-2 py-0.5 rounded border border-border/20 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span>{format(new Date(commitment.dueDate), "MMM d, yyyy")}</span>
              </span>
            </div>
          )}
          <div className="text-right flex flex-col gap-0.5">
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
