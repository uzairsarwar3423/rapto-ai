import { EmailColors, EmailSpacing } from './email-tokens'

export interface EmailCardProps {
  contentHtml: string
  variant?: 'neutral' | 'warning' | 'danger' | 'success'
}

/**
 * Information card. A single-cell table (Outlook ignores padding/border-radius/margins on <div>), a hairline border and,
 * for state variants, a 3px accent rule on the left so status is conveyed without decoration.
 */
export function renderEmailCard(props: EmailCardProps): string {
  const { contentHtml, variant = 'neutral' } = props

  let bg: string = EmailColors.bgSubtle
  let border: string = EmailColors.borderCard
  let accent = ''
  let cls = 'em-card'

  if (variant === 'warning') {
    bg = EmailColors.stateWarningBg
    border = '#FDE68A'
    accent = `border-left: 3px solid ${EmailColors.stateWarningBorder};`
    cls = 'em-card em-card-warning'
  } else if (variant === 'danger') {
    bg = EmailColors.stateDangerBg
    border = '#FECACA'
    accent = `border-left: 3px solid ${EmailColors.stateDangerBorder};`
    cls = 'em-card em-card-danger'
  } else if (variant === 'success') {
    bg = EmailColors.stateSuccessBg
    border = '#A7F3D0'
    accent = `border-left: 3px solid ${EmailColors.stateSuccessBorder};`
    cls = 'em-card em-card-success'
  }

  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; border-collapse: separate;">
  <tr>
    <td class="${cls}" bgcolor="${bg}" style="background-color: ${bg}; border: 1px solid ${border}; ${accent} border-radius: ${EmailSpacing.borderRadiusCallout}; padding: 16px 20px;">
      ${contentHtml}
    </td>
  </tr>
</table>`
}
