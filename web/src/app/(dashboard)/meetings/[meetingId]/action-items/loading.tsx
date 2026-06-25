import React from "react";
import { MeetingDetailTabSection } from "@/features/meetings/components/MeetingDetail/MeetingDetailTabSection";
import { ActionItemRowSkeleton } from "@/features/action-items/components/ActionItemRowSkeleton";

export default function ActionItemsLoading() {
  return (
    <MeetingDetailTabSection title="Action Items" viewAllHref="/action-items">
      <div className="flex flex-col border border-border/40 rounded-lg overflow-hidden divide-y divide-border/20">
        {Array.from({ length: 4 }).map((_, idx) => (
          <ActionItemRowSkeleton key={idx} />
        ))}
      </div>
    </MeetingDetailTabSection>
  );
}
