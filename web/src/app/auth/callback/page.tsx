'use client';

/**
 * /auth/callback — OAuth Token Handoff Page
 *
 * PURPOSE:
 *   This page is the landing point after a successful Google OAuth redirect.
 *   The backend redirects here with:
 *     ?token=<accessToken>&next=<destination>
 *
 *   This page:
 *     1. Reads the access token from the URL param
 *     2. Stores it in the Zustand store + rapto_access cookie (via setAccessToken)
 *     3. Fetches /auth/me to populate the user object in the store
 *     4. Redirects to the `next` destination (dashboard or onboarding)
 *
 * SECURITY:
 *   - The token param is present in the URL for < 1 second (immediate redirect)
 *   - Next.js router.replace() is used (not push) — token never appears in history
 *   - The access token is short-lived (15 min JWT) — exposure window is negligible
 *   - This is the standard OAuth BFF token handoff pattern (used by Auth0, Clerk, etc.)
 *   - The refresh token is already in an httpOnly cookie (never accessible to JS)
 *   - If `token` param is missing, redirect to /login immediately
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { api } from '@/lib/api/client';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { setAccessToken, setUser, setLoading } = useAuthStore();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');

  useEffect(() => {
    async function handleCallback() {
      try {
        // ── 1. Extract token and next destination from URL ─────────────────
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const next  = params.get('next') || '/dashboard';

        if (!token) {
          // No token — something went wrong server-side
          router.replace('/login?error=oauth_failed');
          return;
        }

        // ── 2. Store access token in Zustand + cookie ──────────────────────
        // setAccessToken writes to both Zustand memory and the rapto_access cookie
        // so server components and axios interceptors can both read it.
        setAccessToken(token);

        // ── 3. Hydrate user object ─────────────────────────────────────────
        // The API interceptor will now attach `Bearer <token>` automatically
        // because setAccessToken updated the Zustand store synchronously.
        const meResponse = await api.get<{
          success: boolean;
          data: {
            user: {
              id: string;
              name: string;
              email: string;
              role: string;
              teamId: string | null;
              team: unknown;
              avatarUrl: string | null;
              timezone: string;
              onboardingCompleted: boolean;
            };
          };
        }>('/auth/me');

        const { user } = meResponse.data.data;

        setUser({
          id:                  user.id,
          name:                user.name,
          email:               user.email,
          role:                user.role as any,
          teamId:              user.teamId,
          team:                user.team as any,
          avatarUrl:           user.avatarUrl,
          timezone:            user.timezone,
          onboardingCompleted: user.onboardingCompleted,
        });

        // ── 4. Mark loading complete ───────────────────────────────────────
        setLoading(false);

        // ── 5. Redirect to destination (replaces history — token never in back)
        router.replace(next);
      } catch (err) {
        console.error('[auth/callback] Failed to complete OAuth handoff:', err);
        setStatus('error');
        // Clear any partial auth state
        useAuthStore.getState().clearAuth();
        // Give the user a moment to see the error, then redirect
        setTimeout(() => router.replace('/login?error=oauth_failed'), 1500);
      }
    }

    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render: minimal loading state (this page is visible for < 500ms) ──────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        {status === 'loading' ? (
          <>
            {/* Spinner */}
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground text-sm font-medium">
              Signing you in…
            </p>
          </>
        ) : (
          <>
            {/* Error state */}
            <div className="text-destructive text-2xl">✗</div>
            <p className="text-muted-foreground text-sm">
              Sign-in failed. Redirecting…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
