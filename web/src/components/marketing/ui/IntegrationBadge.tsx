"use client";

/**
 * IntegrationBadge.tsx
 * Pill badge for a single integration tool.
 *
 * Active  → white card, solid border, hover: green border + lift + shadow
 * Coming  → dashed border, muted, no hover interaction
 *
 * Uses Next.js <Image> for real SVG icons in /public/icons/.
 * Falls back to emoji when iconPath is null.
 */

import { useState } from "react";
import Image from "next/image";
import type { IntegrationItem } from "@/lib/marketing/content/integrations.content";
import { analytics } from "@/lib/analytics";

interface IntegrationBadgeProps {
  integration: IntegrationItem;
}

export function IntegrationBadge({ integration }: IntegrationBadgeProps) {
  const [hovered, setHovered] = useState(false);
  const isComingSoon = !!integration.comingSoon;

  const iconEl = integration.iconPath ? (
    <Image
      src={integration.iconPath}
      alt={integration.name}
      width={20}
      height={20}
      style={{ objectFit: "contain", flexShrink: 0 }}
    />
  ) : (
    <span aria-hidden="true" style={{ fontSize: "18px", lineHeight: 1, flexShrink: 0 }}>
      {integration.emoji}
    </span>
  );

  if (isComingSoon) {
    return (
      <div
        aria-label={`${integration.name} — coming soon`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          background: "transparent",
          border: "1px dashed #D0CFC9",
          borderRadius: "10px",
          padding: "9px 16px",
          cursor: "default",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {iconEl}
        <span
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "13px",
            fontWeight: 500,
            color: "#B0AFA9",
          }}
        >
          {integration.name}
        </span>
        <span
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "10px",
            fontStyle: "italic",
            color: "#B0AFA9",
            letterSpacing: "0.02em",
          }}
        >
          soon
        </span>
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={integration.name}
      onMouseEnter={() => {
        setHovered(true);
        analytics.integrationBadgeHover(integration.name);
      }}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "10px",
        background: "white",
        border: `1.5px solid ${hovered ? "#1A6B3C" : "#E4E3DF"}`,
        borderRadius: "10px",
        padding: "10px 18px",
        cursor: "default",
        userSelect: "none",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 8px 20px rgba(26,107,60,0.10), 0 2px 6px rgba(0,0,0,0.04)"
          : "0 1px 3px rgba(0,0,0,0.04)",
        transition: "border-color 150ms ease, transform 150ms ease, box-shadow 150ms ease",
      }}
    >
      {iconEl}
      <span
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "13.5px",
          fontWeight: 500,
          color: "#0A0A0A",
          letterSpacing: "-0.1px",
        }}
      >
        {integration.name}
      </span>
    </div>
  );
}
