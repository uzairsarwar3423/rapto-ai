import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { testTeamIntegrationClient, testCalendarConnectionClient } from "../api/integrations.api";
import { toast } from "sonner";

export function useTestConnection() {
  const queryClient = useQueryClient();
  const teamId = useAuthStore((state) => state.user?.teamId) || "";

  return useMutation({
    mutationFn: async ({ provider, isCalendar }: { provider: string; isCalendar: boolean }) => {
      if (isCalendar) {
        return testCalendarConnectionClient(provider);
      } else {
        return testTeamIntegrationClient(provider);
      }
    },
    onSuccess: (data, variables) => {
      const isIntegrationsPage = typeof window !== "undefined" && window.location.pathname.startsWith("/settings/integrations");
      if (data.healthy) {
        if (isIntegrationsPage) {
          window.dispatchEvent(
            new CustomEvent("integration-test-result", {
              detail: {
                provider: variables.provider,
                type: "success",
                message: `Connection to ${variables.provider} is healthy!`,
              },
            })
          );
        } else {
          toast.success(`Connection to ${variables.provider} is healthy!`);
        }
      } else {
        const errMsg = `Connection to ${variables.provider} failed. Please re-authenticate.`;
        if (isIntegrationsPage) {
          window.dispatchEvent(
            new CustomEvent("integration-test-result", {
              detail: {
                provider: variables.provider,
                type: "error",
                message: errMsg,
              },
            })
          );
        } else {
          toast.error(errMsg);
        }
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all(teamId) });
    },
    onError: (err: any, variables) => {
      const isIntegrationsPage = typeof window !== "undefined" && window.location.pathname.startsWith("/settings/integrations");
      const errMsg = err?.response?.data?.error?.message || "Connection test failed";
      if (isIntegrationsPage) {
        window.dispatchEvent(
          new CustomEvent("integration-test-result", {
            detail: {
              provider: variables.provider,
              type: "error",
              message: errMsg,
            },
          })
        );
      } else {
        toast.error(errMsg);
      }
    }
  });
}
