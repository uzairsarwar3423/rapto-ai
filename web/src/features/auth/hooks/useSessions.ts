import { useQuery } from '@tanstack/react-query';
import { authApi } from '../api/auth.api';

export function useSessions() {
  return useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: authApi.getSessions,
    staleTime: 60 * 1000, // 1 minute
  });
}
