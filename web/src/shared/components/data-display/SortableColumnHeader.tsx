// web/src/shared/components/data-display/SortableColumnHeader.tsx

import React from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableColumnHeaderProps<T> {
  label: string;
  sortKey: keyof T;
  activeSortKey: keyof T;
  direction: "asc" | "desc";
  onSort: (key: keyof T) => void;
  className?: string;
}

export function SortableColumnHeader<T>({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
  className,
}: SortableColumnHeaderProps<T>) {
  const isActive = sortKey === activeSortKey;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "group flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring rounded px-1 -mx-1 py-0.5",
        isActive && "text-foreground",
        className
      )}
    >
      <span>{label}</span>
      <span className="shrink-0 text-muted-foreground/60 transition-opacity duration-150">
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 opacity-40 group-hover:opacity-100" />
        )}
      </span>
    </button>
  );
}
