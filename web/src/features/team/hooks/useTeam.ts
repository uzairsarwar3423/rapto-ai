// web/src/features/team/hooks/useTeam.ts

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { teamApi } from "../api/team.api";

export function useTeam(passedTeamId?: string) {
  const storeTeamId = useAuthStore((state) => state.user?.teamId) || "";
  const teamId = passedTeamId || storeTeamId;

  return useQuery({
    queryKey: queryKeys.team.detail(teamId),
    queryFn: () => teamApi.getTeam(),
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000, // 5 minutes stale time
  });
}
