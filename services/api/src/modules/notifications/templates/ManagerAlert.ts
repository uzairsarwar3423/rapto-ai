import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors } from './shared/email-tokens'

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
  const dueStr = new Date(dueDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const cardHtml = `
<p style="margin: 0; font-weight: 600; color: ${EmailColors.stateWarningText};">Owner: ${assigneeName}</p>
<p style="margin: 8px 0 0 0; font-weight: 500; color: ${EmailColors.textHeadline};">"${commitmentText}"</p>
<p style="margin: 4px 0 0 0; font-size: 12px; color: ${EmailColors.stateWarningText};">Was due on: ${dueStr}</p>`

  const content = `
<h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">Manager Accountability Alert</h2>
<p>Hi ${name},</p>
<p>This is an automated alert to notify you that a member of your team missed a commitment deadline:</p>

${renderEmailCard({ contentHtml: cardHtml, variant: 'warning' })}

<p>As their manager, you can follow up or adjust deadlines in your workspace dashboard.</p>

${renderEmailButton({ href: actionUrl, label: 'View Workspace Dashboard', variant: 'warning' })}

<p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 24px;">
  Direct link: <a href="${actionUrl}" style="color: ${EmailColors.brandPrimary}; word-break: break-all;">${actionUrl}</a>
</p>`

  const footer = renderEmailFooter({
    notificationType: 'MANAGER_ALERT',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `Alert: ${assigneeName} missed a commitment deadline`,
    previewText: `Team member ${assigneeName} missed a commitment deadline`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
