"use client";

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../store/auth.store';
import { FullPageSpinner } from '@/components/shared/feedback/FullPageSpinner';
import { SessionExpiredModal } from './SessionExpiredModal';
import { getPostAuthPath } from '@/features/onboarding/data/onboarding-steps.config';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const isSessionExpired = useAuthStore((state) => state.isSessionExpired);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated && !isSessionExpired) {
        const redirectUrl = pathname && pathname !== '/' ? `/login?redirect=${encodeURIComponent(pathname)}` : '/login';
        router.push(redirectUrl);
      } else if (user && !user.onboardingCompleted) {
        const isExemptRoute = pathname.startsWith('/onboarding') || pathname.startsWith('/invite');
        if (!isExemptRoute) {
          router.replace(getPostAuthPath(user));
        }
      }
    }
  }, [isLoading, isAuthenticated, isSessionExpired, user, router, pathname]);

  // If still rehydrating initial session, show full page loading spinner
  if (isLoading) {
    return <FullPageSpinner />;
  }

  const isOnboardingRoute = pathname.startsWith('/onboarding') || pathname.startsWith('/invite');

  // Renders children if authenticated & onboarding is complete, or if session expired modal is active
  if ((isAuthenticated && user && user.teamId && user.onboardingCompleted) || isSessionExpired) {
    return (
      <>
        {children}
        <SessionExpiredModal />
      </>
    );
  }

  // If authenticated but onboarding pending, only allow onboarding/invite routes
  if (isAuthenticated && user && !user.onboardingCompleted && isOnboardingRoute) {
    return (
      <>
        {children}
        <SessionExpiredModal />
      </>
    );
  }

  return (
    <>
      <FullPageSpinner />
      <SessionExpiredModal />
    </>
  );
}
