import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { syncCalendarNowClient } from "../api/integrations.api";
import { toast } from "sonner";

export function useSyncGoogleCalendar() {
  const queryClient = useQueryClient();
  const teamId = useAuthStore((state) => state.user?.teamId) || "";

  return useMutation({
    mutationFn: async () => {
      return syncCalendarNowClient();
    },
    onSuccess: (data) => {
      if (data.synced > 0) {
        toast.success(`Calendar synced! Created ${data.synced} new meetings.`);
      } else {
        toast.success(`Calendar synced! No new meetings found.`);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all(teamId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.list(teamId) });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || "Failed to sync calendar");
    }
  });
}
