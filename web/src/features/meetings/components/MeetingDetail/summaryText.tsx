import React from "react";
import { splitKeyPhrases } from "../../lib/summary";

export { stripLeadingBulletChar } from "../../lib/summary";

/**
 * Wrap deadlines / dates / priorities in a quiet emphasis (medium weight + a soft brand underline).
 * Returns plain text untouched when nothing matches, so it is safe for any language.
 */
export function emphasize(text: string): React.ReactNode {
  const segments = splitKeyPhrases(text);
  if (!segments.some((s) => s.strong)) return text;
  return segments.map((segment, i) =>
    segment.strong ? (
      <span
        key={i}
        className="font-medium text-foreground underline decoration-brand/40 decoration-1 underline-offset-[3px] [text-decoration-skip-ink:none]"
      >
        {segment.text}
      </span>
    ) : (
      <React.Fragment key={i}>{segment.text}</React.Fragment>
    )
  );
}
