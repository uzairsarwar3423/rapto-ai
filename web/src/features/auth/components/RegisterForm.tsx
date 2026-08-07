"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, AlertCircle, Mail } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useRegister } from '../hooks/useRegister';
import { PasswordStrengthBar } from './PasswordStrengthBar';
import { OAuthButton } from './OAuthButton';
import { itemVariants } from '@/components/ui/auth-12';

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

  const { mutate: registerUser, isPending, isSuccess } = useRegister();

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

  // If successfully registered, show the inline check-email state
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
    <div className="flex flex-col gap-5">
      {/* Error Alert */}
      {errorMessage && (
        <motion.div
          variants={itemVariants}
          className="flex gap-3 rounded-xl p-4 text-sm bg-error-subtle/40 border border-error/30 text-error"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium text-[14px]">{errorMessage}</p>
        </motion.div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {/* Name */}
        <motion.div variants={itemVariants} className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-[14px] font-medium text-foreground">
            Full Name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            {...register('name')}
            aria-describedby={errors.name ? 'name-error' : undefined}
            className={`w-full rounded-xl border bg-background px-4 py-3 text-[14px] text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition-colors ${
              errors.name ? 'border-error ring-1 ring-error/50' : 'border-border'
            }`}
            placeholder="Alex Costa"
          />
          {errors.name && (
            <p id="name-error" className="text-xs text-error font-medium flex items-center gap-1 mt-0.5">
              <AlertCircle className="h-3.5 w-3.5" /> {errors.name.message}
            </p>
          )}
        </motion.div>

        {/* Email */}
        <motion.div variants={itemVariants} className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[14px] font-medium text-foreground">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register('email')}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className={`w-full rounded-xl border bg-background px-4 py-3 text-[14px] text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition-colors ${
              errors.email ? 'border-error ring-1 ring-error/50' : 'border-border'
            }`}
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
          <label htmlFor="password" className="text-[14px] font-medium text-foreground">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              {...register('password')}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className={`w-full rounded-xl border bg-background pl-4 pr-11 py-3 text-[14px] font-mono text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition-colors ${
                errors.password ? 'border-error ring-1 ring-error/50' : 'border-border'
              }`}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-foreground transition-colors focus:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <HugeiconsIcon icon={showPassword ? ViewIcon : ViewOffIcon} className="size-5" />
            </button>
          </div>
          <PasswordStrengthBar password={passwordValue} />
          {errors.password && (
            <p id="password-error" className="text-xs text-error font-medium flex items-center gap-1 mt-0.5">
              <AlertCircle className="h-3.5 w-3.5" /> {errors.password.message}
            </p>
          )}
        </motion.div>

        {/* Submit Button */}
        <motion.div variants={itemVariants} className="mt-2">
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-brand py-3 text-[14px] font-medium text-white transition-transform active:scale-[0.98] hover:bg-brand-mid focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-brand"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Creating account...
              </span>
            ) : (
              'Create account'
            )}
          </button>
        </motion.div>
      </form>

      {/* Google OAuth Button */}
      <motion.div variants={itemVariants}>
        <OAuthButton inviteToken={inviteToken} />
      </motion.div>

      {/* Footer Link */}
      <motion.div variants={itemVariants} className="mt-6 text-center text-[14px] text-muted">
        Already have an account?{' '}
        <Link
          href={redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : '/login'}
          className="font-semibold text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-brand hover:decoration-brand"
        >
          Sign in
        </Link>
      </motion.div>
    </div>
  );
}

