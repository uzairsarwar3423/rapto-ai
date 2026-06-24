"use client";

import React, { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { PasswordStrengthBar } from '@/features/auth/components/PasswordStrengthBar';
import { authApi } from '@/features/auth/api/auth.api';
import { useAuthStore } from '@/features/auth/store/auth.store';

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const setAccessToken = useAuthStore((state) => state.setAccessToken);
  const setUser = useAuthStore((state) => state.setUser);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onBlur',
  });

  const passwordValue = watch('password');

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!token) {
      setErrorMessage('Reset token is missing. Please request a new link.');
      return;
    }

    setIsPending(true);
    setErrorMessage(null);

    try {
      const result = await authApi.resetPassword({
        token,
        newPassword: data.password,
      });

      // Auto login set
      setAccessToken(result.accessToken);
      setUser(result.user);
      setIsSuccess(true);
    } catch (err: any) {
      const apiError = err.response?.data?.error;
      setErrorMessage(apiError?.message || err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setIsPending(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-error-subtle/30 text-error">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg auth-heading font-semibold text-foreground">
            Missing Reset Token
          </h2>
          <p className="text-sm text-muted">
            The password reset link is invalid. Please request a new one.
          </p>
        </div>
        <div className="pt-4">
          <Link
            href="/forgot-password"
            className="text-sm font-semibold text-brand hover:underline"
          >
            Request new link
          </Link>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="text-center py-6 space-y-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl auth-heading font-bold text-foreground">
            Password Updated!
          </h2>
          <p className="text-sm text-muted">
            Your password has been successfully updated and you are now signed in.
          </p>
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

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div
          className="flex gap-3 rounded-xl p-4 text-sm bg-error-subtle/30 border border-error/20 text-error"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="space-y-1.5 flex-1">
            <p className="font-medium">{errorMessage}</p>
            {(errorMessage.includes('expired') || errorMessage.includes('invalid')) && (
              <p className="text-xs">
                <Link href="/forgot-password" className="underline font-semibold">
                  Request a new link
                </Link>
              </p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* New Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-semibold text-foreground uppercase tracking-wider">
            New Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
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
          <PasswordStrengthBar password={passwordValue} />
          {errors.password && (
            <p id="password-error" className="text-xs text-error font-medium flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> {errors.password.message}
            </p>
          )}
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              {...register('confirmPassword')}
              aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
              className={`w-full rounded-xl border bg-background pl-4 pr-11 py-2.5 text-sm text-foreground shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${
                errors.confirmPassword ? 'border-error' : 'border-border'
              }`}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground focus:outline-none"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p id="confirm-password-error" className="text-xs text-error font-medium flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full flex items-center justify-center rounded-xl bg-brand py-3 text-sm font-semibold text-white shadow-brand transition-all hover:bg-brand-mid focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:bg-muted-subtle disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Updating password...
            </span>
          ) : (
            'Reset password'
          )}
        </button>
      </form>
    </div>
  );
}
