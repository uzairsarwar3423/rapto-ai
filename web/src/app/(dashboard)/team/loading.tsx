// web/src/app/(dashboard)/team/loading.tsx

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamHealthStatsSkeleton } from "@/features/team/components/TeamHealthDashboard/TeamHealthStats";
import { MemberTableSkeleton } from "@/features/team/components/MemberTable/MemberTableSkeleton";

export default function TeamLoading() {
  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto px-6 py-6 select-none">
      {/* Header loading skeleton */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {/* Stats Cards Skeleton */}
      <TeamHealthStatsSkeleton />

      {/* Member Table Skeleton */}
      <div className="flex flex-col gap-3.5 mt-2">
        <Skeleton className="h-4 w-32" />
        <MemberTableSkeleton />
      </div>
    </div>
  );
}
