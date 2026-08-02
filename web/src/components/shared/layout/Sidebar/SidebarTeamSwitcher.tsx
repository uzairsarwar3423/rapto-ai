"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { WorkspaceSwitcher } from "@/components/shared/workspace/WorkspaceSwitcher";

interface Team {
  id?: string;
  name?: string;
  logo?: string;
  plan?: string;
}

interface SidebarTeamSwitcherProps {
  team: Team | null;
  collapsed: boolean;
}

export function SidebarTeamSwitcher({ collapsed }: SidebarTeamSwitcherProps) {
  const router = useRouter();

  return (
    <div className="p-2 flex items-center justify-center select-none">
      <WorkspaceSwitcher
        collapsed={collapsed}
        onOpenSettings={() => router.push("/settings/team")}
        onInviteMembers={() => router.push("/onboarding/invite-team")}
        side="right"
        align="start"
      />
    </div>
  );
}
