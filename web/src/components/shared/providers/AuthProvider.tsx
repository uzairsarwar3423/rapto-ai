"use client";

import { useEffect, ReactNode } from 'react';
import axios from 'axios';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { api } from '@/lib/api/client';
import { FullPageSpinner } from '../feedback/FullPageSpinner';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, setAccessToken, setUser, clearAuth, setLoading } = useAuthStore();

  // Effect 1: Mount silent refresh check (runs on initial load / F5 refresh)
  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        // Step 1: Attempt Next.js BFF proxy refresh route
        const response = await axios.post('/api/v1/auth/refresh', {}, {
          withCredentials: true,
          headers: { 'Content-Type': 'application/json' },
        });

        if (isMounted && response.status === 200 && response.data?.accessToken) {
          const { accessToken, user } = response.data;
          setAccessToken(accessToken);
          if (user) setUser(user);
          return;
        }
      } catch (bffError) {
        // Step 2: Fallback to direct Express API refresh endpoint (cross-subdomain with credentials)
        try {
          const directRes = await api.post('/auth/refresh');
          if (isMounted && directRes.data?.data?.accessToken) {
            const { accessToken, user } = directRes.data.data;
            setAccessToken(accessToken);
            if (user) setUser(user);
            return;
          }
        } catch (directError) {
          if (isMounted) {
            clearAuth();
          }
        }
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
  }, [setAccessToken, setUser, clearAuth, setLoading]);

  // Effect 2: Proactive refresh (Every 13 minutes to prevent access token expiry)
  useEffect(() => {
    if (!isAuthenticated) return;

    const intervalId = setInterval(async () => {
      try {
        const response = await axios.post('/api/v1/auth/refresh', {}, {
          withCredentials: true,
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (response.status === 200 && response.data?.accessToken) {
          const { accessToken } = response.data;
          setAccessToken(accessToken);
        }
      } catch (err) {
        try {
          const directRes = await api.post('/auth/refresh');
          if (directRes.data?.data?.accessToken) {
            setAccessToken(directRes.data.data.accessToken);
            return;
          }
        } catch (directErr) {
          clearAuth();
          if (typeof window !== 'undefined') {
            window.location.href = '/login?reason=session_expired';
          }
        }
      }
    }, 13 * 60 * 1000); // 13 minutes

    return () => clearInterval(intervalId);
  }, [isAuthenticated, setAccessToken, clearAuth]);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  return <>{children}</>;
}
