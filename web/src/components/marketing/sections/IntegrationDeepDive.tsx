"use client";

import type { ReactNode } from "react";
import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MockBrowserFrame } from "../mock/MockBrowserFrame";

export interface DeepDiveStep {
  label: string;
  sublabel: string;
  icon: ReactNode;
}

interface IntegrationDeepDiveProps {
  id: string;
  theme: "white" | "gray";
  eyebrow: string;
  title: string | ReactNode;
  descriptionBullets: string[];
  steps?: DeepDiveStep[];
  visualComponent: ReactNode;
  ctaText?: string;
  ctaHref?: string;
  urlText?: string;
}

export function IntegrationDeepDive({
  id,
  theme,
  eyebrow,
  title,
  descriptionBullets,
  steps,
  visualComponent,
  ctaText = "Connect Integration",
  ctaHref = "/settings/integrations",
  urlText = "app.vocaply.com/commitments",
}: IntegrationDeepDiveProps) {
  const isWhiteBg = theme === "white";

  return (
    <section
      id={id}
      className={cn(
        "py-20 px-6 border-b border-[var(--color-border)] transition-all duration-300",
        isWhiteBg ? "bg-white" : "bg-[var(--color-surface)]"
      )}
    >
      <div className="max-w-[1120px] mx-auto flex flex-col lg:flex-row items-center gap-12">
        {/* Left Column — Text details */}
        <div className="flex-1 flex flex-col w-full order-2 lg:order-1">
          {/* Eyebrow */}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-brand)] mb-3">
            {eyebrow}
          </span>

          {/* Title */}
          <h2 className="font-serif text-[clamp(28px,4vw,42px)] font-normal text-[var(--color-foreground)] leading-tight tracking-tight mb-6">
            {title}
          </h2>

          {/* Description Checklist */}
          <ul className="flex flex-col gap-3.5 mb-8 font-sans">
            {descriptionBullets.map((bullet, idx) => (
              <li key={idx} className="flex gap-2.5 items-start">
                <span className="h-5 w-5 rounded-full bg-[var(--color-brand-subtle)] border border-[color-mix(in_srgb,var(--color-brand)_15%,transparent)] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 text-[var(--color-brand)]" />
                </span>
                <span className="text-[14px] text-[var(--color-muted)] leading-relaxed">
                  {bullet}
                </span>
              </li>
            ))}
          </ul>

          {/* Step flow (if present, like Jira connection flow) */}
          {steps && steps.length > 0 && (
            <div className="mb-8 pt-4 border-t border-[var(--color-border)]">
              <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center sm:items-start text-center sm:text-left gap-2 relative">
                    <div className="h-8 w-8 rounded-full bg-[var(--color-brand)] text-white flex items-center justify-center shadow-sm">
                      {step.icon}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--color-foreground)]">{step.label}</h4>
                      <p className="text-[10px] text-[var(--color-muted-subtle)] mt-0.5">{step.sublabel}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action CTA */}
          <div className="mt-2">
            <a
              href={ctaHref}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md border border-[var(--color-border)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] font-sans font-semibold text-xs transition-colors bg-white select-none text-[var(--color-foreground)] shadow-xs"
            >
              {ctaText}
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Right Column — High-fidelity UI mockup browser */}
        <div className="flex-1 w-full order-1 lg:order-2">
          <MockBrowserFrame urlText={urlText}>
            {visualComponent}
          </MockBrowserFrame>
        </div>
      </div>
    </section>
  );
}
