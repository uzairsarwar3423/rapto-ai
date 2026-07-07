import { create } from 'zustand';
import Cookies from 'js-cookie';
import { User } from '../types/auth.types';

interface AuthState {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSessionExpired: boolean;
  
  setUser: (user: User | null) => void;
  setAccessToken: (token: string | null) => void;
  clearAuth: () => void;
  setLoading: (isLoading: boolean) => void;
  setSessionExpired: (expired: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true, // Start as true to prevent flash of unauthenticated UI
  isSessionExpired: false,

  setUser: (user) => set({ 
    user, 
    isAuthenticated: !!user 
  }),
  
  setAccessToken: (token) => {
    if (token) {
      Cookies.set('rapto_access', token, { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    } else {
      Cookies.remove('rapto_access', { path: '/' });
    }
    set({ accessToken: token });
  },
  
  clearAuth: () => {
    Cookies.remove('rapto_access', { path: '/' });
    set({ 
      accessToken: null, 
      user: null, 
      isAuthenticated: false 
    });
  },
  
  setLoading: (isLoading) => set({ 
    isLoading 
  }),
  
  setSessionExpired: (expired) => set({
    isSessionExpired: expired
  }),
}));
