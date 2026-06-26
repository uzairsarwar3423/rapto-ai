"use client";

import React, { useState, useEffect } from "react";
import { Search, X, RefreshCw, AlertCircle, ShieldAlert, Check } from "lucide-react";
import { useDebounce } from "@/hooks/shared/useDebounce";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTeamMembers } from "@/features/commitments/hooks/useTeamMembers";
import { FilterPill } from "@/shared/components/data-display/FilterPill";
import type { FetchActionItemsFilters } from "../api/action-items.queries";

interface ActionItemFiltersProps {
  filters: FetchActionItemsFilters;
  onFiltersChange: (filters: FetchActionItemsFilters) => void;
  onClearAll: () => void;
}

export function ActionItemFilters({ filters, onFiltersChange, onClearAll }: ActionItemFiltersProps) {
  const [searchVal, setSearchVal] = useState(filters.search || "");
  const debouncedSearch = useDebounce(searchVal, 300);
  const { data: teamMembers = [] } = useTeamMembers();

  useEffect(() => {
    setSearchVal(filters.search || "");
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch !== (filters.search || "")) {
      onFiltersChange({ ...filters, search: debouncedSearch || undefined });
    }
  }, [debouncedSearch]);

  const handlePriorityToggle = (priority: string) => {
    const current = filters.priority || [];
    const next = current.includes(priority)
      ? current.filter((p) => p !== priority)
      : [...current, priority];
    onFiltersChange({ ...filters, priority: next.length > 0 ? next : undefined });
  };

  const hasActiveFilters =
    !!filters.search ||
    filters.completed !== undefined ||
    (filters.priority && filters.priority.length > 0) ||
    !!filters.assigneeId ||
    filters.hasJiraTicket !== undefined;

  return (
    <div className="flex flex-col gap-3 font-sans w-full bg-background mb-4">
      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search action items..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            className="pl-8.5 pr-8 h-9 text-xs border border-border bg-card focus-visible:ring-0 focus-visible:border-brand"
          />
          {searchVal && (
            <button
              type="button"
              onClick={() => setSearchVal("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Completed status dropdown */}
        <Select
          value={
            filters.completed === true ? "COMPLETED" : filters.completed === false ? "INCOMPLETE" : "ALL"
          }
          onValueChange={(val) => {
            onFiltersChange({
              ...filters,
              completed: val === "COMPLETED" ? true : val === "INCOMPLETE" ? false : undefined,
            });
          }}
        >
          <SelectTrigger className="text-xs h-9 border border-border bg-card w-[130px] flex items-center gap-1.5 px-3">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-background border border-border shadow-lg" position="popper">
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="INCOMPLETE">Incomplete</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
          </SelectContent>
        </Select>

        {/* Priority popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="text-xs flex items-center gap-1.5 h-9 px-3 border border-border bg-card hover:bg-muted/30"
            >
              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <span>
                {filters.priority && filters.priority.length > 0
                  ? `Priorities (${filters.priority.length})`
                  : "Priority"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 p-2 bg-background border border-border shadow-lg">
            <h4 className="font-semibold text-2xs uppercase tracking-wider text-muted-foreground mb-1.5 px-2">
              Filter by Priority
            </h4>
            <div className="flex flex-col gap-0.5">
              {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => {
                const checked = filters.priority?.includes(p) || false;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePriorityToggle(p)}
                    className="flex items-center justify-between w-full text-left text-xs px-2.5 py-1.5 rounded-md hover:bg-accent/40 text-foreground transition-colors"
                  >
                    <span>{p.charAt(0) + p.slice(1).toLowerCase()}</span>
                    {checked && <Check className="h-3.5 w-3.5 text-brand shrink-0" />}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Assignee select */}
        <Select
          value={filters.assigneeId || "ALL"}
          onValueChange={(val) => {
            onFiltersChange({
              ...filters,
              assigneeId: val === "ALL" ? undefined : val,
            });
          }}
        >
          <SelectTrigger className="text-xs h-9 border border-border bg-card w-[150px] flex items-center gap-1.5 px-3">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent className="bg-background border border-border shadow-lg" position="popper">
            <SelectItem value="ALL">All Assignees</SelectItem>
            {teamMembers.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Jira integration dropdown */}
        <Select
          value={
            filters.hasJiraTicket === true ? "SYNCED" : filters.hasJiraTicket === false ? "UNSYNCED" : "ALL"
          }
          onValueChange={(val) => {
            onFiltersChange({
              ...filters,
              hasJiraTicket: val === "SYNCED" ? true : val === "UNSYNCED" ? false : undefined,
            });
          }}
        >
          <SelectTrigger className="text-xs h-9 border border-border bg-card w-[140px] flex items-center gap-1.5 px-3">
            <SelectValue placeholder="Jira Integration" />
          </SelectTrigger>
          <SelectContent className="bg-background border border-border shadow-lg" position="popper">
            <SelectItem value="ALL">All Jira Tickets</SelectItem>
            <SelectItem value="SYNCED">Synced with Jira</SelectItem>
            <SelectItem value="UNSYNCED">Not Synced</SelectItem>
          </SelectContent>
        </Select>

        {/* Reset */}
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            onClick={onClearAll}
            className="text-xs h-9 px-3 text-muted-foreground hover:text-foreground flex items-center gap-1 hover:bg-muted/30"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Active Filter Pills */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {filters.search && (
            <FilterPill
              label={`Search: "${filters.search}"`}
              onRemove={() => onFiltersChange({ ...filters, search: undefined })}
            />
          )}
          {filters.completed !== undefined && (
            <FilterPill
              label={`Status: ${filters.completed ? "Completed" : "Incomplete"}`}
              onRemove={() => onFiltersChange({ ...filters, completed: undefined })}
            />
          )}
          {filters.priority && filters.priority.length > 0 && (
            <FilterPill
              label={`Priority: ${filters.priority.map((p) => p.toLowerCase()).join(", ")}`}
              onRemove={() => onFiltersChange({ ...filters, priority: undefined })}
            />
          )}
          {filters.assigneeId && (
            <FilterPill
              label={`Assignee: ${teamMembers.find((m) => m.id === filters.assigneeId)?.name || "Selected"}`}
              onRemove={() => onFiltersChange({ ...filters, assigneeId: undefined })}
            />
          )}
          {filters.hasJiraTicket !== undefined && (
            <FilterPill
              label={`Jira: ${filters.hasJiraTicket ? "Synced" : "Not Synced"}`}
              onRemove={() => onFiltersChange({ ...filters, hasJiraTicket: undefined })}
            />
          )}
        </div>
      )}
    </div>
  );
}
