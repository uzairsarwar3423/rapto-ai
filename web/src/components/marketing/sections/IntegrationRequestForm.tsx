"use client";

import React, { useState } from "react";
import { PlusCircle, CheckCircle, Loader2 } from "lucide-react";

export function IntegrationRequestForm() {
  const [integrationName, setIntegrationName] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!integrationName.trim()) return;

    setStatus("submitting");

    // Simulate form submission
    setTimeout(() => {
      setStatus("success");
      setIntegrationName("");
    }, 1200);
  };

  return (
    <section className="bg-white py-16 px-6 border-b border-[var(--color-border)]">
      <div className="max-w-[600px] mx-auto text-center flex flex-col items-center">
        {/* Icon */}
        <div className="h-10 w-10 rounded-full bg-[var(--color-brand-subtle)] border border-[color-mix(in_srgb,var(--color-brand)_15%,transparent)] flex items-center justify-center text-[var(--color-brand)] mb-5">
          <PlusCircle className="w-5.5 h-5.5" />
        </div>

        {/* Headline */}
        <h2 className="font-serif text-[24px] font-normal text-[var(--color-foreground)] leading-tight mb-2">
          Don&apos;t see your tool here?
        </h2>
        
        {/* Body */}
        <p className="font-sans text-xs text-[var(--color-muted)] mb-8 max-w-[450px]">
          We prioritize and build new integrations based on what our teams actually use. Suggest your tool and we will update you as soon as it enters development.
        </p>

        {status === "success" ? (
          <div className="w-full bg-[var(--color-brand-subtle)] border border-[color-mix(in_srgb,var(--color-brand)_15%,transparent)] rounded-lg p-5 flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <CheckCircle className="w-8 h-8 text-[var(--color-brand)] animate-bounce" />
            <h4 className="font-sans font-semibold text-[13px] text-[var(--color-foreground)]">
              Request Submitted Successfully!
            </h4>
            <p className="font-sans text-[11px] text-[var(--color-muted)]">
              Thank you for helping us shape the Vocaply roadmap. We will reach out when development begins.
            </p>
            <button
              onClick={() => setStatus("idle")}
              className="mt-3 text-[11px] font-semibold text-[var(--color-brand)] hover:underline"
            >
              Request another tool
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              required
              disabled={status === "submitting"}
              placeholder="Name your tool (e.g. Trello, GitLab)..."
              value={integrationName}
              onChange={(e) => setIntegrationName(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-foreground)] placeholder-[var(--color-muted-subtle)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-1 focus:ring-[var(--color-brand)] bg-white disabled:bg-[var(--color-surface)]"
            />
            <button
              type="submit"
              disabled={status === "submitting" || !integrationName.trim()}
              className="px-5 py-2.5 rounded-md bg-[var(--color-brand)] hover:bg-[var(--color-brand-mid)] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:bg-[var(--color-muted-subtle)] disabled:cursor-not-allowed cursor-pointer select-none"
            >
              {status === "submitting" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Request it</span>
              )}
            </button>
          </form>
        )}

        {/* Footer text */}
        {status !== "success" && (
          <p className="mt-5 text-[11px] italic text-[var(--color-muted-subtle)]">
            Requested by 200+ teams: Asana &bull; ClickUp &bull; Zapier &bull; HubSpot
          </p>
        )}
      </div>
    </section>
  );
}
