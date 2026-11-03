import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailHeading, renderEmailText, renderEmailLinkFallback, strong } from './shared/EmailContent'
import { EmailColors, EmailTypography } from './shared/email-tokens'
import { esc } from './shared/email-escape'

export interface DeadlineReminderProps {
  name: string
  commitments: Array<{ id: string; text: string; dueDate: Date }>
  actionUrl: string
  unsubscribeToken?: string
}

export function renderDeadlineReminderHtml(props: DeadlineReminderProps): string {
  const { name, commitments, actionUrl, unsubscribeToken } = props

  const itemsHtml = commitments
    .map((c, i) => {
      const due = new Date(c.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      const rule = i === commitments.length - 1 ? '' : `border-bottom: 1px solid ${EmailColors.borderDivider};`
      return `
<tr>
  <td class="em-row-border" style="padding: 10px 0; ${rule} font-family: ${EmailTypography.fontFamily};">
    <p class="em-strong" style="margin: 0 0 2px 0; font-size: 14px; line-height: 20px; font-weight: ${EmailTypography.fontWeightSemiBold}; color: ${EmailColors.textHeadline};">&ldquo;${esc(c.text)}&rdquo;</p>
    <p class="em-muted" style="margin: 0; font-size: 13px; line-height: 18px; color: ${EmailColors.textMuted};">Due date: ${esc(due)}</p>
  </td>
</tr>`
    })
    .join('')

  const listHtml = renderEmailCard({
    variant: 'neutral',
    contentHtml: `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">${itemsHtml}</table>`,
  })

  const count = commitments.length
  const content = [
    renderEmailHeading('Upcoming Commitment Deadlines'),
    renderEmailText(`Hi ${strong(name)},`),
    renderEmailText(`This is a friendly reminder that you have ${strong(count)} commitment${count === 1 ? '' : 's'} coming due today or tomorrow:`),
    listHtml,
    renderEmailText('Completing your commitments on time maintains your Accountability Score and keeps your team aligned.'),
    renderEmailButton({ href: actionUrl, label: 'View My Commitments', variant: 'primary', align: 'left' }),
    renderEmailLinkFallback(actionUrl, 'Direct link:'),
  ].join('')

  return renderEmailLayout({
    title: `Reminder: You have ${count} commitments due soon`,
    previewText: `Upcoming commitment deadline reminder`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'DEADLINE_REMINDER', unsubscribeToken }),
  })
}
