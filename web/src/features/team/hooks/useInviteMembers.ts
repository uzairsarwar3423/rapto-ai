// web/src/features/team/hooks/useInviteMembers.ts

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { teamApi } from "../api/team.api";
import { toast } from "sonner";
import type { InviteResult } from "../types/team.types";

export function useInviteMembers() {
  const queryClient = useQueryClient();
  const teamId = useAuthStore((state) => state.user?.teamId) || "";

  return useMutation<InviteResult, any, { emails: string[]; role: string }>({
    mutationFn: (payload) => teamApi.inviteMembers(payload),
    onSuccess: () => {
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.team.members(teamId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.team.health(teamId) });
      }
    },
    onError: (err: any) => {
      const code = err.response?.data?.error?.code || err.code;
      // Do not toast for PLAN_LIMIT_REACHED; the UI renders the banner internally
      if (code === "PLAN_LIMIT_REACHED" || code === "PLAN_LIMIT") {
        return;
      }
      toast.error(err.response?.data?.error?.message || "Failed to send invitations");
    },
  });
}
