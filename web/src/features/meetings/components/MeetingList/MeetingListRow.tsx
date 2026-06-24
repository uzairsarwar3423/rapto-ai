"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, ListTodo, Handshake, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/shared/components/data-display/StatusDot";
import { MeetingPlatformIcon } from "../MeetingPlatformIcon";
import { RelativeTime } from "@/shared/components/data-display/RelativeTime";
import type { MeetingListItem } from "../../types";

interface MeetingListRowProps {
  meeting: MeetingListItem;
  index: number;
  isActive: boolean;
  onHover: () => void;
  onLeave: () => void;
}

function MeetingStatusBadge({ status }: { status: string }) {
  const norm = status ? status.toUpperCase() : "SCHEDULED";
  
  const configMap: Record<string, { label: string; className: string }> = {
    SCHEDULED: {
      label: "Scheduled",
      className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 border-zinc-200/50 dark:border-zinc-800/50",
    },
    BOT_JOINING: {
      label: "Bot Joining",
      className: "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border-amber-200/45 dark:border-amber-900/30 animate-pulse",
    },
    RECORDING: {
      label: "Recording",
      className: "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border-red-200/45 dark:border-red-900/30 animate-pulse font-bold",
    },
    PROCESSING: {
      label: "Processing",
      className: "bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400 border-orange-200/45 dark:border-orange-900/30",
    },
    DONE: {
      label: "Done",
      className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border-emerald-200/45 dark:border-emerald-900/30",
    },
    FAILED: {
      label: "Failed",
      className: "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border-red-200/45 dark:border-red-900/30",
    },
    CANCELLED: {
      label: "Cancelled",
      className: "bg-zinc-50 text-zinc-500 dark:bg-zinc-900/50 dark:text-zinc-500 border-zinc-200/20 dark:border-zinc-800/20",
    },
  };

  const config = configMap[norm] || {
    label: norm,
    className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 border-zinc-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border uppercase tracking-wider shrink-0",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}

export function MeetingListRow({
  meeting,
  index,
  isActive,
  onHover,
  onLeave,
}: MeetingListRowProps) {
  return (
    <div
      data-row-index={index}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={cn(
        "group relative border-b border-border transition-all duration-150 select-none font-sans overflow-hidden",
        isActive ? "bg-muted/40 dark:bg-muted/10 shadow-sm" : "hover:bg-muted/15"
      )}
    >
      {/* Dynamic left indicator bar */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[3px] bg-brand transition-transform duration-200 origin-left scale-y-0",
          isActive ? "scale-y-100" : "group-hover:scale-y-75"
        )}
      />

      <Link
        href={`/meetings/${meeting.id}`}
        className="grid grid-cols-[24px_1fr_90px_48px] sm:grid-cols-[24px_1fr_110px_110px_48px] md:grid-cols-[24px_1fr_110px_125px_100px_48px] gap-3 items-center px-4 h-12 text-xs"
      >
        {/* Status Dot */}
        <div className="flex items-center justify-start pl-0.5" title={meeting.status}>
          <StatusDot status={meeting.status} />
        </div>

        {/* Title & Platform Icon (mobile inline) */}
        <div className="flex items-center gap-2 min-w-0">
          <MeetingPlatformIcon
            platform={meeting.platform}
            className="sm:hidden shrink-0 border-none bg-transparent p-0"
          />
          <span className="font-semibold text-foreground text-xs truncate group-hover:text-brand transition-colors duration-150">
            {meeting.title}
          </span>
          <MeetingStatusBadge status={meeting.status} />
        </div>

        {/* Platform Column (Desktop) */}
        <div className="hidden sm:flex items-center">
          <MeetingPlatformIcon 
            platform={meeting.platform} 
            showLabel 
            className="transition-transform duration-200 group-hover:scale-105"
          />
        </div>

        {/* Scheduled Time */}
        <div className="text-left text-muted-foreground text-2xs truncate font-mono">
          <RelativeTime date={meeting.scheduledAt} />
        </div>

        {/* Insights Badges */}
        <div className="hidden md:flex items-center justify-end gap-2">
          {meeting.actionItemCount > 0 && (
            <span
              className="flex items-center gap-1 text-amber-600 dark:text-amber-400 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10 text-[10px] hover:bg-amber-500/15 hover:scale-105 active:scale-95 transition-all duration-150"
              title={`${meeting.actionItemCount} Action Items`}
            >
              <ListTodo className="h-2.5 w-2.5" />
              <span className="font-medium">{meeting.actionItemCount}</span>
            </span>
          )}
          {meeting.commitmentCount > 0 && (
            <span
              className="flex items-center gap-1 text-brand bg-brand/5 px-2 py-0.5 rounded border border-brand/10 text-[10px] hover:bg-brand/10 hover:scale-105 active:scale-95 transition-all duration-150"
              title={`${meeting.commitmentCount} Commitments`}
            >
              <Handshake className="h-2.5 w-2.5" />
              <span className="font-medium">{meeting.commitmentCount}</span>
            </span>
          )}
          {meeting.decisionCount > 0 && (
            <span
              className="flex items-center gap-1 text-blue-600 dark:text-blue-400 bg-blue-500/5 px-2 py-0.5 rounded border border-blue-500/10 text-[10px] hover:bg-blue-500/15 hover:scale-105 active:scale-95 transition-all duration-150"
              title={`${meeting.decisionCount} Decisions`}
            >
              <FileText className="h-2.5 w-2.5" />
              <span className="font-medium">{meeting.decisionCount}</span>
            </span>
          )}
        </div>

        {/* Premium Chevron & Action Slide-in */}
        <div className="text-right flex justify-end items-center gap-2 min-w-[48px]">
          {meeting.status === "SCHEDULED" && (
            <button
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  const { api } = await import("@/lib/api/client");
                  await api.post(`/meetings/${meeting.id}/simulate-complete`);
                  window.location.reload();
                } catch (err: any) {
                  alert(`Error simulating completion: ${err.response?.data?.message || err.message}`);
                }
              }}
              className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded hover:bg-amber-500/20 active:scale-95 transition-all z-20 shrink-0"
              title="Simulate Webhook Completion"
            >
              Simulate Complete
            </button>
          )}
          <span className="text-[10px] font-bold text-brand uppercase tracking-wider opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 select-none">
            View
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground/45 group-hover:text-brand group-hover:translate-x-0.5 transition-all duration-200" />
        </div>
      </Link>
    </div>
  );
}
