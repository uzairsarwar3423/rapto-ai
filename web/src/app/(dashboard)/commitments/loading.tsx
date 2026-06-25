import React from "react";
import { PageContainer } from "@/components/shared/layout/PageContainer";
import { CommitmentTrackerSkeleton } from "@/features/commitments/components/CommitmentTracker/CommitmentTrackerSkeleton";

export default function CommitmentsLoading() {
  return (
    <PageContainer>
      <CommitmentTrackerSkeleton />
    </PageContainer>
  );
}
