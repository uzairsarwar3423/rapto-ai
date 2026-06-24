/**
 * SectionHeading.tsx
 * Reusable H2 headline component.
 * Parses '|' delimiters to render enclosed text as italicized accent color.
 * Supports light background styling (default) and dark background styling.
 */

import React from "react";

interface SectionHeadingProps {
  children: string;
  theme?: "light" | "dark";
  align?: "left" | "center";
}

export function SectionHeading({
  children,
  theme = "light",
  align = "left",
}: SectionHeadingProps) {
  // Parse the children string to detect |accent words|
  const parts = children.split("|");

  const textColor = theme === "dark" ? "#FAFAF8" : "#0A0A0A";
  const accentColor = theme === "dark" ? "#6ECC8E" : "#1A6B3C";

  return (
    <h2
      style={{
        fontFamily: "var(--font-serif, Georgia, serif)",
        fontSize: "clamp(28px, 4.2vw, 48px)",
        lineHeight: 1.1,
        letterSpacing: "-1.0px",
        color: textColor,
        textAlign: align,
        margin: 0,
      }}
    >
      {parts.map((part, index) => {
        // Enclosed between | indicators is always odd indices when split
        const isAccent = index % 2 !== 0;
        if (isAccent) {
          return (
            <em
              key={index}
              style={{
                fontStyle: "italic",
                color: accentColor,
                fontWeight: "normal",
              }}
            >
              {part}
            </em>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </h2>
  );
}
