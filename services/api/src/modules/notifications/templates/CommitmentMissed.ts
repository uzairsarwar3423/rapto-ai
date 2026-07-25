import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors } from './shared/email-tokens'

export interface CommitmentMissedProps {
  name: string
  commitmentText: string
  dueDate: Date
  actionUrl: string
  unsubscribeToken?: string
}

export function renderCommitmentMissedHtml(props: CommitmentMissedProps): string {
  const { name, commitmentText, dueDate, actionUrl, unsubscribeToken } = props
  const dueStr = new Date(dueDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const cardHtml = `
<p style="margin: 0; font-weight: 600; color: ${EmailColors.stateWarningText};">⚠️ Overdue Commitment</p>
<p style="margin: 8px 0 0 0; font-weight: 600; color: ${EmailColors.textHeadline}; font-size: 15px;">"${commitmentText}"</p>
<p style="margin: 4px 0 0 0; font-size: 12px; color: ${EmailColors.stateWarningText};">Was due on: ${dueStr}</p>`

  const content = `
<h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">Commitment Overdue Alert</h2>
<p>Hi ${name},</p>
<p>You missed the scheduled deadline for the following commitment:</p>

${renderEmailCard({ contentHtml: cardHtml, variant: 'warning' })}

<p>Updating your commitment status or requesting a deadline adjustment keeps your workspace team up to date.</p>

${renderEmailButton({ href: actionUrl, label: 'Resolve Commitment', variant: 'warning' })}

<p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 24px;">
  Direct link: <a href="${actionUrl}" style="color: ${EmailColors.brandPrimary}; word-break: break-all;">${actionUrl}</a>
</p>`

  const footer = renderEmailFooter({
    notificationType: 'COMMITMENT_MISSED',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `⚠️ Commitment Overdue: Action required`,
    previewText: `Commitment "${commitmentText}" is past its due date`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
