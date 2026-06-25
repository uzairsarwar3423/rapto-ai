"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ActionItemCompletedCheckbox } from "./ActionItemCompletedCheckbox";
import { ActionItemPriorityBadge } from "./ActionItemPriorityBadge";
import { ActionItemAssigneeAvatar } from "./ActionItemAssigneeAvatar";
import { HydrationSafeTime } from "@/shared/components/data-display/HydrationSafeTime";
import type { ActionItem } from "../types";

interface ActionItemRowProps {
  item: ActionItem;
  showMeetingTitle?: boolean;
  density?: "compact" | "comfortable";
  onToggleComplete: (id: string, completed: boolean) => void;
  className?: string;
}

export function ActionItemRow({
  item,
  showMeetingTitle = false,
  density = "compact",
  onToggleComplete,
  className,
}: ActionItemRowProps) {
  const isCompact = density === "compact";

  return (
    <div
      role="listitem"
      className={cn(
        "group relative flex items-center gap-2.5 px-3 border-b border-border/40 bg-background transition-colors duration-120",
        isCompact ? "h-[36px]" : "h-[44px]",
        "hover:bg-accent/40 focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0",
        className
      )}
    >
      {/* 1. Underlying Row Navigation Link (z-0) */}
      <Link
        href={`/meetings/${item.meetingId}/action-items/${item.id}`}
        className="absolute inset-0 z-0 cursor-pointer focus:outline-none"
        aria-label={`View action item: ${item.text}`}
        onClick={(e) => {
          // If they click on something interactive in the z-10 layer, stop it
          const target = e.target as HTMLElement;
          if (target.closest("[data-prevent-nav]")) {
            e.preventDefault();
          }
        }}
      />

      {/* 2. Elevated Interactive Elements (z-10) */}
      <div className="relative z-10 flex items-center justify-between w-full gap-2.5 pointer-events-none">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 pointer-events-auto" data-prevent-nav>
          {/* Checkbox Trigger */}
          <ActionItemCompletedCheckbox
            checked={item.completed}
            onCheckedChange={(checked) => onToggleComplete(item.id, checked)}
            ariaLabel={`Mark "${item.text}" as complete`}
            className="h-4 w-4 shrink-0 transition-transform duration-120 hover:scale-105"
          />

          {/* Action Item Label Text */}
          <span
            className={cn(
              "font-sans text-sm text-foreground truncate select-none transition-all duration-140",
              item.completed 
                ? "line-through text-muted-foreground/60 text-decoration-color-muted-foreground/60" 
                : "text-decoration-color-transparent"
            )}
            style={{
              textDecorationThickness: "1.5px",
              transitionProperty: "color, text-decoration-color",
            }}
          >
            {item.text}
          </span>

          {showMeetingTitle && item.meeting && (
            <span className="text-2xs text-muted-foreground truncate max-w-[120px] font-sans font-normal ml-1">
              • {item.meeting.title}
            </span>
          )}
        </div>

        {/* Action Metadata Stack */}
        <div className="flex items-center gap-2.5 shrink-0 pointer-events-auto" data-prevent-nav>
          {/* AI Priority Badge */}
          {item.priority && (
            <ActionItemPriorityBadge 
              priority={item.priority} 
              context={item.priority === "URGENT" || item.priority === "HIGH" ? "Inferred priority" : null} 
            />
          )}

          {/* Due Date Display */}
          {item.dueDate && (
            <HydrationSafeTime dateString={item.dueDate} />
          )}

          {/* Assignee Avatar Indicator */}
          {item.assignee && (
            <ActionItemAssigneeAvatar assignee={item.assignee} />
          )}
        </div>
      </div>
    </div>
  );
}
