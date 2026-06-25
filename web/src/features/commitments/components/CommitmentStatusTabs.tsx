"use client";

import React from "react";
import { SegmentedTabs, type SegmentedTabItem } from "@/shared/components/data-display/SegmentedTabs";
import type { CommitmentStatusFilter } from "../hooks/useCommitmentFilters";

interface CommitmentStatusTabsProps {
  value: CommitmentStatusFilter;
  onValueChange: (value: CommitmentStatusFilter) => void;
  counts?: Record<string, number>;
}

export function CommitmentStatusTabs({
  value,
  onValueChange,
  counts = {},
}: CommitmentStatusTabsProps) {
  // Aggregate total count from all statuses
  const totalCount = Object.values(counts).reduce((acc, count) => acc + count, 0);

  const items: SegmentedTabItem<CommitmentStatusFilter>[] = [
    { value: "ALL", label: "All", count: totalCount },
    { value: "PENDING", label: "Pending", count: counts.PENDING || 0 },
    { value: "FULFILLED", label: "Fulfilled", count: counts.FULFILLED || 0 },
    { value: "MISSED", label: "Missed", count: counts.MISSED || 0 },
    { value: "DEFERRED", label: "Deferred", count: counts.DEFERRED || 0 },
    { value: "CANCELLED", label: "Cancelled", count: counts.CANCELLED || 0 },
  ];

  return (
    <SegmentedTabs
      value={value}
      onValueChange={onValueChange}
      items={items}
      className="w-full sm:w-auto"
    />
  );
}
