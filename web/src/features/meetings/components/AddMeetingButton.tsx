"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";

/**
 * AddMeetingButton — Minimalist premium SaaS button.
 *
 * Design philosophy (Linear / Vercel / Stripe style):
 *  • Solid brand green — no gradient, no shadow, no glass
 *  • Default state IS the "settled/grounded" look — confident, not floating
 *  • Hover: background lightens slightly — clear affordance
 *  • Active/press: darkens — instant tactile feedback
 *  • 150ms ease transition — snappy, never sluggish
 *  • All styles inline — immune to Tailwind v4 / shadcn cascade issues
 */

interface AddMeetingButtonProps {
  onClick?: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

/* ── Color tokens ─────────────────────────────────────────── */
// Light mode — deep forest green
const LIGHT = {
  base:   "hsl(149, 61%, 26%)",   // solid brand green — grounded default
  hover:  "hsl(149, 61%, 30%)",   // slightly lighter on hover
  active: "hsl(149, 61%, 22%)",   // darker on press
  border: "transparent",
};

// Dark mode — luminous mid-green (readable on dark bg)
const DARK = {
  base:   "hsl(149, 52%, 38%)",
  hover:  "hsl(149, 52%, 43%)",
  active: "hsl(149, 52%, 32%)",
  border: "transparent",
};

/** Watches `.dark` class on <html> for dark-mode awareness */
function useIsDark(): boolean {
  const [dark, setDark] = React.useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  React.useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() =>
      setDark(el.classList.contains("dark"))
    );
    obs.observe(el, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return dark;
}

export function AddMeetingButton({
  onClick,
  label = "Add Meeting",
  className = "",
  disabled = false,
  id,
}: AddMeetingButtonProps) {
  const [hovered, setHovered]  = useState(false);
  const [pressed, setPressed]  = useState(false);
  const isDark = useIsDark();

  const palette = isDark ? DARK : LIGHT;
  const bg = pressed ? palette.active : hovered ? palette.hover : palette.base;

  const style: React.CSSProperties = {
    /* Layout */
    display:         "inline-flex",
    alignItems:      "center",
    gap:             "6px",
    padding:         "0 13px",
    height:          "34px",
    borderRadius:    "8px",
    cursor:          disabled ? "not-allowed" : "pointer",
    userSelect:      "none",
    whiteSpace:      "nowrap",
    position:        "relative",

    /* Typography */
    fontSize:              "0.75rem",   /* 12px */
    fontWeight:            400,
    lineHeight:            1,
    color:                 "#ffffff",
    letterSpacing:         "0.01em",
    WebkitFontSmoothing:   "antialiased",

    /* Visual */
    backgroundColor: bg,
    border:          `1px solid ${palette.border}`,
    boxShadow:       "none",

    /* Transition — only bg, no transform theatrics */
    transition: "background-color 150ms ease",

    /* Reset */
    outline:           "none",
    opacity:           disabled ? 0.45 : 1,
    appearance:        "none",
    WebkitAppearance:  "none",
  };

  return (
    <button
      id={id}
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={label}
      className={className}
      style={style}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => !disabled && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onFocus={() => !disabled && setHovered(true)}
      onBlur={() => { setHovered(false); setPressed(false); }}
    >
      <Plus
        aria-hidden="true"
        style={{ width: 13, height: 13, flexShrink: 0 }}
        strokeWidth={2.5}
      />
      <span>{label}</span>
    </button>
  );
}

export default AddMeetingButton;
