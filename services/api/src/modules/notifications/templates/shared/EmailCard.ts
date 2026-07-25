import { EmailColors, EmailSpacing } from './email-tokens'

export interface EmailCardProps {
  contentHtml: string
  variant?: 'neutral' | 'warning' | 'danger' | 'success'
}

/**
 * Inner content section container for highlighting key blocks of information.
 */
export function renderEmailCard(props: EmailCardProps): string {
  const { contentHtml, variant = 'neutral' } = props

  let bg: string = EmailColors.bgOuter
  let border: string = EmailColors.borderCard
  let borderLeft = ''

  if (variant === 'warning') {
    bg = EmailColors.stateWarningBg
    border = EmailColors.stateWarningBg
    borderLeft = `border-left: 4px solid ${EmailColors.stateWarningBorder};`
  } else if (variant === 'danger') {
    bg = EmailColors.stateDangerBg
    border = EmailColors.stateDangerBg
    borderLeft = `border-left: 4px solid ${EmailColors.stateDangerBorder};`
  } else if (variant === 'success') {
    bg = EmailColors.stateSuccessBg
    border = EmailColors.stateSuccessBg
    borderLeft = `border-left: 4px solid ${EmailColors.stateSuccessBorder};`
  }

  return `
<div style="background-color: ${bg}; border: 1px solid ${border}; ${borderLeft} padding: 16px 20px; border-radius: ${EmailSpacing.borderRadiusCallout}; margin: 20px 0;">
  ${contentHtml}
</div>`
}
