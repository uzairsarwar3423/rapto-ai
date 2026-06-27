"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useChangePassword } from '../hooks/useChangePassword';
import { PasswordStrengthBar } from './PasswordStrengthBar';
import { useSaveState } from '@/shared/hooks/useSaveState';
import { SaveStateIndicator } from '@/shared/components/feedback/SaveStateIndicator';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "New passwords do not match",
  path: ["confirmPassword"],
});

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const changePasswordMutation = useChangePassword();
  const { state: saveState, run } = useSaveState();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onBlur',
  });

  const newPasswordVal = watch('newPassword') || '';

  const onSubmit = (data: ChangePasswordFormData) => {
    setErrorMessage(null);
    run(async () => {
      await changePasswordMutation.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      reset();
    }).catch((err: any) => {
      const msg = err.response?.data?.error?.message || 'Failed to change password. Please verify current password.';
      setErrorMessage(msg);
    });
  };

  return (
    <div className="max-w-md space-y-6">
      {errorMessage && (
        <div className="flex gap-3 rounded-xl p-4 text-sm bg-error-subtle/30 border border-error/20 text-error" role="alert">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{errorMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Current Password */}
        <div className="space-y-1.5">
          <label htmlFor="current-password" className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Current Password
          </label>
          <div className="relative">
            <input
              id="current-password"
              type={showCurrent ? 'text' : 'password'}
              {...register('currentPassword')}
              aria-describedby={errors.currentPassword ? 'current-password-error' : undefined}
              className={`w-full rounded-xl border bg-background pl-4 pr-11 py-2.5 text-sm text-foreground shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${
                errors.currentPassword ? 'border-error' : 'border-border'
              }`}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground focus:outline-none cursor-pointer"
              aria-label={showCurrent ? 'Hide password' : 'Show password'}
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.currentPassword && (
            <p id="current-password-error" className="text-xs text-error font-medium flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> {errors.currentPassword.message}
            </p>
          )}
        </div>

        {/* New Password */}
        <div className="space-y-1.5">
          <label htmlFor="new-password" className="text-xs font-semibold text-foreground uppercase tracking-wider">
            New Password
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showNew ? 'text' : 'password'}
              {...register('newPassword')}
              aria-describedby={errors.newPassword ? 'new-password-error' : undefined}
              className={`w-full rounded-xl border bg-background pl-4 pr-11 py-2.5 text-sm text-foreground shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${
                errors.newPassword ? 'border-error' : 'border-border'
              }`}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground focus:outline-none cursor-pointer"
              aria-label={showNew ? 'Hide password' : 'Show password'}
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.newPassword && (
            <p id="new-password-error" className="text-xs text-error font-medium flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> {errors.newPassword.message}
            </p>
          )}
          {/* Day 9 Password Strength Bar Integration */}
          <PasswordStrengthBar password={newPasswordVal} />
        </div>

        {/* Confirm New Password */}
        <div className="space-y-1.5">
          <label htmlFor="confirm-password" className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Confirm New Password
          </label>
          <div className="relative">
            <input
              id="confirm-password"
              type={showConfirm ? 'text' : 'password'}
              {...register('confirmPassword')}
              aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
              className={`w-full rounded-xl border bg-background pl-4 pr-11 py-2.5 text-sm text-foreground shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${
                errors.confirmPassword ? 'border-error' : 'border-border'
              }`}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground focus:outline-none cursor-pointer"
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p id="confirm-password-error" className="text-xs text-error font-medium flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <div className="border-t border-border pt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={saveState === 'saving'}
            className="flex items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-brand transition-all hover:bg-brand-mid focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:bg-muted-subtle disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
          >
            Update password
          </button>
          
          <SaveStateIndicator state={saveState} />
        </div>
      </form>
    </div>
  );
}
