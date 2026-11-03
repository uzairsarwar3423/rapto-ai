import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailStatCallout } from './shared/EmailStatCallout'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailList, renderEmailEyebrow, strong } from './shared/EmailContent'
import { EmailColors, EmailTypography } from './shared/email-tokens'
import { esc } from './shared/email-escape'

export interface WeeklyDigestTemplateProps {
  recipientName: string
  teamName: string
  healthScore: number
  healthScoreChange: number
  fulfilledCount: number
  missedCount: number
  mostImproved: Array<{ name: string; change: number; currentScore: number }>
  mostDeclined: Array<{ name: string; change: number; currentScore: number }>
  upcomingDeadlines: Array<{ text: string; ownerName: string; dueDate: string }>
  dashboardUrl: string
  unsubscribeToken?: string
}

export function renderWeeklyDigestHtml(props: WeeklyDigestTemplateProps): string {
  const {
    recipientName,
    teamName,
    healthScore,
    healthScoreChange,
    fulfilledCount,
    missedCount,
    mostImproved,
    mostDeclined,
    upcomingDeadlines,
    dashboardUrl,
    unsubscribeToken,
  } = props

  const deltaLabel =
    healthScoreChange > 0
      ? `+${healthScoreChange} pts vs last week`
      : healthScoreChange < 0
      ? `${healthScoreChange} pts vs last week`
      : `Same as last week`

  // Three equal columns that stack on mobile.
  const statsHtml = `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; border-collapse: collapse;">
  <tr>
    <td class="em-stack" width="33%" valign="top" style="padding-right: 6px;">${renderEmailStatCallout({ value: `${healthScore}%`, label: 'Team Health', variant: 'primary' })}</td>
    <td class="em-stack" width="33%" valign="top" style="padding: 0 3px;">${renderEmailStatCallout({ value: fulfilledCount, label: 'Fulfilled', variant: 'success' })}</td>
    <td class="em-stack" width="33%" valign="top" style="padding-left: 6px;">${renderEmailStatCallout({ value: missedCount, label: 'Missed', variant: 'warning' })}</td>
  </tr>
</table>`

  const memberLine = (m: { name: string; change: number; currentScore: number }, sign: string) =>
    `${strong(m.name)}: ${sign}${m.change} pts (Score: ${esc(m.currentScore)}%)`

  const improvedHtml =
    mostImproved.length > 0
      ? renderEmailEyebrow('Top improved members', EmailColors.stateSuccessText) +
        renderEmailList(mostImproved.map((m) => memberLine(m, '+')), '&#10003;', EmailColors.stateSuccessText)
      : ''

  const declinedHtml =
    mostDeclined.length > 0
      ? renderEmailEyebrow('Score attention needed', EmailColors.stateWarningText) +
        renderEmailList(mostDeclined.map((m) => memberLine(m, '')), '&bull;', EmailColors.stateWarningText)
      : ''

  const upcomingHtml =
    upcomingDeadlines.length > 0
      ? renderEmailEyebrow('Upcoming deadlines (next 7 days)') +
        renderEmailList(upcomingDeadlines.map((u) => `${strong(u.text)} &mdash; ${esc(u.ownerName)}`))
      : ''

  const overviewCardHtml =
    renderEmailEyebrow('Weekly performance trend') +
    `<p class="em-text" style="margin: 0; font-family: ${EmailTypography.fontFamily}; font-size: 15px; line-height: 22px; color: ${EmailColors.textHeadline};">Current team health: ${strong(`${healthScore}%`)} (${esc(deltaLabel)})</p>`

  const content = [
    renderEmailHeading('Weekly Team Health Digest', teamName),
    renderEmailText(`Hi ${strong(recipientName)},`),
    renderEmailText("Here is your team's weekly accountability and commitment health summary:"),
    statsHtml,
    renderEmailCard({ contentHtml: overviewCardHtml, variant: 'neutral' }),
    improvedHtml,
    declinedHtml,
    upcomingHtml,
    renderEmailButton({ href: dashboardUrl, label: 'View Full Team Dashboard', variant: 'primary', align: 'left' }),
  ].join('')

  return renderEmailLayout({
    title: `Weekly Team Health Digest: ${teamName}`,
    previewText: `Team Health: ${healthScore}% (${deltaLabel}) — Weekly Summary`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'WEEKLY_DIGEST', unsubscribeToken }),
  })
}
