import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In — Rapto',
  description: 'Sign in to your Rapto account and manage your team\'s meeting accountability.',
};

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your account to continue"
    >
      {/* Suspense required because LoginForm uses useSearchParams() */}
      <Suspense
        fallback={
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
