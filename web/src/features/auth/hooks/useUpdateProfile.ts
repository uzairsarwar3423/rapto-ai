import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../store/auth.store';
import { User } from '../types/auth.types';

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation<{ user: User }, Error, Parameters<typeof authApi.updateMe>[0]>({
    mutationFn: authApi.updateMe,
    onSuccess: (data) => {
      // Update local Zustand store so that the header and page reflect changes instantly
      setUser(data.user);
      
      // Invalidate queries that might rely on user data
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
};
