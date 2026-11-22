"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarLogoProps {
  collapsed: boolean;
  /** Render just the mark (no wrapper padding/height) — the caller owns the surrounding layout. */
  bare?: boolean;
}

export function SidebarLogo({ collapsed, bare = false }: SidebarLogoProps) {
  return (
    <div
      className={cn(
        "flex items-center select-none shrink-0",
        !bare && "h-12 transition-all duration-180",
        !bare && (collapsed ? "justify-center px-0" : "px-4 pt-3 pb-1")
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
              {/* Logo: transparent PNG wordmark (public/email/rapto-logo.png, 288×116 = 3× of 69×28); the white
                  variant is shown in dark mode. Collapsed: the same file clipped to its "R" (the letter ends at 61/288
                  px, the "a" starts at 66/288 px — a 15px window at this scale shows only the "R"). */}
              <span
                className={cn(
                  "inline-flex shrink-0 items-center overflow-hidden",
                  collapsed ? "w-[15px]" : ""
                )}
              >
                <img
                  src="/email/rapto-logo.png"
                  alt="Rapto"
                  width={69}
                  height={28}
                  draggable={false}
                  decoding="async"
                  fetchPriority="high"
                  className="h-7 w-auto max-w-none shrink-0 select-none dark:hidden"
                />
                <img
                  src="/email/rapto-logo-white.png"
                  alt=""
                  aria-hidden="true"
                  width={69}
                  height={28}
                  draggable={false}
                  decoding="async"
                  loading="lazy"
                  className="hidden h-7 w-auto max-w-none shrink-0 select-none dark:block"
                />
              </span>
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
