"use client";

import React, { useRef, useState, useEffect } from "react";
import { ActionItemListHeader } from "./ActionItemListHeader";
import { ActionItemRow } from "../ActionItemRow";
import { VirtualList } from "@/shared/components/data-display/VirtualList";
import { cn } from "@/lib/utils";
import type { UseSelectionReturn } from "@/shared/hooks/useSelection";
import type { ActionItem } from "../../types";

interface ActionItemListProps {
  items: ActionItem[];
  isFetching: boolean;
  selection: UseSelectionReturn<string>;
  onToggleComplete: (id: string, completed: boolean) => void;
}

export function ActionItemList({
  items,
  isFetching,
  selection,
  onToggleComplete,
}: ActionItemListProps) {
  const lastSelectedIdxRef = useRef<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleSelectToggle = (e: React.MouseEvent<any> | React.KeyboardEvent<any>, id: string, index: number) => {
    if (e.shiftKey && lastSelectedIdxRef.current !== null) {
      const start = Math.min(lastSelectedIdxRef.current, index);
      const end = Math.max(lastSelectedIdxRef.current, index);
      const rangeIds = items.slice(start, end + 1).map((item) => item.id);
      selection.toggleRange(rangeIds);
    } else {
      selection.toggle(id);
    }
    lastSelectedIdxRef.current = index;
  };

  const handleToggleAll = () => {
    const visibleIds = items.map((item) => item.id);
    selection.toggleAll(visibleIds);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "a") {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      const visibleIds = items.map((item) => item.id);
      if (selection.selectionState !== "all") {
        selection.toggleAll(visibleIds);
      }
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-border/60 rounded-lg text-center bg-card">
        <h3 className="text-sm font-semibold text-foreground mb-1">No action items</h3>
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
          No action items found matching your filters. Complete commitments or generate them from meeting transcripts.
        </p>
      </div>
    );
  }

  return (
    <div
      onKeyDown={handleKeyDown}
      className="flex flex-col w-full border border-border/40 rounded-lg overflow-hidden bg-background h-[calc(100vh-230px)] min-h-[420px]"
    >
      <ActionItemListHeader
        selectionState={selection.selectionState}
        onToggleAll={handleToggleAll}
      />
      
      <div
        className={cn(
          "flex-1 relative transition-opacity duration-140",
          isFetching ? "opacity-70 cursor-wait pointer-events-none" : "opacity-100"
        )}
      >
        <VirtualList<ActionItem>
          items={items}
          estimateSize={() => (isMobile ? 66 : 38)}
          getItemKey={(item) => item.id}
          className="h-full w-full"
          renderItem={(item, index) => (
            <ActionItemRow
              item={item}
              selected={selection.isSelected(item.id)}
              onSelectToggle={(e) => handleSelectToggle(e, item.id, index)}
              onToggleComplete={onToggleComplete}
              showMeetingTitle
            />
          )}
        />
      </div>
    </div>
  );
}
