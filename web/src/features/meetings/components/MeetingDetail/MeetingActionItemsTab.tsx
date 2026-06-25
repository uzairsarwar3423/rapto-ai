"use client";

import React from "react";
import { MeetingDetailTabSection } from "./MeetingDetailTabSection";
import { ActionItemRow } from "@/features/action-items/components/ActionItemRow";
import { ActionItemEmptyState } from "@/features/action-items/components/ActionItemEmptyState";
import { ActionItemRowSkeleton } from "@/features/action-items/components/ActionItemRowSkeleton";
import { useMeetingActionItems } from "@/features/action-items/hooks/useMeetingActionItems";
import { useToggleActionItemComplete } from "@/features/action-items/hooks/useToggleActionItemComplete";
import type { ActionItem } from "@/features/action-items/types";

interface MeetingActionItemsTabProps {
  meetingId: string;
  initialData?: ActionItem[];
}

export function MeetingActionItemsTab({
  meetingId,
  initialData,
}: MeetingActionItemsTabProps) {
  const { data: items, isLoading } = useMeetingActionItems(meetingId, initialData);
  const { mutate: toggleComplete } = useToggleActionItemComplete(meetingId);

  const handleToggle = (id: string, completed: boolean) => {
    toggleComplete({ id, completed });
  };

  return (
    <MeetingDetailTabSection
      title="Action Items"
      viewAllHref="/action-items"
    >
      {isLoading ? (
        <div className="flex flex-col border border-border/40 rounded-lg overflow-hidden divide-y divide-border/20">
          {Array.from({ length: 3 }).map((_, idx) => (
            <ActionItemRowSkeleton key={idx} />
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <ActionItemEmptyState />
      ) : (
        <div className="flex flex-col border border-border/40 rounded-lg overflow-hidden divide-y divide-border/20">
          {items.map((item) => (
            <ActionItemRow
              key={item.id}
              item={item}
              onToggleComplete={handleToggle}
            />
          ))}
        </div>
      )}
    </MeetingDetailTabSection>
  );
}
