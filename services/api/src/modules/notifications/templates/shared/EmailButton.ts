import { EmailColors, EmailTypography, EmailSpacing } from './email-tokens'

export interface EmailButtonProps {
  href: string
  label: string
  variant?: 'primary' | 'brand' | 'dark' | 'outline' | 'danger' | 'warning'
  align?: 'left' | 'center' | 'full'
}

/**
 * World-Class SaaS CTA Button Primitive (Linear / Vercel / Resend level UI/UX).
 * Features:
 *  - Bulletproof VML fallback for Microsoft Outlook & Office 365
 *  - Elevated box-shadow & crisp 8px border-radius
 *  - High-contrast typography & subtle letter-spacing
 *  - Native Dark Mode media query compatibility
 */
export function renderEmailButton(props: EmailButtonProps): string {
  const { href, label, variant = 'brand', align = 'left' } = props

  let bgColor = '#18181B'
  let textColor = '#FFFFFF'
  let borderColor = '#18181B'
  let shadowStyle = 'box-shadow: 0 2px 5px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06);'

  if (variant === 'brand' || variant === 'primary') {
    bgColor = EmailColors.brandPrimary // Emerald #10B981
    textColor = '#FFFFFF'
    borderColor = '#059669'
    shadowStyle = 'box-shadow: 0 4px 14px rgba(16,185,129,0.35), 0 1px 2px rgba(16,185,129,0.2);'
  } else if (variant === 'dark') {
    bgColor = '#090D16'
    textColor = '#F9FAFB'
    borderColor = '#1F2937'
    shadowStyle = 'box-shadow: 0 4px 12px rgba(0,0,0,0.25);'
  } else if (variant === 'outline') {
    bgColor = '#FFFFFF'
    textColor = '#18181B'
    borderColor = '#E4E4E7'
    shadowStyle = 'box-shadow: 0 1px 2px rgba(0,0,0,0.05);'
  } else if (variant === 'danger') {
    bgColor = EmailColors.stateDangerBorder
    textColor = '#FFFFFF'
    borderColor = '#DC2626'
    shadowStyle = 'box-shadow: 0 4px 14px rgba(239,68,68,0.3);'
  } else if (variant === 'warning') {
    bgColor = EmailColors.stateWarningBorder
    textColor = '#18181B'
    borderColor = '#D97706'
  }

  const tableAlign = align === 'center' ? 'center' : align === 'full' ? 'center' : 'left'
  const widthAttr = align === 'full' ? 'width="100%"' : ''
  const displayStyle = align === 'full' ? 'display: block; text-align: center;' : 'display: inline-block;'

  return `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;v-text-anchor:middle;width:${align === 'full' ? '500px' : '220px'};" arcsize="18%" stroke="f" fillcolor="${bgColor}">
  <w:anchorlock/>
  <center style="color:${textColor};font-family:${EmailTypography.fontFamily};font-size:14px;font-weight:600;letter-spacing:-0.2px;">
    ${label}
  </center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" ${widthAttr} style="margin: 26px 0 20px 0; border-collapse: separate;">
  <tr>
    <td align="${tableAlign}" style="border-radius: 8px;">
      <a href="${href}" target="_blank" class="email-btn-cta" style="background-color: ${bgColor}; color: ${textColor}; border: 1px solid ${borderColor}; border-radius: 8px; font-family: ${EmailTypography.fontFamily}; font-size: 14px; font-weight: 600; text-decoration: none; padding: 13px 28px; ${displayStyle} ${shadowStyle} letter-spacing: -0.2px; line-height: 1.4; transition: all 0.15s ease-in-out; -webkit-text-size-adjust: none;">
        ${label}
      </a>
    </td>
  </tr>
</table>
<!--<![endif]-->`
}
