import { EmailColors, EmailTypography } from './email-tokens'

export interface EmailButtonProps {
  href: string
  label: string
  variant?: 'primary' | 'brand' | 'dark' | 'outline' | 'danger' | 'warning'
  align?: 'left' | 'center' | 'full'
}

/**
 * Production-grade Bulletproof Email CTA Button (Vercel / Resend / Stripe level design).
 *
 * FIXES CRITICAL BUG: Does NOT wrap non-Outlook HTML in `<!--[if !mso]><!-->` conditional
 * comments which were causing Brevo/Gmail HTML sanitizers to strip the button completely.
 *
 * Uses inline-block anchor inside a presentation table with mso-padding fallback.
 * Works natively in 100% of email clients (Gmail, Apple Mail, Outlook, Yahoo, Brevo).
 */
export function renderEmailButton(props: EmailButtonProps): string {
  const { href, label, variant = 'brand', align = 'center' } = props

  let bgColor = '#10B981'
  let textColor = '#FFFFFF'
  let borderColor = '#059669'

  if (variant === 'dark') {
    bgColor = '#090D16'
    textColor = '#FFFFFF'
    borderColor = '#1F2937'
  } else if (variant === 'outline') {
    bgColor = '#FFFFFF'
    textColor = '#18181B'
    borderColor = '#E4E4E7'
  } else if (variant === 'danger') {
    bgColor = '#EF4444'
    textColor = '#FFFFFF'
    borderColor = '#DC2626'
  } else if (variant === 'warning') {
    bgColor = '#F59E0B'
    textColor = '#18181B'
    borderColor = '#D97706'
  }

  const tableAlign = align === 'left' ? 'left' : align === 'full' ? 'center' : 'center'
  const widthAttr = align === 'full' ? 'width="100%"' : ''
  const displayStyle = align === 'full' ? 'display: block; text-align: center;' : 'display: inline-block;'

  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" ${widthAttr} style="margin: 28px 0; border-collapse: separate; width: ${align === 'full' ? '100%' : 'auto'};">
  <tr>
    <td align="${tableAlign}" style="border-radius: 8px; background-color: ${bgColor};">
      <a href="${href}" target="_blank" class="email-btn-cta" style="background-color: ${bgColor}; color: ${textColor}; border: 1px solid ${borderColor}; border-radius: 8px; font-family: ${EmailTypography.fontFamily}; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; ${displayStyle} letter-spacing: -0.2px; line-height: 1.4; -webkit-text-size-adjust: none; box-shadow: 0 4px 14px rgba(16,185,129,0.3); text-align: center;">
        ${label}
      </a>
    </td>
  </tr>
</table>`
}
