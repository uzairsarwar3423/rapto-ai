import { create } from 'zustand';
import Cookies from 'js-cookie';
import { User } from '../types/auth.types';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Cookie options for the short-lived access token cookie.
 * Domain: '.rapto.cloud' in production ensures both app.rapto.cloud and api.rapto.cloud
 * can read the cookie (same root domain).
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

const getInitialAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return Cookies.get('rapto_access') || null;
};

const initialToken = getInitialAccessToken();

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: initialToken,
  user: null,
  isAuthenticated: !!initialToken,
  isLoading: true, // Remains true during initial hydration check
  isSessionExpired: false,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!(user || get().accessToken),
    }),

  setAccessToken: (token) => {
    if (token) {
      Cookies.set('rapto_access', token, ACCESS_COOKIE_OPTIONS);
    } else {
      Cookies.remove('rapto_access', { path: '/' });
      if (isProd) {
        Cookies.remove('rapto_access', { path: '/', domain: '.rapto.cloud' });
      }
    }
    set({
      accessToken: token,
      isAuthenticated: !!(token || get().user),
    });
  },

  clearAuth: () => {
    Cookies.remove('rapto_access', { path: '/' });
    if (isProd) {
      Cookies.remove('rapto_access', { path: '/', domain: '.rapto.cloud' });
    }
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
