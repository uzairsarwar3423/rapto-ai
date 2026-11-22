"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui.store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "../Kbd";

/** The one restrained hover gesture an icon makes. Kept deliberately small — the sidebar should feel calm. */
export type NavIconMotion = "lift" | "rotate" | "tilt";

const ICON_MOTION: Record<NavIconMotion, string> = {
  lift: "group-hover:-translate-y-px group-hover:scale-[1.07]",
  rotate: "group-hover:rotate-45",
  tilt: "group-hover:rotate-12 group-hover:scale-110",
};

interface SidebarNavItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: string;
  shortcut?: string[];
  className?: string;
  /**
   * Override the collapsed state. Defaults to the desktop sidebar's persisted state; the mobile
   * drawer always passes `false` because it is never icon-only.
   */
  collapsed?: boolean;
  /** Distinct per rendered nav so two navs on screen never share one animated indicator. */
  indicatorId?: string;
  hoverMotion?: NavIconMotion;
}

/**
 * A single navigation row.
 *
 * Layout contract: the row is `px-3` and the sidebar gutter is `px-2`, so the 16px icon's centre sits
 * at x = 28 in BOTH states (56px rail centre). Collapsing therefore never moves an icon — the label just
 * fades and is clipped by the narrowing row, which is what keeps the transition feeling like one motion.
 */
export function SidebarNavItem({
  icon: Icon,
  label,
  href,
  badge,
  shortcut,
  className,
  collapsed: collapsedProp,
  indicatorId = "sidebar-active-indicator",
  hoverMotion = "lift",
}: SidebarNavItemProps) {
  const pathname = usePathname();
  const storeCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const collapsed = collapsedProp ?? storeCollapsed;

  // Active when the route matches exactly or is nested beneath this item.
  const isActive = pathname === href || pathname.startsWith(href + "/");

  const link = (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex h-9 w-full select-none items-center gap-3 overflow-hidden rounded-lg px-3",
        "text-[13px] font-medium leading-none tracking-[-0.006em] outline-none",
        "transition-[background-color,color,transform] duration-150 ease-out-soft",
        "active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-brand/40",
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground",
        className
      )}
    >
      {/* Active treatment: a soft green wash and a slim edge mark that glides between items */}
      {isActive && (
        <motion.span
          layoutId={indicatorId}
          layout="position"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="pointer-events-none absolute inset-0 rounded-lg bg-brand/[0.085] ring-1 ring-inset ring-brand/[0.1]"
        >
          <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
        </motion.span>
      )}

      <span
        className={cn(
          "relative z-10 flex h-4 w-4 shrink-0 items-center justify-center",
          "transition-[transform,color] duration-200 ease-out-soft",
          isActive ? "text-brand" : "group-hover:text-foreground",
          ICON_MOTION[hoverMotion]
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </span>

      <span
        className={cn(
          "relative z-10 min-w-0 flex-1 truncate whitespace-nowrap",
          "transition-[opacity,transform] duration-150 ease-out-soft",
          collapsed ? "-translate-x-1 opacity-0" : "translate-x-0 opacity-100 delay-75"
        )}
      >
        {label}
      </span>

      {badge && (
        <span
          className={cn(
            "relative z-10 shrink-0 rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
            "transition-opacity duration-150",
            collapsed ? "opacity-0" : "opacity-100 delay-75"
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );

  if (!collapsed) return link;

  // Icon-only rail: the label lives in a tooltip (the TooltipProvider is mounted once in <Sidebar />).
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={12} className="px-2.5 py-1 text-[11.5px] font-medium">
        <span>{label}</span>
        {shortcut && <Kbd keys={shortcut} />}
      </TooltipContent>
    </Tooltip>
  );
}
