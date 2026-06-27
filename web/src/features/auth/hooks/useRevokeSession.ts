import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth.api';

export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, string>({
    mutationFn: authApi.revokeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
  });
}
