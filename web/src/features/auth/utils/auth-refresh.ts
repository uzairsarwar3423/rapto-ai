import axios from 'axios';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { authSync } from '@/features/auth/utils/auth-events';
import { logger } from '@/lib/utils/logger';
import { getPublicApiUrl } from '@/lib/api/config';

interface RefreshSuccessResult {
  accessToken: string;
  user: any;
}

interface RefreshErrorResult {
  error: true;
  is401: boolean;
}

export type RefreshResult = RefreshSuccessResult | RefreshErrorResult;

/**
 * Fast client-side check to determine if a JWT access token is expired or expiring within bufferSeconds.
 * Safely parses the unencrypted payload without invoking crypto verification.
 */
export function isTokenExpiringSoon(token: string | null, bufferSeconds = 120): boolean {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    if (!payload.exp) return true;
    const expiryMs = payload.exp * 1000;
    const nowMs = Date.now();
    return expiryMs - nowMs <= bufferSeconds * 1000;
  } catch {
    return true;
  }
}

/**
 * Singleton in-flight Promise tracker.
 * Ensures that all concurrent callers (Axios 401 interceptors, AuthProvider timers,
 * visibilitychange listeners, WebSocket re-connects) share the exact same refresh request.
 */
let activeRefreshPromise: Promise<RefreshResult> | null = null;

/**
 * Executes or joins an in-flight silent token refresh.
 * Directly contacts the API host with withCredentials: true so cookies are preserved across tabs and ports.
 */
export async function executeTokenRefresh(): Promise<RefreshResult> {
  // If a refresh is already in flight, reuse it
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async (): Promise<RefreshResult> => {
    // 1. Guard against offline status
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.onLine) {
      logger.warn('[AuthRefresh] Browser is offline — preserving auth state without refresh attempt');
      return { error: true, is401: false };
    }

    const apiUrl = getPublicApiUrl();

    try {
      logger.debug('[AuthRefresh] Sending refresh request...');

      // Dispatch refresh with credentials directly to backend
      let response = await axios.post(
        `${apiUrl}/api/v1/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers: { 'Content-Type': 'application/json' },
          timeout: 10_000,
          validateStatus: () => true,
        }
      );

      // If backend returned 404 (e.g. host difference) try relative Next.js BFF
      if (response.status === 404) {
        response = await axios.post(
          '/api/v1/auth/refresh',
          {},
          {
            withCredentials: true,
            headers: { 'Content-Type': 'application/json' },
            timeout: 10_000,
            validateStatus: () => true,
          }
        );
      }

      const accessToken = response.data?.data?.accessToken || response.data?.accessToken;

      if (response.status === 200 && accessToken) {
        let user = response.data?.data?.user || response.data?.user || null;

        // If user object not included in refresh response, fetch via getMe()
        if (!user) {
          try {
            const meRes = await axios.get(`${apiUrl}/api/v1/auth/me`, {
              headers: { Authorization: `Bearer ${accessToken}` },
              timeout: 5000,
            });
            user = meRes.data?.data?.user || null;
          } catch {}
        }

        // Atomically update memory store and cookie
        useAuthStore.getState().setAccessToken(accessToken);
        if (user) {
          useAuthStore.getState().setUser(user);
        }
        useAuthStore.getState().setSessionExpired(false);

        // Notify other open browser tabs
        authSync.emit('TOKEN_REFRESHED', { accessToken, user });

        logger.info('[AuthRefresh] Token refreshed successfully');
        return { accessToken, user };
      }

      const is401 = response.status === 401;
      const errorCode = response.data?.error?.code;

      if (is401) {
        // Only trigger session expiration modal and cross-tab logout broadcast
        // for genuine session expirations (NOT for normal unauthenticated NO_REFRESH_TOKEN)
        if (errorCode === 'REFRESH_TOKEN_EXPIRED' || errorCode === 'INVALID_REFRESH_TOKEN' || errorCode === 'USER_NOT_FOUND') {
          logger.warn('[AuthRefresh] Refresh token expired or revoked — session expired');
          handleSessionExpired();
        } else {
          logger.debug('[AuthRefresh] No active refresh session found');
        }
      }

      return { error: true, is401 };
    } catch (err: any) {
      const status = err?.response?.status;
      const is401 = status === 401;
      const errorCode = err?.response?.data?.error?.code;

      if (is401 && (errorCode === 'REFRESH_TOKEN_EXPIRED' || errorCode === 'INVALID_REFRESH_TOKEN' || errorCode === 'USER_NOT_FOUND')) {
        logger.warn('[AuthRefresh] Server returned 401 during token refresh — session expired');
        handleSessionExpired();
      } else {
        logger.warn('[AuthRefresh] Transient/network error during refresh — preserving session state', err?.message);
      }

      return { error: true, is401 };
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

function handleSessionExpired() {
  const { isAuthenticated, accessToken } = useAuthStore.getState();
  // Only trigger session expired UI if user actually had an active session
  if (isAuthenticated || accessToken) {
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setSessionExpired(true);
    authSync.emit('SESSION_EXPIRED');
  }
}

