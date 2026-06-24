"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import type { MeetingListItem } from "../../types";

interface MeetingListProps {
  initialData?: MeetingListItem[];
}

export function MeetingList({ initialData }: MeetingListProps) {
  const router = useRouter();
  const { filters, clearAll } = useMeetingFilters();
  const [addModalOpen, setAddModalOpen] = useState(false);

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-sans">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground font-heading">
            Meetings
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Analyze, track, and retrieve intelligence from your calendar events and calls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="text-xs h-9 bg-brand hover:bg-brand/90 text-white flex items-center gap-1.5 font-medium"
          >
            <Plus className="h-4 w-4" />
            Add Meeting
          </Button>
        </div>
      </div>

      {/* Filter panel */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-xs">
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
        <div className="border border-border rounded-lg bg-card overflow-hidden shadow-xs">
          <MeetingListHeader />
          <div
            ref={containerRef as React.RefObject<HTMLDivElement>}
            className="divide-y divide-border"
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

      {/* Slide-over sheet for manually scheduling meetings */}
      <AddMeetingModal open={addModalOpen} onOpenChange={setAddModalOpen} />
    </div>
  );
}
