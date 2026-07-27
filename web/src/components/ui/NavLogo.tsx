"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export interface NavLogoProps {
  href?: string;
  className?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
}

export function NavLogo({
  href = "/",
  className = "font-display text-2xl font-bold tracking-tight transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-sm text-white flex items-center",
  ariaLabel = "Rapto Home",
  style,
}: NavLogoProps = {}) {
  const logoContent = (
    <span
      style={{
        fontFamily: "var(--font-space-grotesk), var(--font-display), sans-serif",
        ...style,
      }}
      className="inline-flex items-center"
    >
      Rapt<span className="relative inline-block">
        o
        <span className="absolute top-[5px] -right-[5px] w-[6px] h-[6px] rounded-full bg-[var(--color-brand-300,#22c55e)] shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
      </span>
    </span>
  );

  if (!href) {
    return (
      <span className={cn("flex items-center select-none font-display", className)} aria-label={ariaLabel}>
        {logoContent}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn("font-display", className)}
      aria-label={ariaLabel}
    >
      {logoContent}
    </Link>
  );
}
