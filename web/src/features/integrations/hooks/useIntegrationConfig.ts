import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { 
  updateTeamIntegrationConfigClient, 
  updateCalendarConfigClient,
  fetchProviderOptionsClient 
} from "../api/integrations.api";
import { toast } from "sonner";

export function useIntegrationConfig(provider: string, isCalendar = false) {
  const queryClient = useQueryClient();
  const teamId = useAuthStore((state) => state.user?.teamId) || "";

  const optionsQuery = useQuery({
    queryKey: queryKeys.integrations.config(provider),
    queryFn: () => fetchProviderOptionsClient(provider),
    enabled: !isCalendar && !!provider && !!teamId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (config: Record<string, any>) => {
      if (isCalendar) {
        return updateCalendarConfigClient(provider, config);
      } else {
        return updateTeamIntegrationConfigClient(provider, config);
      }
    },
    onSuccess: () => {
      toast.success("Configuration updated successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all(teamId) });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || "Failed to save configuration");
    }
  });

  return {
    options: optionsQuery.data || [],
    isLoadingOptions: optionsQuery.isLoading,
    optionsError: optionsQuery.error,
    save: saveMutation.mutate,
    saveAsync: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isSuccess: saveMutation.isSuccess,
  };
}
