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
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarLogo } from "./SidebarLogo";
import { SidebarCollapseButton } from "./SidebarCollapseButton";
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

/**
 * Desktop sidebar.
 *
 *   header      logo · collapse control
 *   workspace   switcher
 *   nav         Workspace group · Intelligence group      (scrolls if the viewport is short)
 *   footer      Settings (anchored) · profile
 *
 * Width is the only thing that animates on collapse (240 → 56). Every row shares one geometry (a px-2
 * gutter and px-3 rows), so icons hold their x-position and only labels fade — no layout jumps.
 */
export function Sidebar({ user, team }: SidebarProps) {
  const collapsed = useUIStore((state) => state.sidebarCollapsed);

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={400}>
      <aside
        data-collapsed={collapsed}
        aria-label="Sidebar"
        className={cn(
          // min-w-0 lets the rail narrow below its content's intrinsic width (labels stay in the DOM so they can fade)
          "group flex h-dvh min-w-0 shrink-0 flex-col overflow-x-clip border-r border-border/70 bg-surface-2",
          "transition-[width] duration-200 ease-out-soft",
          "w-[240px] data-[collapsed=true]:w-14" // 56px icon rail
        )}
      >
        {/* Header: wordmark + collapse control. Collapsed, the control replaces the mark on hover/focus. */}
        <div className="group/header relative flex h-14 shrink-0 items-center px-5">
          <div
            className={cn(
              "transition-opacity duration-150 ease-out-soft",
              collapsed && "group-hover/header:opacity-0 group-focus-within/header:opacity-0"
            )}
          >
            <SidebarLogo collapsed={collapsed} bare />
          </div>
          <SidebarCollapseButton
            className={cn(
              "absolute transition-opacity duration-150",
              collapsed
                ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/header:opacity-100 group-focus-within/header:opacity-100"
                : "right-3 top-1/2 -translate-y-1/2 opacity-100"
            )}
          />
        </div>

        <SidebarTeamSwitcher team={team} collapsed={collapsed} />

        <div className="min-h-0 flex-1">
          <ScrollArea className="h-full px-2 pb-3 pt-3">
            <SidebarNav>
              <SidebarNavGroup label="Workspace" collapsed={collapsed}>
                <SidebarNavItem icon={LayoutDashboard} label="Dashboard" href="/dashboard" />
                <SidebarNavItem icon={Video} label="Meetings" href="/meetings" />
                <SidebarNavItem icon={CheckCircle2} label="Commitments" href="/commitments" />
                <SidebarNavItem icon={ListTodo} label="Action Items" href="/action-items" />
                <SidebarNavItem icon={Users} label="Team" href="/team" />
                <SidebarNavItem icon={BarChart3} label="Analytics" href="/analytics" />
              </SidebarNavGroup>

              <SidebarNavGroup label="Intelligence" collapsed={collapsed}>
                <SidebarNavItem icon={Sparkles} label="Intelligence" href="/intelligence" hoverMotion="tilt" />
              </SidebarNavGroup>
            </SidebarNav>
          </ScrollArea>
        </div>

        {/* Anchored footer: Settings, then the profile. One hairline, no stacked separators. */}
        <div className="shrink-0 border-t border-border/60 px-2 pt-2">
          <SidebarNavItem icon={Settings} label="Settings" href="/settings" hoverMotion="rotate" />
        </div>
        <div className="pt-1">
          <SidebarUser user={user} collapsed={collapsed} />
        </div>
      </aside>
    </TooltipProvider>
  );
}
