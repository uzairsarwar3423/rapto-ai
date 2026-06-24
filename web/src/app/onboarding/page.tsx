"use client";

import React from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useLogout } from '@/features/auth/hooks/useLogout';
import { Sparkles, LogOut, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function OnboardingPage() {
  const { user } = useAuth();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div className="flex justify-center">
        <div className="h-14 w-14 rounded-2xl bg-brand/10 text-brand flex items-center justify-center animate-bounce-slow">
          <Sparkles className="h-7 w-7" />
        </div>
      </div>

      <div className="space-y-3 text-center">
        <h1 className="text-3xl onboarding-heading font-bold tracking-tight text-foreground">
          Welcome to Vocaply, {user?.name || 'User'}!
        </h1>
        <p className="text-sm text-muted max-w-md mx-auto">
          Your account is verified. Let's get your workspace set up in just a few quick steps so you can start tracking meeting commitments automatically.
        </p>
      </div>

      <div className="space-y-4 pt-2">
        <div className="flex items-start gap-3 bg-brand/5 border border-brand/10 rounded-2xl p-4">
          <CheckCircle2 className="h-5 w-5 text-brand shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-brand-dark">Account Verified</h4>
            <p className="text-xs text-muted">You've successfully signed up and verified your credentials.</p>
          </div>
        </div>

        <Link
          href="/onboarding/create-team"
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-brand-mid hover:shadow-brand active:scale-[0.98]"
        >
          <span>{user?.teamId ? "Continue Setup" : "Set Up Team Workspace"}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="pt-2 flex items-center justify-center">
        <button
          onClick={() => logout()}
          disabled={isLoggingOut}
          className="text-xs font-medium text-error hover:underline flex items-center gap-1.5 focus:outline-none cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          {isLoggingOut ? 'Logging out...' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}
