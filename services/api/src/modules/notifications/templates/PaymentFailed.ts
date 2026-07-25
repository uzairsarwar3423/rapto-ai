import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors } from './shared/email-tokens'

export interface PaymentFailedProps {
  teamName: string
  amountDue: string
  retryUrl: string
  reason?: string
  unsubscribeToken?: string
}

export function renderPaymentFailedHtml(props: PaymentFailedProps): string {
  const { teamName, amountDue, retryUrl, reason, unsubscribeToken } = props

  const cardHtml = `
<p style="margin: 0; font-weight: 600; color: ${EmailColors.stateWarningText};">⚠️ Billing Notice: ${teamName}</p>
<p style="margin: 8px 0 0 0; font-size: 14px; color: ${EmailColors.textHeadline};">
  Amount due: <strong>${amountDue}</strong>
</p>
${reason ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: ${EmailColors.textMuted};">Reason: ${reason}</p>` : ''}`

  const content = `
<h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">Payment Attempt Unsuccessful</h2>
<p>We were unable to process the recent subscription payment for your workspace <strong>${teamName}</strong>.</p>

${renderEmailCard({ contentHtml: cardHtml, variant: 'warning' })}

<p>Please update your billing information or payment method to avoid any interruption to your team's Vocaply service.</p>

${renderEmailButton({ href: retryUrl, label: 'Update Payment Details', variant: 'warning' })}

<p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 24px;">
  Direct link: <a href="${retryUrl}" style="color: ${EmailColors.brandPrimary}; word-break: break-all;">${retryUrl}</a>
</p>`

  const footer = renderEmailFooter({
    notificationType: 'PAYMENT_FAILED',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `Action Required: Payment failed for ${teamName}`,
    previewText: `Subscription payment for ${teamName} was unsuccessful`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
