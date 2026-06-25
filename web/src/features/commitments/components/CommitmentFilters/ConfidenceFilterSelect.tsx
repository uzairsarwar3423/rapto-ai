"use client";

import React from "react";
import { SlidersHorizontal } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ConfidenceFilterSelectProps {
  value?: number;
  onValueChange: (val?: number) => void;
}

export function ConfidenceFilterSelect({
  value,
  onValueChange,
}: ConfidenceFilterSelectProps) {
  const displayValue = value !== undefined ? `≥ ${(value * 100).toFixed(0)}%` : "Confidence";
  const isSelected = value !== undefined;

  const handleValueChange = (val: string) => {
    if (val === "ALL") {
      onValueChange(undefined);
    } else {
      onValueChange(parseFloat(val));
    }
  };

  return (
    <Select
      value={value !== undefined ? String(value) : "ALL"}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          "flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium font-sans transition-all duration-120 cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-ring border-input bg-transparent py-0 pr-2 pl-2.5",
          isSelected
            ? "border-brand/35 bg-brand/5 text-brand hover:bg-brand/10 [&_svg]:text-brand"
            : "border-border bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        )}
      >
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 opacity-65 text-muted-foreground" />
          <span>{displayValue}</span>
        </div>
      </SelectTrigger>
      <SelectContent align="start" position="popper" className="bg-white dark:bg-zinc-950 border border-border shadow-md rounded-lg font-sans">
        <SelectItem value="ALL" className="text-xs cursor-pointer">All confidence levels</SelectItem>
        <SelectItem value="0.9" className="text-xs cursor-pointer">High (≥ 90%)</SelectItem>
        <SelectItem value="0.7" className="text-xs cursor-pointer">Medium (≥ 70%)</SelectItem>
        <SelectItem value="0.5" className="text-xs cursor-pointer">Low (≥ 50%)</SelectItem>
      </SelectContent>
    </Select>
  );
}
