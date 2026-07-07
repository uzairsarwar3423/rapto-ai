import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { RegisterForm } from '@/features/auth/components/RegisterForm';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up — Rapto',
  description: 'Create your Rapto account and start tracking meeting commitments with AI accountability.',
};

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Sign up in seconds to get started"
    >
      {/* Suspense required because RegisterForm uses useSearchParams() */}
      <Suspense
        fallback={
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
          </div>
        }
      >
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}
