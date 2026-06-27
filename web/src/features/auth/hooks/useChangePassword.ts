import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth.api';

export function useChangePassword() {
  return useMutation<{ message: string }, Error, any>({
    mutationFn: authApi.changePassword,
  });
}
