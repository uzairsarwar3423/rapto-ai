import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { teamApi } from "../api/team.api";
import { useAuthStore } from "@/features/auth/store/auth.store";

export function useMemberProfile(memberId: string) {
  const teamId = useAuthStore((state) => state.user?.teamId) || "";

  return useQuery({
    queryKey: queryKeys.team.member(teamId, memberId),
    queryFn: () => teamApi.getMember(memberId),
    enabled: !!teamId && !!memberId,
    staleTime: 15 * 1000,
  });
}
