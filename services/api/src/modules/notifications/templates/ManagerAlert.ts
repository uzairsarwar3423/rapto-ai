import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailLinkFallback, renderEmailBadge, strong } from './shared/EmailContent'
import { EmailColors, EmailTypography } from './shared/email-tokens'
import { esc } from './shared/email-escape'

export interface ManagerAlertProps {
  name: string
  assigneeName: string
  commitmentText: string
  dueDate: Date
  actionUrl: string
  unsubscribeToken?: string
}

export function renderManagerAlertHtml(props: ManagerAlertProps): string {
  const { name, assigneeName, commitmentText, dueDate, actionUrl, unsubscribeToken } = props
  const dueStr = new Date(dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const cardHtml =
    `<p style="margin: 0 0 10px 0;">${renderEmailBadge('Owner: ' + assigneeName, 'warning')}</p>` +
    `<p class="em-strong" style="margin: 0 0 6px 0; font-family: ${EmailTypography.fontFamily}; font-size: 15px; line-height: 22px; font-weight: ${EmailTypography.fontWeightMedium}; color: ${EmailColors.textHeadline};">&ldquo;${esc(commitmentText)}&rdquo;</p>` +
    `<p style="margin: 0; font-family: ${EmailTypography.fontFamily}; font-size: 13px; line-height: 18px; color: ${EmailColors.stateWarningText};">Was due on ${esc(dueStr)}</p>`

  const content = [
    renderEmailHeading('Manager Accountability Alert'),
    renderEmailText(`Hi ${strong(name)},`),
    renderEmailText('This is an automated alert to notify you that a member of your team missed a commitment deadline:'),
    renderEmailCard({ contentHtml: cardHtml, variant: 'warning' }),
    renderEmailText('As their manager, you can follow up or adjust deadlines in your workspace dashboard.'),
    renderEmailButton({ href: actionUrl, label: 'View Workspace Dashboard', variant: 'primary', align: 'left' }),
    renderEmailLinkFallback(actionUrl, 'Direct link:'),
  ].join('')

  return renderEmailLayout({
    title: `Alert: ${assigneeName} missed a commitment deadline`,
    previewText: `Team member ${assigneeName} missed a commitment deadline`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'MANAGER_ALERT', unsubscribeToken }),
  })
}
