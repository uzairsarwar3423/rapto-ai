import { create } from 'zustand';
import Cookies from 'js-cookie';
import { User } from '../types/auth.types';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Cookie options for the short-lived access token cookie.
 * This is used by the Next.js server-client (SSR) to read the token for RSC calls.
 * It is NOT httpOnly so Next.js middleware/server actions can read it via cookies().
 *
 * domain: '.rapto.cloud' in production ensures both app.rapto.cloud and api.rapto.cloud
 *         can read the cookie (same root domain).
 */
const ACCESS_COOKIE_OPTIONS: Cookies.CookieAttributes = {
  path: '/',
  secure: isProd,
  sameSite: isProd ? 'None' : 'Lax',
  expires: 1 / 96, // ~15 minutes (matches JWT expiry)
  ...(isProd ? { domain: '.rapto.cloud' } : {}),
};

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

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
    }),

  setAccessToken: (token) => {
    if (token) {
      Cookies.set('rapto_access', token, ACCESS_COOKIE_OPTIONS);
    } else {
      Cookies.remove('rapto_access', {
        path: '/',
        ...(isProd ? { domain: '.rapto.cloud' } : {}),
      });
    }
    set({ accessToken: token });
  },

  clearAuth: () => {
    Cookies.remove('rapto_access', {
      path: '/',
      ...(isProd ? { domain: '.rapto.cloud' } : {}),
    });
    set({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      isSessionExpired: false,
    });
  },

  setLoading: (isLoading) => set({ isLoading }),

  setSessionExpired: (expired) =>
    set({
      isSessionExpired: expired,
    }),
}));
