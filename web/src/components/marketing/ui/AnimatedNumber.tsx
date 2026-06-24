"use client";

/**
 * AnimatedNumber.tsx
 * Displays a number that counts up from 0 to `to` when it enters the viewport.
 * Wraps useCountUp. Used in CaseStudy (Day 8) and anywhere large stats appear.
 */

import { useCountUp } from "@/hooks/marketing/useCountUp";

interface AnimatedNumberProps {
  to: number;
  suffix?: string;
  decimals?: number;
  duration?: number;
  /** Font size override, default "64px" */
  fontSize?: string;
  /** Color override, default "#6ECC8E" (for dark sections) */
  color?: string;
  /** Label displayed below the number */
  label?: string;
  labelColor?: string;
}

export function AnimatedNumber({
  to,
  suffix = "",
  decimals = 0,
  duration = 1500,
  fontSize = "clamp(44px, 5vw, 64px)",
  color = "#6ECC8E",
  label,
  labelColor = "rgba(255,255,255,0.5)",
}: AnimatedNumberProps) {
  const { ref, displayValue } = useCountUp({ to, suffix, decimals, duration });

  return (
    <div>
      <p
        ref={ref as React.RefObject<HTMLParagraphElement>}
        style={{
          fontFamily: "var(--font-serif, Georgia, serif)",
          fontSize,
          fontWeight: 400,
          color,
          lineHeight: 1.0,
          letterSpacing: "-2px",
          margin: 0,
        }}
      >
        {displayValue}
      </p>
      {label && (
        <p
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "14px",
            fontWeight: 400,
            color: labelColor,
            marginTop: "6px",
            lineHeight: 1.4,
          }}
        >
          {label}
        </p>
      )}
    </div>
  );
}
