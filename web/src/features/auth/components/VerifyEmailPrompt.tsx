"use client";

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Mail, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { authApi } from '@/features/auth/api/auth.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import axios from 'axios';

// Cache to prevent duplicate verification requests for the same token in React 18 Strict Mode
const verificationPromises: Record<string, Promise<any>> = {};

export function VerifyEmailPrompt() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const setAccessToken = useAuthStore((state) => state.setAccessToken);
  const setUser = useAuthStore((state) => state.setUser);

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [inviteAccepted, setInviteAccepted] = useState(false);

  // Resend state
  const [email, setEmail] = useState('');
  const [resendStatus, setResendStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorCode('TOKEN_MISSING');
      setErrorMessage('Verification token is missing. Please request a new link.');
      return;
    }

    let isMounted = true;

    async function verify() {
      try {
        if (!verificationPromises[token!]) {
          verificationPromises[token!] = authApi.verifyEmail(token!);
        }
        const data = await verificationPromises[token!];
        if (isMounted) {
          setAccessToken(data.accessToken);
          setUser(data.user);
          setInviteAccepted(!!(data as any).inviteAccepted);
          setStatus('success');
        }
      } catch (err: any) {
        if (isMounted) {
          setStatus('error');
          const apiError = err.response?.data?.error;
          if (apiError) {
            setErrorCode(apiError.code);
            setErrorMessage(apiError.message);
          } else {
            setErrorMessage(err.message || 'Verification failed. The token may be invalid or expired.');
          }
        }
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [token, setAccessToken, setUser]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setResendStatus('loading');
    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      await axios.post(`${backendUrl}/api/v1/auth/resend-verification`, { email });
      setResendStatus('success');
    } catch (err) {
      setResendStatus('error');
    }
  };

  if (status === 'loading') {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="flex justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-brand" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg auth-heading font-semibold text-foreground">
            Verifying your email
          </h2>
          <p className="text-sm text-muted">
            Checking your credentials with the server...
          </p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="text-center py-6 space-y-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 animate-bounce">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl auth-heading font-bold text-foreground">
            Email Verified!
          </h2>
          {inviteAccepted ? (
            <p className="text-sm text-muted">
              Your email is verified and you've been added to the team. Let's get started!
            </p>
          ) : (
            <p className="text-sm text-muted">
              Your account is verified and you are now signed in. Let's get started!
            </p>
          )}
        </div>
        <div className="pt-2">
          <Link
            href="/dashboard"
            className="w-full flex items-center justify-center rounded-xl bg-brand py-3 text-sm font-semibold text-white shadow-brand transition-all hover:bg-brand-mid focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-error-subtle/30 text-error">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg auth-heading font-semibold text-foreground">
            {errorCode === 'TOKEN_EXPIRED' ? 'Verification Link Expired' : 'Invalid Verification Link'}
          </h2>
          <p className="text-sm text-muted">
            {errorMessage}
          </p>
        </div>
      </div>

      {/* Resend Verification Form */}
      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase text-foreground tracking-wider">
          Request a new link
        </h3>
        
        {resendStatus === 'success' ? (
          <div className="flex gap-2 text-xs text-brand font-medium items-center p-2 bg-brand/5 rounded-lg border border-brand/10">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Verification email sent successfully! Please check your inbox.</span>
          </div>
        ) : (
          <form onSubmit={handleResend} className="space-y-3">
            <div className="space-y-1">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
              />
            </div>
            <button
              type="submit"
              disabled={resendStatus === 'loading'}
              className="w-full flex items-center justify-center rounded-lg bg-brand py-2 text-xs font-semibold text-white transition-all hover:bg-brand-mid disabled:bg-muted-subtle cursor-pointer"
            >
              {resendStatus === 'loading' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                'Resend link'
              )}
            </button>
            {resendStatus === 'error' && (
              <p className="text-[10px] text-error font-medium text-center">
                Failed to send. Please verify your email is correct and try again.
              </p>
            )}
          </form>
        )}
      </div>

      <div className="text-center pt-2">
        <Link
          href="/login"
          className="text-xs font-semibold text-brand hover:underline"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}
