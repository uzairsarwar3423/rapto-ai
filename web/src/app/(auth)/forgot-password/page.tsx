"use client";

import React from 'react';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we'll send you a password reset link"
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
