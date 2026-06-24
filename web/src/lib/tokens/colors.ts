/**
 * Vocaply Design Tokens — Colors
 * Hex values exported for JS/TS environments (workers, dynamic styles, emails, etc.)
 */
export const COLORS = {
  background: "#FAFAF8",
  foreground: "#0A0A0A",
  brand: {
    DEFAULT: "#1A6B3C",
    subtle: "#E8F5EE",
    mid: "#2D8A50",
    dark: "#6ECC8E",
  },
  error: {
    DEFAULT: "#C84B31",
    subtle: "#FDECEA",
  },
  muted: {
    DEFAULT: "#6B6A67",
    subtle: "#9B9A96",
  },
  border: "#E4E3DF",
  surface: {
    DEFAULT: "#F2F1EE",
    "2": "#FAFAF8",
  },
  status: {
    pending: {
      bg: "#F2F1EE",
      text: "#6B6A67",
    },
    fulfilled: {
      bg: "#E8F5EE",
      text: "#1A6B3C",
    },
    missed: {
      bg: "#FDECEA",
      text: "#C84B31",
    },
    deferred: {
      bg: "#EEF2FF",
      text: "#4F46E5",
    },
  },
} as const;
