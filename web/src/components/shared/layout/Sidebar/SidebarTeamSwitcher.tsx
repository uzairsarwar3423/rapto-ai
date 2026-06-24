"use client";

import { ChevronsUpDown, Settings, UserPlus, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Team {
  id: string;
  name: string;
  logo?: string;
  plan?: string;
}

interface SidebarTeamSwitcherProps {
  team: Team | null;
  collapsed: boolean;
}

export function SidebarTeamSwitcher({ team, collapsed }: SidebarTeamSwitcherProps) {
  const teamName = team?.name || "Workspace";
  const initials = teamName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const currentPlan = team?.plan || "Growth";

  return (
    <div className={cn("p-2 flex items-center justify-center select-none")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-2 rounded-md hover:bg-surface-hover transition-colors duration-120 cursor-pointer text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              collapsed ? "h-9 w-9 justify-center" : "h-9 w-full px-2"
            )}
            aria-label="Switch team workspace"
          >
            <Avatar className="h-6 w-6 rounded-md">
              {team?.logo && <AvatarImage src={team.logo} alt={teamName} />}
              <AvatarFallback className="rounded-md bg-brand text-white font-heading text-[10px] font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>

            {!collapsed && (
              <>
                <span className="flex-1 truncate text-xs font-medium text-foreground">
                  {teamName}
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-subtle shrink-0" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[220px] bg-white border border-border rounded-xl p-1 shadow-lg"
          align="start"
          side="right"
          sideOffset={8}
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="truncate text-xs font-semibold text-foreground max-w-[140px]">
              {teamName}
            </span>
            <Badge className="bg-brand/10 text-brand border border-brand/20 text-[9px] px-1 py-0 font-bold uppercase rounded-sm">
              {currentPlan}
            </Badge>
          </div>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem asChild>
            <Link
              href="/settings/team"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5" />
              Team settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/onboarding/invite-team"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Invite members
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            disabled
            className="flex items-center gap-2 text-xs text-muted-subtle cursor-not-allowed opacity-50 select-none focus:bg-transparent"
          >
            <Plus className="h-3.5 w-3.5" />
            Create team <span className="text-[9px] text-muted-subtle font-normal">(soon)</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
