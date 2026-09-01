"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMeetingFilters } from "../../hooks/useMeetingFilters";
import { useMeetings } from "../../hooks/useMeetings";
import { useFocusListNavigation } from "@/hooks/shared/useFocusListNavigation";
import { MeetingFilters } from "../MeetingFilters";
import { MeetingListHeader } from "./MeetingListHeader";
import { MeetingListRow } from "./MeetingListRow";
import { MeetingListSkeleton } from "./MeetingListSkeleton";
import { MeetingEmptyState } from "../MeetingEmptyState";
import { CursorPagination } from "@/shared/components/data-display/CursorPagination";
import { AddMeetingModal } from "../AddMeetingModal";
import { useRealtimeMeeting } from "../../hooks/useRealtimeMeeting";
import { Button } from "@/components/ui/button";
import { AddMeetingButton } from "../AddMeetingButton";
import { AddMeetingTooltip } from "../AddMeetingTooltip";
import type { MeetingListItem } from "../../types";

interface MeetingListProps {
  initialData?: MeetingListItem[];
}

export function MeetingList({ initialData }: MeetingListProps) {
  const router = useRouter();
  const { filters, clearAll } = useMeetingFilters();
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Subscribe to realtime meeting lifecycle updates
  useRealtimeMeeting();

  // Fetch paginated infinite meetings
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useMeetings(filters, { initialData });

  const flatMeetings = data?.pages.flatMap((page) => page.meetings) ?? [];

  // Unified keyboard & mouse list navigation
  const { activeIndex, setActiveIndex, containerRef } = useFocusListNavigation<MeetingListItem>({
    items: flatMeetings,
    onOpen: (meeting) => router.push(`/meetings/${meeting.id}`),
  });

  const hasActiveFilters =
    !!filters.search ||
    !!filters.platform ||
    !!filters.from ||
    !!filters.to ||
    !!(filters.status && filters.status.length > 0);

  const recordingCount = flatMeetings.filter((m) => m.status === "RECORDING").length;
  const processingCount = flatMeetings.filter((m) => m.status === "PROCESSING" || m.status === "BOT_JOINING").length;

  return (
    <div className="space-y-5 sm:space-y-6 max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 font-sans">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4 border-b border-border pb-4 sm:pb-5">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-heading">
              Meetings
            </h1>
            {flatMeetings.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium font-mono text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/50">
                  {flatMeetings.length} total
                </span>
                {recordingCount > 0 && (
                  <span className="text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20 animate-pulse flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-600 dark:bg-red-400" />
                    {recordingCount} live
                  </span>
                )}
                {processingCount > 0 && (
                  <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-spin" />
                    {processingCount} processing
                  </span>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Analyze, track, and retrieve intelligence from your calendar events, recordings, and team calls.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <AddMeetingTooltip>
            <AddMeetingButton
              id="meetings-page-add-btn"
              onClick={() => setAddModalOpen(true)}
            />
          </AddMeetingTooltip>
        </div>
      </div>

      {/* Filter panel */}
      <div className="bg-card border border-border rounded-xl p-3.5 sm:p-4 shadow-xs">
        <MeetingFilters />
      </div>

      {/* List content */}
      {isLoading && flatMeetings.length === 0 ? (
        <MeetingListSkeleton />
      ) : flatMeetings.length === 0 ? (
        <MeetingEmptyState
          isFiltered={hasActiveFilters}
          onClearFilters={clearAll}
          onAddMeeting={() => setAddModalOpen(true)}
          onConnectCalendar={() => router.push("/integrations")}
        />
      ) : (
        <div className="border border-border rounded-xl bg-card overflow-hidden shadow-xs">
          <MeetingListHeader />
          <div
            ref={containerRef as React.RefObject<HTMLDivElement>}
            className="divide-y divide-border/70"
          >
            {flatMeetings.map((meeting, index) => (
              <MeetingListRow
                key={meeting.id}
                meeting={meeting}
                index={index}
                isActive={activeIndex === index}
                onHover={() => setActiveIndex(index)}
                onLeave={() => setActiveIndex(-1)}
              />
            ))}
          </div>

          <CursorPagination
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={fetchNextPage}
          />
        </div>
      )}

      {/* Keyboard Shortcut Hint (Desktop only) */}
      {flatMeetings.length > 0 && (
        <div className="hidden lg:flex items-center justify-between text-[11px] text-muted-foreground/60 px-1 select-none font-mono">
          <span>Navigate with <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border/80 text-[10px]">↑</kbd> <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border/80 text-[10px]">↓</kbd></span>
          <span>Press <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border/80 text-[10px]">Enter</kbd> to open details</span>
        </div>
      )}

      {/* Modal for manually scheduling meetings */}
      <AddMeetingModal open={addModalOpen} onOpenChange={setAddModalOpen} />
    </div>
  );
}
