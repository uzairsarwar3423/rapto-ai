"use client";

import React from "react";
import { Filter } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { MeetingStatus } from "../types";

const STATUS_OPTIONS: { label: string; value: MeetingStatus }[] = [
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Joining", value: "BOT_JOINING" },
  { label: "Recording", value: "RECORDING" },
  { label: "Processing", value: "PROCESSING" },
  { label: "Done", value: "DONE" },
  { label: "Failed", value: "FAILED" },
  { label: "Cancelled", value: "CANCELLED" },
];

interface MeetingFiltersPopoverProps {
  selectedStatuses: MeetingStatus[] | undefined;
  onChange: (statuses: MeetingStatus[] | undefined) => void;
}

export function MeetingFiltersPopover({
  selectedStatuses = [],
  onChange,
}: MeetingFiltersPopoverProps) {
  const activeCount = selectedStatuses.length;

  const handleToggleStatus = (status: MeetingStatus, checked: boolean) => {
    let next: MeetingStatus[];
    if (checked) {
      next = [...selectedStatuses, status];
    } else {
      next = selectedStatuses.filter((s) => s !== status);
    }
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="text-xs flex items-center gap-1.5 h-9 px-3 border border-border bg-card font-sans hover:bg-muted/30"
        >
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Status</span>
          {activeCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[9px] font-semibold text-white">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3 bg-white dark:bg-zinc-950 border border-border shadow-lg font-sans">
        <h4 className="font-medium text-xs text-muted-foreground mb-2 pb-1 border-b border-border">
          Filter by Status
        </h4>
        <div className="flex flex-col gap-2">
          {STATUS_OPTIONS.map((option) => {
            const isChecked = selectedStatuses.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none py-0.5 hover:text-foreground/80"
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) =>
                    handleToggleStatus(option.value, !!checked)
                  }
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
        {activeCount > 0 && (
          <div className="mt-3 pt-2 border-t border-border flex justify-end">
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="text-[10px] text-muted-foreground hover:text-brand font-medium"
            >
              Clear status filters
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
