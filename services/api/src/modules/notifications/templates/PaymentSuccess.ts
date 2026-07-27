import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors, EmailTypography } from './shared/email-tokens'

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

  const greeting = customerName ? `Hi ${customerName},` : 'Hello,'

  const summaryRowsHtml = `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-top: 12px;">
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textMuted}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">Workspace</td>
        <td align="right" style="padding: 8px 0; font-size: 14px; font-weight: 600; color: ${EmailColors.textHeadline}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">${teamName}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textMuted}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">Plan</td>
        <td align="right" style="padding: 8px 0; font-size: 14px; font-weight: 600; color: ${EmailColors.textHeadline}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">${planName} (${billingInterval})</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textMuted}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">Amount Billed</td>
        <td align="right" style="padding: 8px 0; font-size: 16px; font-weight: 700; color: ${EmailColors.stateSuccessText}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">${amountPaid}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textMuted}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">Date</td>
        <td align="right" style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textHeadline}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">${paymentDate}</td>
      </tr>
      ${
        nextBillingDate
          ? `
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textMuted}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">Next Renewal Date</td>
        <td align="right" style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textHeadline}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">${nextBillingDate}</td>
      </tr>`
          : ''
      }
      ${
        invoiceId
          ? `
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textMuted}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">Invoice Reference</td>
        <td align="right" style="padding: 8px 0; font-size: 13px; font-family: monospace; color: ${EmailColors.textMuted}; border-bottom: 1px dashed ${EmailColors.borderDivider};">${invoiceId}</td>
      </tr>`
          : ''
      }
      ${
        paymentMethod
          ? `
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textMuted}; font-family: ${EmailTypography.fontFamily};">Payment Method</td>
        <td align="right" style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textHeadline}; font-family: ${EmailTypography.fontFamily};">${paymentMethod}</td>
      </tr>`
          : ''
      }
    </table>
  `

  const cardHtml = `
    <p style="margin: 0; font-weight: 600; font-size: 15px; color: ${EmailColors.stateSuccessText};">
      ✅ Payment Successfully Received
    </p>
    <p style="margin: 4px 0 0 0; font-size: 13px; color: ${EmailColors.textMuted};">
      Your transaction has been processed and your account balance is current.
    </p>
    ${summaryRowsHtml}
  `

  const content = `
    <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">Payment Receipt & Confirmation</h2>
    <p style="margin-bottom: 16px;">${greeting}</p>
    <p style="margin-bottom: 20px;">
      Thank you for your payment! We have successfully received your subscription payment for <strong>${teamName}</strong>. Your subscription is active and up to date.
    </p>

    ${renderEmailCard({ contentHtml: cardHtml, variant: 'success' })}

    <div style="margin-top: 24px; text-align: center;">
      ${renderEmailButton({ href: billingUrl, label: 'Manage Billing & Invoices', variant: 'primary' })}
    </div>

    ${
      hostedInvoiceUrl
        ? `
    <p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 20px; text-align: center;">
      Need an official tax invoice PDF? <a href="${hostedInvoiceUrl}" style="color: ${EmailColors.brandPrimary}; text-decoration: underline;" target="_blank">Download Invoice PDF</a>
    </p>`
        : ''
    }

    <p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 28px; line-height: 1.5;">
      If you have any questions about this charge or need support, simply reply to this email or reach out to us at <a href="mailto:support@rapto.cloud" style="color: ${EmailColors.brandPrimary};">support@rapto.cloud</a>.
    </p>
  `

  const footer = renderEmailFooter({
    notificationType: 'PAYMENT_SUCCESS',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `Payment Receipt: ${planName} for ${teamName}`,
    previewText: `Payment of ${amountPaid} received for ${teamName} (${planName})`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
