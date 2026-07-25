import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailStatCallout } from './shared/EmailStatCallout'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors } from './shared/email-tokens'

export interface PlanLimitProps {
  teamName: string
  resource: string
  used: number
  limit: number
  upgradeUrl: string
  unsubscribeToken?: string
}

export function renderPlanLimitHtml(props: PlanLimitProps): string {
  const { teamName, resource, used, limit, upgradeUrl, unsubscribeToken } = props

  const content = `
<h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">Workspace Usage Limit Reached</h2>
<p>Your team <strong>${teamName}</strong> is getting great value out of Rapto! You are currently approaching or have reached your monthly <strong>${resource}</strong> plan limit:</p>

<div style="margin: 24px 0;">
  ${renderEmailStatCallout({
    value: `${used} / ${limit}`,
    label: `${resource} Used This Month`,
    variant: 'warning',
  })}
</div>

<p>To continue processing meetings and tracking commitments without interruption, upgrade your plan today.</p>

${renderEmailButton({ href: upgradeUrl, label: 'Upgrade Plan & Capacity', variant: 'primary' })}

<p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 24px;">
  Direct link: <a href="${upgradeUrl}" style="color: ${EmailColors.brandPrimary}; word-break: break-all;">${upgradeUrl}</a>
</p>`

  const footer = renderEmailFooter({
    notificationType: 'PLAN_LIMIT',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `Action Required: ${teamName} reached its ${resource} limit`,
    previewText: `${teamName} has used ${used} of ${limit} ${resource}`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
