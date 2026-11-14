"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useLogin } from '../hooks/useLogin';
import { OAuthButton } from './OAuthButton';
import { itemVariants } from '@/components/ui/auth-12';
import axios from 'axios';
import { getPublicApiUrl } from '@/lib/api/config';

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
        const apiError = error.response?.data?.error;
        if (apiError) {
          setErrorCode(apiError.code);
          setErrorMessage(apiError.message);

          if (apiError.code === 'RATE_LIMITED' || apiError.message.includes('locked')) {
            const match = apiError.message.match(/(\d+)\s+minutes/);
            if (match) {
              setLockedTimeLeft(parseInt(match[1], 10));
            } else {
              setLockedTimeLeft(15);
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
      const backendUrl = getPublicApiUrl();
      await axios.post(`${backendUrl}/api/v1/auth/resend-verification`, { email });
      setResendStatus('success');
    } catch {
      setResendStatus('error');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Contextual Banner Alerts */}
      {errorMessage && (
        <motion.div
          variants={itemVariants}
          className={`flex gap-3 rounded-xl p-4 text-sm ${
            errorCode === 'RATE_LIMITED' || lockedTimeLeft !== null
              ? 'bg-error-subtle/40 border border-error/30 text-error'
              : errorCode === 'EMAIL_NOT_VERIFIED'
              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400'
              : 'bg-error-subtle/40 border border-error/30 text-error'
          }`}
          role="alert"
        >
          {errorCode === 'EMAIL_NOT_VERIFIED' ? (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <div className="flex-1 space-y-1">
            <p className="font-medium text-[14px]">{errorMessage}</p>
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
        </motion.div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {/* Email */}
        <motion.div variants={itemVariants} className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[13px] font-medium tracking-[-0.003em] text-ink">
            Email or username
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register('email')}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className="auth-input"
            placeholder="alex.costa@example.com"
          />
          {errors.email && (
            <p id="email-error" className="text-xs text-error font-medium flex items-center gap-1 mt-0.5">
              <AlertCircle className="h-3.5 w-3.5" /> {errors.email.message}
            </p>
          )}
        </motion.div>

        {/* Password */}
        <motion.div variants={itemVariants} className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-[13px] font-medium tracking-[-0.003em] text-ink">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              {...register('password')}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className="auth-input pr-11"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center rounded-r-[10px] pr-3.5 text-ink-3 transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <HugeiconsIcon icon={showPassword ? ViewIcon : ViewOffIcon} className="size-[18px]" />
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="text-xs text-error font-medium flex items-center gap-1 mt-0.5">
              <AlertCircle className="h-3.5 w-3.5" /> {errors.password.message}
            </p>
          )}
        </motion.div>

        {/* Checkbox & Forgot Password */}
        <motion.div variants={itemVariants} className="flex items-center justify-between mt-0.5">
          <div className="flex items-center gap-2.5">
            <input
              id="remember"
              type="checkbox"
              className="size-4 cursor-pointer rounded-[5px] accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
            <label htmlFor="remember" className="cursor-pointer select-none text-[13px] text-ink-2">
              Keep me signed in
            </label>
          </div>
          <Link
            href="/forgot-password"
            className="text-[13px] font-medium text-ink underline decoration-ink/25 underline-offset-[5px] transition-colors hover:decoration-ink"
          >
            Forgot password?
          </Link>
        </motion.div>

        {/* Submit Button */}
        <motion.div variants={itemVariants} className="mt-2">
          <button
            type="submit"
            disabled={isPending || lockedTimeLeft !== null}
            aria-busy={isPending}
            className="btn-ink-grain w-full"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Signing in…</span>
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </motion.div>
      </form>

      {/* Divider + Google OAuth Button */}
      <motion.div variants={itemVariants} className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">or</span>
        <span className="h-px flex-1 bg-hairline" />
      </motion.div>
      <motion.div variants={itemVariants}>
        <OAuthButton inviteToken={inviteToken} />
      </motion.div>

      {/* Footer link to Register */}
      <motion.div variants={itemVariants} className="mt-4 text-center text-[13px] text-ink-2">
        Haven&apos;t joined yet?{' '}
        <Link
          href={redirectParam ? `/register?redirect=${encodeURIComponent(redirectParam)}` : '/register'}
          className="font-medium text-ink underline decoration-ink/25 underline-offset-[5px] transition-colors hover:decoration-ink"
        >
          Sign up
        </Link>
      </motion.div>
    </div>
  );
}
