import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth.api';
import { RegisterResponse } from '../types/auth.types';

export const useRegister = () => {
  return useMutation<RegisterResponse, Error, any>({
    mutationFn: authApi.register,
  });
};
