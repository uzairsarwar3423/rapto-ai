"use client";

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { authApi } from '@/features/auth/api/auth.api';
import { FullPageSpinner } from '../feedback/FullPageSpinner';
import { logger } from '@/lib/utils/logger';

// How often to proactively refresh — every 13 min (access token lasts 15 min)
const PROACTIVE_REFRESH_INTERVAL_MS = 13 * 60 * 1000;

/**
 * Calls the Next.js BFF refresh proxy.
 * Returns { accessToken, user } on success, null on failure.
 */
async function silentRefresh(): Promise<{ accessToken: string; user: any } | null> {
  try {
    const response = await axios.post(
      '/api/v1/auth/refresh',
      {},
      {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json' },
        timeout: 10_000,
      }
    );

    if (response.status === 200 && response.data?.accessToken) {
      return { accessToken: response.data.accessToken, user: response.data.user ?? null };
    }

    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, setAccessToken, setUser, clearAuth, setLoading } = useAuthStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Effect 1: Mount rehydration & session validation check.
   * Scalable Industry-level approach:
   *  1. First try existing valid access token from cookies via authApi.getMe()
   *  2. If expired/401, fallback to silentRefresh() using HttpOnly refresh cookie
   *  3. Preserves dashboard state across hard refreshes (F5 / Ctrl+R)
   */
  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const existingToken = useAuthStore.getState().accessToken || Cookies.get('rapto_access');

        // Step 1: Attempt to restore session using existing access token
        if (existingToken) {
          useAuthStore.getState().setAccessToken(existingToken);
          try {
            const me = await authApi.getMe();
            if (isMounted && me) {
              setUser(me);
              setLoading(false);
              logger.debug('[AuthProvider] Session successfully restored from active access token');
              return;
            }
          } catch {
            logger.debug('[AuthProvider] Access token stale — proceeding to silent refresh');
          }
        }

        // Step 2: Access token missing or stale — attempt silent refresh via HttpOnly refresh cookie
        const result = await silentRefresh();

        if (!isMounted) return;

        if (result) {
          setAccessToken(result.accessToken);
          if (result.user) setUser(result.user);
          logger.debug('[AuthProvider] Session successfully restored via silent token rotation');
        } else {
          // No valid token or refresh cookie — clear auth state
          clearAuth();
        }
      } catch (error) {
        logger.error('[AuthProvider] Rehydration check failed:', error);
        if (isMounted) clearAuth();
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Effect 2: Proactive token refresh timer.
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
      // Skip refresh if tab is hidden — avoid false session expiry on network blips
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        logger.debug('[AuthProvider] Tab hidden — skipping proactive refresh');
        return;
      }

      logger.debug('[AuthProvider] Proactive token refresh...');
      const result = await silentRefresh();

      if (result) {
        setAccessToken(result.accessToken);
        if (result.user) setUser(result.user);
        logger.debug('[AuthProvider] Proactive refresh succeeded');
      } else {
        logger.warn('[AuthProvider] Proactive refresh failed — will retry next cycle');
      }
    }, PROACTIVE_REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated, setAccessToken, setUser]);

  /**
   * Effect 3: Refresh immediately when tab becomes visible again.
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        logger.debug('[AuthProvider] Tab became visible — checking token freshness...');
        const result = await silentRefresh();
        if (result) {
          setAccessToken(result.accessToken);
          if (result.user) setUser(result.user);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthenticated, setAccessToken, setUser]);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  return <>{children}</>;
}
