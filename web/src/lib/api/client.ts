import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { authSync } from '@/features/auth/utils/auth-events';
import { getPublicApiUrl } from './config';
import { logger } from '@/lib/utils/logger';

// Base Axios instance pointing to the Express Backend API
export const api = axios.create({
  baseURL: `${getPublicApiUrl()}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Interceptor to attach accessToken from Zustand memory store / readable cookie
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Queued 401 refresh handling ───────────────────────────────────────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (reason?: any) => void;
}> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

// Response interceptor — intercept 401s and attempt a silent token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Don't handle non-401 errors
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Check offline status — if user is offline, reject without blowing away session
    if (typeof window !== 'undefined' && !navigator.onLine) {
      logger.warn('[API] Request failed while offline — preserving auth state');
      return Promise.reject(error);
    }

    // Guard: Don't try to refresh if the 401 came FROM the refresh endpoint itself
    if (originalRequest?.url?.includes('/auth/refresh')) {
      logger.warn('[API] Refresh endpoint returned 401 — clearing session');
      useAuthStore.getState().clearAuth();
      useAuthStore.getState().setSessionExpired(true);
      authSync.emit('SESSION_EXPIRED');
      return Promise.reject(error);
    }

    // Avoid infinite retry loops on a single request
    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    // If a refresh is already in-flight, queue this request
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Call Next.js BFF refresh proxy
      const response = await axios.post(
        '/api/v1/auth/refresh',
        {},
        {
          withCredentials: true,
          headers: { 'Content-Type': 'application/json' },
          timeout: 10_000,
        }
      );

      const { accessToken, user } = response.data;

      if (!accessToken) {
        throw new Error('NO_ACCESS_TOKEN');
      }

      logger.debug('[API] Token refreshed successfully via interceptor');

      // Update local Zustand store
      useAuthStore.getState().setAccessToken(accessToken);
      if (user) {
        useAuthStore.getState().setUser(user);
      }

      // Broadcast token refresh to other open tabs
      authSync.emit('TOKEN_REFRESHED', { accessToken, user });

      // Resume all queued requests with the new token
      processQueue(null, accessToken);

      // Retry original request
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError: any) {
      const is401 = refreshError?.response?.status === 401 || refreshError?.message === 'NO_ACCESS_TOKEN';

      if (is401) {
        logger.error('[API] Refresh token expired/invalid (401) — prompt session re-login');
        processQueue(refreshError, null);
        useAuthStore.getState().clearAuth();
        useAuthStore.getState().setSessionExpired(true);
        authSync.emit('SESSION_EXPIRED');
      } else {
        logger.warn('[API] Refresh request failed due to network/transient error — preserving auth state');
        processQueue(refreshError, null);
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
