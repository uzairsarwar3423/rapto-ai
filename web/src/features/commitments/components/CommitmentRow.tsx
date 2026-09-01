"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CommitmentStatusBadge } from "./CommitmentStatusBadge";
import { CommitmentConfidenceDim } from "./CommitmentConfidenceDim";
import { HydrationSafeTime } from "@/shared/components/data-display/HydrationSafeTime";
import { CommitmentRowQuickActions } from "./CommitmentRowQuickActions";
import { CommitmentActionsMenu } from "./CommitmentActionsMenu";
import { Calendar, Video, RefreshCw } from "lucide-react";
import type { CommitmentAction } from "./commitment-actions.permissions";
import type { Commitment } from "../types";

interface CommitmentRowProps extends React.HTMLAttributes<HTMLDivElement> {
  commitment: Commitment;
  showMeetingTitle?: boolean;
  showOwner?: boolean;
  density?: "compact" | "comfortable";
  onAction?: (action: CommitmentAction, commitment: Commitment) => void;
}

const STATUS_LEFT_BORDER: Record<string, string> = {
  PENDING: "group-hover:border-l-pending-text/70 sm:border-l-transparent",
  FULFILLED: "group-hover:border-l-fulfilled-text/70 sm:border-l-transparent",
  MISSED: "border-l-missed-text sm:border-l-transparent group-hover:border-l-missed-text/70",
  DEFERRED: "group-hover:border-l-deferred-text/70 sm:border-l-transparent",
  CANCELLED: "group-hover:border-l-muted/70 sm:border-l-transparent",
};

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function CommitmentRow({
  commitment,
  showMeetingTitle = true,
  showOwner = true,
  density = "compact",
  onAction,
  className,
  ...props
}: CommitmentRowProps) {
  const isCompact = density === "compact";

  return (
    <div
      role="listitem"
      className={cn(
        "group relative flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-0 border-b border-border/40 bg-background/50 backdrop-blur-xs transition-all duration-160 ease-out-soft",
        "border-l-3 sm:border-l-3 border-l-transparent",
        STATUS_LEFT_BORDER[commitment.status] || "group-hover:border-l-border",
        isCompact ? "min-h-[58px] sm:min-h-0 sm:h-[42px]" : "min-h-[66px] sm:min-h-0 sm:h-[50px]",
        "hover:bg-surface-hover/80 hover:shadow-xs focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0 select-none",
        className
      )}
      {...props}
    >
      {/* 1. Underlying Row Navigation Link (z-0) */}
      <Link
        href={`/commitments/${commitment.id}`}
        className="absolute inset-0 z-0 cursor-pointer focus:outline-none"
        aria-label={`View commitment details: ${commitment.text}`}
      />

      {/* 2. Elevated Interactive Row Content (z-10) */}
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-1.5 sm:gap-3 pointer-events-none">
        
        {/* Column 1 & 2: Status Badge + Commitment Details (Text & Meeting origin) */}
        <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1 w-full">
          {/* Status Badge (w-[76px]) */}
          <div className="w-[76px] shrink-0 pointer-events-auto pt-0.5 sm:pt-0 flex items-center">
            <CommitmentStatusBadge status={commitment.status} />
          </div>

          {/* Commitment Text & Meeting Pill */}
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <CommitmentConfidenceDim confidenceScore={commitment.confidenceScore}>
              <span className="font-sans text-xs sm:text-sm text-foreground/90 font-medium line-clamp-2 sm:line-clamp-1 sm:truncate select-none group-hover:text-foreground">
                {commitment.text}
              </span>
            </CommitmentConfidenceDim>

            {/* Desktop Meeting Origin Pill (stays anchored inside details column) */}
            {showMeetingTitle && commitment.meeting && (
              <span
                className="hidden md:inline-flex items-center gap-1 text-[10px] text-muted-foreground truncate max-w-[150px] font-sans font-normal bg-muted/40 px-1.5 py-0.5 rounded border border-border/25 pointer-events-auto shrink-0"
                title={`Extracted from meeting: ${commitment.meeting.title}`}
              >
                <Video className="h-2.5 w-2.5 shrink-0 opacity-70" />
                <span className="truncate">{commitment.meeting.title}</span>
              </span>
            )}
          </div>
        </div>

        {/* Column 3, 4 & 5: Actions, Due Date, Owner */}
        <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 shrink-0 pointer-events-auto w-full sm:w-auto pl-[86px] sm:pl-0 mt-0.5 sm:mt-0">
          
          {/* Mobile Meeting Origin Tag */}
          {showMeetingTitle && commitment.meeting && (
            <span
              className="md:hidden inline-flex items-center gap-1 text-[10px] text-muted-foreground truncate max-w-[140px] font-sans font-normal bg-muted/30 px-1.5 py-0.5 rounded border border-border/20"
              title={`Extracted from meeting: ${commitment.meeting.title}`}
            >
              <Video className="h-2.5 w-2.5 shrink-0 opacity-70" />
              <span className="truncate">{commitment.meeting.title}</span>
            </span>
          )}

          <div className="flex items-center gap-2 sm:gap-3 ml-auto sm:ml-0">
            {/* Quick Actions (Desktop Hover / Focus) */}
            <CommitmentRowQuickActions
              commitment={commitment}
              onAction={(action) => onAction?.(action, commitment)}
              className="hidden sm:flex opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-all duration-160 translate-x-1 group-hover:translate-x-0 mr-0.5"
            />

            {/* Deferred Indicator Badge */}
            {commitment.deferredCount > 0 && (
              <div
                className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 select-none shrink-0"
                title={`Deferred ${commitment.deferredCount} time${commitment.deferredCount > 1 ? "s" : ""}`}
              >
                <RefreshCw className="h-2.5 w-2.5" />
                {commitment.deferredCount > 1 && <span>×{commitment.deferredCount}</span>}
              </div>
            )}

            {/* Column: Due Date (Fixed w-24 to maintain column alignment) */}
            <div className="w-24 shrink-0 text-right flex items-center justify-end">
              {commitment.dueDate ? (
                <span className="inline-flex items-center gap-1 text-[10px] sm:text-2xs font-mono text-muted-foreground/90 font-medium bg-muted/25 px-1.5 sm:px-2 py-0.5 rounded border border-border/25 truncate">
                  <Calendar className="h-2.5 w-2.5 opacity-65 hidden sm:inline shrink-0" />
                  <HydrationSafeTime dateString={commitment.dueDate} />
                </span>
              ) : commitment.dueDateRaw ? (
                <span 
                  className="text-[10px] sm:text-2xs font-mono text-muted-foreground/80 font-medium bg-muted/15 px-1.5 sm:px-2 py-0.5 rounded border border-border/15 italic truncate max-w-full inline-block align-bottom"
                  title={`Extracted date: ${commitment.dueDateRaw}`}
                >
                  {commitment.dueDateRaw}
                </span>
              ) : (
                <span className="text-2xs font-mono text-muted-foreground/30 select-none pr-1">
                  —
                </span>
              )}
            </div>

            {/* Column: Owner Avatar Indicator (Fixed w-7) */}
            {showOwner && (
              <div className="w-7 shrink-0 flex items-center justify-center">
                {commitment.owner ? (
                  <Avatar className="h-5.5 w-5.5 hover:scale-[1.08] hover:shadow-xs transition-all duration-160 border border-border/40 select-none">
                    {commitment.owner.avatarUrl && (
                      <AvatarImage src={commitment.owner.avatarUrl} alt={commitment.owner.name} />
                    )}
                    <AvatarFallback
                      className="font-heading font-medium text-[8px] bg-muted/80 text-muted-foreground flex items-center justify-center"
                      title={`Owner: ${commitment.owner.name}`}
                    >
                      {getInitials(commitment.owner.name)}
                    </AvatarFallback>
                  </Avatar>
                ) : commitment.ownerNameRaw ? (
                  <Avatar className="h-5.5 w-5.5 hover:scale-[1.08] hover:shadow-xs transition-all duration-160 border border-dashed border-border/60 select-none opacity-70">
                    <AvatarFallback
                      className="font-heading font-medium text-[8px] bg-muted/40 text-muted-foreground/70 flex items-center justify-center"
                      title={`External participant: ${commitment.ownerNameRaw}`}
                    >
                      {getInitials(commitment.ownerNameRaw)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <span className="text-2xs font-mono text-muted-foreground/30 select-none">
                    —
                  </span>
                )}
              </div>
            )}

            {/* Mobile Actions Menu Trigger */}
            <div className="sm:hidden flex items-center shrink-0">
              <CommitmentActionsMenu
                commitment={commitment}
                onAction={(action) => onAction?.(action, commitment)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
