"use client";

import React, { useState, useEffect } from "react";
import { useOnboarding } from "@/features/onboarding/hooks/useOnboarding";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Globe, Users, Loader2, Check, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function CreateTeamPage() {
  const { createTeam, isCreatingTeam, updateTeam, isUpdatingTeam, checkSlug, isCheckingSlug } = useOnboarding();
  const { user } = useAuth();

  const [name, setName] = useState(user?.team?.name || "");
  const [slug, setSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "unavailable" | "invalid">("idle");
  const [error, setError] = useState("");

  const hasTeam = !!user?.teamId;

  // Helper: Format slug from team name automatically
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (slugStatus === "idle" || slug === "") {
      const generatedSlug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setSlug(generatedSlug);
    }
  };

  // Debounced check for slug availability
  useEffect(() => {
    if (!slug) {
      setSlugStatus("idle");
      return;
    }

    // Validate slug regex: lowercase alphanumeric and hyphens, no leading/trailing hyphen
    const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
    if (!SLUG_REGEX.test(slug)) {
      setSlugStatus("invalid");
      return;
    }

    setSlugStatus("checking");
    const delayDebounce = setTimeout(async () => {
      try {
        const available = await checkSlug(slug);
        setSlugStatus(available ? "available" : "unavailable");
      } catch (err) {
        setSlugStatus("idle");
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [slug, checkSlug]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Team name is required");
      return;
    }

    if (hasTeam) {
      if (slugStatus !== "idle" && slugStatus !== "available") {
        setError("Please choose an available and valid URL slug");
        return;
      }
      updateTeam({ name: name.trim(), ...(slug && slugStatus === 'available' ? { slug: slug.trim() } : {}) });
    } else {
      if (slugStatus !== "available") {
        setError("Please choose an available and valid URL slug");
        return;
      }
      createTeam({ name: name.trim(), slug: slug.trim() });
    }
  };

  const isSubmitting = isCreatingTeam || isUpdatingTeam;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div className="space-y-2 text-center md:text-left">
        <div className="mx-auto md:mx-0 h-10 w-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center mb-2">
          <Users className="h-5 w-5" />
        </div>
        <h1 className="text-2xl onboarding-heading font-bold text-foreground">
          {hasTeam ? "Update your team workspace" : "Create your team workspace"}
        </h1>
        <p className="text-sm text-muted">
          Your workspace URL is where your team will log in and access shared meeting recordings and summaries.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3.5 rounded-xl bg-error-subtle border border-error/20 text-xs text-error flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="team-name" className="text-xs font-semibold uppercase tracking-wider text-muted">
            Team Name
          </label>
          <input
            id="team-name"
            type="text"
            required
            value={name}
            onChange={handleNameChange}
            placeholder="Acme Corp"
            className="w-full px-4 py-3 rounded-xl border border-border bg-surface-2/45 text-sm text-foreground placeholder:text-muted/50 outline-none focus:border-brand transition"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="team-slug" className="text-xs font-semibold uppercase tracking-wider text-muted">
            Workspace URL Slug
          </label>
          <div className="relative flex items-center">
            <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted/60 pointer-events-none" />
            <input
              id="team-slug"
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
              placeholder="acme-corp"
              className="w-full pl-10 pr-10 py-3 rounded-xl border border-border bg-surface-2/45 text-sm text-foreground placeholder:text-muted/50 outline-none focus:border-brand transition font-mono text-xs"
            />

            {/* Status Indicators */}
            <div className="absolute right-3">
              {isCheckingSlug || slugStatus === "checking" ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand" />
              ) : slugStatus === "available" ? (
                <Check className="h-4 w-4 text-brand font-bold" />
              ) : slugStatus === "unavailable" || slugStatus === "invalid" ? (
                <AlertCircle className="h-4 w-4 text-error" />
              ) : null}
            </div>
          </div>

          {/* Validation Feedback */}
          {slugStatus === "available" && (
            <p className="text-[11px] text-brand font-medium"> vocaply.com/teams/{slug} is available!</p>
          )}
          {slugStatus === "unavailable" && (
            <p className="text-[11px] text-error font-medium"> This URL is already taken.</p>
          )}
          {slugStatus === "invalid" && (
            <p className="text-[11px] text-error font-medium"> URL must be alphanumeric with hyphens only.</p>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting || (!hasTeam && slugStatus !== "available")}
            className={`w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white transition-all duration-200 ${isSubmitting || (!hasTeam && slugStatus !== "available")
                ? "bg-brand/40 cursor-not-allowed"
                : "bg-brand hover:bg-brand-mid hover:shadow-brand active:scale-[0.98]"
              }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{hasTeam ? "Updating Workspace..." : "Creating Workspace..."}</span>
              </>
            ) : (
              <span>{hasTeam ? "Update & Continue" : "Create & Continue"}</span>
            )}
          </button>

          <Link
            href="/onboarding"
            className="w-full py-3.5 text-center text-xs font-semibold text-muted hover:text-foreground hover:underline transition duration-150"
          >
            Back to previous step
          </Link>
        </div>
      </form>
    </div>
  );
}
