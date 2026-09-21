"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { WorkspaceSwitcher } from "@/components/shared/workspace/WorkspaceSwitcher";
import { useUIStore } from "@/store/ui.store";

interface Team {
  id?: string;
  name?: string;
  logo?: string;
  plan?: string;
}

interface SidebarTeamSwitcherProps {
  team: Team | null;
  collapsed: boolean;
  onInviteOpened?: () => void;
}

export function SidebarTeamSwitcher({
  collapsed,
  onInviteOpened,
}: SidebarTeamSwitcherProps) {
  const router = useRouter();
  const setInviteModalOpen = useUIStore((state) => state.setInviteModalOpen);

  const handleInviteMembers = () => {
    onInviteOpened?.();
    setInviteModalOpen(true);
  };

  return (
    <div className="p-2 flex items-center justify-center select-none">
      <WorkspaceSwitcher
        collapsed={collapsed}
        onOpenSettings={() => router.push("/settings/team")}
        onInviteMembers={handleInviteMembers}
        side="right"
        align="start"
      />
    </div>
  );
}
