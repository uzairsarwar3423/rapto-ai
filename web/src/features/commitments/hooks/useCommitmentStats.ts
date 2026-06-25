"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCommitmentStatsClient } from "../api/commitments.queries";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuth } from "@/features/auth/hooks/useAuth";

export interface CommitmentStatsFilters {
  from?: string;
  to?: string;
}

export function useCommitmentStats(filters?: CommitmentStatsFilters) {
  const { user } = useAuth();
  const teamId = user?.teamId || "default";

  return useQuery({
    queryKey: queryKeys.commitments.stats(teamId, filters || {}),
    queryFn: () => fetchCommitmentStatsClient(filters),
    staleTime: 30_000,
    enabled: !!user?.teamId, // Only execute query once the user session is active
  });
}
