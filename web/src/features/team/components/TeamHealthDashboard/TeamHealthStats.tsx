// web/src/features/team/components/TeamHealthDashboard/TeamHealthStats.tsx

"use client";

import React from "react";
import { useTeamHealth } from "../../hooks/useTeamHealth";
import { StatPill } from "@/features/dashboard/components/StatPill";
import { TrendIndicator } from "@/features/commitments/components/TrendIndicator";
import { Skeleton } from "@/components/ui/skeleton";

export function TeamHealthStats() {
  const { data, isPending } = useTeamHealth();

  if (isPending) {
    return <TeamHealthStatsSkeleton />;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      <StatPill label="Team Health" value={data.score} size="lg" />
      <StatPill label="Fulfillment" value={`${data.fulfillmentRate}%`} />
      <StatPill label="On-time" value={`${data.onTimeRate}%`} />
      <StatPill label="Trend" value={<TrendIndicator trend={data.trend} />} />
    </div>
  );
}

export function TeamHealthStatsSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5 p-3 rounded-xl bg-surface border border-border/40 select-none">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-20 mt-1" />
        </div>
      ))}
    </div>
  );
}
