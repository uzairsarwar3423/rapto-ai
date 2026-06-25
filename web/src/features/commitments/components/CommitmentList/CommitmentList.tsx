"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useFocusListNavigation } from "@/hooks/shared/useFocusListNavigation";
import { CommitmentRow } from "../CommitmentRow";
import { CommitmentListHeader } from "./CommitmentListHeader";
import { CursorPagination } from "@/shared/components/data-display/CursorPagination";
import { RowEmptyState } from "@/shared/components/feedback/RowEmptyState";
import type { Commitment } from "../../types";
import type { CommitmentAction } from "../commitment-actions.permissions";

interface CommitmentListProps {
  commitments: Commitment[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onAction?: (action: CommitmentAction, commitment: Commitment) => void;
}

export function CommitmentList({
  commitments,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  onLoadMore,
  hasActiveFilters,
  onClearFilters,
  onAction,
}: CommitmentListProps) {
  const router = useRouter();

  // Keyboard & mouse list navigation
  const { activeIndex, setActiveIndex, containerRef } = useFocusListNavigation<Commitment>({
    items: commitments,
    onOpen: (commitment) =>
      router.push(`/commitments/${commitment.id}`),
  });

  if (commitments.length === 0) {
    return (
      <div className="border border-border rounded-lg bg-card p-8 text-center shadow-xs font-sans">
        <RowEmptyState
          title={hasActiveFilters ? "No matching commitments" : "No commitments found"}
          subtitle={
            hasActiveFilters
              ? "Try adjusting or clearing your active filters."
              : "Commitments automatically extracted from your meetings will appear here."
          }
          className="max-w-md mx-auto"
        />
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-4 text-xs font-semibold text-brand hover:underline cursor-pointer select-none"
          >
            Clear active filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden shadow-xs font-sans">
      <CommitmentListHeader />
      <div
        ref={containerRef as React.RefObject<HTMLDivElement>}
        className="divide-y divide-border/40"
      >
        {commitments.map((commitment, index) => (
          <CommitmentRow
            key={commitment.id}
            commitment={commitment}
            showMeetingTitle={true}
            showOwner={true}
            density="compact"
            data-row-index={index}
            onAction={onAction}
            className={activeIndex === index ? "bg-accent/40" : ""}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(-1)}
          />
        ))}
      </div>

      <CursorPagination
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}
