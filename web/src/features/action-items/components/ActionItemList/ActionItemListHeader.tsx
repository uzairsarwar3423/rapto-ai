"use client";

import React from "react";
import { DataTableSelectAllCheckbox } from "@/shared/components/data-display/DataTable/DataTableSelectAllCheckbox";

interface ActionItemListHeaderProps {
  selectionState: "none" | "some" | "all";
  onToggleAll: () => void;
}

export function ActionItemListHeader({ selectionState, onToggleAll }: ActionItemListHeaderProps) {
  return (
    <div className="flex md:grid md:grid-cols-[36px_1fr_120px_100px_100px_40px] lg:grid-cols-[36px_1fr_140px_120px_100px_40px] h-9 border-b border-border/40 bg-muted/20 text-[12px] font-medium text-muted-foreground items-center select-none px-2 md:px-0">
      <div className="flex justify-center items-center h-full w-[36px] md:w-auto shrink-0">
        <DataTableSelectAllCheckbox state={selectionState} onClick={onToggleAll} />
      </div>
      <span className="font-medium pl-1 flex-1 md:flex-none">Title</span>
      <span className="font-medium hidden md:block">Assignee</span>
      <span className="font-medium hidden md:block">Priority</span>
      <span className="font-medium text-right tabular pr-4 hidden md:block">Due</span>
      <span className="hidden md:block w-[40px] md:w-auto" />
    </div>
  );
}
