import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors } from './shared/email-tokens'

export interface DeadlineReminderProps {
  name: string
  commitments: Array<{ id: string; text: string; dueDate: Date }>
  actionUrl: string
  unsubscribeToken?: string
}

export function renderDeadlineReminderHtml(props: DeadlineReminderProps): string {
  const { name, commitments, actionUrl, unsubscribeToken } = props

  const itemsHtml = commitments
    .map(
      (c) => `
<li style="margin-bottom: 12px; padding: 12px 16px; background-color: ${EmailColors.bgOuter}; border-radius: 6px; list-style-type: none; border-left: 3px solid ${EmailColors.brandPrimary};">
  <strong style="color: ${EmailColors.textHeadline};">"${c.text}"</strong><br />
  <span style="font-size: 12px; color: ${EmailColors.textMuted};">Due date: ${new Date(c.dueDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}</span>
</li>`
    )
    .join('')

  const content = `
<h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">Upcoming Commitment Deadlines</h2>
<p>Hi ${name},</p>
<p>This is a friendly reminder that you have <strong>${commitments.length}</strong> commitment${commitments.length === 1 ? '' : 's'} coming due today or tomorrow:</p>

<ul style="padding: 0; margin: 20px 0;">
  ${itemsHtml}
</ul>

<p>Completing your commitments on time maintains your Accountability Score and keeps your team aligned.</p>

${renderEmailButton({ href: actionUrl, label: 'View My Commitments', variant: 'primary' })}

<p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 24px;">
  Direct link: <a href="${actionUrl}" style="color: ${EmailColors.brandPrimary}; word-break: break-all;">${actionUrl}</a>
</p>`

  const footer = renderEmailFooter({
    notificationType: 'DEADLINE_REMINDER',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `Reminder: You have ${commitments.length} commitments due soon`,
    previewText: `Upcoming commitment deadline reminder`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
