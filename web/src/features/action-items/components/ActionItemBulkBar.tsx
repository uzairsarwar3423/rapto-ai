"use client";

import React from "react";
import { BulkActionBar } from "@/shared/components/feedback/BulkActionBar";
import { ActionItemBulkPriorityMenu } from "./ActionItemBulkPriorityMenu";
import { ActionItemBulkAssigneeMenu } from "./ActionItemBulkAssigneeMenu";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionItemPatch } from "../api/action-items.mutations";
import type { PriorityLevel } from "../types";

interface ActionItemBulkBarProps {
  selectedIds: Set<string>;
  onClear: () => void;
  onUpdate: (ids: string[], patch: ActionItemPatch) => void;
}

export function ActionItemBulkBar({ selectedIds, onClear, onUpdate }: ActionItemBulkBarProps) {
  const ids = Array.from(selectedIds);
  const visible = selectedIds.size > 0;

  const handleMarkComplete = () => {
    onUpdate(ids, { completed: true });
  };

  const handleMarkIncomplete = () => {
    onUpdate(ids, { completed: false });
  };

  const handlePrioritySelect = (priority: PriorityLevel) => {
    onUpdate(ids, { priority });
  };

  const handleAssigneeSelect = (assigneeId: string | null) => {
    onUpdate(ids, { assigneeId });
  };

  return (
    <BulkActionBar visible={visible} onDismiss={onClear}>
      <span className="font-heading font-semibold text-[14px] text-zinc-400 select-none px-1 shrink-0 tabular">
        {selectedIds.size} selected
      </span>
      <div className="w-[1px] h-4 bg-zinc-800 self-center mx-1 shrink-0" />

      <Button
        variant="ghost"
        size="sm"
        onClick={handleMarkComplete}
        className="h-7 text-xs text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800 shrink-0"
      >
        <Check className="h-3.5 w-3.5 mr-1 shrink-0" />
        Complete
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleMarkIncomplete}
        className="h-7 text-xs text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800 shrink-0"
      >
        Incomplete
      </Button>

      <div className="relative shrink-0 flex items-center">
        <ActionItemBulkAssigneeMenu onSelect={handleAssigneeSelect} />
      </div>
      <div className="relative shrink-0 flex items-center">
        <ActionItemBulkPriorityMenu onSelect={handlePrioritySelect} />
      </div>

      <div className="w-[1px] h-4 bg-zinc-800 self-center mx-1 shrink-0" />

      <Button
        variant="ghost"
        size="icon"
        onClick={onClear}
        className="h-7 w-7 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded shrink-0 p-0"
        title="Clear selection (Esc)"
      >
        <X className="h-3.5 w-3.5 shrink-0" />
      </Button>
    </BulkActionBar>
  );
}
