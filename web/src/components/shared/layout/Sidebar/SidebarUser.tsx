"use client";

import Link from "next/link";
import { Bell, ChevronsUpDown, LogOut, Shield, User as UserIcon } from "lucide-react";
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
import type { User } from "@/features/auth/types/auth.types";
import { ConnectionStatusDot } from "@/components/shared/feedback/ConnectionStatusDot";

interface SidebarUserProps {
  user: User | null;
  collapsed: boolean;
}

const MENU_ITEM =
  "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground focus:bg-foreground/[0.05] focus:text-foreground";

/**
 * Profile row: avatar with a live connection badge, name over email, and a menu.
 * Shares the nav's geometry (px-2 gutter + px-1.5 padding → avatar centred at x = 28) so collapsing
 * never moves it.
 */
export function SidebarUser({ user, collapsed }: SidebarUserProps) {
  const logoutMutation = useLogout();

  const name = user?.name || "User";
  const email = user?.email || "";
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  return (
    <div className="shrink-0 px-2 pb-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className={cn(
              "group flex h-12 w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-lg px-1.5 text-left outline-none",
              "transition-[background-color,transform] duration-150 ease-out-soft",
              "hover:bg-foreground/[0.045] active:scale-[0.985] data-[state=open]:bg-foreground/[0.05]",
              "focus-visible:ring-2 focus-visible:ring-brand/40"
            )}
          >
            <span className="relative shrink-0">
              <Avatar className="h-7 w-7 rounded-full">
                {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
                <AvatarFallback className="rounded-full bg-brand/10 text-[11px] font-semibold text-brand">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {/* Connection badge: a ring in the sidebar colour separates it cleanly from the avatar */}
              <ConnectionStatusDot
                compact
                className="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface-2 p-[2px]"
              />
            </span>

            <span
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-0.5 transition-opacity duration-150 ease-out-soft",
                collapsed ? "opacity-0" : "opacity-100 delay-75"
              )}
            >
              <span className="truncate text-[13px] font-medium leading-none tracking-[-0.006em] text-foreground">
                {name}
              </span>
              <span className="truncate text-[11px] leading-none text-muted-foreground">{email}</span>
            </span>

            <ChevronsUpDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-subtle transition-[opacity,color] duration-150 group-hover:text-foreground",
                collapsed ? "opacity-0" : "opacity-100 delay-75"
              )}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          className="w-[224px] rounded-xl border-0 bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
          align="end"
          side="right"
          sideOffset={10}
        >
          <div className="px-2 pb-2 pt-1.5">
            <p className="truncate text-[13px] font-medium text-foreground">{name}</p>
            {email && <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{email}</p>}
            <ConnectionStatusDot className="mt-2" />
          </div>
          <DropdownMenuSeparator className="bg-border/70" />
          <DropdownMenuItem asChild>
            <Link href="/settings/profile" className={MENU_ITEM}>
              <UserIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings/notifications" className={MENU_ITEM}>
              <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
              Notifications
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings/security" className={MENU_ITEM}>
              <Shield className="h-3.5 w-3.5" strokeWidth={1.75} />
              Security
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border/70" />
          <DropdownMenuItem
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-error focus:bg-error/10 focus:text-error"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
            {logoutMutation.isPending ? "Signing out..." : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
