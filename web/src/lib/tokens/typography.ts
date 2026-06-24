/**
 * Vocaply Design Tokens — Typography
 */
export const FONTS = {
  sans: "DM Sans, system-ui, -apple-system, sans-serif",
  serif: "Instrument Serif, Georgia, serif",
} as const;

export const FONT_SIZES = {
  display: "clamp(48px, 6vw, 78px)",
  h2: "clamp(32px, 4vw, 52px)",
  h3: "clamp(18px, 2vw, 28px)",
  bodyLg: "clamp(16px, 2vw, 19px)",
  body: "16px",
  sm: "14px",
  xs: "13px",
  label: "11px",
} as const;
