import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailStatCallout } from './shared/EmailStatCallout'
import { renderEmailDivider } from './shared/EmailDivider'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors } from './shared/email-tokens'

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

  const statsGridHtml = `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0;">
  <tr>
    <td width="32%" align="center">
      ${renderEmailStatCallout({ value: `${healthScore}%`, label: 'Team Health', variant: 'primary' })}
    </td>
    <td width="2%"></td>
    <td width="32%" align="center">
      ${renderEmailStatCallout({ value: fulfilledCount, label: 'Fulfilled', variant: 'success' })}
    </td>
    <td width="2%"></td>
    <td width="32%" align="center">
      ${renderEmailStatCallout({ value: missedCount, label: 'Missed', variant: 'warning' })}
    </td>
  </tr>
</table>`

  let improvedListHtml = ''
  if (mostImproved.length > 0) {
    const items = mostImproved
      .map(
        (m) =>
          `<li style="margin-bottom: 6px;"><strong>${m.name}</strong>: +${m.change} pts (Score: ${m.currentScore}%)</li>`
      )
      .join('')
    improvedListHtml = `
<div style="margin-top: 16px;">
  <p style="margin: 0 0 6px 0; font-weight: 600; font-size: 14px; color: ${EmailColors.stateSuccessText};">🚀 Top Improved Members</p>
  <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: ${EmailColors.textHeadline};">
    ${items}
  </ul>
</div>`
  }

  let declinedListHtml = ''
  if (mostDeclined.length > 0) {
    const items = mostDeclined
      .map(
        (m) =>
          `<li style="margin-bottom: 6px;"><strong>${m.name}</strong>: ${m.change} pts (Score: ${m.currentScore}%)</li>`
      )
      .join('')
    declinedListHtml = `
<div style="margin-top: 16px;">
  <p style="margin: 0 0 6px 0; font-weight: 600; font-size: 14px; color: ${EmailColors.stateWarningText};">⚠️ Score Attention Needed</p>
  <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: ${EmailColors.textHeadline};">
    ${items}
  </ul>
</div>`
  }

  let upcomingHtml = ''
  if (upcomingDeadlines.length > 0) {
    const items = upcomingDeadlines
      .map(
        (u) =>
          `<li style="margin-bottom: 6px;"><strong>${u.text}</strong> — ${u.ownerName}</li>`
      )
      .join('')
    upcomingHtml = `
<div style="margin-top: 20px;">
  <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 14px; color: ${EmailColors.brandPrimary}; text-transform: uppercase; letter-spacing: 0.5px;">Upcoming Deadlines (Next 7 Days)</p>
  <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: ${EmailColors.textHeadline};">
    ${items}
  </ul>
</div>`
  }

  const overviewCardHtml = `
<p style="margin: 0; font-weight: 600; font-size: 13px; color: ${EmailColors.brandPrimary}; text-transform: uppercase; letter-spacing: 0.5px;">Weekly Performance Trend</p>
<p style="margin: 6px 0 0 0; font-size: 15px; color: ${EmailColors.textHeadline}; font-weight: 500;">Current Team Health: <strong>${healthScore}%</strong> (${deltaLabel})</p>
${improvedListHtml}
${declinedListHtml}`

  const content = `
<h2 style="margin: 0 0 4px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">Weekly Team Health Digest</h2>
<p style="font-size: 15px; color: ${EmailColors.textMuted}; margin-bottom: 20px;">${teamName}</p>

<p>Hi ${recipientName},</p>
<p>Here is your team's weekly accountability and commitment health summary:</p>

${statsGridHtml}

${renderEmailDivider()}

${renderEmailCard({ contentHtml: overviewCardHtml, variant: 'neutral' })}

${upcomingHtml}

<div style="margin-top: 28px; text-align: center;">
  ${renderEmailButton({ href: dashboardUrl, label: 'View Full Team Dashboard', variant: 'primary' })}
</div>`

  const footer = renderEmailFooter({
    notificationType: 'WEEKLY_DIGEST',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `Weekly Team Health Digest: ${teamName}`,
    previewText: `Team Health: ${healthScore}% (${deltaLabel}) — Weekly Summary`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
