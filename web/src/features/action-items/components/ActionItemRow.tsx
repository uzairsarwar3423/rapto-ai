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
        "group relative grid grid-cols-[36px_1fr_140px_120px_100px_40px] items-center px-0 border-b border-border/40 bg-background transition-colors duration-120",
        "h-[36px] hover:bg-accent/40 focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0",
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
      <div className="relative z-10 flex justify-center items-center h-full pointer-events-auto" data-prevent-nav>
        {onSelectToggle && (
          <DataTableRowCheckbox
            checked={selected}
            onClick={onSelectToggle}
            ariaLabel={`Select row: ${item.text}`}
          />
        )}
      </div>

      {/* Column 2: Mark Complete Checkbox + Title Text */}
      <div className="relative z-10 flex items-center gap-2 pl-1 min-w-0 pointer-events-auto" data-prevent-nav>
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
      <div className="relative z-10 flex items-center min-w-0 pointer-events-auto" data-prevent-nav>
        {item.assignee ? (
          <div className="flex items-center gap-1.5 min-w-0 pr-2">
            <ActionItemAssigneeAvatar assignee={item.assignee} className="h-4 w-4 shrink-0" />
            <span className="text-[13px] text-muted-foreground truncate font-sans font-normal">{item.assignee.name}</span>
          </div>
        ) : (
          <span className="text-[13px] text-muted-foreground/30 font-sans font-normal">—</span>
        )}
      </div>

      {/* Column 4: Priority */}
      <div className="relative z-10 flex items-center pointer-events-auto" data-prevent-nav>
        {item.priority && (
          <ActionItemPriorityBadge 
            priority={item.priority} 
            context={item.priority === "URGENT" || item.priority === "HIGH" ? "Inferred priority" : null} 
          />
        )}
      </div>

      {/* Column 5: Due Date */}
      <div className="relative z-10 flex items-center justify-end pr-4 text-right tabular pointer-events-auto" data-prevent-nav>
        {item.dueDate ? (
          <HydrationSafeTime dateString={item.dueDate} className="text-[13px] font-sans font-normal text-muted-foreground" />
        ) : (
          <span className="text-[13px] text-muted-foreground/30 font-sans font-normal pr-1">—</span>
        )}
      </div>

      {/* Column 6: Sync status / actions */}
      <div className="relative z-10 flex items-center justify-center pointer-events-auto" data-prevent-nav>
        <SyncToJiraButton actionItem={item} />
      </div>
    </div>
  );
}
