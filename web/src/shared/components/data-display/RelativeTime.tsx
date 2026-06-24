"use client";

import React, { useState, useEffect } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";

interface RelativeTimeProps {
  date: string | Date;
  className?: string;
}

function formatRelative(date: string | Date): string {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    return formatDistanceToNowStrict(d, { addSuffix: true });
  } catch {
    return "";
  }
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const [label, setLabel] = useState(() => formatRelative(date));

  useEffect(() => {
    // Re-compute every 60 seconds (60,000ms) to avoid CPU re-render churn
    const id = setInterval(() => {
      setLabel(formatRelative(date));
    }, 60_000);

    return () => clearInterval(id);
  }, [date]);

  const parsedDate = new Date(date);
  const isoString = !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : "";
  const localeString = !isNaN(parsedDate.getTime()) ? parsedDate.toLocaleString() : "";

  return (
    <time
      dateTime={isoString}
      title={localeString}
      className={cn("tabular-nums text-muted-foreground", className)}
    >
      {label}
    </time>
  );
}
