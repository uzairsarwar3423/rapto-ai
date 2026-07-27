import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors, EmailTypography } from './shared/email-tokens'

export interface SubscriptionUpgradedProps {
  customerName?: string
  teamName: string
  oldPlanName: string
  newPlanName: string
  amountPaid: string
  billingInterval: string
  effectiveDate: string
  features?: string[]
  dashboardUrl: string
  unsubscribeToken?: string
}

const DEFAULT_FEATURES: Record<string, string[]> = {
  STARTER: [
    'Up to 30 meeting recordings & AI summaries per month',
    'Automated commitments & action item extraction',
    'Slack & Google Calendar integration',
    'Exportable meeting digests & summaries',
  ],
  GROWTH: [
    'Up to 100 meeting recordings per month',
    'Advanced commitment tracking & accountability metrics',
    'Jira & Linear task auto-creation',
    'Weekly Team Health Digest reports',
    'Priority customer support',
  ],
  BUSINESS: [
    'Unlimited meeting recordings & AI summaries',
    'Custom team workflows & Webhook automation',
    'Full API & export capabilities',
    'Dedicated account manager & SLA support',
  ],
  ENTERPRISE: [
    'Custom AI model fine-tuning & domain vocabulary',
    'SOC2 & HIPAA compliance configuration',
    'SSO, SAML & custom security policies',
    'Dedicated infrastructure & SLA guarantee',
  ],
}

export function renderSubscriptionUpgradedHtml(props: SubscriptionUpgradedProps): string {
  const {
    customerName,
    teamName,
    oldPlanName,
    newPlanName,
    amountPaid,
    billingInterval,
    effectiveDate,
    features,
    dashboardUrl,
    unsubscribeToken,
  } = props

  const greeting = customerName ? `Hi ${customerName},` : 'Hello,'
  const normalizedNewPlan = newPlanName.toUpperCase()
  const featureList = features || DEFAULT_FEATURES[normalizedNewPlan] || DEFAULT_FEATURES.GROWTH

  const cardHtml = `
    <div style="text-align: center; padding: 4px 0 12px 0;">
      <span style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: ${EmailColors.textMuted};">Workspace Plan Upgrade</span>
      <div style="font-size: 22px; font-weight: 700; color: ${EmailColors.stateSuccessText}; margin-top: 4px;">
        ${oldPlanName} &rarr; <span style="text-decoration: underline;">${newPlanName}</span>
      </div>
    </div>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-top: 8px;">
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textMuted}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">Workspace</td>
        <td align="right" style="padding: 8px 0; font-size: 14px; font-weight: 600; color: ${EmailColors.textHeadline}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">${teamName}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textMuted}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">New Tier</td>
        <td align="right" style="padding: 8px 0; font-size: 14px; font-weight: 700; color: ${EmailColors.brandPrimary}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">${newPlanName} (${billingInterval})</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textMuted}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">Billing Amount</td>
        <td align="right" style="padding: 8px 0; font-size: 15px; font-weight: 700; color: ${EmailColors.textHeadline}; font-family: ${EmailTypography.fontFamily}; border-bottom: 1px dashed ${EmailColors.borderDivider};">${amountPaid}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textMuted}; font-family: ${EmailTypography.fontFamily};">Effective Date</td>
        <td align="right" style="padding: 8px 0; font-size: 14px; color: ${EmailColors.textHeadline}; font-family: ${EmailTypography.fontFamily};">${effectiveDate}</td>
      </tr>
    </table>
  `

  const featureItemsHtml = featureList
    .map(
      (feat) => `
    <tr style="vertical-align: top;">
      <td style="padding: 4px 8px 4px 0; font-size: 14px; color: ${EmailColors.stateSuccessText}; font-weight: bold;">✓</td>
      <td style="padding: 4px 0; font-size: 14px; color: ${EmailColors.textBody}; font-family: ${EmailTypography.fontFamily};">${feat}</td>
    </tr>`
    )
    .join('')

  const content = `
    <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">🎉 Upgrade Confirmed!</h2>
    <p style="margin-bottom: 16px;">${greeting}</p>
    <p style="margin-bottom: 20px;">
      Great news! Workspace <strong>${teamName}</strong> has been successfully upgraded to the <strong>${newPlanName}</strong> plan. All new limits and premium features are now active for your entire team.
    </p>

    ${renderEmailCard({ contentHtml: cardHtml, variant: 'success' })}

    <div style="margin-top: 24px; padding: 16px; background-color: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px;">
      <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: ${EmailColors.textHeadline};">Unlocked in ${newPlanName}:</p>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        ${featureItemsHtml}
      </table>
    </div>

    <div style="margin-top: 28px; text-align: center;">
      ${renderEmailButton({ href: dashboardUrl, label: 'Explore New Features', variant: 'primary' })}
    </div>

    <p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 28px; line-height: 1.5;">
      Need help setting up integrations or onboarding your team? Reach out to <a href="mailto:support@rapto.cloud" style="color: ${EmailColors.brandPrimary};">support@rapto.cloud</a> and our team will assist you.
    </p>
  `

  const footer = renderEmailFooter({
    notificationType: 'SUBSCRIPTION_UPGRADED',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `Upgrade Confirmed: ${teamName} is now on ${newPlanName}`,
    previewText: `${teamName} has been upgraded to ${newPlanName}. New limits and features are active!`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
