import React from "react";
import { cn } from "@/lib/utils";

interface StatPillProps {
  label: string;
  value: string | number;
  className?: string;
}

export function StatPill({ label, value, className }: StatPillProps) {
  return (
    <div className={cn("flex flex-col gap-0.5 p-3 rounded-xl bg-surface border border-border/40", className)}>
      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{label}</span>
      <span className="text-sm font-semibold text-foreground tabular-nums leading-none mt-1">{value}</span>
    </div>
  );
}
