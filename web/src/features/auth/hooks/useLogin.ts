import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../store/auth.store';
import { AuthPayload } from '../types/auth.types';

export const useLogin = () => {
  const router = useRouter();
  const setAccessToken = useAuthStore((state) => state.setAccessToken);
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation<AuthPayload, Error, any>({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      setUser(data.user);
      
      const searchParams = new URLSearchParams(window.location.search);
      const redirect = searchParams.get('redirect');
      
      if (redirect) {
        router.push(redirect);
      } else if (data.user.teamId) {
        router.push('/dashboard');
      } else {
        router.push('/onboarding');
      }
    },
  });
};
