"use client";

import React from "react";
import { DataTableSelectAllCheckbox } from "@/shared/components/data-display/DataTable/DataTableSelectAllCheckbox";

interface ActionItemListHeaderProps {
  selectionState: "none" | "some" | "all";
  onToggleAll: () => void;
}

export function ActionItemListHeader({ selectionState, onToggleAll }: ActionItemListHeaderProps) {
  return (
    <div className="grid grid-cols-[36px_1fr_140px_120px_100px_40px] h-9 border-b border-border/40 bg-muted/20 text-[12px] font-medium text-muted-foreground items-center select-none">
      <div className="flex justify-center items-center h-full">
        <DataTableSelectAllCheckbox state={selectionState} onClick={onToggleAll} />
      </div>
      <span className="font-medium pl-1">Title</span>
      <span className="font-medium">Assignee</span>
      <span className="font-medium">Priority</span>
      <span className="font-medium text-right tabular pr-4">Due</span>
      <span />
    </div>
  );
}
