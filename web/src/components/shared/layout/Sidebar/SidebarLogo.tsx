"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarLogoProps {
  collapsed: boolean;
}

export function SidebarLogo({ collapsed }: SidebarLogoProps) {
  return (
    <div
      className={cn(
        "flex items-center h-12 select-none shrink-0 transition-all duration-180",
        collapsed ? "justify-center px-0" : "px-4 pt-3 pb-1"
      )}
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/dashboard"
              className={cn(
                "group inline-flex items-center rounded-md transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                collapsed ? "justify-center" : ""
              )}
              aria-label="Rapto Home"
            >
              <AnimatePresence mode="wait" initial={false}>
                {collapsed ? (
                  <motion.span
                    key="collapsed-logo"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    className="font-display text-xl font-bold tracking-tight text-foreground select-none flex items-center"
                  >
                    R
                    <span className="relative inline-block text-brand ml-0.5">
                      .
                      <span className="absolute top-[3px] left-0 w-[4px] h-[4px] rounded-full bg-brand" />
                    </span>
                  </motion.span>
                ) : (
                  <motion.span
                    key="expanded-logo"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="font-display text-xl font-extrabold tracking-tight text-foreground select-none flex items-center"
                  >
                    Rapt
                    <span className="relative inline-block text-brand">
                      o
                      <span className="absolute top-[3px] -right-[4px] w-[5px] h-[5px] rounded-full bg-brand" />
                    </span>
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right" sideOffset={12} className="font-medium text-xs">
              Rapto
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
