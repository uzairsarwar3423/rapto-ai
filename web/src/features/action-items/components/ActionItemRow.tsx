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
  showMeetingTitle = false,
  className,
}: ActionItemRowProps) {
  return (
    <div
      role="listitem"
      className={cn(
        "group relative flex flex-wrap md:grid md:grid-cols-[36px_1fr_120px_100px_100px_40px] lg:grid-cols-[36px_1fr_140px_120px_100px_40px] items-center px-2 md:px-0 py-2 md:py-0 border-b border-border/40 bg-background transition-colors duration-120",
        "min-h-[36px] hover:bg-accent/40 focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0",
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
          // If they click on something interactive in the z-10 layer, stop default link navigation
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
      
      {/* Column 1: Row Selection Checkbox */}
      <div className="relative z-10 flex justify-center items-center h-full w-[36px] md:w-auto shrink-0 pointer-events-auto order-1 md:order-none" data-prevent-nav>
        {onSelectToggle && (
          <DataTableRowCheckbox
            checked={selected}
            onClick={onSelectToggle}
            ariaLabel={`Select row: ${item.text}`}
          />
        )}
      </div>

      {/* Column 2: Mark Complete Checkbox + Title Text */}
      <div className="relative z-10 flex items-center gap-2 pl-1 min-w-0 flex-1 md:flex-none pointer-events-auto order-2 md:order-none" data-prevent-nav>
        <ActionItemCompletedCheckbox
          checked={item.completed}
          onCheckedChange={(checked) => onToggleComplete(item.id, checked)}
          ariaLabel={`Mark "${item.text}" as complete`}
          className="h-4 w-4 shrink-0 transition-transform duration-120 hover:scale-105"
        />

        <span
          className={cn(
            "font-sans text-[13px] text-foreground truncate select-none transition-all duration-140",
            item.completed 
              ? "line-through text-muted-foreground/60" 
              : "text-decoration-color-transparent"
          )}
        >
          {item.text}
        </span>

        {showMeetingTitle && item.meeting && (
          <span className="text-2xs text-muted-foreground truncate max-w-[120px] font-sans font-normal ml-1 shrink-0">
            • {item.meeting.title}
          </span>
        )}
      </div>

      {/* Column 3: Assignee */}
      <div className="relative z-10 flex items-center min-w-0 pointer-events-auto order-4 md:order-none w-1/3 md:w-auto pl-[36px] md:pl-0 mt-2 md:mt-0" data-prevent-nav>
        {item.assignee ? (
          <div className="flex items-center gap-1.5 min-w-0 pr-2">
            <ActionItemAssigneeAvatar assignee={item.assignee} className="h-4 w-4 shrink-0" />
            <span className="text-[13px] text-muted-foreground truncate font-sans font-normal">{item.assignee.name}</span>
          </div>
        ) : item.assigneeNameRaw ? (
          <div className="flex items-center gap-1.5 min-w-0 pr-2">
            <div className="flex items-center justify-center h-4 w-4 rounded-full bg-muted border border-border/40 shrink-0 text-[8px] font-medium text-muted-foreground uppercase">
              {item.assigneeNameRaw.charAt(0)}
            </div>
            <span className="text-[13px] text-muted-foreground/80 truncate font-sans font-normal italic">{item.assigneeNameRaw}</span>
          </div>
        ) : (
          <span className="text-[13px] text-muted-foreground/30 font-sans font-normal">—</span>
        )}
      </div>

      {/* Column 4: Priority */}
      <div className="relative z-10 flex items-center justify-center md:justify-start pointer-events-auto order-5 md:order-none w-1/3 md:w-auto mt-2 md:mt-0" data-prevent-nav>
        {item.priority && (
          <ActionItemPriorityBadge 
            priority={item.priority} 
            context={item.priority === "URGENT" || item.priority === "HIGH" ? "Inferred priority" : null} 
          />
        )}
      </div>

      {/* Column 5: Due Date */}
      <div className="relative z-10 flex items-center justify-end pr-2 md:pr-4 text-right tabular pointer-events-auto order-6 md:order-none w-1/3 md:w-auto mt-2 md:mt-0" data-prevent-nav>
        {item.dueDate ? (
          <HydrationSafeTime dateString={item.dueDate} className="text-[13px] font-sans font-normal text-muted-foreground" />
        ) : item.dueDateRaw ? (
          <span className="text-[13px] text-muted-foreground/80 font-sans font-normal pr-1 italic truncate max-w-[100px]">{item.dueDateRaw}</span>
        ) : (
          <span className="text-[13px] text-muted-foreground/30 font-sans font-normal pr-1">—</span>
        )}
      </div>

      {/* Column 6: Sync status / actions */}
      <div className="relative z-10 flex items-center justify-center w-[40px] md:w-auto shrink-0 pointer-events-auto order-3 md:order-none" data-prevent-nav>
        <SyncToJiraButton actionItem={item} />
      </div>
    </div>
  );
}
