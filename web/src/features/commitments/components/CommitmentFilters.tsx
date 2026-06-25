"use client";

import React from "react";
import { useCommitmentFilters } from "../hooks/useCommitmentFilters";
import { useTeamMembers } from "../hooks/useTeamMembers";
import { OwnerFilterPopover } from "./CommitmentFilters/OwnerFilterPopover";
import { DateRangeFilterPopover } from "./CommitmentFilters/DateRangeFilterPopover";
import { ConfidenceFilterSelect } from "./CommitmentFilters/ConfidenceFilterSelect";
import { FilterPill } from "@/shared/components/data-display/FilterPill";

export function CommitmentFilters() {
  const { filters, setFilters, clearAll, activeFilterCount } = useCommitmentFilters();
  const { data: members = [] } = useTeamMembers();

  // Find owner names for active pills
  const getOwnerName = (id: string) => {
    const member = members.find((m) => m.id === id);
    return member ? member.name : id;
  };

  const handleOwnerRemove = (ownerId: string) => {
    setFilters({
      ownerIds: filters.ownerIds.filter((id) => id !== ownerId),
    });
  };

  const handleDateRangeChange = (range: { from?: string; to?: string }) => {
    setFilters({
      from: range.from,
      to: range.to,
    });
  };

  const handleConfidenceChange = (val?: number) => {
    setFilters({
      confidenceMin: val,
    });
  };

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className="flex flex-col gap-3 font-sans">
      <div className="flex flex-wrap items-center gap-2">
        {/* Owner Multi-select filter */}
        <OwnerFilterPopover
          selectedOwnerIds={filters.ownerIds}
          onSelectedOwnerIdsChange={(ids) => setFilters({ ownerIds: ids })}
        />

        {/* Date Range filter */}
        <DateRangeFilterPopover
          from={filters.from}
          to={filters.to}
          onRangeChange={handleDateRangeChange}
        />

        {/* Confidence Filter */}
        <ConfidenceFilterSelect
          value={filters.confidenceMin}
          onValueChange={handleConfidenceChange}
        />
      </div>

      {/* Active Filter Pills row */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2.5">
          <span className="text-2xs text-muted-foreground mr-1">Active filters:</span>

          {/* Owner Pills */}
          {filters.ownerIds.map((id) => (
            <FilterPill
              key={id}
              label={`Owner: ${getOwnerName(id)}`}
              onRemove={() => handleOwnerRemove(id)}
            />
          ))}

          {/* Date Range Pill */}
          {(filters.from || filters.to) && (
            <FilterPill
              label={(() => {
                const formatDate = (dStr: string) => {
                  const dateObj = new Date(dStr);
                  return isNaN(dateObj.getTime())
                    ? ""
                    : dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
                };
                if (filters.from && filters.to) {
                  return `Due: ${formatDate(filters.from)} – ${formatDate(filters.to)}`;
                }
                if (filters.from) {
                  return `Due after: ${formatDate(filters.from)}`;
                }
                if (filters.to) {
                  return `Due before: ${formatDate(filters.to)}`;
                }
                return "";
              })()}
              onRemove={() => handleDateRangeChange({ from: undefined, to: undefined })}
            />
          )}

          {/* Confidence Pill */}
          {filters.confidenceMin !== undefined && (
            <FilterPill
              label={`Confidence ≥ ${(filters.confidenceMin * 100).toFixed(0)}%`}
              onRemove={() => handleConfidenceChange(undefined)}
            />
          )}

          {/* Clear all action */}
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-2xs font-medium text-brand hover:text-brand/90 transition-colors duration-120 cursor-pointer ml-1 select-none"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
