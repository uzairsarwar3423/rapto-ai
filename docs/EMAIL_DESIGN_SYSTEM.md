# Rapto transactional email design system

All emails are built from `services/api/src/modules/notifications/templates/shared/`. Templates only compose these primitives.

| Primitive | File | Notes |
|---|---|---|
| Layout | `EmailLayout.ts` | Full-width table with explicit background (Outlook ignores `<body>` padding), 600px container (Outlook ghost table), hidden preheader, dark-mode + mobile CSS as progressive enhancement. |
| Logo | `EmailBrandLogo.ts` | Real `<img>` from `${getFrontendUrl()}/email/rapto-logo.png` (never localhost). White variant swapped in for dark mode. |
| Button | `EmailButton.ts` | Colour/border/padding on the `<td>` (`bgcolor` + inline), link fills the cell, `mso-padding-alt`, no box-shadow, no conditional-comment wrapper. Variants: `primary`/`brand`, `dark`, `outline`, `danger`, `warning`. |
| Content | `EmailContent.ts` | `renderEmailHeading/Text/Muted/Eyebrow/Details/Badge/List/Steps/LinkFallback`, `strong()`, `link()`. |
| Card / Divider / Stat | `EmailCard.ts`, `EmailDivider.ts`, `EmailStatCallout.ts` | Table-based (no `<div>` padding/`<hr>`). |
| Footer | `EmailFooter.ts` | Reason for the email, unsubscribe/preferences link, company line. |
| Tokens | `email-tokens.ts` | Colours (AA contrast), typography, spacing, asset paths. |
| Escaping | `email-escape.ts` | `esc()` for text/attributes, `safeUrl()` allows only `http(s):`/`mailto:`. |

## Rules

1. **Every dynamic value is escaped.** Use `esc()` / `strong()` / `link()` / `safeUrl()`; helpers that take `html` expect already-escaped, trusted markup. Static copy in templates is trusted.
2. **Inline critical CSS.** The `<style>` block is progressive enhancement only.
3. **No** flexbox, grid, `position`, `box-shadow`, `calc()`, external CSS, `background-image`, `<hr>`, or conditional-comment wrappers around visible content.
4. Keep each email under ~100 KB (Gmail clips larger messages).
5. Adding a template: create `templates/<Name>.ts`, add a case to `tests/support/email-fixtures.ts`, and the `email-design-system` test covers structure, logo, buttons, contrast, escaping and link safety automatically.

## Logo assets

`web/public/email/rapto-logo.png` (dark wordmark) and `rapto-logo-white.png` (dark mode): the existing wordmark from `web/src/components/ui/NavLogo.tsx` (Space Grotesk Bold "Rapto" + `#22c55e` dot), converted to outlines and rendered to transparent PNG at **288×116 (3× of the 96×39 display size)**. They are static files served unauthenticated by the Next.js app at `https://app.rapto.cloud/email/…`; deploy the web app for the logo to appear. To regenerate: render the same wordmark from the Space Grotesk Bold font outlines (opentype.js → SVG → `sharp`), keep the 3× size and transparency.

## Verification checklist after deploy

```
curl -I https://app.rapto.cloud/email/rapto-logo.png        # 200, content-type: image/png
curl -I https://app.rapto.cloud/email/rapto-logo-white.png  # 200, content-type: image/png
```
Then send one test of each category to Gmail (web + mobile), Apple Mail and Outlook (desktop + web) and confirm logo, button background, and layout.
