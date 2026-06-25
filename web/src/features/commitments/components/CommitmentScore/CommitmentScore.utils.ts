/**
 * Clamps a score strictly between 0 and 100.
 */
export function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score));
}

/**
 * Calculates the stroke-dashoffset for a given score and circumference.
 * At 0, the offset is equal to the circumference (fully hidden).
 * At 100, the offset is 0 (fully drawn).
 */
export function scoreToStrokeDashoffset(score: number, circumference: number): number {
  const clamped = clampScore(score);
  return circumference * (1 - clamped / 100);
}

/**
 * Returns a CSS custom property reference for the arc color.
 * Reuses the status text colors from the theme.
 */
export function scoreToArcColor(score: number): string {
  const clamped = clampScore(score);
  if (clamped >= 80) return "var(--color-fulfilled-text)";
  if (clamped >= 60) return "var(--color-pending-text)";
  return "var(--color-missed-text)";
}

/**
 * Resolves standard sizing configurations for the gauge component.
 * sm: 32px diameter, stroke-width 3, label hidden (10px baseline font size)
 * md: 56px diameter, stroke-width 4, font-size 16px
 * lg: 96px diameter, stroke-width 6, font-size 28px
 */
export function getGaugeDimensions(size: "sm" | "md" | "lg" = "md"): {
  diameter: number;
  strokeWidth: number;
  fontSize: number;
} {
  switch (size) {
    case "sm":
      return { diameter: 32, strokeWidth: 3, fontSize: 10 };
    case "lg":
      return { diameter: 96, strokeWidth: 6, fontSize: 28 };
    case "md":
    default:
      return { diameter: 56, strokeWidth: 4, fontSize: 16 };
  }
}
