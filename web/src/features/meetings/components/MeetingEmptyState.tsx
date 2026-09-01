"use client";

import React from "react";
import { Calendar, RefreshCw, Sparkles, FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddMeetingButton } from "./AddMeetingButton";

interface MeetingEmptyStateProps {
  isFiltered: boolean;
  onClearFilters?: () => void;
  onAddMeeting?: () => void;
  onConnectCalendar?: () => void;
}

export function MeetingEmptyState({
  isFiltered,
  onClearFilters,
  onAddMeeting,
  onConnectCalendar,
}: MeetingEmptyStateProps) {
  if (isFiltered) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 sm:p-12 text-center bg-muted/5 font-sans">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted border border-border">
          <FilterX className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="mt-3.5 text-sm font-semibold text-foreground">No meetings found</h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
          No meetings match the active status, platform, or search filters. Try clearing some filters or searching for something else.
        </p>
        <div className="mt-5">
          <Button
            type="button"
            variant="outline"
            onClick={onClearFilters}
            className="text-xs flex items-center gap-1.5 h-8.5 cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            Reset all filters
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 sm:p-14 md:p-16 text-center bg-muted/5 font-sans">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/5 dark:bg-brand/10 border border-brand/20 shadow-xs">
        <Calendar className="h-6 w-6 text-brand" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground font-heading">Connect your first meeting</h3>
      <p className="mt-1.5 text-xs text-muted-foreground max-w-md">
        Rapto extracts action items, commitments, and decisions automatically. To get started, sync your calendar or add a meeting manually.
      </p>
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3 w-full sm:w-auto">
        {onConnectCalendar && (
          <Button
            type="button"
            onClick={onConnectCalendar}
            className="text-xs bg-brand hover:bg-brand/90 text-white flex items-center justify-center gap-1.5 h-9 w-full sm:w-auto px-4 cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Connect Google / Outlook
          </Button>
        )}
        {onAddMeeting && (
          <AddMeetingButton
            id="meetings-empty-add-btn"
            onClick={onAddMeeting}
            label="Add meeting manually"
            className="w-full sm:w-auto justify-center"
          />
        )}
      </div>
    </div>
  );
}
