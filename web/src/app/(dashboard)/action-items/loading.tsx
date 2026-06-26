import React from "react";
import { PageContainer } from "@/components/shared/layout/PageContainer";
import { ActionItemListSkeleton } from "@/features/action-items/components/ActionItemList/ActionItemListSkeleton";

export default function ActionItemsLoading() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-4 w-full h-full font-sans animate-pulse">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/40 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Action Items</h1>
            <div className="h-3 w-48 bg-muted-foreground/10 rounded mt-1.5 animate-pulse" />
          </div>
        </div>
        <div className="h-9 w-full bg-muted/20 border border-border/40 rounded-lg animate-pulse" />
        <ActionItemListSkeleton />
      </div>
    </PageContainer>
  );
}
