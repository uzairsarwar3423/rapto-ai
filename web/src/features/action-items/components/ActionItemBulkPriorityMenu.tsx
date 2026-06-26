"use client";

import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import type { PriorityLevel } from "../types";

interface ActionItemBulkPriorityMenuProps {
  onSelect: (priority: PriorityLevel) => void;
}

export function ActionItemBulkPriorityMenu({ onSelect }: ActionItemBulkPriorityMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800">
          <AlertCircle className="h-3.5 w-3.5 mr-1 shrink-0" />
          Priority
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-36 p-1 bg-zinc-950 border border-zinc-800 text-zinc-50 rounded-md shadow-md z-50">
        <div className="flex flex-col gap-0.5">
          {(["LOW", "MEDIUM", "HIGH", "URGENT"] as PriorityLevel[]).map((priority) => (
            <button
              key={priority}
              type="button"
              onClick={() => {
                onSelect(priority);
                setOpen(false);
              }}
              className="text-left text-xs px-2.5 py-1.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-zinc-50 transition-colors"
            >
              {priority.charAt(0) + priority.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
