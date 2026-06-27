import { useMutation, useQueryClient } from '@tanstack/react-query';
import { teamApi } from '../api/team.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { queryKeys } from '@/shared/lib/cache/query-keys';

export function useUpdateTeam() {
  const queryClient = useQueryClient();
  const teamId = useAuthStore((state) => state.user?.teamId) || '';

  return useMutation({
    mutationFn: teamApi.updateTeam,
    onSuccess: (data) => {
      // Invalidate both local detail query and any shared team caches
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.team.detail(teamId) });
      }
      queryClient.invalidateQueries({ queryKey: ['team'] });
    },
  });
}
