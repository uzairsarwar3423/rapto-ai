"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useCommitmentFilters } from "../../hooks/useCommitmentFilters";
import { useCommitments } from "../../hooks/useCommitments";
import { useCommitmentCounts } from "../../hooks/useCommitmentCounts";
import { CommitmentStatusTabs } from "../CommitmentStatusTabs";
import { CommitmentFilters } from "../CommitmentFilters";
import { CommitmentList } from "../CommitmentList/CommitmentList";
import { OverdueAlert } from "../OverdueAlert";
import { MarkFulfilledSheet } from "../MarkFulfilledSheet";
import { DeferSheet } from "../DeferSheet";
import { CancelCommitmentSheet } from "../CancelCommitmentSheet";
import type { CommitmentAction } from "../commitment-actions.permissions";
import type { Commitment } from "../../types";

interface CommitmentTrackerProps {
  teamId: string;
  initialData: {
    commitments: Commitment[];
    nextCursor: string | null;
    counts: Record<string, number>;
  };
}

export function CommitmentTracker({ teamId, initialData }: CommitmentTrackerProps) {
  const { filters, setFilters, clearAll, activeFilterCount } = useCommitmentFilters();
  const router = useRouter();

  // Sheets state
  const [activeCommitment, setActiveCommitment] = useState<Commitment | null>(null);
  const [isFulfillOpen, setIsFulfillOpen] = useState(false);
  const [isDeferOpen, setIsDeferOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);

  // Query counts independently (seeded with server initialData)
  const { data: counts = {} } = useCommitmentCounts(teamId, {
    initialData: initialData.counts,
  });

  // Query list with infinite scroll (seeded with server initialData)
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useCommitments(filters, {
    initialData: initialData.commitments,
    nextCursor: initialData.nextCursor,
    counts: initialData.counts,
  });

  const flatCommitments = data?.pages.flatMap((page) => page.commitments) ?? [];

  const handleStatusChange = (status: any) => {
    setFilters({ status });
  };

  const handleAction = (action: CommitmentAction, commitment: Commitment) => {
    setActiveCommitment(commitment);
    if (action === "MARK_FULFILLED") {
      setIsFulfillOpen(true);
    } else if (action === "DEFER") {
      setIsDeferOpen(true);
    } else if (action === "CANCEL") {
      setIsCancelOpen(true);
    } else if (action === "VIEW_HISTORY") {
      router.push(`/commitments/${commitment.id}`);
    }
  };

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-sans">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground font-heading">
            Commitments
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Track commitments and deliverables extracted from your calendar events and meetings.
          </p>
        </div>
      </div>

      {/* Overdue alert banner if there are missed commitments */}
      <OverdueAlert
        overdueCount={counts.MISSED || 0}
        currentStatus={filters.status}
        onStatusChange={handleStatusChange}
      />

      {/* Segmented status tabs navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <CommitmentStatusTabs
          value={filters.status}
          onValueChange={handleStatusChange}
          counts={counts}
        />
      </div>

      {/* Filters bar */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-xs">
        <CommitmentFilters />
      </div>

      {/* Listing Content */}
      <CommitmentList
        commitments={flatCommitments}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={!!hasNextPage}
        onLoadMore={fetchNextPage}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearAll}
        onAction={handleAction}
      />

      {/* Action Sheets */}
      <MarkFulfilledSheet
        open={isFulfillOpen}
        onOpenChange={setIsFulfillOpen}
        commitment={activeCommitment}
      />
      <DeferSheet
        open={isDeferOpen}
        onOpenChange={setIsDeferOpen}
        commitment={activeCommitment}
      />
      <CancelCommitmentSheet
        open={isCancelOpen}
        onOpenChange={setIsCancelOpen}
        commitment={activeCommitment}
      />
    </div>
  );
}
