import React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommitmentConfidenceDimProps {
  confidenceScore: number;
  children: React.ReactNode;
  className?: string;
}

export function CommitmentConfidenceDim({
  confidenceScore,
  children,
  className,
}: CommitmentConfidenceDimProps) {
  const isLowConfidence = confidenceScore < 0.75;
  const pct = Math.round(confidenceScore * 100);

  return (
    <div
      className={cn(
        "flex-1 min-w-0 flex items-center gap-2",
        isLowConfidence && "text-muted-foreground/90 transition-all duration-160 group-hover:text-foreground",
        className
      )}
    >
      {children}
      {isLowConfidence && (
        <span 
          className="inline-flex items-center gap-1 text-3xs font-mono px-1.5 py-0.5 rounded-sm bg-error/10 text-error border border-error/15 cursor-help select-none animate-pulse"
          title={`Low confidence AI extraction (${pct}% match). Verify details.`}
        >
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>{pct}%</span>
        </span>
      )}
    </div>
  );
}
