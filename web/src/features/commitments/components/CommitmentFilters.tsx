"use client";

import React from "react";
import { useCommitmentFilters } from "../hooks/useCommitmentFilters";
import { useTeamMembers } from "../hooks/useTeamMembers";
import { OwnerFilterPopover } from "./CommitmentFilters/OwnerFilterPopover";
import { DateRangeFilterPopover } from "./CommitmentFilters/DateRangeFilterPopover";
import { ConfidenceFilterSelect } from "./CommitmentFilters/ConfidenceFilterSelect";
import { FilterPill } from "@/shared/components/data-display/FilterPill";

interface CommitmentFiltersProps {
  /** Called when user clicks "Clear all" — parent also needs to reset local status */
  onClearAll?: () => void;
}

export function CommitmentFilters({ onClearAll }: CommitmentFiltersProps) {
  const { urlFilters, setUrlFilters, clearUrlFilters, activeFilterCount } =
    useCommitmentFilters();
  const { data: members = [] } = useTeamMembers();

  const getOwnerName = (id: string) => {
    const member = members.find((m) => m.id === id);
    return member ? member.name : id;
  };

  const handleOwnerRemove = (ownerId: string) => {
    setUrlFilters({
      ownerIds: urlFilters.ownerIds.filter((id) => id !== ownerId),
    });
  };

  const handleDateRangeChange = (range: { from?: string; to?: string }) => {
    setUrlFilters({ from: range.from, to: range.to });
  };

  const handleConfidenceChange = (val?: number) => {
    setUrlFilters({ confidenceMin: val });
  };

  const handleClearAll = () => {
    clearUrlFilters();
    onClearAll?.();
  };

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className="flex flex-col gap-3 font-sans">
      <div className="flex flex-wrap items-center gap-2">
        {/* Owner Multi-select filter */}
        <OwnerFilterPopover
          selectedOwnerIds={urlFilters.ownerIds}
          onSelectedOwnerIdsChange={(ids) => setUrlFilters({ ownerIds: ids })}
        />

        {/* Date Range filter */}
        <DateRangeFilterPopover
          from={urlFilters.from}
          to={urlFilters.to}
          onRangeChange={handleDateRangeChange}
        />

        {/* Confidence Filter */}
        <ConfidenceFilterSelect
          value={urlFilters.confidenceMin}
          onValueChange={handleConfidenceChange}
        />
      </div>

      {/* Active Filter Pills row */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2.5">
          <span className="text-2xs text-muted-foreground mr-1">Active filters:</span>

          {/* Owner Pills */}
          {urlFilters.ownerIds.map((id) => (
            <FilterPill
              key={id}
              label={`Owner: ${getOwnerName(id)}`}
              onRemove={() => handleOwnerRemove(id)}
            />
          ))}

          {/* Date Range Pill */}
          {(urlFilters.from || urlFilters.to) && (
            <FilterPill
              label={(() => {
                const formatDate = (dStr: string) => {
                  const dateObj = new Date(dStr);
                  return isNaN(dateObj.getTime())
                    ? ""
                    : dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
                };
                if (urlFilters.from && urlFilters.to) {
                  return `Due: ${formatDate(urlFilters.from)} – ${formatDate(urlFilters.to)}`;
                }
                if (urlFilters.from) return `Due after: ${formatDate(urlFilters.from)}`;
                if (urlFilters.to) return `Due before: ${formatDate(urlFilters.to)}`;
                return "";
              })()}
              onRemove={() => handleDateRangeChange({ from: undefined, to: undefined })}
            />
          )}

          {/* Confidence Pill */}
          {urlFilters.confidenceMin !== undefined && (
            <FilterPill
              label={`Confidence ≥ ${(urlFilters.confidenceMin * 100).toFixed(0)}%`}
              onRemove={() => handleConfidenceChange(undefined)}
            />
          )}

          {/* Clear all */}
          <button
            type="button"
            onClick={handleClearAll}
            className="inline-flex items-center gap-1 text-2xs font-medium text-brand hover:text-brand/90 transition-colors duration-120 cursor-pointer ml-1 select-none"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
