import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailStatCallout } from './shared/EmailStatCallout'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailLinkFallback, renderEmailEyebrow, strong } from './shared/EmailContent'
import { EmailColors, EmailTypography } from './shared/email-tokens'
import { esc } from './shared/email-escape'

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

  const summaryCardHtml =
    renderEmailEyebrow('Summary overview') +
    `<p class="em-text" style="margin: 0; font-family: ${EmailTypography.fontFamily}; font-size: 14px; line-height: 22px; color: ${EmailColors.textHeadline}; white-space: pre-line;">${esc(summary || 'No summary text extracted.')}</p>`

  // Two equal columns that stack on mobile. Table-based so Outlook keeps the gutter.
  const statsHtml = `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; border-collapse: collapse;">
  <tr>
    <td class="em-stack" width="50%" valign="top" style="padding-right: 6px;">${renderEmailStatCallout({ value: commitmentsCount, label: 'Commitments', variant: 'primary' })}</td>
    <td class="em-stack" width="50%" valign="top" style="padding-left: 6px;">${renderEmailStatCallout({ value: actionItemsCount, label: 'Action Items', variant: 'neutral' })}</td>
  </tr>
</table>`

  const content = [
    renderEmailHeading('Meeting Summary', meetingTitle),
    renderEmailText(`Hi ${strong(name)},`),
    renderEmailText('Here is the automated summary and key takeaways from your recent meeting:'),
    renderEmailCard({ contentHtml: summaryCardHtml, variant: 'neutral' }),
    statsHtml,
    renderEmailButton({ href: viewUrl, label: 'View Full Meeting Details', variant: 'primary', align: 'left' }),
    renderEmailLinkFallback(viewUrl, 'Direct link:'),
  ].join('')

  return renderEmailLayout({
    title: `Meeting Summary: ${meetingTitle}`,
    previewText: `Summary & key takeaways from ${meetingTitle}`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'MEETING_PROCESSED', unsubscribeToken }),
  })
}
