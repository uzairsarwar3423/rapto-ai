"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { fetchTeamActionItemsClient, FetchActionItemsFilters } from "../api/action-items.queries";
import { useAuthStore } from "@/features/auth/store/auth.store";

export function useActionItems(filters: FetchActionItemsFilters) {
  const teamId = useAuthStore((state) => state.user?.teamId) || "";

  return useQuery({
    queryKey: queryKeys.actionItems.list(teamId, filters),
    queryFn: () => fetchTeamActionItemsClient(filters),
    enabled: !!teamId,
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000, // staleTime 15s — matches Commitments tier
  });
}
