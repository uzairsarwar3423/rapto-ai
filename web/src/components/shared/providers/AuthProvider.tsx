"use client";

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import { useAuthStore } from '@/features/auth/store/auth.store';
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
        // Don't retry on network error — the interval will retry next cycle
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
   * Effect 1: Mount silent refresh check.
   * Runs once on initial load (F5 / first render) to bootstrap the auth state
   * from the HttpOnly refresh cookie — avoids any flash of unauthenticated UI.
   */
  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      const result = await silentRefresh();

      if (!isMounted) return;

      if (result) {
        setAccessToken(result.accessToken);
        if (result.user) setUser(result.user);
      } else {
        // No valid refresh token — user is not authenticated
        clearAuth();
      }

      setLoading(false);
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally run only on mount — deps would cause re-runs

  /**
   * Effect 2: Proactive token refresh timer.
   *
   * Key improvements over the old implementation:
   * - Uses document.visibilityState to skip refresh when tab is hidden.
   *   A hidden tab that can't reach the server causes a false "session expired".
   * - Clears and recreates the interval when isAuthenticated changes so we don't
   *   have a stale closure holding old state.
   * - Does NOT call clearAuth() on a single failure — the Axios interceptor in
   *   client.ts handles individual 401 responses. Here we log a warning and let
   *   the next interval cycle retry.
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
        // Single failure is NOT a session expiry — could be a brief network blip.
        // The Axios response interceptor in client.ts will handle the next 401
        // that actually affects a user request and will show the modal then.
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
   * This handles the case where the user wakes up their laptop or switches back
   * to the tab after the access token has expired (>15 min of inactivity).
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
        // If it fails, don't force logout — next API call will 401 and the
        // interceptor queue will handle it gracefully.
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
