// web/src/features/team/hooks/useTeamHealth.ts

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { teamApi } from "../api/team.api";

export function useTeamHealth(passedTeamId?: string) {
  const storeTeamId = useAuthStore((state) => state.user?.teamId) || "";
  const teamId = passedTeamId || storeTeamId;

  return useQuery({
    queryKey: queryKeys.team.health(teamId),
    queryFn: () => teamApi.getHealth(),
    enabled: !!teamId,
    staleTime: 60 * 1000, // 60 seconds stale time (health doesn't change rapidly)
  });
}
