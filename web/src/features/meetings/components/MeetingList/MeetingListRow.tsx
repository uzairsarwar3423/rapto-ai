"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, ListTodo, Handshake, FileText, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/shared/components/data-display/StatusDot";
import { MeetingPlatformIcon } from "../MeetingPlatformIcon";
import { MeetingStatusBadge } from "../MeetingStatusBadge";
import { RelativeTime } from "@/shared/components/data-display/RelativeTime";
import type { MeetingListItem } from "../../types";

interface MeetingListRowProps {
  meeting: MeetingListItem;
  index: number;
  isActive: boolean;
  onHover: () => void;
  onLeave: () => void;
}

export function MeetingListRow({
  meeting,
  index,
  isActive,
  onHover,
  onLeave,
}: MeetingListRowProps) {
  const hasInsights =
    meeting.actionItemCount > 0 ||
    meeting.commitmentCount > 0 ||
    meeting.decisionCount > 0;

  return (
    <div
      data-row-index={index}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={cn(
        "group relative border-b border-border/80 transition-all duration-150 select-none font-sans overflow-hidden",
        isActive ? "bg-muted/40 dark:bg-muted/10 shadow-xs" : "hover:bg-muted/15"
      )}
    >
      {/* Dynamic left indicator bar */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[3px] bg-brand transition-transform duration-200 origin-left scale-y-0",
          isActive ? "scale-y-100" : "group-hover:scale-y-75"
        )}
      />

      <Link href={`/meetings/${meeting.id}`} className="block">
        {/* ─── Desktop & Tablet Layout (sm and up) ─── */}
        <div className="hidden sm:grid sm:grid-cols-[28px_1fr_110px_110px_48px] md:grid-cols-[28px_1fr_110px_125px_110px_48px] lg:grid-cols-[28px_1fr_120px_135px_140px_56px] gap-3 items-center px-4 h-12.5 text-xs">
          {/* Status Dot */}
          <div className="flex items-center justify-start pl-0.5" title={meeting.status}>
            <StatusDot status={meeting.status} />
          </div>

          {/* Title + Status Badge */}
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <span className="font-medium text-foreground text-xs truncate group-hover:text-brand transition-colors duration-150">
              {meeting.title}
            </span>
            <MeetingStatusBadge status={meeting.status} size="sm" />
          </div>

          {/* Platform Column */}
          <div className="flex items-center min-w-0">
            <MeetingPlatformIcon
              platform={meeting.platform}
              showLabel
              className="transition-transform duration-200 group-hover:scale-[1.02]"
            />
          </div>

          {/* Scheduled Time */}
          <div className="text-left text-muted-foreground text-2xs truncate font-mono flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            <RelativeTime date={meeting.scheduledAt} />
          </div>

          {/* Insights Badges */}
          <div className="hidden md:flex items-center justify-end gap-1.5 flex-wrap">
            {meeting.actionItemCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 text-[10px] hover:bg-amber-500/15 transition-colors"
                title={`${meeting.actionItemCount} Action Items`}
              >
                <ListTodo className="h-2.5 w-2.5 shrink-0" />
                <span className="font-medium">{meeting.actionItemCount}</span>
              </span>
            )}
            {meeting.commitmentCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-brand bg-brand/10 px-1.5 py-0.5 rounded border border-brand/20 text-[10px] hover:bg-brand/15 transition-colors"
                title={`${meeting.commitmentCount} Commitments`}
              >
                <Handshake className="h-2.5 w-2.5 shrink-0" />
                <span className="font-medium">{meeting.commitmentCount}</span>
              </span>
            )}
            {meeting.decisionCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 text-[10px] hover:bg-blue-500/15 transition-colors"
                title={`${meeting.decisionCount} Decisions`}
              >
                <FileText className="h-2.5 w-2.5 shrink-0" />
                <span className="font-medium">{meeting.decisionCount}</span>
              </span>
            )}
            {!hasInsights && (
              <span className="text-[11px] text-muted-foreground/40 font-mono">—</span>
            )}
          </div>

          {/* Action Column */}
          <div className="text-right flex justify-end items-center gap-1.5 min-w-[48px]">
            {meeting.status === "SCHEDULED" && (
              <button
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    const { api } = await import("@/lib/api/client");
                    await api.post(`/meetings/${meeting.id}/simulate-complete`);
                    window.location.reload();
                  } catch (err: any) {
                    alert(
                      `Error simulating completion: ${
                        err.response?.data?.message || err.message
                      }`
                    );
                  }
                }}
                className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded hover:bg-amber-500/20 active:scale-95 transition-all z-20 shrink-0 hidden lg:inline-flex cursor-pointer"
                title="Simulate Webhook Completion"
              >
                Simulate
              </button>
            )}
            <span className="text-[10px] font-bold text-brand uppercase tracking-wider opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 select-none hidden lg:inline-block">
              View
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/45 group-hover:text-brand group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
          </div>
        </div>

        {/* ─── Mobile Adaptive Card Layout (<sm, <640px) ─── */}
        <div className="sm:hidden flex flex-col gap-2 p-3.5 text-xs">
          {/* Top Line: Platform + Title + Status */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <StatusDot status={meeting.status} />
              <MeetingPlatformIcon
                platform={meeting.platform}
                className="shrink-0 h-4 w-4 p-0 border-none bg-transparent"
              />
              <span className="font-semibold text-foreground text-xs truncate group-hover:text-brand transition-colors">
                {meeting.title}
              </span>
            </div>
            <MeetingStatusBadge status={meeting.status} size="sm" />
          </div>

          {/* Bottom Line: Relative Time + Intelligence Badges + Chevron */}
          <div className="flex items-center justify-between gap-2 pt-0.5 text-muted-foreground">
            <div className="flex items-center gap-1.5 text-2xs font-mono">
              <Clock className="h-3 w-3 text-muted-foreground/70 shrink-0" />
              <RelativeTime date={meeting.scheduledAt} />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {meeting.actionItemCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px] font-medium border border-amber-500/20">
                  <ListTodo className="h-2.5 w-2.5" />
                  {meeting.actionItemCount}
                </span>
              )}
              {meeting.commitmentCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-brand bg-brand/10 px-1.5 py-0.5 rounded text-[10px] font-medium border border-brand/20">
                  <Handshake className="h-2.5 w-2.5" />
                  {meeting.commitmentCount}
                </span>
              )}
              {meeting.decisionCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded text-[10px] font-medium border border-blue-500/20">
                  <FileText className="h-2.5 w-2.5" />
                  {meeting.decisionCount}
                </span>
              )}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/45 group-hover:text-brand transition-colors" />
            </div>
          </div>

          {/* Mobile Simulate button if scheduled */}
          {meeting.status === "SCHEDULED" && (
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    const { api } = await import("@/lib/api/client");
                    await api.post(`/meetings/${meeting.id}/simulate-complete`);
                    window.location.reload();
                  } catch (err: any) {
                    alert(
                      `Error simulating completion: ${
                        err.response?.data?.message || err.message
                      }`
                    );
                  }
                }}
                className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded active:scale-95 transition-all cursor-pointer"
              >
                Simulate Complete
              </button>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
