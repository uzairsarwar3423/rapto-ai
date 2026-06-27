"use client";

import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

interface IntegrationsGridHeaderProps {
  connectedCount: number;
}

export function IntegrationsGridHeader({ connectedCount }: IntegrationsGridHeaderProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem("vocaply-integrations-cmd-hint-dismissed") === "true");
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key?.toLowerCase() === "k") {
        localStorage.setItem("vocaply-integrations-cmd-hint-dismissed", "true");
        setDismissed(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex items-center justify-between select-none">
      <div className="flex items-center gap-3">
        <h1 className="font-heading font-semibold text-[20px] tracking-[-0.01em] text-foreground leading-[28px]">
          Integrations
        </h1>
        {connectedCount > 0 && (
          <Badge
            variant="outline"
            className="font-poppins font-medium text-[12px] leading-[16px] px-2 py-0.5 bg-muted/40 border-muted/30 text-muted-foreground/80 tabular-nums rounded-md"
          >
            {connectedCount} connected
          </Badge>
        )}
      </div>

      {!dismissed && (
        <span className="text-[11px] font-sans font-normal text-muted-foreground/40 tracking-normal transition-opacity duration-150">
          <kbd className="font-sans">⌘K</kbd> to search integrations
        </span>
      )}
    </div>
  );
}
