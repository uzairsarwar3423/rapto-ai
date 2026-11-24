"use client";

import React, { Suspense } from "react";
import { useConnectCalendarStep } from "@/features/onboarding/hooks/useConnectCalendarStep";
import { useStepNavigation } from "@/features/onboarding/hooks/useStepNavigation";
import { ONBOARDING_COMPLETE_PATH } from "@/features/onboarding/data/onboarding-steps.config";
import { OnboardingStepShell } from "@/features/onboarding/components/OnboardingStepShell";
import { OnboardingStepFooter } from "@/features/onboarding/components/OnboardingStepFooter";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import Link from "next/link";

function ConnectCalendarContent() {
  const { goNext: handleFinish, isNavigating: isRedirectingFromFinish } =
    useStepNavigation(ONBOARDING_COMPLETE_PATH);

  const {
    isConfigured,
    isLoadingConfig,
    isConnecting,
    isConnected,
    oauthError,
    handleConnect,
  } = useConnectCalendarStep(handleFinish);

  const getButtonText = () => {
    if (isRedirectingFromFinish) return "Finishing…";
    return isConnected ? "Finish Setup →" : "Finish & Skip Sync →";
  };

  return (
    <OnboardingStepShell
      title="Sync your calendar"
      description="Connect your Google Calendar to automatically invite Rapto to meetings and sync action items with deadlines."
    >
      <div className="space-y-6">
        {oauthError && (
          <div
            role="alert"
            className="flex items-center gap-2 text-xs font-medium text-foreground bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 select-none"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{oauthError}</span>
          </div>
        )}

        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 bg-zinc-50/30 dark:bg-zinc-900/10">
          {isConnected ? (
            <div className="flex flex-col items-center justify-center py-4 text-center space-y-2 select-none">
              <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800 text-foreground flex items-center justify-center">
                <Check className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-foreground">Google Calendar Connected</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Rapto will now track and sync your calendar events automatically.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-full block">
                      <Button
                        type="button"
                        onClick={handleConnect}
                        disabled={!isConfigured || isConnecting || isLoadingConfig}
                        className="w-full flex items-center justify-center gap-2 h-10 border border-zinc-200 bg-white hover:bg-zinc-50 text-foreground text-xs font-medium dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                      >
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" width="24" height="24">
                          <path
                            fill="#4285F4"
                            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.9h6.69c-.29 1.5-.1.14-.3.14-1.14 1.9-3.23 3.14-5.39 3.14a8.03 8.03 0 0 1-7.66-5.83 8.14 8.14 0 0 1 0-4.5 8.03 8.03 0 0 1 7.66-5.83c2.1 0 4 .77 5.5 2.03l2.9-2.9C19.745 1.84 16.035.9 12 .9a11.1 11.1 0 0 0-11.1 11.1 11.1 11.1 0 0 0 11.1 11.1c5.73 0 10.9-4.12 11.745-10.83z"
                          />
                        </svg>
                        <span>{isConnecting ? "Redirecting…" : "Connect Google Calendar"}</span>
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!isConfigured && (
                    <TooltipContent>
                      Calendar connect isn&apos;t configured in this environment
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>

        <OnboardingStepFooter>
          <Link
            href="/onboarding/invite-team"
            className="text-xs font-sans text-muted-foreground hover:text-foreground hover:underline font-medium h-9 flex items-center"
          >
            Back
          </Link>
          <Button
            variant="ink"
            onClick={handleFinish}
            aria-busy={isRedirectingFromFinish}
            disabled={isRedirectingFromFinish}
            className="h-10 px-5 text-xs font-medium min-w-[140px]"
          >
            {getButtonText()}
          </Button>
        </OnboardingStepFooter>
      </div>
    </OnboardingStepShell>
  );
}

export default function ConnectCalendarPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    }>
      <ConnectCalendarContent />
    </Suspense>
  );
}
