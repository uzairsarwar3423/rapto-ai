"use client";

import React, { useState, useEffect } from "react";
import { Calendar as CalendarIcon, ChevronDown, X, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

interface DateRangeFilterPopoverProps {
  from?: string;
  to?: string;
  onRangeChange: (range: { from?: string; to?: string }) => void;
}

const toDateString = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getPresetRange = (preset: "today" | "thisWeek" | "next7Days" | "last30Days"): DateRange => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let fromDate = new Date(today);
  let toDate = new Date(today);

  switch (preset) {
    case "today":
      break;
    case "thisWeek":
      const day = today.getDay();
      fromDate.setDate(today.getDate() - day);
      toDate.setDate(today.getDate() + (6 - day));
      break;
    case "next7Days":
      toDate.setDate(today.getDate() + 7);
      break;
    case "last30Days":
      fromDate.setDate(today.getDate() - 30);
      break;
  }

  return { from: fromDate, to: toDate };
};

const getDaysCount = (from?: Date, to?: Date) => {
  if (!from || !to) return 0;
  const diffTime = Math.abs(to.getTime() - from.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

export function DateRangeFilterPopover({
  from,
  to,
  onRangeChange,
}: DateRangeFilterPopoverProps) {
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const [previewDate, setPreviewDate] = useState<DateRange | undefined>(undefined);
  const [isOpen, setIsOpen] = useState(false);

  // Sync state if props change externally
  useEffect(() => {
    setDate({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }, [from, to]);

  const handleApply = () => {
    onRangeChange({
      from: date?.from ? toDateString(date.from) : undefined,
      to: date?.to ? toDateString(date.to) : undefined,
    });
    setIsOpen(false);
  };

  const handleClear = () => {
    setDate(undefined);
    setPreviewDate(undefined);
    onRangeChange({ from: undefined, to: undefined });
    setIsOpen(false);
  };

  const handlePresetClick = (preset: "today" | "thisWeek" | "next7Days" | "last30Days") => {
    const range = getPresetRange(preset);
    setDate(range);
    setPreviewDate(undefined);
  };

  // Helper to format date label for the trigger button
  const getLabel = () => {
    if (!from && !to) return "Date";

    const formatDate = (dateStr: string) => {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    };

    if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
    if (from) return `After ${formatDate(from)}`;
    if (to) return `Before ${formatDate(to)}`;
    return "Date";
  };

  const isSelected = !!from || !!to;

  // Active or Preview display date values
  const currentRange = previewDate || date;
  const daysCount = getDaysCount(currentRange?.from, currentRange?.to);

  // Checks if selected dates match a preset
  const isPresetActive = (preset: "today" | "thisWeek" | "next7Days" | "last30Days") => {
    if (!date?.from || !date?.to) return false;
    const presetRange = getPresetRange(preset);
    if (!presetRange.from || !presetRange.to) return false;
    return (
      toDateString(date.from) === toDateString(presetRange.from) &&
      toDateString(date.to) === toDateString(presetRange.to)
    );
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium font-sans transition-all duration-120 cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-ring",
            isSelected
              ? "border-brand/35 bg-brand/5 text-brand hover:bg-brand/10 [&_svg]:text-brand"
              : "border-border bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          )}
        >
          <CalendarIcon className="mr-1 h-3.5 w-3.5 opacity-65 text-muted-foreground transition-transform group-hover:scale-105" />
          <span>{getLabel()}</span>
          {isSelected && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="ml-1 rounded-full p-0.5 hover:bg-brand/10 text-brand transition-colors duration-100"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          {!isSelected && <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 bg-white dark:bg-zinc-950 border border-border shadow-lg rounded-lg font-sans flex flex-col md:flex-row overflow-hidden animate-in fade-in-0 slide-in-from-top-1.5 duration-150">
        {/* Presets side menu with hover intentions */}
        <div className="flex flex-row md:flex-col gap-0.5 border-b md:border-b-0 md:border-r border-border p-1.5 bg-zinc-50 dark:bg-zinc-900/50 min-w-36 shrink-0 select-none">
          <span className="hidden md:block text-3xs font-semibold uppercase tracking-wider text-muted-foreground/80 px-2 py-1.5 font-sans">
            Quick Ranges
          </span>
          {(["today", "thisWeek", "next7Days", "last30Days"] as const).map((preset) => {
            const isActive = isPresetActive(preset);
            const label = preset === "today" ? "Today" 
                        : preset === "thisWeek" ? "This Week" 
                        : preset === "next7Days" ? "Next 7 Days" 
                        : "Last 30 Days";
            return (
              <button
                key={preset}
                type="button"
                onMouseEnter={() => setPreviewDate(getPresetRange(preset))}
                onMouseLeave={() => setPreviewDate(undefined)}
                onClick={() => handlePresetClick(preset)}
                className={cn(
                  "text-left px-2 py-1.5 rounded-md text-2xs font-medium cursor-pointer transition-all duration-120 flex items-center justify-between",
                  isActive
                    ? "bg-brand/10 text-brand font-semibold"
                    : "text-foreground hover:bg-surface-hover/80 hover:text-foreground"
                )}
              >
                <span>{label}</span>
                {isActive && <div className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />}
              </button>
            );
          })}
        </div>

        {/* Calendar Picker Panel */}
        <div className="flex flex-col p-3.5">
          {/* Status micro-copy header */}
          <div className="flex items-center gap-1.5 h-6 mb-2 px-1 text-2xs font-sans text-muted-foreground select-none">
            <Info className="h-3.5 w-3.5 opacity-70 shrink-0" />
            {previewDate ? (
              <span className="text-brand font-medium animate-pulse">
                Preview: {previewDate.from?.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {previewDate.to?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            ) : date?.from && !date.to ? (
              <span className="text-amber-500 font-medium">Select end date...</span>
            ) : date?.from && date.to ? (
              <span className="text-foreground font-medium flex items-center">
                Selected: {date.from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {date.to.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            ) : (
              <span>Select a range on the calendar</span>
            )}
            {daysCount > 0 && (
              <span className="ml-auto px-1.5 py-0.5 rounded-full bg-brand/8 text-3xs font-mono font-bold text-brand animate-in zoom-in-95 duration-100">
                {daysCount} {daysCount === 1 ? "day" : "days"}
              </span>
            )}
          </div>

          <Calendar
            mode="range"
            defaultMonth={date?.from}
            selected={currentRange}
            onSelect={setDate}
            numberOfMonths={1}
            className="rounded-md border border-border/40 p-1.5 bg-card/50"
          />

          <div className="flex items-center justify-between border-t border-border pt-3 mt-3 font-sans">
            <button
              type="button"
              onClick={handleClear}
              className="text-2xs font-medium text-muted-foreground/80 hover:text-foreground cursor-pointer transition-colors duration-100"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded bg-brand px-3 py-1 text-2xs font-semibold text-white hover:bg-brand/90 hover:scale-[1.02] active:scale-[0.98] transition-all duration-120 cursor-pointer shadow-xs"
            >
              Apply Range
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
