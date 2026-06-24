"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui.store";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarNavItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: string;
  className?: string;
}

export function SidebarNavItem({
  icon: Icon,
  label,
  href,
  badge,
  className,
}: SidebarNavItemProps) {
  const pathname = usePathname();
  const collapsed = useUIStore((state) => state.sidebarCollapsed);

  // Active check: matches exactly or matches nested routes
  const isActive = pathname === href || pathname.startsWith(href + "/");

  const content = (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center rounded-md text-xs transition-colors duration-120 outline-hidden focus-visible:ring-2 focus-visible:ring-ring select-none",
        collapsed
          ? "h-8 w-8 justify-center"
          : "h-8 gap-2.5 px-2.5 w-full text-muted-foreground hover:bg-surface-hover hover:text-foreground",
        isActive && !collapsed && "bg-surface-hover text-foreground font-medium",
        isActive &&
          !collapsed &&
          "before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2px] before:rounded-full before:bg-foreground",
        isActive && collapsed && "bg-surface-hover text-foreground",
        className
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors duration-120",
          isActive
            ? "text-foreground"
            : "text-muted-foreground group-hover:text-foreground"
        )}
      />
      {!collapsed && (
        <span className="flex-1 truncate text-xs">{label}</span>
      )}
      {!collapsed && badge && (
        <span className="shrink-0 rounded-sm bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground group-hover:text-foreground">
          {badge}
        </span>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={12} className="text-[11px] font-normal">
            {label}
            {badge && (
              <span className="ml-1.5 rounded-sm bg-background/20 px-1 py-0.2 text-[9px] font-medium">
                {badge}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}
