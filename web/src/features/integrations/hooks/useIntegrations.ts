import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { fetchIntegrationsClient } from "../api/integrations.api";

export function useIntegrations() {
  const teamId = useAuthStore((state) => state.user?.teamId) || "";
  
  return useQuery({
    queryKey: queryKeys.integrations.all(teamId),
    queryFn: fetchIntegrationsClient,
    enabled: !!teamId,
    staleTime: 60 * 1000,
  });
}
