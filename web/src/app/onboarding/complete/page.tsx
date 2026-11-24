"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { useOnboarding } from "@/features/onboarding/hooks/useOnboarding";
import { Button } from "@/components/ui/button";

/**
 * Final step: persist onboarding completion, then go straight to the dashboard.
 * The dashboard route is prefetched while the save is in flight, so the redirect is
 * immediate once the server confirms. Auth is guaranteed by the onboarding layout.
 */
export default function OnboardingCompletePage() {
  const router = useRouter();
  const { completeOnboarding } = useOnboarding();
  const [status, setStatus] = useState<"saving" | "error">("saving");
  const startedRef = useRef(false);

  const finish = useCallback(async () => {
    setStatus("saving");
    try {
      // Already persisted (e.g. a refresh on this page) — nothing left to save.
      if (!useAuthStore.getState().user?.onboardingCompleted) {
        await completeOnboarding();
      }
      router.replace("/dashboard");
    } catch {
      setStatus("error");
    }
  }, [completeOnboarding, router]);

  useEffect(() => {
    router.prefetch("/dashboard");
    if (startedRef.current) return; // StrictMode re-runs effects; save once
    startedRef.current = true;
    void finish();
  }, [router, finish]);

  if (status === "error") {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-10 select-none" role="alert">
        <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
          <AlertCircle className="h-5 w-5 text-foreground" />
        </div>
        <div className="space-y-1">
          <h1 className="font-heading text-base font-semibold tracking-tight text-foreground">
            We couldn&apos;t finish setting up
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
            Your team and invites are saved. Check your connection and try again.
          </p>
        </div>
        <Button variant="ink" onClick={finish} className="h-10 px-5 text-xs font-medium min-w-[120px]">
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center gap-4 py-10 select-none" aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="font-heading text-base font-semibold tracking-tight text-foreground">
          Your workspace is ready
        </h1>
        <p className="text-xs text-muted-foreground">Taking you to your dashboard…</p>
      </div>
    </div>
  );
}
