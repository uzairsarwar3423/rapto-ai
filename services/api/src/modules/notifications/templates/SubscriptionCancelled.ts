import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors, EmailTypography } from './shared/email-tokens'

export interface SubscriptionCancelledProps {
  customerName?: string
  teamName: string
  effectiveDate?: string
  billingUrl: string
  unsubscribeToken?: string
}

export function renderSubscriptionCancelledHtml(props: SubscriptionCancelledProps): string {
  const { customerName, teamName, effectiveDate, billingUrl, unsubscribeToken } = props

  const greeting = customerName ? `Hi ${customerName},` : 'Hello,'

  const cardHtml = `
    <p style="margin: 0; font-weight: 600; color: ${EmailColors.stateWarningText};">
      ℹ️ Plan Change Notice: ${teamName}
    </p>
    <p style="margin: 8px 0 0 0; font-size: 14px; color: ${EmailColors.textHeadline};">
      Your paid subscription has been cancelled. Workspace <strong>${teamName}</strong> has been moved to the Free plan.
    </p>
    ${
      effectiveDate
        ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: ${EmailColors.textMuted};">Effective Date: ${effectiveDate}</p>`
        : ''
    }
  `

  const content = `
    <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">Subscription Cancelled</h2>
    <p style="margin-bottom: 16px;">${greeting}</p>
    <p style="margin-bottom: 20px;">
      This email confirms that the paid subscription for <strong>${teamName}</strong> has been cancelled.
    </p>

    ${renderEmailCard({ contentHtml: cardHtml, variant: 'warning' })}

    <p style="margin-top: 20px; font-size: 14px; color: ${EmailColors.textBody}; line-height: 1.6;">
      All your meeting history, recordings, and commitments remain safe and accessible under the Free plan limits. You can re-subscribe or upgrade your plan at any time to regain higher limits and premium integrations.
    </p>

    <div style="margin-top: 24px; text-align: center;">
      ${renderEmailButton({ href: billingUrl, label: 'Manage Workspace Subscription', variant: 'primary' })}
    </div>

    <p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 28px; line-height: 1.5;">
      If this cancellation was unintended or if you need assistance, please contact us at <a href="mailto:support@rapto.cloud" style="color: ${EmailColors.brandPrimary};">support@rapto.cloud</a>.
    </p>
  `

  const footer = renderEmailFooter({
    notificationType: 'SUBSCRIPTION_CANCELLED',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `Subscription Cancelled: ${teamName}`,
    previewText: `The subscription for ${teamName} has been cancelled. Workspace is now on the Free plan.`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
