import { EmailColors, EmailTypography } from './email-tokens'

export interface EmailStatCalloutProps {
  value: string | number
  label: string
  variant?: 'primary' | 'warning' | 'neutral' | 'success'
}

/**
 * Stat callout primitive (number + label block) for usage metrics and digests.
 */
export function renderEmailStatCallout(props: EmailStatCalloutProps): string {
  const { value, label, variant = 'primary' } = props

  let valueColor: string = EmailColors.brandPrimary
  if (variant === 'warning') {
    valueColor = EmailColors.stateWarningBorder
  } else if (variant === 'neutral') {
    valueColor = EmailColors.textHeadline
  } else if (variant === 'success') {
    valueColor = EmailColors.stateSuccessBorder
  }

  return `
<div style="background-color: ${EmailColors.bgOuter}; border: 1px solid ${EmailColors.borderCard}; border-radius: 6px; padding: 16px; text-align: center; font-family: ${EmailTypography.fontFamily};">
  <div style="font-size: 28px; font-weight: ${EmailTypography.fontWeightBold}; color: ${valueColor}; line-height: 1;">
    ${value}
  </div>
  <div style="font-size: ${EmailTypography.fontSizeSmall}; color: ${EmailColors.textMuted}; font-weight: ${EmailTypography.fontWeightMedium}; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
    ${label}
  </div>
</div>`
}
