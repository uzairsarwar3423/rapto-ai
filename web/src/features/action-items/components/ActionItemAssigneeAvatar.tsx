"use client";

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ActionItemAssigneePopover } from "./ActionItemAssigneePopover";
import { cn } from "@/lib/utils";
import type { User } from "@/features/auth/types/auth.types";

interface ActionItemAssigneeAvatarProps {
  assignee: User;
  className?: string;
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function ActionItemAssigneeAvatar({ assignee, className }: ActionItemAssigneeAvatarProps) {
  return (
    <ActionItemAssigneePopover assignee={assignee}>
      <button
        type="button"
        className="outline-none focus:ring-1 focus:ring-ring focus:ring-offset-1 rounded-full cursor-pointer"
        aria-label={`Assigned to ${assignee.name}`}
      >
        <Avatar className={cn("h-5 w-5 hover:opacity-80 transition-opacity", className)}>
          {assignee.avatarUrl && <AvatarImage src={assignee.avatarUrl} alt={assignee.name} />}
          <AvatarFallback className="font-heading font-medium text-[9px] bg-muted text-muted-foreground flex items-center justify-center">
            {getInitials(assignee.name)}
          </AvatarFallback>
        </Avatar>
      </button>
    </ActionItemAssigneePopover>
  );
}
