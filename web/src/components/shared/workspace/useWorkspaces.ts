"use client";

import { useMemo } from "react";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { useTeam } from "@/features/team/hooks/useTeam";
import type { Workspace, WorkspacePlan, WorkspaceRole } from "./types";

export function formatPlanName(rawPlan?: string): WorkspacePlan {
  if (!rawPlan) return "Free";
  const p = rawPlan.trim().toUpperCase();
  if (p === "ENTERPRISE") return "Enterprise";
  if (p === "PRO") return "Pro";
  if (p === "STARTER") return "Starter";
  if (p === "BUSINESS") return "Business";
  if (p === "TRIAL") return "Trial";
  if (p === "FREE") return "Free";
  return (p.charAt(0) + p.slice(1).toLowerCase()) as WorkspacePlan;
}

export function useWorkspaces() {
  const user = useAuthStore((state) => state.user);
  const { data: teamData, isLoading: isTeamLoading } = useTeam();

  const workspaces: Workspace[] = useMemo(() => {
    const list: Workspace[] = [];

    // Real Primary Team Workspace from API (/teams/me) & Auth Store (user.team)
    if (teamData || user?.team) {
      const name = teamData?.name || user?.team?.name || "Workspace";
      const slug = teamData?.slug || name.toLowerCase().replace(/\s+/g, "-");
      const rawPlan = teamData?.plan || user?.team?.plan || "Free";
      const formattedPlan = formatPlanName(rawPlan);

      const userRole: WorkspaceRole =
        user?.role === "ADMIN" ? "Owner" : user?.role === "USER" ? "Member" : "Admin";

      const membersCount = teamData?.usage?.membersCount || 1;

      list.push({
        id: teamData?.id || user?.team?.id || "team-primary",
        name,
        slug,
        plan: formattedPlan,
        role: userRole,
        membersCount,
        avatarGradient: "bg-brand text-white",
        active: true,
        shortcut: "⌘1",
      });
    } else {
      // Fallback workspace while loading
      list.push({
        id: "default-ws",
        name: "Workspace",
        slug: "workspace",
        plan: "Free",
        role: "Member",
        membersCount: 1,
        avatarGradient: "bg-brand text-white",
        active: true,
        shortcut: "⌘1",
      });
    }

    // Real User's Personal Workspace
    const personalName = user?.name
      ? `${user.name.split(" ")[0]}'s Workspace`
      : "Personal Workspace";

    list.push({
      id: "personal-ws",
      name: personalName,
      slug: "personal",
      plan: "Free",
      role: "Owner",
      membersCount: 1,
      isPersonal: true,
      avatarGradient: "bg-emerald-600 text-white",
      shortcut: "⌘2",
    });

    return list;
  }, [teamData, user]);

  return {
    workspaces,
    activeWorkspace: workspaces[0],
    isLoading: isTeamLoading,
  };
}
