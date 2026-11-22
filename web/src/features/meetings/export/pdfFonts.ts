import { Font } from "@react-pdf/renderer";

export const PDF_FONT_FAMILY = "Inter";

const WEIGHTS = [400, 500, 600, 700] as const;
let registeredFor: string | null = null;

/**
 * Embed Inter (SIL OFL, served from /public/fonts/inter) so the PDF renders identically everywhere
 * and its text stays selectable and searchable. Safe to call repeatedly.
 *
 * `baseUrl` is a URL in the browser ("/fonts/inter") or a folder path when generating in Node (tests).
 */
export function registerPdfFonts(baseUrl = "/fonts/inter"): void {
  if (registeredFor === baseUrl) return;
  registeredFor = baseUrl;

  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: WEIGHTS.map((fontWeight) => ({
      src: `${baseUrl}/inter-latin-${fontWeight}-normal.woff`,
      fontWeight,
    })),
  });

  // Never hyphenate: broken words look wrong in a formal report. Long tokens wrap at the line edge.
  Font.registerHyphenationCallback((word) => [word]);
}
