"use client";

import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { User } from "@/features/auth/types/auth.types";

interface ActionItemAssigneePopoverProps {
  assignee: User;
  children: React.ReactNode;
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function ActionItemAssigneePopover({
  assignee,
  children,
}: ActionItemAssigneePopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[240px] p-3 text-sm z-50 bg-popover text-popover-foreground border border-border shadow-md rounded-md animate-in fade-in-50 zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            {assignee.avatarUrl && <AvatarImage src={assignee.avatarUrl} alt={assignee.name} />}
            <AvatarFallback className="font-heading font-medium text-xs">
              {getInitials(assignee.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-sans text-xs font-medium text-foreground truncate">{assignee.name}</p>
            <p className="font-sans text-[11px] text-muted-foreground truncate">{assignee.email}</p>
          </div>
        </div>
        <div className="border-t border-border/60 mt-3 pt-2">
          <Button
            size="sm"
            variant="outline"
            disabled
            className="w-full text-2xs h-7 font-sans pointer-events-none opacity-50"
          >
            Change assignee
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-1">Reassignment coming soon</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
