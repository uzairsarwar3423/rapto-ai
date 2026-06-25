import React from "react";
import { cn } from "@/lib/utils";

interface RowEmptyStateProps {
  title: string;
  subtitle?: string;
  className?: string;
}

export function RowEmptyState({ title, subtitle, className }: RowEmptyStateProps) {
  return (
    <div 
      className={cn(
        "flex flex-col items-center justify-center py-8 px-4 text-center border border-dashed border-border/60 rounded-lg animate-in fade-in-0 duration-150",
        className
      )}
    >
      <h3 className="font-heading text-sm font-medium text-foreground">{title}</h3>
      {subtitle && (
        <p className="font-sans text-xs text-muted-foreground mt-1 max-w-sm">
          {subtitle}
        </p>
      )}
    </div>
  );
}
