"use client";

import React, { useState } from "react";
import { PageContainer } from "@/components/shared/layout/PageContainer";
import { ActionItemFilters } from "@/features/action-items/components/ActionItemFilters";
import { ActionItemList } from "@/features/action-items/components/ActionItemList/ActionItemList";
import { ActionItemBulkBar } from "@/features/action-items/components/ActionItemBulkBar";
import { useActionItems } from "@/features/action-items/hooks/useActionItems";
import { useBulkUpdateActionItems } from "@/features/action-items/hooks/useBulkUpdateActionItems";
import { useSelection } from "@/shared/hooks/useSelection";
import { ActionItemListSkeleton } from "@/features/action-items/components/ActionItemList/ActionItemListSkeleton";
import type { FetchActionItemsFilters } from "@/features/action-items/api/action-items.queries";

export default function ActionItemsPage() {
  const [filters, setFilters] = useState<FetchActionItemsFilters>({});

  const { data, isLoading, isFetching } = useActionItems(filters);
  const items = data?.items || [];
  const counts = data?.counts || { completed: 0, incomplete: 0 };
  const visibleIds = items.map((item) => item.id);

  const selection = useSelection(visibleIds);
  const bulkUpdate = useBulkUpdateActionItems();

  const handleFiltersChange = (newFilters: FetchActionItemsFilters) => {
    setFilters(newFilters);
    selection.clear(); // Clear selection when filters change
  };

  const handleClearAll = () => {
    setFilters({});
    selection.clear();
  };

  const handleToggleComplete = (id: string, completed: boolean) => {
    bulkUpdate.mutate({ ids: [id], patch: { completed } });
  };

  const handleBulkUpdate = (ids: string[], patch: any) => {
    bulkUpdate.mutate({ ids, patch }, {
      onSuccess: () => {
        selection.clear();
      }
    });
  };

  return (
    <PageContainer>
      <div className="flex flex-col gap-4 w-full h-full font-sans">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/40 pb-4">
          <div>
            <h1 className="text-xl font-heading font-bold tracking-tight text-foreground">Action Items</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage, sync, and prioritize team action items extracted from meeting transcripts.
            </p>
          </div>
          {/* Summary counts */}
          <div className="flex items-center gap-4 text-xs font-medium self-start md:self-center bg-muted/20 px-3 py-1.5 rounded-lg border border-border/30">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Completed:</span>
              <span className="text-foreground font-semibold">{counts.completed}</span>
            </div>
            <div className="w-[1px] h-3 bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-muted-foreground">Incomplete:</span>
              <span className="text-foreground font-semibold">{counts.incomplete}</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <ActionItemFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onClearAll={handleClearAll}
        />

        {/* List / Loading */}
        {isLoading ? (
          <ActionItemListSkeleton />
        ) : (
          <ActionItemList
            items={items}
            isFetching={isFetching}
            selection={selection}
            onToggleComplete={handleToggleComplete}
          />
        )}

        {/* Floating Bulk Actions Bar */}
        <ActionItemBulkBar
          selectedIds={selection.selectedIds}
          onClear={selection.clear}
          onUpdate={handleBulkUpdate}
        />
      </div>
    </PageContainer>
  );
}
