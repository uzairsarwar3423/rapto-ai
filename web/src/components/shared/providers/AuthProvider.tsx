"use client";

import { useEffect, ReactNode } from 'react';
import axios from 'axios';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { FullPageSpinner } from '../feedback/FullPageSpinner';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, setAccessToken, setUser, clearAuth, setLoading } = useAuthStore();

  // Effect 1: Mount silent refresh check
  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const response = await axios.post('/api/v1/auth/refresh', {}, {
          headers: { 'Content-Type': 'application/json' },
        });

        if (isMounted && response.status === 200) {
          const { accessToken, user } = response.data;
          setAccessToken(accessToken);
          setUser(user);
        }
      } catch (err) {
        if (isMounted) {
          clearAuth();
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

  // Effect 2: Proactive refresh (Every 13 minutes)
  useEffect(() => {
    if (!isAuthenticated) return;

    const intervalId = setInterval(async () => {
      try {
        const response = await axios.post('/api/v1/auth/refresh', {}, {
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (response.status === 200) {
          const { accessToken } = response.data;
          setAccessToken(accessToken);
        }
      } catch (err) {
        clearAuth();
        if (typeof window !== 'undefined') {
          window.location.href = '/login?reason=session_expired';
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
