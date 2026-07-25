import { EmailColors, EmailTypography, EmailSpacing } from './email-tokens'

export interface EmailLayoutProps {
  title: string
  previewText?: string
  childrenHtml: string
  footerHtml?: string
}

/**
 * Outer wrapper for all Vocaply transactional emails.
 * Table-based 580px responsive layout with full Dark Mode support and email client compatibility.
 */
export function renderEmailLayout(props: EmailLayoutProps): string {
  const { title, previewText, childrenHtml, footerHtml } = props

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${title}</title>
  ${previewText ? `<meta name="description" content="${previewText}" />` : ''}
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      background-color: ${EmailColors.bgOuter};
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }
    p { margin: 0 0 16px 0; }
    a { color: ${EmailColors.brandPrimary}; text-decoration: none; }

    .email-btn-cta:hover {
      opacity: 0.92 !important;
    }

    /* Dark Mode Media Query overrides */
    @media (prefers-color-scheme: dark) {
      body, .email-outer-bg {
        background-color: #0B0F19 !important;
      }
      .email-card-bg {
        background-color: #111827 !important;
        border-color: #1F2937 !important;
      }
      .email-header-border {
        border-bottom-color: #1F2937 !important;
      }
      .email-headline-text {
        color: #F9FAFB !important;
      }
      .email-body-text {
        color: #D1D5DB !important;
      }
      .email-muted-text {
        color: #9CA3AF !important;
      }
      .email-inner-card {
        background-color: #1F2937 !important;
        border-color: #374151 !important;
      }
      .email-btn-cta {
        background-color: #10B981 !important;
        color: #FFFFFF !important;
        border-color: #059669 !important;
        box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4) !important;
      }
    }

    /* Mobile responsiveness */
    @media only screen and (max-width: 600px) {
      .email-card-padding {
        padding: 24px 16px !important;
      }
      .email-container {
        width: 100% !important;
      }
      .email-btn-cta {
        display: block !important;
        width: 100% !important;
        text-align: center !important;
        box-sizing: border-box !important;
      }
    }
  </style>
</head>
<body class="email-outer-bg" style="background-color: ${EmailColors.bgOuter}; margin: 0; padding: 32px 12px; font-family: ${EmailTypography.fontFamily}; color: ${EmailColors.textBody};">
  ${previewText ? `<div style="display: none; max-height: 0px; overflow: hidden; opacity: 0; mso-hide: all;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table role="presentation" class="email-container email-card-bg" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: ${EmailSpacing.containerMaxWidth}; background-color: ${EmailColors.bgCard}; border: 1px solid ${EmailColors.borderCard}; border-radius: ${EmailSpacing.borderRadiusCard}; border-collapse: separate; overflow: hidden;">
          
          <!-- Header Bar with Brand Wordmark -->
          <tr>
            <td class="email-header-border" style="padding: 24px 32px 16px 32px; border-bottom: 1px solid ${EmailColors.borderDivider};">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span class="email-headline-text" style="font-size: 18px; font-weight: ${EmailTypography.fontWeightBold}; color: ${EmailColors.textHeadline}; letter-spacing: -0.5px; font-family: ${EmailTypography.fontFamily};">
                      ⚡ Vocaply
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td class="email-card-padding email-body-text" style="padding: ${EmailSpacing.paddingCard}; font-size: ${EmailTypography.fontSizeBody}; line-height: ${EmailTypography.lineHeightBody}; color: ${EmailColors.textBody}; font-family: ${EmailTypography.fontFamily};">
              ${childrenHtml}
            </td>
          </tr>

          <!-- Optional Footer Inside Card -->
          ${footerHtml ? `
          <tr>
            <td style="padding: 0 32px 24px 32px; font-family: ${EmailTypography.fontFamily};">
              ${footerHtml}
            </td>
          </tr>
          ` : ''}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

