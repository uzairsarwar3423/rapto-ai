import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailMuted, renderEmailDetails, renderEmailBadge, link, strong } from './shared/EmailContent'
import { EmailColors } from './shared/email-tokens'

export interface PaymentSuccessProps {
  customerName?: string
  teamName: string
  planName: string
  amountPaid: string
  currency?: string
  billingInterval?: string
  paymentDate: string
  nextBillingDate?: string | null
  invoiceId?: string | null
  paymentMethod?: string | null
  hostedInvoiceUrl?: string | null
  billingUrl: string
  unsubscribeToken?: string
}

export function renderPaymentSuccessHtml(props: PaymentSuccessProps): string {
  const {
    customerName,
    teamName,
    planName,
    amountPaid,
    billingInterval = 'monthly',
    paymentDate,
    nextBillingDate,
    invoiceId,
    paymentMethod,
    hostedInvoiceUrl,
    billingUrl,
    unsubscribeToken,
  } = props

  const greeting = customerName ? `Hi ${strong(customerName)},` : 'Hello,'

  const receiptCard = renderEmailCard({
    variant: 'success',
    contentHtml:
      `<p style="margin: 0 0 10px 0;">${renderEmailBadge('Payment received', 'success')}</p>` +
      renderEmailDetails([
        { label: 'Workspace', value: teamName, strong: true },
        { label: 'Plan', value: `${planName} (${billingInterval})`, strong: true },
        { label: 'Amount billed', value: amountPaid, strong: true, color: EmailColors.stateSuccessText },
        { label: 'Date', value: paymentDate },
        { label: 'Next renewal date', value: nextBillingDate ?? '' },
        { label: 'Invoice reference', value: invoiceId ?? '', mono: true },
        { label: 'Payment method', value: paymentMethod ?? '' },
      ]),
  })

  const content = [
    renderEmailHeading('Payment Receipt & Confirmation'),
    renderEmailText(greeting),
    renderEmailText(
      `Thank you for your payment. We have received your subscription payment for ${strong(teamName)}. Your subscription is active and up to date.`
    ),
    receiptCard,
    renderEmailButton({ href: billingUrl, label: 'Manage Billing & Invoices', variant: 'primary', align: 'left' }),
    hostedInvoiceUrl ? renderEmailMuted(`Need an official tax invoice PDF? ${link(hostedInvoiceUrl, 'Download Invoice PDF')}`) : '',
    renderEmailMuted(
      `If you have any questions about this charge or need support, reply to this email or contact ${link('mailto:support@rapto.cloud', 'support@rapto.cloud')}.`
    ),
  ].join('')

  return renderEmailLayout({
    title: `Payment Receipt: ${planName} for ${teamName}`,
    previewText: `Payment of ${amountPaid} received for ${teamName} (${planName})`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'PAYMENT_SUCCESS', unsubscribeToken }),
  })
}
