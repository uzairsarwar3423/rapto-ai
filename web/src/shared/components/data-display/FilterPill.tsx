"use client";

import React from "react";
import { X } from "lucide-react";

interface FilterPillProps {
  label: string;
  onRemove: () => void;
}

export function FilterPill({ label, onRemove }: FilterPillProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-2xs font-sans text-foreground">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="rounded-full p-0.5 hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors duration-120"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}
