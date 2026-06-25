"use client";

import React from "react";
import { MeetingDetailTabSection } from "./MeetingDetailTabSection";
import { CommitmentRow } from "@/features/commitments/components/CommitmentRow";
import { CommitmentEmptyState } from "@/features/commitments/components/CommitmentEmptyState";
import { CommitmentRowSkeleton } from "@/features/commitments/components/CommitmentRowSkeleton";
import { useMeetingCommitments } from "@/features/commitments/hooks/useMeetingCommitments";
import type { Commitment } from "@/features/commitments/types";

interface MeetingCommitmentsTabProps {
  meetingId: string;
  initialData?: Commitment[];
}

export function MeetingCommitmentsTab({
  meetingId,
  initialData,
}: MeetingCommitmentsTabProps) {
  const { data: commitments, isLoading } = useMeetingCommitments(meetingId, initialData);

  return (
    <MeetingDetailTabSection
      title="Commitments"
      viewAllHref="/commitments"
    >
      {isLoading ? (
        <div className="flex flex-col border border-border/40 rounded-lg overflow-hidden divide-y divide-border/20">
          {Array.from({ length: 3 }).map((_, idx) => (
            <CommitmentRowSkeleton key={idx} />
          ))}
        </div>
      ) : !commitments || commitments.length === 0 ? (
        <CommitmentEmptyState />
      ) : (
        <div className="flex flex-col border border-border/40 rounded-lg overflow-hidden divide-y divide-border/20">
          {commitments.map((commitment) => (
            <CommitmentRow
              key={commitment.id}
              commitment={commitment}
              showOwner={true}
            />
          ))}
        </div>
      )}
    </MeetingDetailTabSection>
  );
}
