import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailMuted, renderEmailDetails, renderEmailBadge, link, strong } from './shared/EmailContent'

export interface SubscriptionCancelledProps {
  customerName?: string
  teamName: string
  effectiveDate?: string
  billingUrl: string
  unsubscribeToken?: string
}

export function renderSubscriptionCancelledHtml(props: SubscriptionCancelledProps): string {
  const { customerName, teamName, effectiveDate, billingUrl, unsubscribeToken } = props

  const greeting = customerName ? `Hi ${strong(customerName)},` : 'Hello,'

  const content = [
    renderEmailHeading('Subscription Cancelled'),
    renderEmailText(greeting),
    renderEmailText(`This email confirms that the paid subscription for ${strong(teamName)} has been cancelled.`),
    renderEmailCard({
      variant: 'neutral',
      contentHtml:
        `<p style="margin: 0 0 10px 0;">${renderEmailBadge('Plan change', 'neutral')}</p>` +
        renderEmailDetails([
          { label: 'Workspace', value: teamName, strong: true },
          { label: 'Current plan', value: 'Free' },
          { label: 'Effective date', value: effectiveDate ?? '' },
        ]),
    }),
    renderEmailText(
      'All your meeting history, recordings, and commitments remain safe and accessible under the Free plan limits. You can re-subscribe or upgrade your plan at any time to regain higher limits and premium integrations.'
    ),
    renderEmailButton({ href: billingUrl, label: 'Manage Workspace Subscription', variant: 'primary', align: 'left' }),
    renderEmailMuted(`If this cancellation was unintended or if you need assistance, contact us at ${link('mailto:support@rapto.cloud', 'support@rapto.cloud')}.`),
  ].join('')

  return renderEmailLayout({
    title: `Subscription Cancelled: ${teamName}`,
    previewText: `The subscription for ${teamName} has been cancelled. Workspace is now on the Free plan.`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'SUBSCRIPTION_CANCELLED', unsubscribeToken }),
  })
}
