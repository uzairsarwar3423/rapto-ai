"use client";

import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Set a new password">
      <Suspense fallback={
        <div className="text-center py-6">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-brand" />
          <p className="mt-2 text-xs text-muted">Loading reset page...</p>
        </div>
      }>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
