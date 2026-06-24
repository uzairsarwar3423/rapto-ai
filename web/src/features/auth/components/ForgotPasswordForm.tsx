"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { authApi } from '@/features/auth/api/auth.api';

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onBlur',
  });

  const emailValue = watch('email');

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsPending(true);
    setErrorMessage(null);

    try {
      await authApi.forgotPassword(data.email);
      setIsSuccess(true);
    } catch (err: any) {
      const apiError = err.response?.data?.error;
      setErrorMessage(apiError?.message || err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg auth-heading font-semibold text-foreground">
            Check your email
          </h2>
          <p className="text-sm text-muted">
            If an account exists for <span className="font-semibold text-foreground">{emailValue}</span>, we have sent a password reset link.
          </p>
        </div>
        <div className="pt-4">
          <Link
            href="/login"
            className="text-sm font-semibold text-brand hover:underline"
          >
            Back to login
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
          <p className="font-medium">{errorMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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

        <button
          type="submit"
          disabled={isPending}
          className="w-full flex items-center justify-center rounded-xl bg-brand py-3 text-sm font-semibold text-white shadow-brand transition-all hover:bg-brand-mid focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:bg-muted-subtle disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Sending link...
            </span>
          ) : (
            'Send reset link'
          )}
        </button>
      </form>

      <p className="text-center text-xs text-muted">
        Remembered your password?{' '}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
