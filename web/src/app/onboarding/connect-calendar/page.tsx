"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useOnboarding } from "@/features/onboarding/hooks/useOnboarding";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { Calendar, Check, AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";

function ConnectCalendarContent() {
  const { completeOnboarding, isCompleting } = useOnboarding();
  const accessToken = useAuthStore((state) => state.accessToken);

  const searchParams = useSearchParams();
  const isConnected = searchParams.get("connected") === "true";
  const errorParam = searchParams.get("error");

  const handleConnect = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    // Redirect to backend auth initiator with token query param
    window.location.href = `${apiUrl}/api/v1/auth/google-calendar?token=${accessToken}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div className="space-y-2 text-center md:text-left">
        <div className="mx-auto md:mx-0 h-10 w-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center mb-2">
          <Calendar className="h-5 w-5" />
        </div>
        <h1 className="text-2xl onboarding-heading font-bold text-foreground">
          Sync your calendar
        </h1>
        <p className="text-sm text-muted">
          Connect your Google Calendar to automatically invite Vocaply to meetings and sync action items with deadlines.
        </p>
      </div>

      <div className="border border-border/60 bg-surface/30 rounded-2xl p-6 space-y-6">
        {isConnected ? (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-brand/10 text-brand flex items-center justify-center animate-pulse">
              <Check className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Google Calendar Connected</h3>
              <p className="text-xs text-muted">Vocaply will now track and sync your calendar events.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {errorParam && (
              <div className="p-3.5 rounded-xl bg-error-subtle border border-error/20 text-xs text-error flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {errorParam === "oauth_denied"
                    ? "Calendar access was denied. Please accept permissions to sync."
                    : "Connection failed. Please try again."}
                </span>
              </div>
            )}

            <button
              onClick={handleConnect}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-border bg-surface-2 hover:bg-surface py-3.5 text-sm font-semibold text-foreground transition-all duration-200 active:scale-[0.98] hover:border-brand/40 hover:text-brand cursor-pointer"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" width="24" height="24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.9h6.69c-.29 1.5-.1.14-.3.14-1.14 1.9-3.23 3.14-5.39 3.14a8.03 8.03 0 0 1-7.66-5.83 8.14 8.14 0 0 1 0-4.5 8.03 8.03 0 0 1 7.66-5.83c2.1 0 4 .77 5.5 2.03l2.9-2.9C19.745 1.84 16.035.9 12 .9a11.1 11.1 0 0 0-11.1 11.1 11.1 11.1 0 0 0 11.1 11.1c5.73 0 10.9-4.12 11.745-10.83z"
                />
              </svg>
              <span>Connect Google Calendar</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <button
          onClick={() => completeOnboarding()}
          disabled={isCompleting}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-brand-mid hover:shadow-brand active:scale-[0.98] disabled:opacity-50"
        >
          {isCompleting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Finishing Setup...</span>
            </>
          ) : isConnected ? (
            <span>Finish Setup</span>
          ) : (
            <span>Finish & Skip Sync</span>
          )}
        </button>
        <Link
          href="/onboarding/invite-team"
          className="w-full py-3.5 text-center text-xs font-semibold text-muted hover:text-foreground hover:underline transition duration-150"
        >
          Back to previous step
        </Link>
      </div>
    </div>
  );
}

export default function ConnectCalendarPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    }>
      <ConnectCalendarContent />
    </Suspense>
  );
}
