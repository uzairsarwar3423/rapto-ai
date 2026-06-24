"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Eye, EyeOff, Loader2, AlertCircle, Mail } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRegister } from '../hooks/useRegister';
import { PasswordStrengthBar } from './PasswordStrengthBar';
import { OAuthButton } from './OAuthButton';

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const { mutate: registerUser, isPending, isSuccess, data: responseData } = useRegister();

  // Extract invite token from redirect param: redirect=/invite/<token>
  const redirectParam = searchParams.get('redirect') ?? '';
  const inviteTokenMatch = redirectParam.match(/^\/invite\/([^/?#]+)/);
  const inviteToken = inviteTokenMatch ? inviteTokenMatch[1] : undefined;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
  });

  const passwordValue = watch('password');
  const emailValue = watch('email');

  const onSubmit = (data: RegisterFormData) => {
    setErrorMessage(null);
    registerUser(
      { ...data, inviteToken },
      {
        onError: (error: any) => {
          const apiError = error.response?.data?.error;
          if (apiError) {
            setErrorMessage(apiError.message);
          } else {
            setErrorMessage(error.message || 'An unexpected error occurred. Please try again.');
          }
        },
      }
    );
  };

  // If successfully registered, show the inline check-email state (UX decision from plan)
  if (isSuccess) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Mail className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg auth-heading font-semibold text-foreground">
            Check your email
          </h2>
          <p className="text-sm text-muted">
            We sent a verification link to <span className="font-semibold text-foreground">{emailValue}</span>. Please click the link to verify your account.
          </p>
          {inviteToken && (
            <p className="text-xs text-brand font-medium mt-2">
              ✓ Your team invite will be accepted automatically once you verify.
            </p>
          )}
        </div>
        <div className="pt-4">
          <Link
            href={redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : '/login'}
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

      {/* Error Alert */}
      {errorMessage && (
        <div
          className="flex gap-3 rounded-xl p-4 text-sm bg-error-subtle/30 border border-error/20 text-error"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{errorMessage}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Name */}
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Full Name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            {...register('name')}
            aria-describedby={errors.name ? 'name-error' : undefined}
            className={`w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${
              errors.name ? 'border-error' : 'border-border'
            }`}
            placeholder="John Doe"
          />
          {errors.name && (
            <p id="name-error" className="text-xs text-error font-medium flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> {errors.name.message}
            </p>
          )}
        </div>

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
          <label htmlFor="password" className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Password
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

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full flex items-center justify-center rounded-xl bg-brand py-3 text-sm font-semibold text-white shadow-brand transition-all hover:bg-brand-mid focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:bg-muted-subtle disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Creating account...
            </span>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      <p className="text-center text-xs text-muted mt-4">
        Already have an account?{' '}
        <Link
          href={redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : '/login'}
          className="font-semibold text-brand hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
