"use client";

import {
  LayoutDashboard,
  Video,
  CheckCircle2,
  ListTodo,
  Users,
  BarChart3,
  Sparkles,
  Settings,
} from "lucide-react";
import { useUIStore } from "@/store/ui.store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SidebarTeamSwitcher } from "./SidebarTeamSwitcher";
import { SidebarUser } from "./SidebarUser";
import { SidebarNav } from "./SidebarNav";
import { SidebarNavGroup } from "./SidebarNavGroup";
import { SidebarNavItem } from "./SidebarNavItem";
import { cn } from "@/lib/utils";

import { User } from "@/features/auth/types/auth.types";

interface Team {
  id: string;
  name: string;
  logo?: string;
  plan?: string;
}

interface SidebarProps {
  user: User | null;
  team: Team | null;
}

export function Sidebar({ user, team }: SidebarProps) {
  const collapsed = useUIStore((state) => state.sidebarCollapsed);

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "group flex h-dvh flex-col border-r border-border bg-surface shrink-0",
        "transition-[width] duration-180 ease-out-soft",
        "w-[240px] data-[collapsed=true]:w-14" // data-[collapsed=true]:w-14 is 56px (14 * 4px)
      )}
    >
      <SidebarTeamSwitcher team={team} collapsed={collapsed} />
      <Separator className="bg-border" />

      <div className="flex-1 overflow-hidden">
      <ScrollArea className="h-full px-2 py-3">
        <SidebarNav>
          <SidebarNavGroup label="Workspace" collapsed={collapsed}>
            <SidebarNavItem
              icon={LayoutDashboard}
              label="Dashboard"
              href="/dashboard"
            />
            <SidebarNavItem icon={Video} label="Meetings" href="/meetings" />
            <SidebarNavItem
              icon={CheckCircle2}
              label="Commitments"
              href="/commitments"
            />
            <SidebarNavItem
              icon={ListTodo}
              label="Action Items"
              href="/action-items"
            />
            <SidebarNavItem icon={Users} label="Team" href="/team" />
            <SidebarNavItem
              icon={BarChart3}
              label="Analytics"
              href="/analytics"
            />
          </SidebarNavGroup>

          <Separator className="my-2 bg-border" />

          <SidebarNavGroup label="Intelligence" collapsed={collapsed}>
            <SidebarNavItem
              icon={Sparkles}
              label="Intelligence"
              href="/intelligence"
            />
          </SidebarNavGroup>
        </SidebarNav>
      </ScrollArea>
      </div>

      <Separator className="bg-border" />
      <div className="px-2 py-2 bg-surface/30">
        <SidebarNavItem
          icon={Settings}
          label="Settings"
          href="/settings"
        />
      </div>
      <SidebarUser user={user} collapsed={collapsed} />
    </aside>
  );
}
