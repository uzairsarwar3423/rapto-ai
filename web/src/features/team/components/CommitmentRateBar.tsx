// web/src/features/team/components/CommitmentRateBar.tsx

import React from "react";

interface CommitmentRateBarProps {
  rate: number;
}

export function CommitmentRateBar({ rate }: CommitmentRateBarProps) {
  // Clamp rate between 0 and 100
  const clampedRate = Math.min(100, Math.max(0, rate));

  return (
    <div
      role="img"
      aria-label={`Fulfillment rate ${clampedRate}%`}
      className="h-1.5 w-full rounded-full bg-muted overflow-hidden select-none"
    >
      <div
        className="h-full bg-brand rounded-full transition-[width] duration-200 ease-out"
        style={{ width: `${Math.max(clampedRate, 2)}%` }}
      />
    </div>
  );
}
