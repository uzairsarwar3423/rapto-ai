import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../store/auth.store';
import { authSync } from '../utils/auth-events';
import { AuthPayload } from '../types/auth.types';
import { getPostAuthPath } from '@/features/onboarding/data/onboarding-steps.config';

export const useLogin = () => {
  const router = useRouter();
  const setAccessToken = useAuthStore((state) => state.setAccessToken);
  const setUser = useAuthStore((state) => state.setUser);
  const setSessionExpired = useAuthStore((state) => state.setSessionExpired);

  return useMutation<AuthPayload, Error, any>({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      setUser(data.user);
      setSessionExpired(false);

      // Broadcast login to all other open tabs
      authSync.emit('LOGIN', { accessToken: data.accessToken, user: data.user });

      const searchParams = new URLSearchParams(window.location.search);
      const redirect = searchParams.get('redirect');

      // Go straight to where the user belongs — a team owner who hasn't finished
      // onboarding used to land on /dashboard only to be redirected back.
      router.push(redirect || getPostAuthPath(data.user));
    },
  });
};
