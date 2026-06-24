import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/features/auth/store/auth.store';

// Set up base Axios instance pointing to the Express Backend API
export const api = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/v1`,
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

// Queue system to handle simultaneous 401 failures during token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string | PromiseLike<string>) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

// Response interceptor to intercept 401s and attempt silent refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If response is not 401 or has already been retried once, reject immediately
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Refresh already in progress. Queue this request's resolution.
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    // Set retry flag to prevent infinite loops
    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Call BFF refresh proxy route (relative path to Next.js BFF server)
      // Note: we use direct axios here to avoid baseURL pointing to backend port 5000
      const response = await axios.post('/api/v1/auth/refresh', {}, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const { accessToken } = response.data;
      
      // Update store
      useAuthStore.getState().setAccessToken(accessToken);
      
      // Process queued requests
      processQueue(null, accessToken);

      // Retry original request with new token
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      // Refresh failed (refresh token expired or invalid)
      processQueue(refreshError, null);
      useAuthStore.getState().clearAuth();

      // Trigger the Session Expired Modal
      useAuthStore.getState().setSessionExpired(true);

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
