import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { teamApi } from "../api/team.api";
import { useAuthStore } from "@/features/auth/store/auth.store";

export function useMemberTrend(memberId: string) {
  const teamId = useAuthStore((state) => state.user?.teamId) || "";

  return useQuery({
    queryKey: queryKeys.team.memberTrend(teamId, memberId),
    queryFn: () => teamApi.getMemberTrend(memberId),
    enabled: !!teamId && !!memberId,
    staleTime: 60 * 1000,
  });
}
