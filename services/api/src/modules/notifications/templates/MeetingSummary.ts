import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailStatCallout } from './shared/EmailStatCallout'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors } from './shared/email-tokens'

export interface MeetingSummaryProps {
  name: string
  meetingTitle: string
  summary: string
  commitmentsCount: number
  actionItemsCount: number
  viewUrl: string
  unsubscribeToken?: string
}

export function renderMeetingSummaryHtml(props: MeetingSummaryProps): string {
  const { name, meetingTitle, summary, commitmentsCount, actionItemsCount, viewUrl, unsubscribeToken } = props

  const summaryCardHtml = `
<p style="margin: 0; font-weight: 600; font-size: 13px; color: ${EmailColors.brandPrimary}; text-transform: uppercase; letter-spacing: 0.5px;">Summary Overview</p>
<p style="margin: 8px 0 0 0; font-style: italic; color: ${EmailColors.textHeadline}; white-space: pre-line;">${summary || 'No summary text extracted.'}</p>`

  const statsGridHtml = `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0;">
  <tr>
    <td width="48%" align="center">
      ${renderEmailStatCallout({ value: commitmentsCount, label: 'Commitments', variant: 'primary' })}
    </td>
    <td width="4%"></td>
    <td width="48%" align="center">
      ${renderEmailStatCallout({ value: actionItemsCount, label: 'Action Items', variant: 'neutral' })}
    </td>
  </tr>
</table>`

  const content = `
<h2 style="margin: 0 0 4px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">Meeting Summary</h2>
<p style="font-size: 15px; color: ${EmailColors.textMuted}; margin-bottom: 20px;">${meetingTitle}</p>

<p>Hi ${name},</p>
<p>Here is the automated summary and key takeaways from your recent meeting:</p>

${renderEmailCard({ contentHtml: summaryCardHtml, variant: 'success' })}

${statsGridHtml}

${renderEmailButton({ href: viewUrl, label: 'View Full Meeting Details', variant: 'primary' })}

<p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 24px;">
  Direct link: <a href="${viewUrl}" style="color: ${EmailColors.brandPrimary}; word-break: break-all;">${viewUrl}</a>
</p>`

  const footer = renderEmailFooter({
    notificationType: 'MEETING_PROCESSED',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `Meeting Summary: ${meetingTitle}`,
    previewText: `Summary & key takeaways from ${meetingTitle}`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
