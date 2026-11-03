import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailLinkFallback, renderEmailDetails, renderEmailBadge, strong } from './shared/EmailContent'

export interface PaymentFailedProps {
  teamName: string
  amountDue: string
  retryUrl: string
  reason?: string
  unsubscribeToken?: string
}

export function renderPaymentFailedHtml(props: PaymentFailedProps): string {
  const { teamName, amountDue, retryUrl, reason, unsubscribeToken } = props

  const content = [
    renderEmailHeading('Payment Attempt Unsuccessful'),
    renderEmailText(`We were unable to process the recent subscription payment for your workspace ${strong(teamName)}.`),
    renderEmailCard({
      variant: 'warning',
      contentHtml:
        `<p style="margin: 0 0 10px 0;">${renderEmailBadge('Billing notice', 'warning')}</p>` +
        renderEmailDetails([
          { label: 'Workspace', value: teamName, strong: true },
          { label: 'Amount due', value: amountDue, strong: true },
          { label: 'Reason', value: reason ?? '' },
        ]),
    }),
    renderEmailText("Please update your billing information or payment method to avoid any interruption to your team's Rapto service."),
    renderEmailButton({ href: retryUrl, label: 'Update Payment Details', variant: 'primary', align: 'left' }),
    renderEmailLinkFallback(retryUrl, 'Direct link:'),
  ].join('')

  return renderEmailLayout({
    title: `Action Required: Payment failed for ${teamName}`,
    previewText: `Subscription payment for ${teamName} was unsuccessful`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'PAYMENT_FAILED', unsubscribeToken }),
  })
}
