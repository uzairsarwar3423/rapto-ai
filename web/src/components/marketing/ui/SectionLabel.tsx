import type { CSSProperties, ReactNode } from "react";

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
  /** When true: green pill badge with pulsing dot (used in Hero) */
  asPill?: boolean;
  /** Override text/dot color — e.g. for dark section backgrounds */
  color?: string;
  style?: CSSProperties;
}

/**
 * SectionLabel — small uppercase tag shown above section headings.
 *
 * Two modes:
 *   - Plain (default): "The problem", "How it works", "Features"
 *   - Pill  (asPill):  Used in Hero — green tinted pill with pulsing dot
 *
 * Uses only inline styles to guarantee correct rendering in Tailwind v4.
 */
export function SectionLabel({
  children,
  asPill = false,
  color,
  style,
}: SectionLabelProps) {
  // ── Pill variant (Hero badge) ──────────────────────────────
  if (asPill) {
    return (
      <div
        style={{
          // CRITICAL: inline-flex so width wraps tightly around content
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          // Pill shape
          background: "#E8F5EE",
          borderRadius: "100px",
          border: "1px solid rgba(26,107,60,0.12)",
          // Spacing
          padding: "5px 12px 5px 10px",
          marginBottom: "28px",
          // Max width guard — never full-width
          maxWidth: "max-content",
          // Typography
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: color ?? "#1A6B3C",
          lineHeight: 1,
          whiteSpace: "nowrap",
          userSelect: "none",
          // Prevent stretching in flex containers
          alignSelf: "flex-start",
          ...style,
        }}
      >
        {/* Pulsing dot */}
        <span
          aria-hidden="true"
          style={{
            display: "block",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: color ?? "#1A6B3C",
            flexShrink: 0,
            animation: "pulse-dot 2s ease-in-out infinite",
          }}
        />
        {children}
      </div>
    );
  }

  // ── Plain text variant (all other sections) ────────────────
  return (
    <p
      style={{
        fontFamily: "var(--font-sans, system-ui)",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: color ?? "#1A6B3C",
        marginBottom: "12px",
        lineHeight: 1,
        ...style,
      }}
    >
      {children}
    </p>
  );
}
