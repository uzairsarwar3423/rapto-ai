"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncStatusBadgeProps {
  status: "synced" | "pending" | "failed" | null;
  url?: string | null;
  className?: string;
}

export function SyncStatusBadge({ status, url, className }: SyncStatusBadgeProps) {
  if (!status) return null;

  const content = (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-sans font-medium transition-all select-none border",
        status === "synced" && "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
        status === "pending" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 animate-pulse",
        status === "failed" && "bg-destructive/10 text-destructive border-destructive/20",
        className
      )}
    >
      <span>Jira</span>
      {status === "synced" && url && <ExternalLink className="size-2.5 shrink-0" />}
    </div>
  );

  if (url && status === "synced") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:opacity-80 transition-opacity focus:outline-none"
        onClick={(e) => e.stopPropagation()} // Prevent row click navigation
      >
        {content}
      </a>
    );
  }

  return content;
}
