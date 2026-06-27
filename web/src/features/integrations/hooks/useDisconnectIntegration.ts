import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { disconnectTeamIntegrationClient, disconnectCalendarClient } from "../api/integrations.api";
import { toast } from "sonner";

export function useDisconnectIntegration() {
  const queryClient = useQueryClient();
  const teamId = useAuthStore((state) => state.user?.teamId) || "";

  return useMutation({
    mutationFn: async ({ provider, isCalendar }: { provider: string; isCalendar: boolean }) => {
      if (isCalendar) {
        return disconnectCalendarClient(provider);
      } else {
        return disconnectTeamIntegrationClient(provider);
      }
    },
    onSuccess: (_, variables) => {
      toast.success(`${variables.provider} integration disconnected`);
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all(teamId) });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || "Failed to disconnect integration");
    }
  });
}
