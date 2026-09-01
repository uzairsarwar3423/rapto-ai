"use client";

import React from "react";
import { DataTableSelectAllCheckbox } from "@/shared/components/data-display/DataTable/DataTableSelectAllCheckbox";

interface ActionItemListHeaderProps {
  selectionState: "none" | "some" | "all";
  onToggleAll: () => void;
}

export function ActionItemListHeader({ selectionState, onToggleAll }: ActionItemListHeaderProps) {
  return (
    <div className="hidden md:grid md:grid-cols-[36px_1fr_130px_100px_100px_40px] h-9 border-b border-border/40 bg-muted/20 text-[11px] font-bold uppercase tracking-wider text-muted-foreground select-none items-center">
      <div className="flex justify-center items-center h-full w-[36px] shrink-0">
        <DataTableSelectAllCheckbox state={selectionState} onClick={onToggleAll} />
      </div>
      <span className="font-semibold pl-1">Title</span>
      <span className="font-semibold">Assignee</span>
      <span className="font-semibold">Priority</span>
      <span className="font-semibold text-right tabular pr-4">Due</span>
      <span className="w-[40px] shrink-0" />
    </div>
  );
}
