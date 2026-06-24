import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ActivityItem } from "../api/dashboard.queries";

async function fetchDashboardOverviewClient(limit = 10): Promise<ActivityItem[]> {
  const response = await api.get<{ data: ActivityItem[] }>("/analytics/activity", {
    params: { limit },
  });
  return response.data.data;
}

export function useDashboardOverview(limit = 10) {
  return useQuery({
    queryKey: ["dashboard", "overview", limit],
    queryFn: () => fetchDashboardOverviewClient(limit),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
