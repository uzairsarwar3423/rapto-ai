import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CommitmentStatusBadge } from "./CommitmentStatusBadge";
import { CommitmentConfidenceDim } from "./CommitmentConfidenceDim";
import { HydrationSafeTime } from "@/shared/components/data-display/HydrationSafeTime";
import type { Commitment } from "../types";
import { CommitmentRowQuickActions } from "./CommitmentRowQuickActions";
import type { CommitmentAction } from "./commitment-actions.permissions";

interface CommitmentRowProps extends React.HTMLAttributes<HTMLDivElement> {
  commitment: Commitment;
  showMeetingTitle?: boolean;
  showOwner?: boolean;
  density?: "compact" | "comfortable";
  onAction?: (action: CommitmentAction, commitment: Commitment) => void;
}

const STATUS_LEFT_BORDER: Record<string, string> = {
  PENDING: "group-hover:border-l-pending-text/70",
  FULFILLED: "group-hover:border-l-fulfilled-text/70",
  MISSED: "group-hover:border-l-missed-text/70",
  DEFERRED: "group-hover:border-l-deferred-text/70",
  CANCELLED: "group-hover:border-l-muted/70",
};

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function CommitmentRow({
  commitment,
  showMeetingTitle = false,
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
        "group relative flex items-center gap-3 px-4 border-b border-border/40 bg-background/50 backdrop-blur-xs transition-all duration-160 ease-out-soft",
        "border-l-3 border-l-transparent",
        STATUS_LEFT_BORDER[commitment.status] || "group-hover:border-l-border",
        isCompact ? "h-[40px]" : "h-[50px]",
        "hover:bg-surface-hover/80 hover:shadow-xs hover:translate-x-0.5 focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0",
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

      {/* 2. Elevated Interactive Elements (z-10) */}
      <div className="relative z-10 flex items-center justify-between w-full gap-3 pointer-events-none">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Status Badge Column (w-[72px]) */}
          <div className="w-[76px] shrink-0 pointer-events-auto flex items-center">
            <CommitmentStatusBadge status={commitment.status} />
          </div>

          {/* Low Confidence Wrapper + Text */}
          <CommitmentConfidenceDim confidenceScore={commitment.confidenceScore}>
            <span className="font-sans text-sm text-foreground/90 font-medium truncate select-none group-hover:text-foreground">
              {commitment.text}
            </span>
            {showMeetingTitle && commitment.meeting && (
              <span 
                className="text-3xs text-muted-foreground truncate max-w-[150px] font-sans font-normal ml-1 bg-muted/30 px-1.5 py-0.5 rounded border border-border/20 pointer-events-auto cursor-help"
                title={`Extracted from meeting: ${commitment.meeting.title}`}
              >
                {commitment.meeting.title}
              </span>
            )}
          </CommitmentConfidenceDim>
        </div>

        {/* Commitment Metadata Stack */}
        <div className="flex items-center gap-5 shrink-0 pointer-events-auto">
          {/* Quick actions, only visible on group-hover/group-focus-within */}
          <CommitmentRowQuickActions
            commitment={commitment}
            onAction={(action) => onAction?.(action, commitment)}
            className="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-all duration-160 translate-x-1 group-hover:translate-x-0 mr-1"
          />

          {/* Deferred Indicator */}
          {commitment.deferredCount > 0 && (
            <div
              className="inline-flex items-center gap-0.5 text-3xs font-mono px-1.5 py-0.5 rounded-sm bg-deferred-bg text-deferred-text border border-deferred-text/25 select-none animate-in fade-in slide-in-from-bottom-1 duration-160"
              title={`Deferred ${commitment.deferredCount} time${commitment.deferredCount > 1 ? "s" : ""}`}
            >
              <span>↻</span>
              {commitment.deferredCount > 1 && <span>×{commitment.deferredCount}</span>}
            </div>
          )}

          {/* Due Date Display (w-24 text-right) */}
          <div className="w-24 text-right">
            {commitment.dueDate && (
              <span className="text-3xs font-mono text-muted-foreground/90 font-medium bg-muted/20 px-2 py-0.5 rounded border border-border/25">
                <HydrationSafeTime dateString={commitment.dueDate} />
              </span>
            )}
          </div>

          {/* Owner Avatar Indicator (w-6 text-center) */}
          <div className="w-6 flex items-center justify-center">
            {showOwner && commitment.owner && (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
