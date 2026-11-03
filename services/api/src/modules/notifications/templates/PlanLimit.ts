import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailStatCallout } from './shared/EmailStatCallout'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailLinkFallback, strong } from './shared/EmailContent'

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

  const content = [
    renderEmailHeading('Workspace Usage Limit Reached'),
    renderEmailText(
      `Your team ${strong(teamName)} is getting great value out of Rapto. You are approaching or have reached your monthly ${strong(resource)} plan limit.`
    ),
    `<div style="margin: 20px 0;">${renderEmailStatCallout({
      value: `${used} / ${limit}`,
      label: `${resource} Used This Month`,
      variant: 'warning',
    })}</div>`,
    renderEmailText('To continue processing meetings and tracking commitments without interruption, upgrade your plan.'),
    renderEmailButton({ href: upgradeUrl, label: 'Upgrade Plan & Capacity', variant: 'primary', align: 'left' }),
    renderEmailLinkFallback(upgradeUrl, 'Direct link:'),
  ].join('')

  return renderEmailLayout({
    title: `Action Required: ${teamName} reached its ${resource} limit`,
    previewText: `${teamName} has used ${used} of ${limit} ${resource}`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'PLAN_LIMIT', unsubscribeToken }),
  })
}
