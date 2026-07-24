"use client";

import React from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutoSyncIndicatorProps {
  autoSynced?: boolean | null;
  className?: string;
}

export function AutoSyncIndicator({ autoSynced, className }: AutoSyncIndicatorProps) {
  if (!autoSynced) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-sans font-medium select-none border",
        "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        className
      )}
      title="Automatically synced upon meeting extraction"
    >
      <Zap className="size-2.5 fill-amber-500 text-amber-500 shrink-0" />
      <span>Auto</span>
    </div>
  );
}
