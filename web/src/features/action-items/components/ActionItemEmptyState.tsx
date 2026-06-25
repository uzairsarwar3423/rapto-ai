import React from "react";
import { RowEmptyState } from "@/shared/components/feedback/RowEmptyState";

interface ActionItemEmptyStateProps {
  className?: string;
}

export function ActionItemEmptyState({ className }: ActionItemEmptyStateProps) {
  return (
    <RowEmptyState
      title="No action items extracted"
      subtitle="Action items automatically identified in this meeting will show up here."
      className={className}
    />
  );
}
