import { useQuery } from "@tanstack/react-query";
import { fetchSlackChannelsClient } from "../api/integrations.api";

export function useSlackChannels(enabled: boolean = true) {
  return useQuery({
    queryKey: ["slackChannels"],
    queryFn: fetchSlackChannelsClient,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
