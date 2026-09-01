"use client";

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Cookies from 'js-cookie';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { authApi } from '@/features/auth/api/auth.api';
import { authSync } from '@/features/auth/utils/auth-events';
import { executeTokenRefresh, isTokenExpiringSoon } from '@/features/auth/utils/auth-refresh';
import { FullPageSpinner } from '../feedback/FullPageSpinner';
import { logger } from '@/lib/utils/logger';

// Proactively check access token freshness every 2 minutes
const PROACTIVE_CHECK_INTERVAL_MS = 2 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, setAccessToken, setUser, clearAuth, setLoading, setSessionExpired } = useAuthStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Effect 1: Initial App Mount Session Rehydration & Validation
   */
  useEffect(() => {
    let isMounted = true;

    async function initializeAuth() {
      try {
        const existingToken = useAuthStore.getState().accessToken || Cookies.get('rapto_access');

        // Step 1: If access token exists in memory/cookie and is still fresh, attempt getMe()
        if (existingToken && !isTokenExpiringSoon(existingToken, 60)) {
          useAuthStore.getState().setAccessToken(existingToken);
          try {
            const me = await authApi.getMe();
            if (isMounted && me) {
              setUser(me);
              setLoading(false);
              logger.debug('[AuthProvider] Session validated via getMe()');
              return;
            }
          } catch (err: any) {
            logger.debug('[AuthProvider] Access token stale/invalid — proceeding to silent refresh');
          }
        }

        // Step 2: Access token missing or expiring soon — perform silent refresh using HttpOnly refresh cookie
        const result = await executeTokenRefresh();

        if (!isMounted) return;

        if ('accessToken' in result) {
          setAccessToken(result.accessToken);
          if (result.user) setUser(result.user);
          logger.debug('[AuthProvider] Session successfully restored via silent token rotation');
        } else if (result.is401) {
          // Explicit 401 from backend — no valid session
          clearAuth();
          logger.debug('[AuthProvider] No valid session cookie found');
        } else {
          // Network error or offline — leave state intact
          logger.warn('[AuthProvider] Initial refresh encountered network issue — preserving existing auth state');
        }
      } catch (error) {
        logger.error('[AuthProvider] Auth initialization error:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    initializeAuth();

    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Effect 2: Multi-Tab Authentication Synchronization
   */
  useEffect(() => {
    const unsubscribe = authSync.subscribe((event) => {
      logger.debug('[AuthProvider] Cross-tab auth event received:', event.type);

      switch (event.type) {
        case 'LOGIN':
        case 'TOKEN_REFRESHED':
          if (event.accessToken) {
            setAccessToken(event.accessToken);
          }
          if (event.user) {
            setUser(event.user);
          }
          setSessionExpired(false);
          setLoading(false);
          break;

        case 'LOGOUT':
          clearAuth();
          break;

        case 'SESSION_EXPIRED':
          clearAuth();
          setSessionExpired(true);
          break;
      }
    });

    return () => unsubscribe();
  }, [setAccessToken, setUser, clearAuth, setSessionExpired, setLoading]);

  /**
   * Effect 3: Proactive Background Token Refresh Timer
   */
  useEffect(() => {
    if (!isAuthenticated) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }

      const token = useAuthStore.getState().accessToken;
      if (isTokenExpiringSoon(token, 180)) {
        logger.debug('[AuthProvider] Proactive background token refresh for expiring token...');
        await executeTokenRefresh();
      }
    }, PROACTIVE_CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated]);

  /**
   * Effect 4: Window Visibility & Online Re-connection Refresh
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleRecheck = async () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        const token = useAuthStore.getState().accessToken;
        if (isTokenExpiringSoon(token, 120)) {
          logger.debug('[AuthProvider] Tab visible / re-connected with expiring token — refreshing...');
          await executeTokenRefresh();
        }
      }
    };

    document.addEventListener('visibilitychange', handleRecheck);
    window.addEventListener('online', handleRecheck);

    return () => {
      document.removeEventListener('visibilitychange', handleRecheck);
      window.removeEventListener('online', handleRecheck);
    };
  }, [isAuthenticated]);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  return <>{children}</>;
}
