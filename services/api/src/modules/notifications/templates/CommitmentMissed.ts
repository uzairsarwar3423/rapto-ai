import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailLinkFallback, renderEmailBadge, strong } from './shared/EmailContent'
import { EmailColors, EmailTypography } from './shared/email-tokens'
import { esc } from './shared/email-escape'

export interface CommitmentMissedProps {
  name: string
  commitmentText: string
  dueDate: Date
  actionUrl: string
  unsubscribeToken?: string
}

export function renderCommitmentMissedHtml(props: CommitmentMissedProps): string {
  const { name, commitmentText, dueDate, actionUrl, unsubscribeToken } = props
  const dueStr = new Date(dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const cardHtml =
    `<p style="margin: 0 0 10px 0;">${renderEmailBadge('Overdue', 'warning')}</p>` +
    `<p class="em-strong" style="margin: 0 0 6px 0; font-family: ${EmailTypography.fontFamily}; font-size: 15px; line-height: 22px; font-weight: ${EmailTypography.fontWeightSemiBold}; color: ${EmailColors.textHeadline};">&ldquo;${esc(commitmentText)}&rdquo;</p>` +
    `<p style="margin: 0; font-family: ${EmailTypography.fontFamily}; font-size: 13px; line-height: 18px; color: ${EmailColors.stateWarningText};">Was due on ${esc(dueStr)}</p>`

  const content = [
    renderEmailHeading('Commitment Overdue Alert'),
    renderEmailText(`Hi ${strong(name)},`),
    renderEmailText('You missed the scheduled deadline for the following commitment:'),
    renderEmailCard({ contentHtml: cardHtml, variant: 'warning' }),
    renderEmailText('Updating your commitment status or requesting a deadline adjustment keeps your workspace team up to date.'),
    renderEmailButton({ href: actionUrl, label: 'Resolve Commitment', variant: 'primary', align: 'left' }),
    renderEmailLinkFallback(actionUrl, 'Direct link:'),
  ].join('')

  return renderEmailLayout({
    title: `⚠️ Commitment Overdue: Action required`,
    previewText: `Commitment "${commitmentText}" is past its due date`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'COMMITMENT_MISSED', unsubscribeToken }),
  })
}
