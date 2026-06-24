"use client";

/**
 * SkipLink.tsx
 * Accessibility: "Skip to main content" link.
 * Visually hidden by default, becomes visible on keyboard focus.
 */

import { useState } from "react";

export function SkipLink() {
  const [focused, setFocused] = useState(false);

  return (
    <a
      href="#main-content"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        position: "absolute",
        top: focused ? "16px" : "-100px",
        left: "16px",
        zIndex: 9999,
        background: "white",
        color: "#0A0A0A",
        padding: "8px 16px",
        borderRadius: "6px",
        fontFamily: "var(--font-sans, system-ui)",
        fontSize: "14px",
        fontWeight: 500,
        textDecoration: "none",
        border: "2px solid #1A6B3C",
        transition: "top 200ms ease",
      }}
    >
      Skip to main content
    </a>
  );
}
