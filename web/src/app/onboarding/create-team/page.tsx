"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateTeamStep } from "@/features/onboarding/hooks/useCreateTeamStep";
import { OnboardingStepShell } from "@/features/onboarding/components/OnboardingStepShell";
import { OnboardingStepFooter } from "@/features/onboarding/components/OnboardingStepFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { AlertCircle, Check, Loader2, X } from "lucide-react";

export default function CreateTeamPage() {
  const router = useRouter();
  const [isExiting, setIsExiting] = useState(false);

  const {
    name,
    setName,
    slug,
    setSlug,
    onSlugBlur,
    slugLocked,
    displayStatus,
    suggestion,
    adjustedFrom,
    error,
    isSubmitting,
    hasTeam,
    canSubmit,
    acceptSuggestion,
    retryCheck,
    handleSubmit,
  } = useCreateTeamStep(() => {
    setIsExiting(true);
    setTimeout(() => {
      router.push("/onboarding/invite-team");
    }, 100);
  });

  return (
    <OnboardingStepShell
      title={hasTeam ? "Update team workspace" : "Create team workspace"}
      description="Your workspace URL is where your team will log in and access shared meeting recordings and summaries."
      isExiting={isExiting}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 text-xs font-medium text-foreground bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 select-none"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-foreground" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="team-name" className="text-xs font-semibold text-muted uppercase tracking-wider">
            Team Name
          </label>
          <Input
            id="team-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Corp"
            className="h-10 text-sm font-sans"
            disabled={isSubmitting}
            autoFocus
            autoComplete="organization"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="team-slug" className="text-xs font-semibold text-muted uppercase tracking-wider">
            Workspace URL Slug
          </label>
          <div className="flex items-center relative">
            <span className="absolute left-3 text-xs font-mono text-muted-foreground/60 select-none">
              app.rapto.cloud/teams/
            </span>
            <input
              id="team-slug"
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onBlur={onSlugBlur}
              placeholder="acme-corp"
              maxLength={50}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby="team-slug-status"
              aria-invalid={displayStatus === "taken" || displayStatus === "invalid"}
              className="h-10 w-full rounded-md border border-zinc-200 bg-transparent pl-[168px] pr-9 text-sm font-mono transition-all outline-none placeholder:text-zinc-400 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 aria-[invalid=true]:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 read-only:cursor-not-allowed read-only:bg-muted/30 read-only:text-muted-foreground dark:border-zinc-800 dark:placeholder:text-zinc-500"
              disabled={isSubmitting}
              readOnly={slugLocked}
            />
            {/* Status glyph — one quiet icon, crossfades between states */}
            {!slugLocked && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-3 flex h-4 w-4 items-center justify-center"
              >
                {displayStatus === "checking" && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60 animate-in fade-in-0 duration-200" />
                )}
                {displayStatus === "available" && (
                  <Check className="h-3.5 w-3.5 text-brand animate-in fade-in-0 zoom-in-75 duration-200" strokeWidth={2.5} />
                )}
                {(displayStatus === "taken" || displayStatus === "invalid") && (
                  <X className="h-3.5 w-3.5 text-muted-foreground animate-in fade-in-0 duration-200" strokeWidth={2.5} />
                )}
              </span>
            )}
          </div>

          {/* Availability feedback — fixed height so the form never jumps */}
          <div
            id="team-slug-status"
            role="status"
            aria-live="polite"
            className="min-h-5 pt-1.5 flex items-center select-none text-[11px] font-sans font-medium leading-relaxed"
          >
            {slugLocked ? (
              <span className="text-muted-foreground/80">
                Your workspace URL can&apos;t be changed after creation — it would break invitation links and integrations.
              </span>
            ) : (
              <span
                key={displayStatus}
                className="flex items-center gap-1 animate-in fade-in-0 slide-in-from-top-0.5 duration-200"
              >
                {displayStatus === "checking" && (
                  <span className="text-muted-foreground/80">Checking availability…</span>
                )}

                {displayStatus === "available" && (
                  <>
                    <span className="text-brand">URL is available</span>
                    {adjustedFrom && (
                      <span className="text-muted-foreground/70 font-normal">
                        · &ldquo;{adjustedFrom}&rdquo; was taken
                      </span>
                    )}
                  </>
                )}

                {displayStatus === "taken" && (
                  <>
                    <span className="text-muted-foreground">URL is already taken.</span>
                    {suggestion && (
                      <>
                        <span className="text-muted-foreground/80">Try</span>
                        <button
                          type="button"
                          onClick={() => acceptSuggestion(suggestion)}
                          className="underline decoration-zinc-300 underline-offset-2 text-foreground font-semibold hover:decoration-foreground transition-colors"
                        >
                          {suggestion}
                        </button>
                      </>
                    )}
                  </>
                )}

                {displayStatus === "invalid" && (
                  <span className="text-muted-foreground">
                    Use at least 2 letters or numbers (hyphens allowed).
                  </span>
                )}

                {displayStatus === "error" && (
                  <>
                    <span className="text-muted-foreground">Unable to verify URL.</span>
                    <button
                      type="button"
                      onClick={retryCheck}
                      className="underline decoration-zinc-300 underline-offset-2 text-foreground font-semibold hover:decoration-foreground transition-colors"
                    >
                      Retry
                    </button>
                  </>
                )}
              </span>
            )}
          </div>
        </div>

        <OnboardingStepFooter>
          <Link
            href="/onboarding"
            className="text-xs font-sans text-muted-foreground hover:text-foreground hover:underline font-medium h-9 flex items-center"
          >
            Back
          </Link>
          <Button
            type="submit"
            variant="ink"
            aria-busy={isSubmitting}
            disabled={!canSubmit}
            className="h-10 px-5 text-xs font-medium min-w-[120px]"
          >
            {isSubmitting ? "Saving…" : "Continue →"}
          </Button>
        </OnboardingStepFooter>
      </form>
    </OnboardingStepShell>
  );
}
