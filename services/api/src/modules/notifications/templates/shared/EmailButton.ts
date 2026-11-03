import { EmailColors, EmailTypography, EmailSpacing } from './email-tokens'
import { esc, safeUrl } from './email-escape'

export interface EmailButtonProps {
  href: string
  label: string
  variant?: 'primary' | 'brand' | 'dark' | 'outline' | 'danger' | 'warning'
  align?: 'left' | 'center' | 'full'
}

interface ButtonTheme {
  bg: string
  text: string
  border: string
}

const THEMES: Record<NonNullable<EmailButtonProps['variant']>, ButtonTheme> = {
  // primary / brand: Rapto emerald, deep enough for AA contrast with white text (5.5:1)
  primary: { bg: EmailColors.brandAction, text: '#FFFFFF', border: EmailColors.brandActionBorder },
  brand: { bg: EmailColors.brandAction, text: '#FFFFFF', border: EmailColors.brandActionBorder },
  dark: { bg: '#18181B', text: '#FFFFFF', border: '#18181B' },
  outline: { bg: '#FFFFFF', text: '#18181B', border: '#D4D4D8' },
  danger: { bg: '#DC2626', text: '#FFFFFF', border: '#B91C1C' },
  warning: { bg: '#F59E0B', text: '#18181B', border: '#D97706' },
}

/**
 * Bulletproof CTA button.
 *
 * Why this shape: the colour, border and PADDING live on the <td> (Outlook's Word engine ignores padding and
 * background on <a>), the <a> fills the cell with its own padding for every other client, and the background is set
 * three ways (bgcolor attribute, inline background-color, border) so it survives style stripping and forced
 * dark-mode inversion. Text colour is set on the <a> AND an inner <span> so link-colour overrides (Gmail iOS, Apple
 * Data Detectors) cannot recolour it. No box-shadow, no flexbox, no external CSS, no conditional-comment wrapper
 * (an earlier version wrapped the button in `<!--[if !mso]>` and Brevo's sanitizer removed it entirely).
 *
 * Outlook desktop renders the same solid rectangle; only the rounded corners degrade to square (VML would be needed
 * for those and was deliberately not used — it requires conditional comments around the button, which previously
 * caused the sanitizer problem).
 */
export function renderEmailButton(props: EmailButtonProps): string {
  const { href, label, variant = 'brand', align = 'center' } = props
  const t = THEMES[variant] ?? THEMES.brand
  const url = safeUrl(href)
  const text = esc(label)
  const radius = EmailSpacing.borderRadiusButton
  const full = align === 'full'
  const cellAlign = align === 'left' ? 'left' : 'center'
  const font = EmailTypography.fontFamily

  // An outer full-width table + aligned cell positions the button WITHOUT `align` on the button table itself:
  // `<table align="left">` floats, and the following paragraphs would wrap beside the button.
  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
  <tr>
    <td align="${cellAlign}" style="padding: 12px 0 16px 0;">
      <table role="presentation" class="em-btn-table" border="0" cellpadding="0" cellspacing="0" ${full ? 'width="100%"' : ''} style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; ${full ? 'width: 100%;' : ''}">
        <tr>
          <td align="center" bgcolor="${t.bg}" class="em-btn-cell" style="background-color: ${t.bg}; border: 1px solid ${t.border}; border-radius: ${radius}; mso-padding-alt: 12px 28px;">
            <a href="${url}" target="_blank" class="em-btn-link" style="display: inline-block; padding: 12px 28px; font-family: ${font}; font-size: 15px; line-height: 20px; font-weight: 600; color: ${t.text}; text-decoration: none; border-radius: ${radius}; mso-line-height-rule: exactly; -webkit-text-size-adjust: none; text-align: center;"><span class="em-btn-text" style="color: ${t.text}; text-decoration: none;">${text}</span></a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}
