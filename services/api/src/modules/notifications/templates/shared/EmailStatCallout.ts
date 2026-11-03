import { EmailColors, EmailTypography } from './email-tokens'
import { esc } from './email-escape'

export interface EmailStatCalloutProps {
  value: string | number
  label: string
  variant?: 'primary' | 'warning' | 'neutral' | 'success'
}

/**
 * Stat tile (number + label) for usage metrics and digests. Table-based so it sizes and pads correctly in Outlook.
 */
export function renderEmailStatCallout(props: EmailStatCalloutProps): string {
  const { value, label, variant = 'primary' } = props

  let valueColor: string = EmailColors.brandText
  if (variant === 'warning') valueColor = EmailColors.stateWarningText
  else if (variant === 'neutral') valueColor = EmailColors.textHeadline
  else if (variant === 'success') valueColor = EmailColors.stateSuccessText

  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: separate;">
  <tr>
    <td class="em-card" align="center" bgcolor="${EmailColors.bgSubtle}" style="background-color: ${EmailColors.bgSubtle}; border: 1px solid ${EmailColors.borderCard}; border-radius: 8px; padding: 16px 8px; font-family: ${EmailTypography.fontFamily};">
      <div style="font-size: 28px; line-height: 32px; font-weight: ${EmailTypography.fontWeightSemiBold}; color: ${valueColor}; letter-spacing: -0.5px;">${esc(value)}</div>
      <div class="em-muted" style="font-size: 12px; line-height: 16px; color: ${EmailColors.textMuted}; font-weight: ${EmailTypography.fontWeightMedium}; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px;">${esc(label)}</div>
    </td>
  </tr>
</table>`
}
