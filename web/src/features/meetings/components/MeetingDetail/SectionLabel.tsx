import React from "react";
import { cn } from "@/lib/utils";

/**
 * Quiet section label used across the meeting Overview: a small line icon, an uppercase
 * label and an optional count. Rendered as a real <h2> so the page outline stays accessible.
 */
export function SectionLabel({
  icon: Icon,
  children,
  count,
  action,
  className,
  id,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  count?: number;
  /** Optional control aligned to the end (e.g. "Expand all"). */
  action?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center gap-2 text-muted-foreground", className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <h2
        id={id}
        className="mtg-label text-[11px] font-medium uppercase leading-none tracking-[0.09em]"
      >
        {children}
      </h2>
      {count !== undefined && count > 0 && (
        <span className="text-[11px] font-normal tabular-nums leading-none text-muted-foreground/60">
          {count}
        </span>
      )}
      {action && <div className="ms-auto">{action}</div>}
    </div>
  );
}
