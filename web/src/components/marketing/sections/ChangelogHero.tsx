import React, { useState } from "react";
import { Rss, Loader2, Check } from "lucide-react";

export function ChangelogHero() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus("submitting");

    setTimeout(() => {
      setStatus("success");
      setEmail("");
    }, 1200);
  };

  return (
    <section className="bg-white pt-24 pb-12 px-6 flex justify-center border-b border-[var(--color-border)]/40">
      <div className="max-w-[1000px] w-full relative">
        {/* RSS link top-right alignment */}
        <div className="absolute top-0 right-0 hidden sm:block">
          <a
            href="/changelog/feed.xml"
            target="_blank"
            className="flex items-center gap-1.5 text-xs text-[var(--color-muted-subtle)] hover:text-[var(--color-foreground)] transition-colors select-none font-medium"
          >
            <Rss className="w-3.5 h-3.5" />
            <span>RSS Feed</span>
          </a>
        </div>

        {/* Eyebrow / Version badge row */}
        <div className="flex items-center gap-2 mb-6 select-none">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-brand)] font-plus-jakarta">
            Changelog
          </span>
          <span className="h-3 w-[1px] bg-[var(--color-border)]" />
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[9px] font-mono text-[var(--color-muted)] font-semibold">
            v1.4.2
          </span>
        </div>

        {/* H1 */}
        <h1 className="font-plus-jakarta text-4xl md:text-5xl lg:text-6xl font-extrabold text-[var(--color-foreground)] leading-tight tracking-tight mb-4 max-w-[750px]">
          What&apos;s new in Vocaply
        </h1>

        {/* Description */}
        <p className="font-sans font-light text-base md:text-lg text-[var(--color-muted)] leading-relaxed mb-8 max-w-[650px]">
          Every improvement, fix, and new feature &mdash; documented in detail as it ships to production.
        </p>

        {/* Minimal Subscribe Form block */}
        <div className="max-w-[420px]">
          {status === "success" ? (
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-brand)] bg-[var(--color-brand-subtle)] p-2.5 rounded-md border border-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] animate-in fade-in slide-in-from-bottom-1 duration-200">
              <Check className="w-3.5 h-3.5" />
              <span>You&apos;re subscribed to release updates!</span>
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="flex gap-2">
              <input
                type="email"
                required
                disabled={status === "submitting"}
                placeholder="Email address..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 px-3 py-2 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-foreground)] placeholder-[var(--color-muted-subtle)] focus:outline-none focus:border-[var(--color-foreground)] bg-[#FAF9F6] disabled:bg-[var(--color-surface)] transition-colors"
              />
              <button
                type="submit"
                disabled={status === "submitting" || !email}
                className="px-4 py-2 rounded-md bg-[var(--color-foreground)] hover:opacity-90 disabled:opacity-50 text-[var(--color-background)] text-xs font-semibold flex items-center justify-center gap-1.5 transition-opacity cursor-pointer select-none"
              >
                {status === "submitting" ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Subscribing...</span>
                  </>
                ) : (
                  <span>Subscribe</span>
                )}
              </button>
            </form>
          )}
          <span className="text-[10px] text-[var(--color-muted-subtle)] font-light mt-2 block pl-0.5 select-none">
            Get structured release notes in your inbox. No spam. Unsubscribe anytime.
          </span>
        </div>
      </div>
    </section>
  );
}
