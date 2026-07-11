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
import { motion, AnimatePresence } from "framer-motion";
import { Kbd } from "../Kbd";

interface SidebarNavItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: string;
  shortcut?: string[];
  className?: string;
}

// Custom hover micro-interactions tailored specifically to each icon type
const iconVariants = {
  Dashboard: {
    hover: {
      rotate: [0, -6, 6, 0],
      scale: 1.12,
      transition: { duration: 0.4, ease: "easeInOut" },
    },
  },
  Meetings: {
    hover: {
      scale: 1.15,
      y: [0, -3, 2, 0],
      transition: { duration: 0.5, ease: "easeInOut" },
    },
  },
  Commitments: {
    hover: {
      scale: 1.2,
      rotate: 360,
      transition: { duration: 0.5, ease: "easeInOut" },
    },
  },
  "Action Items": {
    hover: {
      x: [0, 3, -1, 0],
      scale: 1.12,
      transition: { duration: 0.35, ease: "easeInOut" },
    },
  },
  Team: {
    hover: {
      scale: 1.18,
      y: [0, -2, 0],
      transition: { duration: 0.4, ease: "easeOut" },
    },
  },
  Analytics: {
    hover: {
      scale: 1.18,
      y: [0, -3, 0],
      transition: { duration: 0.45, ease: [0.175, 0.885, 0.32, 1.275] }, // backOut-like bounce
    },
  },
  Intelligence: {
    hover: {
      scale: [1, 1.25, 1.1, 1.2, 1],
      rotate: [0, 45, 90, 135, 180],
      transition: { duration: 0.8, ease: "easeInOut" },
    },
  },
  Settings: {
    hover: {
      rotate: 180,
      scale: 1.15,
      transition: { duration: 0.6, ease: "easeInOut" },
    },
  },
};

const MotionLink = motion.create(Link);

export function SidebarNavItem({
  icon: Icon,
  label,
  href,
  badge,
  shortcut,
  className,
}: SidebarNavItemProps) {
  const pathname = usePathname();
  const collapsed = useUIStore((state) => state.sidebarCollapsed);

  // Active check: matches exactly or matches nested routes
  const isActive = pathname === href || pathname.startsWith(href + "/");

  const variants = iconVariants[label as keyof typeof iconVariants] || {
    hover: { scale: 1.1, transition: { duration: 0.2 } },
  };

  const content = (
    <MotionLink
      layout="position"
      href={href}
      className={cn(
        "group relative flex items-center rounded-md text-xs transition-colors duration-120 outline-hidden focus-visible:ring-2 focus-visible:ring-ring select-none w-full",
        collapsed
          ? "h-8 w-8 justify-center hover:bg-surface-hover/80 text-muted-foreground hover:text-foreground"
          : "h-8 px-2.5 text-muted-foreground hover:bg-surface-hover/80 hover:text-foreground",
        isActive && "text-brand font-semibold dark:text-brand",
        isActive && collapsed && "bg-brand-subtle/50 dark:bg-brand-subtle/20 text-brand hover:bg-brand-subtle/70",
        className
      )}
    >
      <motion.div
        className={cn(
          "flex items-center w-full h-full relative",
          collapsed ? "justify-center" : ""
        )}
        whileHover="hover"
        whileTap="tap"
      >
        {/* Active background pill with smooth layout transition */}
        {isActive && !collapsed && (
          <motion.span
            layoutId="sidebar-active-pill"
            className="absolute inset-0 rounded-md bg-brand-subtle/50 dark:bg-brand-subtle/20 border-l-2 border-brand -mx-2.5 z-0"
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 30,
            }}
          />
        )}

        {/* Icon wrapper with tailored micro-interaction variants */}
        <motion.div
          variants={variants}
          className={cn(
            "relative z-10 h-4 w-4 shrink-0 transition-colors duration-120 flex items-center justify-center",
            isActive
              ? "text-brand dark:text-brand"
              : "text-muted-foreground group-hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
        </motion.div>

        {/* Label with slide/fade transition to prevent text clipping */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0, marginLeft: 0 }}
              animate={{ opacity: 1, width: "auto", marginLeft: 10 }}
              exit={{ opacity: 0, width: 0, marginLeft: 0 }}
              transition={{
                duration: 0.18,
                ease: [0.16, 1, 0.3, 1], // ease-out-soft
              }}
              className="flex-1 truncate text-xs relative z-10"
              style={{ overflow: "hidden", whiteSpace: "nowrap" }}
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Badge */}
        <AnimatePresence initial={false}>
          {!collapsed && badge && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="relative z-10 shrink-0 rounded-sm bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground group-hover:text-foreground ml-auto"
            >
              {badge}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </MotionLink>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={12} className="flex items-center gap-2 text-[11px] font-normal">
            <span>{label}</span>
            {badge && (
              <span className="ml-1.5 rounded-sm bg-background/20 px-1 py-0.2 text-[9px] font-medium">
                {badge}
              </span>
            )}
            {shortcut && <Kbd keys={shortcut} />}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}
