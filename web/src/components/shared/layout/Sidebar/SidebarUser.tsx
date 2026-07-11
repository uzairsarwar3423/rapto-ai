"use client";

import { LogOut, User as UserIcon, Shield, Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLogout } from "@/features/auth/hooks/useLogout";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { motion } from "framer-motion";

import { User } from "@/features/auth/types/auth.types";
import { ConnectionStatusDot } from "@/components/shared/feedback/ConnectionStatusDot";

interface SidebarUserProps {
  user: User | null;
  collapsed: boolean;
}

export function SidebarUser({ user, collapsed }: SidebarUserProps) {
  const logoutMutation = useLogout();

  const name = user?.name || "User";
  const email = user?.email || "";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className={cn("p-2 shrink-0 select-none border-t border-border bg-surface/50")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "flex items-center gap-2 rounded-md hover:bg-surface-hover transition-colors duration-120 cursor-pointer text-left w-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              collapsed ? "h-9 w-9 justify-center" : "h-auto py-1 px-2"
            )}
            aria-label="User settings menu"
          >
            <Avatar className="h-6 w-6 rounded-full shrink-0">
              {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={name} />}
              <AvatarFallback className="rounded-full bg-brand-subtle text-brand font-heading text-[10px] font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>

            {!collapsed && (
              <div className="flex flex-1 flex-col truncate">
                <span className="truncate text-xs font-medium text-foreground leading-none mb-0.5">
                  {name}
                </span>
                <span className="truncate text-[10px] text-muted-subtle leading-none mb-1">
                  {email}
                </span>
                <ConnectionStatusDot />
              </div>
            )}
          </motion.button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[190px] bg-popover border border-border rounded-xl p-1 shadow-lg text-popover-foreground"
          align="end"
          side="right"
          sideOffset={8}
        >
          <DropdownMenuItem asChild>
            <Link
              href="/settings/profile"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <UserIcon className="h-3.5 w-3.5" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/settings/notifications"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Bell className="h-3.5 w-3.5" />
              Notifications
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/settings/security"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Shield className="h-3.5 w-3.5" />
              Security
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            className="flex items-center gap-2 text-xs text-error hover:bg-error/10 hover:text-error! cursor-pointer focus:text-error!"
          >
            <LogOut className="h-3.5 w-3.5" />
            {logoutMutation.isPending ? "Signing out..." : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
