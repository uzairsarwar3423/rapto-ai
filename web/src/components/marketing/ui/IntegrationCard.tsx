"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntegrationItem } from "@/lib/marketing/content/integrations-page.content";
import { LiveStatusBadge } from "./LiveStatusBadge";
import { IntegrationCategoryBadge } from "./IntegrationCategoryBadge";

interface IntegrationCardProps {
  integration: IntegrationItem;
  className?: string;
}

export function IntegrationCard({ integration, className }: IntegrationCardProps) {
  const isLive = integration.status === "live";
  const isFeatured = integration.hasDeepDive;

  const handleCardClick = () => {
    if (!isLive || !integration.deepDiveAnchor) return;
    const targetElement = document.getElementById(integration.deepDiveAnchor);
    if (targetElement) {
      const offset = 80; // height of sticky nav + filter bar
      const elementPosition = targetElement.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        "group relative flex flex-col p-7 rounded-xl border bg-white select-none transition-all duration-200",
        isLive
          ? "cursor-pointer hover:border-[var(--color-brand)] hover:shadow-[0_0_0_1px_var(--color-brand)]"
          : "opacity-65 cursor-not-allowed",
        isFeatured && isLive && "border-[var(--color-brand)] bg-[var(--color-background)]",
        className
      )}
    >
      {/* Popular badge for featured items */}
      {isFeatured && isLive && (
        <span className="absolute top-2.5 right-24 inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-[var(--color-brand)] text-white select-none">
          Popular
        </span>
      )}

      {/* Row 1 — Logo + Status badge */}
      <div className="flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white p-2 flex-shrink-0 shadow-sm">
          <Image
            src={integration.logoPath}
            alt={`${integration.name} logo`}
            width={32}
            height={32}
            className={cn(
              "object-contain w-8 h-8 transition-all duration-300",
              isLive ? "grayscale group-hover:grayscale-0" : "grayscale"
            )}
          />
        </div>
        <LiveStatusBadge status={integration.status} />
      </div>

      {/* Row 2 — Name */}
      <h3 className="mt-4 text-[15px] font-semibold text-[var(--color-foreground)] leading-tight">
        {integration.name}
      </h3>

      {/* Row 3 — Categories */}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {integration.categories.map((cat) => (
          <IntegrationCategoryBadge key={cat} category={cat} />
        ))}
      </div>

      {/* Row 4 — Description */}
      <p className="mt-3 text-[13px] text-[var(--color-muted)] leading-relaxed line-clamp-2">
        {integration.description}
      </p>

      {/* Row 5 — Action link */}
      {isLive && (
        <div className="mt-6 pt-2 flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-brand)] mt-auto">
          {integration.hasDeepDive ? "See how it works" : "Learn more"}
          <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
        </div>
      )}
    </div>
  );
}
