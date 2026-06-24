"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Eye, EyeOff, Loader2, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLogin } from '../hooks/useLogin';
import { OAuthButton } from './OAuthButton';
import axios from 'axios';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [lockedTimeLeft, setLockedTimeLeft] = useState<number | null>(null);
  const [resendStatus, setResendStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const searchParams = useSearchParams();

  // Extract invite token from redirect param: redirect=/invite/<token>
  const redirectParam = searchParams.get('redirect') ?? '';
  const inviteTokenMatch = redirectParam.match(/^\/invite\/([^/?#]+)/);
  const inviteToken = inviteTokenMatch ? inviteTokenMatch[1] : undefined;

  const { mutate: login, isPending } = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
  });

  const onSubmit = (data: LoginFormData) => {
    setErrorMessage(null);
    setErrorCode(null);
    setLockedTimeLeft(null);

    login(data, {
      onError: (error: any) => {
        // Parse error response
        const apiError = error.response?.data?.error;
        if (apiError) {
          setErrorCode(apiError.code);
          setErrorMessage(apiError.message);

          // Handle rate limit/lockout
          if (apiError.code === 'RATE_LIMITED' || apiError.message.includes('locked')) {
            // Extract minutes from message if available
            const match = apiError.message.match(/(\d+)\s+minutes/);
            if (match) {
              setLockedTimeLeft(parseInt(match[1], 10));
            } else {
              setLockedTimeLeft(15); // default fallback
            }
          }
        } else {
          setErrorMessage(error.message || 'An unexpected error occurred. Please try again.');
        }
      },
    });
  };

  const handleResendVerification = async () => {
    const email = getValues('email');
    if (!email) {
      setErrorMessage('Please enter your email address first.');
      return;
    }

    setResendStatus('loading');
    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      await axios.post(`${backendUrl}/api/v1/auth/resend-verification`, { email });
      setResendStatus('success');
    } catch (err: any) {
      setResendStatus('error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Google Sign In */}
      <OAuthButton inviteToken={inviteToken} />

      {/* Or Divider */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border"></div>
        </div>
        <span className="relative bg-surface-2 px-3 text-xs uppercase text-muted">
          or
        </span>
      </div>

      {/* Contextual Banner Alerts */}
      {errorMessage && (
        <div
          className={`flex gap-3 rounded-xl p-4 text-sm ${
            errorCode === 'RATE_LIMITED' || lockedTimeLeft !== null
              ? 'bg-error-subtle/30 border border-error/20 text-error'
              : errorCode === 'EMAIL_NOT_VERIFIED'
              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500'
              : 'bg-error-subtle/30 border border-error/20 text-error'
          }`}
          role="alert"
        >
          {errorCode === 'EMAIL_NOT_VERIFIED' ? (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <div className="flex-1 space-y-1">
            <p className="font-medium">{errorMessage}</p>
            {errorCode === 'EMAIL_NOT_VERIFIED' && (
              <div className="mt-2 text-xs">
                {resendStatus === 'idle' && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    className="font-semibold underline hover:opacity-80 focus:outline-none"
                  >
                    Resend verification email
                  </button>
                )}
                {resendStatus === 'loading' && (
                  <span className="flex items-center gap-1 font-semibold">
                    <Loader2 className="h-3 w-3 animate-spin" /> Sending...
                  </span>
                )}
                {resendStatus === 'success' && (
                  <span className="flex items-center gap-1 font-semibold text-brand">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Verification link sent! Check your inbox.
                  </span>
                )}
                {resendStatus === 'error' && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    className="font-semibold text-error underline hover:opacity-80 focus:outline-none"
                  >
                    Failed to send. Click to try again.
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register('email')}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className={`w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${
              errors.email ? 'border-error' : 'border-border'
            }`}
            placeholder="you@example.com"
          />
          {errors.email && (
            <p id="email-error" className="text-xs text-error font-medium flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-brand hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              {...register('password')}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className={`w-full rounded-xl border bg-background pl-4 pr-11 py-2.5 text-sm text-foreground shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${
                errors.password ? 'border-error' : 'border-border'
              }`}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground focus:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="text-xs text-error font-medium flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> {errors.password.message}
            </p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isPending || lockedTimeLeft !== null}
          className="w-full flex items-center justify-center rounded-xl bg-brand py-3 text-sm font-semibold text-white shadow-brand transition-all hover:bg-brand-mid focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:bg-muted-subtle disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Signing in...
            </span>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <p className="text-center text-xs text-muted mt-4">
        Don't have an account?{' '}
        <Link
          href={redirectParam ? `/register?redirect=${encodeURIComponent(redirectParam)}` : '/register'}
          className="font-semibold text-brand hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
