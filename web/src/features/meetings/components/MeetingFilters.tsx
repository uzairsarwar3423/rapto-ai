"use client";

import React, { useState, useEffect } from "react";
import { Search, X, Calendar, Video, RefreshCw } from "lucide-react";
import { useMeetingFilters } from "../hooks/useMeetingFilters";
import { MeetingFiltersPopover } from "./MeetingFiltersPopover";
import { FilterPill } from "@/shared/components/data-display/FilterPill";
import { useDebounce } from "@/hooks/shared/useDebounce";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlatformType, MeetingStatus } from "../types";

export function MeetingFilters() {
  const { filters, setFilters, clearAll } = useMeetingFilters();
  const [searchVal, setSearchVal] = useState(filters.search || "");
  const debouncedSearch = useDebounce(searchVal, 300);

  // Sync internal search value with external filter updates (like clearAll)
  useEffect(() => {
    setSearchVal(filters.search || "");
  }, [filters.search]);

  // Apply search filter when debounced value changes
  useEffect(() => {
    if (debouncedSearch !== (filters.search || "")) {
      setFilters({ search: debouncedSearch || undefined });
    }
  }, [debouncedSearch, filters.search, setFilters]);

  // Check if any filter is active
  const hasActiveFilters =
    !!filters.search ||
    !!filters.platform ||
    !!filters.from ||
    !!filters.to ||
    !!(filters.status && filters.status.length > 0);

  const handleClearField = (key: keyof typeof filters) => {
    setFilters({ [key]: undefined });
  };

  const handleRemoveStatus = (statusToRemove: MeetingStatus) => {
    if (!filters.status) return;
    const next = filters.status.filter((s) => s !== statusToRemove);
    setFilters({ status: next.length > 0 ? next : undefined });
  };

  // Convert ISO string to YYYY-MM-DD for date inputs
  const formatDateForInput = (isoString?: string) => {
    if (!isoString) return "";
    return isoString.split("T")[0];
  };

  const handleDateChange = (type: "from" | "to", dateString: string) => {
    if (!dateString) {
      setFilters({ [type]: undefined });
      return;
    }
    // Set to start of day for 'from' and end of day for 'to'
    const date = new Date(dateString);
    if (type === "from") {
      date.setHours(0, 0, 0, 0);
    } else {
      date.setHours(23, 59, 59, 999);
    }
    setFilters({ [type]: date.toISOString() });
  };

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* Filters Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        {/* Search Input */}
        <div className="relative w-full sm:w-auto sm:flex-1 sm:max-w-xs md:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search meetings by title..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            className="pl-8.5 pr-8 h-9 text-xs border border-border bg-card focus-visible:ring-1 focus-visible:ring-brand w-full"
          />
          {searchVal && (
            <button
              type="button"
              onClick={() => setSearchVal("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Status Popover */}
          <MeetingFiltersPopover
            selectedStatuses={filters.status}
            onChange={(statuses) => setFilters({ status: statuses })}
          />

          {/* Platform Dropdown */}
          <Select
            value={filters.platform || "ALL"}
            onValueChange={(val) =>
              setFilters({ platform: val === "ALL" ? undefined : (val as PlatformType) })
            }
          >
            <SelectTrigger className="text-xs h-9 border border-border bg-card flex-1 sm:flex-none sm:w-[130px] flex items-center justify-between gap-1.5 px-3 cursor-pointer">
              <div className="flex items-center gap-1.5 truncate">
                <Video className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Platform" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-zinc-950 border border-border shadow-lg" position="popper">
              <SelectItem value="ALL">All Platforms</SelectItem>
              <SelectItem value="ZOOM">Zoom</SelectItem>
              <SelectItem value="GOOGLE_MEET">Google Meet</SelectItem>
              <SelectItem value="TEAMS">Teams</SelectItem>
              <SelectItem value="WEBEX">Webex</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Range Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="text-xs flex-1 sm:flex-none flex items-center gap-1.5 h-9 px-3 border border-border bg-card hover:bg-muted/30 cursor-pointer"
              >
                <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">
                  {filters.from || filters.to ? "Date Range Set" : "Date Range"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(calc(100vw-32px),280px)] p-3 bg-white dark:bg-zinc-950 border border-border shadow-lg font-sans">
              <h4 className="font-medium text-xs text-muted-foreground mb-2 pb-1 border-b border-border">
                Filter by Date Range
              </h4>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                    From Date
                  </label>
                  <Input
                    type="date"
                    value={formatDateForInput(filters.from)}
                    onChange={(e) => handleDateChange("from", e.target.value)}
                    className="h-8 text-xs border border-border focus-visible:ring-0"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                    To Date
                  </label>
                  <Input
                    type="date"
                    value={formatDateForInput(filters.to)}
                    onChange={(e) => handleDateChange("to", e.target.value)}
                    className="h-8 text-xs border border-border focus-visible:ring-0"
                  />
                </div>
              </div>
              {(filters.from || filters.to) && (
                <div className="mt-3 pt-2 border-t border-border flex justify-end">
                  <button
                    type="button"
                    onClick={() => setFilters({ from: undefined, to: undefined })}
                    className="text-[10px] text-muted-foreground hover:text-brand font-medium cursor-pointer"
                  >
                    Reset dates
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Clear All button */}
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              onClick={clearAll}
              className="text-xs h-9 px-2.5 text-muted-foreground hover:text-foreground flex items-center gap-1 hover:bg-muted/30 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}
        </div>
      </div>

      {/* Active Filter Pills Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {filters.search && (
            <FilterPill
              label={`Search: "${filters.search}"`}
              onRemove={() => handleClearField("search")}
            />
          )}
          {filters.platform && (
            <FilterPill
              label={`Platform: ${filters.platform}`}
              onRemove={() => handleClearField("platform")}
            />
          )}
          {(filters.from || filters.to) && (
            <FilterPill
              label={`Date: ${formatDateForInput(filters.from) || "..."} to ${formatDateForInput(filters.to) || "..."}`}
              onRemove={() => setFilters({ from: undefined, to: undefined })}
            />
          )}
          {filters.status &&
            filters.status.map((s) => (
              <FilterPill
                key={s}
                label={`Status: ${s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ")}`}
                onRemove={() => handleRemoveStatus(s)}
              />
            ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
