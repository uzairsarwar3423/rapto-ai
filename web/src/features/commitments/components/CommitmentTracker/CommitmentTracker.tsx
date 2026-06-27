"use client";

import React, { useState, useTransition, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCommitmentFilters, type CommitmentStatusFilter } from "../../hooks/useCommitmentFilters";
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
  const { urlFilters, initialStatus, setUrlFilters, clearUrlFilters, activeFilterCount } =
    useCommitmentFilters();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Status lives in local state — NO server re-render on tab click ──────────
  const [status, setStatus] = useState<CommitmentStatusFilter>(initialStatus);
  const [isPendingTransition, startTransition] = useTransition();

  // Track when we just switched tabs so we can show skeleton before isFetching fires
  const prevStatusRef = useRef<CommitmentStatusFilter>(status);
  const [isTabSwitching, setIsTabSwitching] = useState(false);

  // Sheets state
  const [activeCommitment, setActiveCommitment] = useState<Commitment | null>(null);
  const [isFulfillOpen, setIsFulfillOpen] = useState(false);
  const [isDeferOpen, setIsDeferOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);

  // Combined filters passed to React Query
  const combinedFilters = { status, ...urlFilters };

  // Counts — not status-sensitive, seeded from server
  const { data: counts = {} } = useCommitmentCounts(teamId, {
    initialData: initialData.counts,
  });

  // List with infinite scroll
  const { data, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useCommitments(combinedFilters, {
      initialData: initialData.commitments,
      nextCursor: initialData.nextCursor,
      counts: initialData.counts,
    });

  // Clear isTabSwitching once the fetch settles
  React.useEffect(() => {
    if (!isFetching && isTabSwitching) {
      setIsTabSwitching(false);
    }
  }, [isFetching, isTabSwitching]);

  const flatCommitments = data?.pages.flatMap((page) => page.commitments) ?? [];

  // ── Silently sync status to URL bar (no router navigation, no server call) ──
  const syncStatusToUrl = useCallback(
    (newStatus: CommitmentStatusFilter) => {
      if (typeof window === "undefined") return;
      const next = new URLSearchParams(searchParams.toString());
      if (newStatus === "ALL") {
        next.delete("status");
      } else {
        next.set("status", newStatus);
      }
      const qs = next.toString();
      window.history.replaceState(null, "", `${pathname}${qs ? `?${qs}` : ""}`);
    },
    [pathname, searchParams]
  );

  // ── Tab click: instant local state + URL bar update, no server roundtrip ────
  const handleStatusChange = (newStatus: CommitmentStatusFilter) => {
    if (newStatus === status) return;
    prevStatusRef.current = status;

    // Show skeleton immediately on click
    setIsTabSwitching(true);

    // Update local state inside transition (keeps UI responsive)
    startTransition(() => {
      setStatus(newStatus);
    });

    // Silently update URL bar for bookmarking / sharing
    syncStatusToUrl(newStatus);
  };

  const handleAction = (action: CommitmentAction, commitment: Commitment) => {
    setActiveCommitment(commitment);
    if (action === "MARK_FULFILLED") setIsFulfillOpen(true);
    else if (action === "DEFER") setIsDeferOpen(true);
    else if (action === "CANCEL") setIsCancelOpen(true);
    else if (action === "VIEW_HISTORY") router.push(`/commitments/${commitment.id}`);
  };

  const handleClearAll = () => {
    setStatus("ALL");
    clearUrlFilters();
    syncStatusToUrl("ALL");
  };

  // Show skeleton during tab switch OR first load
  const showSkeleton = isLoading || isTabSwitching || isPendingTransition;

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-sans">
      {/* Header */}
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

      {/* Overdue alert */}
      <OverdueAlert
        overdueCount={counts.MISSED || 0}
        currentStatus={status}
        onStatusChange={handleStatusChange}
      />

      {/* Status tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <CommitmentStatusTabs
          value={status}
          onValueChange={handleStatusChange}
          counts={counts}
        />
      </div>

      {/* Filters bar */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-xs">
        <CommitmentFilters onClearAll={handleClearAll} />
      </div>

      {/* List */}
      <CommitmentList
        commitments={flatCommitments}
        isLoading={showSkeleton}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={!!hasNextPage}
        onLoadMore={fetchNextPage}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearAll}
        onAction={handleAction}
      />

      {/* Action Sheets */}
      <MarkFulfilledSheet open={isFulfillOpen} onOpenChange={setIsFulfillOpen} commitment={activeCommitment} />
      <DeferSheet open={isDeferOpen} onOpenChange={setIsDeferOpen} commitment={activeCommitment} />
      <CancelCommitmentSheet open={isCancelOpen} onOpenChange={setIsCancelOpen} commitment={activeCommitment} />
    </div>
  );
}
