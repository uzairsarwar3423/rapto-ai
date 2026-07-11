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
import { motion, AnimatePresence } from "framer-motion";

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

  const currentPlan = team?.plan || "Free";

  return (
    <div className={cn("p-2 flex items-center justify-center select-none")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "group flex items-center gap-2 rounded-md hover:bg-surface-hover transition-colors duration-120 cursor-pointer text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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

            <AnimatePresence initial={false}>
              {!collapsed && (
                <>
                  <motion.span
                    initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                    animate={{ opacity: 1, width: "auto", marginLeft: 8 }}
                    exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="flex-1 truncate text-xs font-medium text-foreground"
                    style={{ overflow: "hidden", whiteSpace: "nowrap" }}
                  >
                    {teamName}
                  </motion.span>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.12 }}
                    className="shrink-0"
                  >
                    <ChevronsUpDown className="h-3.5 w-3.5 text-muted-subtle shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180 group-data-[state=open]:text-foreground" />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </motion.button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[220px] bg-popover border border-border rounded-xl p-1 shadow-lg text-popover-foreground"
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

