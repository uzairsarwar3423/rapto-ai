import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { getPublicApiUrl } from './config';
import { logger } from '@/lib/utils/logger';

// Set up base Axios instance pointing to the Express Backend API
export const api = axios.create({
  baseURL: `${getPublicApiUrl()}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Interceptor to attach accessToken from Zustand memory store
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
// Prevents concurrent 401s from each triggering their own refresh call.
// All queued requests are resumed or rejected once the single refresh resolves.
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

    // Only handle 401s that haven't been retried yet
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Guard: Don't try to refresh if the 401 came FROM the refresh endpoint itself
    // (avoids an infinite refresh loop)
    if (originalRequest.url?.includes('/auth/refresh')) {
      logger.warn('[API] Refresh endpoint returned 401 — clearing auth state');
      useAuthStore.getState().clearAuth();
      useAuthStore.getState().setSessionExpired(true);
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
      // Always go through the Next.js BFF proxy — it holds the HttpOnly cookie
      // and knows the correct backend URL. We use a plain axios call (not `api`)
      // to avoid the base URL being set to the backend port.
      const response = await axios.post(
        '/api/v1/auth/refresh',
        {},
        {
          withCredentials: true,
          headers: { 'Content-Type': 'application/json' },
          timeout: 10_000,
        }
      );

      const { accessToken } = response.data;

      if (!accessToken) {
        throw new Error('No access token in refresh response');
      }

      logger.debug('[API] Token refreshed successfully via interceptor');

      // Update the Zustand store
      useAuthStore.getState().setAccessToken(accessToken);
      if (response.data.user) {
        useAuthStore.getState().setUser(response.data.user);
      }

      // Resume all queued requests with the new token
      processQueue(null, accessToken);

      // Retry the original request
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      logger.error('[API] Silent refresh failed — showing session expired modal');

      // Drain the queue with an error so those requests reject cleanly
      processQueue(refreshError, null);

      // Clear local auth state
      useAuthStore.getState().clearAuth();

      // Show the "Session Expired" modal instead of hard-redirecting
      useAuthStore.getState().setSessionExpired(true);

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
