import { EmailColors, EmailTypography, EmailSpacing } from './email-tokens'
import { renderEmailBrandLogo } from './EmailBrandLogo'
import { esc } from './email-escape'

export interface EmailLayoutProps {
  title: string
  previewText?: string
  childrenHtml: string
  footerHtml?: string
}

/**
 * Outer wrapper for every Rapto transactional email.
 *
 * Engineered for real mail clients, not browsers:
 *  • Table layout. The page background is set on a full-width table (bgcolor attribute + inline style) because Outlook
 *    ignores <body> padding/background. Centering and the 600px cap use align="center" + max-width, with an
 *    Outlook-only "ghost table" so the 600px width is honoured by the Word engine.
 *  • Every critical style is inline. The <style> block only adds progressive enhancement: dark mode
 *    (prefers-color-scheme, plus Outlook.com's [data-ogsc]/[data-ogsb]) and mobile tweaks.
 *  • Explicit background colours everywhere so forced dark-mode inversion keeps the intended contrast.
 *  • Hidden preheader text for inbox previews. Title and preview text are escaped.
 */
export function renderEmailLayout(props: EmailLayoutProps): string {
  const { title, previewText, childrenHtml, footerHtml } = props
  const font = EmailTypography.fontFamily
  const width = EmailSpacing.containerWidth

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${esc(title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { text-decoration: none; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    u + #body a { color: inherit; text-decoration: none; font-size: inherit; font-family: inherit; font-weight: inherit; line-height: inherit; }

    /* ── Mobile ── */
    @media only screen and (max-width: 620px) {
      .em-pad { padding: 24px 20px !important; }
      .em-container { width: 100% !important; max-width: 100% !important; }
      .em-btn-table { width: 100% !important; }
      .em-btn-link { display: block !important; padding: 14px 20px !important; }
      .em-stack { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; padding-bottom: 12px !important; }
    }

    /* ── Dark mode (Apple Mail, iOS Mail, Outlook.com, Outlook apps). Gmail applies its own inversion. ── */
    @media (prefers-color-scheme: dark) {
      body, .em-bg { background-color: #09090B !important; }
      .em-heading, .em-strong { color: #FAFAFA !important; }
      .em-text { color: #D4D4D8 !important; }
      .em-muted { color: #A1A1AA !important; }
      .em-link { color: #34D399 !important; }
      .em-card { background-color: #18181B !important; border-color: #27272A !important; }
      .em-card-warning { background-color: #1F1A0E !important; border-color: #3F2F0B !important; }
      .em-card-danger { background-color: #1F1214 !important; border-color: #451A1D !important; }
      .em-card-success { background-color: #0E1F18 !important; border-color: #14412F !important; }
      .em-border-bg { background-color: #27272A !important; }
      .em-row-border { border-color: #27272A !important; }
      .em-logo-light { display: none !important; max-height: 0 !important; overflow: hidden !important; }
      .em-logo-dark { display: block !important; max-height: none !important; overflow: visible !important; }
    }
    /* Outlook.com dark mode */
    [data-ogsb] .em-bg { background-color: #09090B !important; }
    [data-ogsc] .em-heading, [data-ogsc] .em-strong { color: #FAFAFA !important; }
    [data-ogsc] .em-text { color: #D4D4D8 !important; }
    [data-ogsc] .em-muted { color: #A1A1AA !important; }
    [data-ogsc] .em-link { color: #34D399 !important; }
    [data-ogsb] .em-card { background-color: #18181B !important; }
    [data-ogsb] .em-border-bg { background-color: #27272A !important; }
  </style>
</head>
<body id="body" class="em-bg" bgcolor="${EmailColors.bgOuter}" style="margin: 0; padding: 0; background-color: ${EmailColors.bgOuter}; font-family: ${font}; color: ${EmailColors.textBody};">
  ${
    previewText
      ? `<div style="display: none; font-size: 1px; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all;">${esc(previewText)}${'&nbsp;&zwnj;'.repeat(40)}</div>`
      : ''
  }
  <table role="presentation" class="em-bg" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${EmailColors.bgOuter}" style="background-color: ${EmailColors.bgOuter};">
    <tr>
      <td align="center" class="em-pad" style="padding: 40px 16px;">
        <!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${width}" align="center"><tr><td><![endif]-->
        <table role="presentation" class="em-container" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; max-width: ${EmailSpacing.containerMaxWidth}; margin: 0 auto;">

          <!-- Header: logo -->
          <tr>
            <td align="left" style="padding: 0 0 20px 0;">
              ${renderEmailBrandLogo()}
            </td>
          </tr>
          <tr>
            <td height="1" bgcolor="${EmailColors.borderCard}" class="em-border-bg" style="height: 1px; line-height: 1px; font-size: 1px; mso-line-height-rule: exactly; background-color: ${EmailColors.borderCard};">&nbsp;</td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="em-text" align="left" style="padding: ${EmailSpacing.paddingCard}; font-family: ${font}; font-size: ${EmailTypography.fontSizeBody}; line-height: ${EmailTypography.lineHeightBody}; color: ${EmailColors.textBody};">
              ${childrenHtml}
            </td>
          </tr>
          ${
            footerHtml
              ? `
          <!-- Footer -->
          <tr>
            <td align="left" style="padding: 16px 0 0 0; font-family: ${font};">
              ${footerHtml}
            </td>
          </tr>`
              : ''
          }
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`
}
