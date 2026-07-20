import { useMutation, useQueryClient } from "@tanstack/react-query";
import { configureSlackClient } from "../api/integrations.api";
import { toast } from "sonner";

export function useConfigureSlack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: configureSlackClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Slack configured successfully.");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to configure Slack integration.");
    },
  });
}
