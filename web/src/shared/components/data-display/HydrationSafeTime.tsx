"use client";

import React, { useState, useEffect } from "react";
import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";

interface HydrationSafeTimeProps {
  dateString: string;
  className?: string;
}

export function HydrationSafeTime({ dateString, className }: HydrationSafeTimeProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Render an invisible placeholder during SSR to match the client spacing exactly
    return <span className="invisible font-mono text-xs select-none">--/--</span>;
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;

  // Overdue if it is in the past and is not today
  const overdue = isPast(date) && !isToday(date);
  const formattedDate = format(date, "MMM dd");

  return (
    <span
      className={cn(
        "font-mono text-xs tabular-nums tracking-tight flex items-center gap-1.5 shrink-0 select-none",
        overdue ? "text-foreground font-medium" : "text-muted-foreground",
        className
      )}
    >
      {overdue && (
        <span
          className="w-1 h-1 rounded-full bg-foreground shrink-0"
          aria-hidden="true"
        />
      )}
      {formattedDate}
    </span>
  );
}
