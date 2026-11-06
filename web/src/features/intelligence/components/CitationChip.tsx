"use client";

import Link from "next/link";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { chatTelemetry } from "../telemetry/chatTelemetry";
import type { CitationView } from "../utils/citationModel";

/**
 * Compact numbered chip (D-1). The full label lives in the accessible name and the native tooltip; the Sources row has
 * the rest. A chip is a real LINK: plain click navigates in-app, modifier/middle click opens a new tab, copy-link works.
 * Unavailable sources render as a disabled, non-interactive chip. All source text is rendered as text (React escapes it).
 */
function CitationChipImpl({ view, position }: { view: CitationView; position: number }) {
  const base =
    "mx-0.5 inline-flex h-[18px] min-w-[18px] translate-y-[-1px] items-center justify-center rounded-md border px-1 align-baseline text-[11px] font-medium tabular-nums leading-none";
  const tip = view.unavailable ? "Source no longer available" : [view.label, view.speaker, view.preview].filter(Boolean).join(" — ").slice(0, 240);

  if (!view.href) {
    return (
      <span
        role="img"
        aria-label={view.accessibleName}
        title={tip}
        className={cn(base, "border-border/60 text-muted-foreground", view.unavailable && "line-through opacity-60")}
        dir="ltr"
      >
        {view.number}
      </span>
    );
  }
  return (
    <Link
      href={view.href}
      aria-label={view.accessibleName}
      title={tip}
      dir="ltr"
      onClick={() => chatTelemetry.citationClicked({ sourceType: view.kind, position })}
      className={cn(base, "border-border bg-surface text-foreground no-underline transition-colors hover:border-brand hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand")}
    >
      {view.number}
    </Link>
  );
}
export const CitationChip = memo(CitationChipImpl);
