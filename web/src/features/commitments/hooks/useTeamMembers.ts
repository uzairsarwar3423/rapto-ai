"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
}

export function useTeamMembers() {
  return useQuery<TeamMember[]>({
    queryKey: ["team", "members"],
    queryFn: async () => {
      const response = await api.get<{
        data: { members: TeamMember[] };
      }>("/teams/me/members", {
        params: { limit: 100 },
      });
      return response.data.data?.members || [];
    },
    staleTime: 300_000, // 5 minutes
  });
}
