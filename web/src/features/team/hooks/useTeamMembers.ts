// web/src/features/team/hooks/useTeamMembers.ts

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { teamApi } from "../api/team.api";

export function useTeamMembers(options?: { from?: string; to?: string; teamId?: string }) {
  const storeTeamId = useAuthStore((state) => state.user?.teamId) || "";
  const teamId = options?.teamId || storeTeamId;

  // Default to rolling 30 days to align with backend Team Health Score window.
  // Truncate to the start of the current hour to ensure query key stability and prevent infinite refetch loops.
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const defaultTo = now.toISOString();

  const from = options?.from || defaultFrom;
  const to = options?.to || defaultTo;

  return useQuery({
    queryKey: [...queryKeys.team.members(teamId), { from, to }],
    queryFn: () => teamApi.getMembers(from, to),
    enabled: !!teamId,
    staleTime: 15 * 1000, // 15s staleTime
    select: (data) => data.members,
  });
}
