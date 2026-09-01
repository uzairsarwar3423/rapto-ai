"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ActionItemCompletedCheckbox } from "./ActionItemCompletedCheckbox";
import { ActionItemPriorityBadge } from "./ActionItemPriorityBadge";
import { ActionItemAssigneeAvatar } from "./ActionItemAssigneeAvatar";
import { HydrationSafeTime } from "@/shared/components/data-display/HydrationSafeTime";
import { DataTableRowCheckbox } from "@/shared/components/data-display/DataTable/DataTableRowCheckbox";
import { SyncToJiraButton } from "./SyncToJiraButton";
import { Calendar, Video } from "lucide-react";
import type { ActionItem } from "../types";

interface ActionItemRowProps {
  item: ActionItem;
  selected?: boolean;
  onSelectToggle?: (e: React.MouseEvent<any> | React.KeyboardEvent<any>) => void;
  onToggleComplete: (id: string, completed: boolean) => void;
  showMeetingTitle?: boolean;
  className?: string;
}

export function ActionItemRow({
  item,
  selected = false,
  onSelectToggle,
  onToggleComplete,
  showMeetingTitle = true,
  className,
}: ActionItemRowProps) {
  return (
    <div
      role="listitem"
      className={cn(
        "group relative flex flex-col md:grid md:grid-cols-[36px_1fr_130px_100px_100px_40px] items-start md:items-center px-3 md:px-0 py-2.5 md:py-0 border-b border-border/40 bg-background transition-colors duration-120",
        "min-h-[62px] md:min-h-[38px] md:h-[38px] hover:bg-accent/40 focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0 select-none",
        selected && "bg-accent/20",
        className
      )}
    >
      {/* 1. Underlying Row Navigation Link (z-0) */}
      <Link
        href={`/action-items/${item.id}`}
        className="absolute inset-0 z-0 cursor-pointer focus:outline-none"
        aria-label={`View action item: ${item.text}`}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("[data-prevent-nav]")) {
            e.preventDefault();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            onSelectToggle?.(e);
          }
        }}
      />

      {/* 2. Elevated Interactive Elements (z-10) */}

      {/* Desktop Column 1 / Mobile Row 1 Checkbox: Row Selection Checkbox */}
      <div
        className="relative z-10 hidden md:flex justify-center items-center h-full w-[36px] shrink-0 pointer-events-auto"
        data-prevent-nav
      >
        {onSelectToggle && (
          <DataTableRowCheckbox
            checked={selected}
            onClick={onSelectToggle}
            ariaLabel={`Select row: ${item.text}`}
          />
        )}
      </div>

      {/* Main Title / Mobile Top Row */}
      <div
        className="relative z-10 flex items-start md:items-center gap-2 pl-0 md:pl-1 min-w-0 w-full md:w-auto flex-1 pointer-events-auto"
        data-prevent-nav
      >
        {/* Mobile Selection Checkbox */}
        <div className="md:hidden pt-0.5 shrink-0">
          {onSelectToggle && (
            <DataTableRowCheckbox
              checked={selected}
              onClick={onSelectToggle}
              ariaLabel={`Select row: ${item.text}`}
            />
          )}
        </div>

        {/* Complete Checkbox */}
        <div className="pt-0.5 md:pt-0 shrink-0">
          <ActionItemCompletedCheckbox
            checked={item.completed}
            onCheckedChange={(checked) => onToggleComplete(item.id, checked)}
            ariaLabel={`Mark "${item.text}" as complete`}
            className="h-4 w-4 shrink-0 transition-transform duration-120 hover:scale-105"
          />
        </div>

        {/* Action Item Text */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span
            className={cn(
              "font-sans text-xs md:text-[13px] text-foreground line-clamp-2 md:line-clamp-1 md:truncate select-none transition-all duration-140",
              item.completed
                ? "line-through text-muted-foreground/60"
                : "text-foreground group-hover:text-foreground"
            )}
          >
            {item.text}
          </span>

          {/* Desktop Meeting Tag */}
          {showMeetingTitle && item.meeting && (
            <span
              className="hidden lg:inline-flex items-center gap-1 text-[10px] text-muted-foreground truncate max-w-[130px] font-sans font-normal bg-muted/40 px-1.5 py-0.5 rounded border border-border/20 shrink-0"
              title={`Source meeting: ${item.meeting.title}`}
            >
              <Video className="h-2.5 w-2.5 opacity-70 shrink-0" />
              <span className="truncate">{item.meeting.title}</span>
            </span>
          )}
        </div>

        {/* Mobile Sync Button */}
        <div className="md:hidden ml-auto shrink-0 pl-1">
          <SyncToJiraButton actionItem={item} />
        </div>
      </div>

      {/* Desktop Column 3 / Mobile Bottom Row Item 1: Assignee */}
      <div
        className="relative z-10 flex items-center min-w-0 pointer-events-auto md:w-auto mt-1.5 md:mt-0 pl-[52px] md:pl-0"
        data-prevent-nav
      >
        {item.assignee ? (
          <div className="flex items-center gap-1.5 min-w-0 pr-2">
            <ActionItemAssigneeAvatar assignee={item.assignee} className="h-4 w-4 shrink-0" />
            <span className="text-xs md:text-[13px] text-muted-foreground truncate font-sans font-normal max-w-[100px] md:max-w-none">
              {item.assignee.name}
            </span>
          </div>
        ) : item.assigneeNameRaw ? (
          <div className="flex items-center gap-1.5 min-w-0 pr-2">
            <div className="flex items-center justify-center h-4 w-4 rounded-full bg-muted border border-border/40 shrink-0 text-[8px] font-medium text-muted-foreground uppercase">
              {item.assigneeNameRaw.charAt(0)}
            </div>
            <span className="text-xs md:text-[13px] text-muted-foreground/80 truncate font-sans font-normal italic max-w-[100px] md:max-w-none">
              {item.assigneeNameRaw}
            </span>
          </div>
        ) : (
          <span className="text-xs md:text-[13px] text-muted-foreground/30 font-sans font-normal">—</span>
        )}
      </div>

      {/* Desktop Column 4 / Mobile Bottom Row Item 2: Priority */}
      <div
        className="relative z-10 flex items-center justify-start pointer-events-auto md:w-auto mt-1.5 md:mt-0 ml-3 md:ml-0"
        data-prevent-nav
      >
        {item.priority ? (
          <ActionItemPriorityBadge
            priority={item.priority}
            context={item.priority === "URGENT" || item.priority === "HIGH" ? "Inferred priority" : null}
          />
        ) : (
          <span className="hidden md:inline text-xs text-muted-foreground/30 font-sans">—</span>
        )}
      </div>

      {/* Desktop Column 5 / Mobile Bottom Row Item 3: Due Date */}
      <div
        className="relative z-10 flex items-center justify-end pr-0 md:pr-4 text-right tabular pointer-events-auto md:w-auto mt-1.5 md:mt-0 ml-auto md:ml-0"
        data-prevent-nav
      >
        {item.dueDate ? (
          <span className="inline-flex items-center gap-1 text-[11px] md:text-[13px] font-sans font-normal text-muted-foreground">
            <Calendar className="h-3 w-3 opacity-60 hidden md:inline" />
            <HydrationSafeTime dateString={item.dueDate} />
          </span>
        ) : item.dueDateRaw ? (
          <span
            className="text-[11px] md:text-[13px] text-muted-foreground/80 font-sans font-normal pr-1 italic truncate max-w-[90px] md:max-w-[100px]"
            title={`Extracted date: ${item.dueDateRaw}`}
          >
            {item.dueDateRaw}
          </span>
        ) : (
          <span className="text-xs md:text-[13px] text-muted-foreground/30 font-sans font-normal pr-1">—</span>
        )}
      </div>

      {/* Desktop Column 6: Sync status / actions */}
      <div
        className="relative z-10 hidden md:flex items-center justify-center w-[40px] shrink-0 pointer-events-auto"
        data-prevent-nav
      >
        <SyncToJiraButton actionItem={item} />
      </div>
    </div>
  );
}
