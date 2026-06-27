import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { fetchCalendarPreviewClient } from "../api/integrations.api";

export function useCalendarEvents() {
  const userId = useAuthStore((state) => state.user?.id) || "";

  return useQuery({
    queryKey: queryKeys.integrations.calendarPreview(userId),
    queryFn: fetchCalendarPreviewClient,
    enabled: !!userId,
    staleTime: 30 * 1000,
  });
}
