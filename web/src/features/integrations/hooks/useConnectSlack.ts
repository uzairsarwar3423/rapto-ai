import { useMutation } from "@tanstack/react-query";
import { initiateSlackConnectClient } from "../api/integrations.api";
import { toast } from "sonner";

export function useConnectSlack() {
  return useMutation({
    mutationFn: initiateSlackConnectClient,
    onSuccess: (authUrl) => {
      window.location.href = authUrl;
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to initiate Slack connection.");
    },
  });
}
