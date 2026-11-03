import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailMuted, renderEmailDetails, renderEmailList, renderEmailEyebrow, link, strong } from './shared/EmailContent'
import { EmailColors, EmailTypography } from './shared/email-tokens'
import { esc } from './shared/email-escape'

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

  const greeting = customerName ? `Hi ${strong(customerName)},` : 'Hello,'
  const normalizedNewPlan = newPlanName.toUpperCase()
  const featureList = features || DEFAULT_FEATURES[normalizedNewPlan] || DEFAULT_FEATURES.GROWTH

  const planChangeHtml =
    renderEmailEyebrow('Workspace plan upgrade', EmailColors.stateSuccessText) +
    `<p class="em-heading" style="margin: 0 0 12px 0; font-family: ${EmailTypography.fontFamily}; font-size: 20px; line-height: 28px; font-weight: ${EmailTypography.fontWeightSemiBold}; color: ${EmailColors.textHeadline};">${esc(oldPlanName)} &rarr; ${esc(newPlanName)}</p>` +
    renderEmailDetails([
      { label: 'Workspace', value: teamName, strong: true },
      { label: 'New tier', value: `${newPlanName} (${billingInterval})`, strong: true },
      { label: 'Billing amount', value: amountPaid, strong: true },
      { label: 'Effective date', value: effectiveDate },
    ])

  const content = [
    renderEmailHeading('Upgrade Confirmed'),
    renderEmailText(greeting),
    renderEmailText(
      `Workspace ${strong(teamName)} has been upgraded to the ${strong(newPlanName)} plan. All new limits and premium features are now active for your entire team.`
    ),
    renderEmailCard({ contentHtml: planChangeHtml, variant: 'success' }),
    renderEmailEyebrow(`Unlocked in ${newPlanName}`),
    renderEmailList(featureList.map((f) => esc(f)), '&#10003;', EmailColors.stateSuccessText),
    renderEmailButton({ href: dashboardUrl, label: 'Explore New Features', variant: 'primary', align: 'left' }),
    renderEmailMuted(
      `Need help setting up integrations or onboarding your team? Reach out to ${link('mailto:support@rapto.cloud', 'support@rapto.cloud')} and our team will assist you.`
    ),
  ].join('')

  return renderEmailLayout({
    title: `Upgrade Confirmed: ${teamName} is now on ${newPlanName}`,
    previewText: `${teamName} has been upgraded to ${newPlanName}. New limits and features are active!`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'SUBSCRIPTION_UPGRADED', unsubscribeToken }),
  })
}
