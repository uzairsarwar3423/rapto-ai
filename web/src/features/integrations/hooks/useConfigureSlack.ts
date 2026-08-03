import { useMutation, useQueryClient } from "@tanstack/react-query";
import { configureSlackClient } from "../api/integrations.api";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { toast } from "sonner";

export function useConfigureSlack() {
  const queryClient = useQueryClient();
  const teamId = useAuthStore((state) => state.user?.teamId) || "";

  return useMutation({
    mutationFn: configureSlackClient,
    onSuccess: () => {
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all(teamId) });
      }
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Slack configured successfully.");
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error?.message || error?.message || "Failed to configure Slack integration.");
    },
  });
}
