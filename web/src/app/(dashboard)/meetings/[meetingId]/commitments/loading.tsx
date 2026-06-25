import React from "react";
import { MeetingDetailTabSection } from "@/features/meetings/components/MeetingDetail/MeetingDetailTabSection";
import { CommitmentRowSkeleton } from "@/features/commitments/components/CommitmentRowSkeleton";

export default function CommitmentsLoading() {
  return (
    <MeetingDetailTabSection title="Commitments" viewAllHref="/commitments">
      <div className="flex flex-col border border-border/40 rounded-lg overflow-hidden divide-y divide-border/20">
        {Array.from({ length: 4 }).map((_, idx) => (
          <CommitmentRowSkeleton key={idx} />
        ))}
      </div>
    </MeetingDetailTabSection>
  );
}
