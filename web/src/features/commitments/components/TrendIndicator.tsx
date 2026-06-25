"use client";

import React from "react";
import { ArrowUp, ArrowDown, ArrowRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface TrendIndicatorProps {
  trend: "improving" | "stable" | "declining";
  weekOverWeekText?: string; // e.g. "This week: 82% · Last week: 71%"
}

export function TrendIndicator({ trend, weekOverWeekText }: TrendIndicatorProps) {
  let icon: React.ReactNode;
  let label: string;
  let textClass: string;

  switch (trend) {
    case "improving":
      icon = <ArrowUp className="size-3" aria-hidden="true" />;
      label = "improving";
      textClass = "text-foreground font-medium";
      break;
    case "declining":
      icon = <ArrowDown className="size-3" aria-hidden="true" />;
      label = "declining";
      textClass = "text-foreground font-medium";
      break;
    case "stable":
    default:
      icon = <ArrowRight className="size-3" aria-hidden="true" />;
      label = "stable";
      textClass = "text-muted-foreground";
      break;
  }

  const indicatorElement = (
    <span className={`inline-flex items-center gap-1 text-xs select-none ${textClass}`}>
      {icon}
      <span>{label}</span>
    </span>
  );

  if (!weekOverWeekText) {
    return indicatorElement;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help inline-flex">{indicatorElement}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs bg-popover text-popover-foreground border border-border px-2 py-1 rounded shadow-md">
          {weekOverWeekText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
