"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { PriorityLevel } from "../types";

interface ActionItemPriorityBadgeProps {
  priority: PriorityLevel;
  context?: string | null;
  className?: string;
}

const PRIORITY_STYLES: Record<PriorityLevel, string> = {
  LOW: "text-muted-foreground border-border bg-transparent font-normal hover:bg-transparent",
  MEDIUM: "text-foreground border-border bg-transparent font-normal hover:bg-transparent",
  HIGH: "text-foreground border-foreground/40 bg-transparent font-normal hover:bg-transparent",
  URGENT: "text-foreground border-foreground/40 bg-transparent font-medium hover:bg-transparent",
};

export function ActionItemPriorityBadge({
  priority,
  context,
  className,
}: ActionItemPriorityBadgeProps) {
  const badge = (
    <span
      className={cn(
        "inline-flex items-center text-2xs px-1.5 py-0 h-4 rounded-sm tracking-wider uppercase font-mono select-none border border-border/60",
        PRIORITY_STYLES[priority],
        className
      )}
      aria-label={`Priority: ${priority.toLowerCase()}`}
    >
      {priority}
    </span>
  );

  if (!context) {
    return badge;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center cursor-help">{badge}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-2xs max-w-[240px]">
          Inferred from: &ldquo;{context}&rdquo;
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
