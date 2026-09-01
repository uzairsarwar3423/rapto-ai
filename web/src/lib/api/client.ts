import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { executeTokenRefresh } from '@/features/auth/utils/auth-refresh';
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
    const token = useAuthStore.getState().accessToken || (typeof window !== 'undefined' ? Cookies.get('rapto_access') : null);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — intercept 401s and attempt a silent token refresh via singleton coordinator
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
      return Promise.reject(error);
    }

    // Avoid infinite retry loops on a single request
    if (originalRequest?._retry) {
      return Promise.reject(error);
    }

    if (originalRequest) {
      originalRequest._retry = true;
    }

    try {
      const result = await executeTokenRefresh();

      if ('accessToken' in result && result.accessToken) {
        if (originalRequest) {
          originalRequest.headers.Authorization = `Bearer ${result.accessToken}`;
          return api(originalRequest);
        }
      }

      return Promise.reject(error);
    } catch (refreshErr) {
      return Promise.reject(refreshErr);
    }
  }
);
