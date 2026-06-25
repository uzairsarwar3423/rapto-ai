import React from "react";
import { RowEmptyState } from "@/shared/components/feedback/RowEmptyState";

interface CommitmentEmptyStateProps {
  className?: string;
}

export function CommitmentEmptyState({ className }: CommitmentEmptyStateProps) {
  return (
    <RowEmptyState
      title="No commitments extracted"
      subtitle="Commitments automatically identified in this meeting will show up here."
      className={className}
    />
  );
}
