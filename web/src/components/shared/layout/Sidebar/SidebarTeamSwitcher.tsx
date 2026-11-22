"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { WorkspaceSwitcher } from "@/components/shared/workspace/WorkspaceSwitcher";
import { useUIStore } from "@/store/ui.store";
import type { Workspace } from "@/components/shared/workspace/types";
import { cn } from "@/lib/utils";

interface Team {
  id?: string;
  name?: string;
  logo?: string;
  plan?: string;
}

export interface SidebarTeamSwitcherProps {
  team: Team | null;
  collapsed: boolean;
  onInviteOpened?: () => void;
  onWorkspaceSelected?: (workspace: Workspace) => void;
  className?: string;
  mode?: "auto" | "modal" | "popover" | "drawer";
}

export function SidebarTeamSwitcher({
  collapsed,
  onInviteOpened,
  onWorkspaceSelected,
  className,
  mode = "auto",
}: SidebarTeamSwitcherProps) {
  const router = useRouter();
  const setInviteModalOpen = useUIStore((state) => state.setInviteModalOpen);

  const handleInviteMembers = () => {
    onInviteOpened?.();
    setInviteModalOpen(true);
  };

  const handleSelectWorkspace = (ws: Workspace) => {
    onWorkspaceSelected?.(ws);
  };

  return (
    <div className={cn("flex w-full select-none items-center justify-center px-2 pb-1", className)}>
      <WorkspaceSwitcher
        collapsed={collapsed}
        onSelect={handleSelectWorkspace}
        onOpenSettings={() => router.push("/settings/team")}
        onInviteMembers={handleInviteMembers}
        side="right"
        align="start"
        mode={mode}
      />
    </div>
  );
}
