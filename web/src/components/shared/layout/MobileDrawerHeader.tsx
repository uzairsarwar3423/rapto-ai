"use client";

import React from "react";
import { X } from "lucide-react";
import { SidebarLogo } from "./Sidebar/SidebarLogo";
import { SidebarTeamSwitcher } from "./Sidebar/SidebarTeamSwitcher";
import { cn } from "@/lib/utils";

interface Team {
  id: string;
  name: string;
  logo?: string;
  plan?: string;
}

interface MobileDrawerHeaderProps {
  team: Team | null;
  onClose: () => void;
}

export function MobileDrawerHeader({ team, onClose }: MobileDrawerHeaderProps) {
  return (
    <div className="flex flex-col border-b border-border">
      {/* Top Header Row: Responsive Logo + Close Button */}
      <div className="flex items-center justify-between pr-2">
        <div className="flex-1 min-w-0">
          <SidebarLogo collapsed={false} />
        </div>
        <button
          onClick={onClose}
          aria-label="Close navigation menu"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            "transition-colors duration-120 ml-1",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "cursor-pointer"
          )}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Team Switcher Row */}
      <SidebarTeamSwitcher team={team} collapsed={false} />
    </div>
  );
}
