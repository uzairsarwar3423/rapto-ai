// Realistic render fixtures for every transactional email template, in three variants:
//   full    — every optional value present
//   minimal — optional values omitted / lists empty
//   hostile — user-controlled strings carrying HTML/script injection and dangerous URLs
import { renderVerifyEmailHtml } from '../../src/modules/notifications/templates/VerifyEmail'
import { renderPasswordResetHtml } from '../../src/modules/notifications/templates/PasswordReset'
import { renderTeamInviteHtml } from '../../src/modules/notifications/templates/TeamInvite'
import { renderMeetingSummaryHtml } from '../../src/modules/notifications/templates/MeetingSummary'
import { renderDeadlineReminderHtml } from '../../src/modules/notifications/templates/DeadlineReminder'
import { renderCommitmentMissedHtml } from '../../src/modules/notifications/templates/CommitmentMissed'
import { renderManagerAlertHtml } from '../../src/modules/notifications/templates/ManagerAlert'
import { renderPaymentFailedHtml } from '../../src/modules/notifications/templates/PaymentFailed'
import { renderPaymentSuccessHtml } from '../../src/modules/notifications/templates/PaymentSuccess'
import { renderPlanLimitHtml } from '../../src/modules/notifications/templates/PlanLimit'
import { renderIntegrationWarningHtml } from '../../src/modules/notifications/templates/IntegrationWarning'
import { renderIntegrationDeactivatedHtml } from '../../src/modules/notifications/templates/IntegrationDeactivated'
import { renderOwnerWelcomeHtml } from '../../src/modules/notifications/templates/OwnerWelcome'
import { renderTeamMemberWelcomeHtml } from '../../src/modules/notifications/templates/TeamMemberWelcome'
import { renderSubscriptionUpgradedHtml } from '../../src/modules/notifications/templates/SubscriptionUpgraded'
import { renderSubscriptionCancelledHtml } from '../../src/modules/notifications/templates/SubscriptionCancelled'
import { renderWeeklyDigestHtml } from '../../src/modules/notifications/templates/WeeklyDigest'

export type Variant = 'full' | 'minimal' | 'hostile'

/** The injection payload used for every user-controlled string in the "hostile" variant. */
export const XSS = `<img src=x onerror=alert(1)><script>alert('xss')</script>"'&`
export const BAD_URL = 'javascript:alert(document.cookie)'

const APP = 'https://app.rapto.cloud'
const date = new Date('2026-12-31T00:00:00Z')

export interface TemplateCase {
  name: string
  render: (v: Variant) => string
  /** URLs that must appear as real hrefs in the full variant. */
  urls: string[]
  /** User-controlled text that appears verbatim (escaped) in the full variant. */
  texts: string[]
}

const h = (v: Variant, normal: string) => (v === 'hostile' ? XSS : normal)
const u = (v: Variant, normal: string) => (v === 'hostile' ? BAD_URL : normal)

export const TEMPLATE_CASES: TemplateCase[] = [
  {
    name: 'VerifyEmail',
    urls: [`${APP}/verify-email?token=abc123`],
    texts: ['Alice Smith'],
    render: (v) => renderVerifyEmailHtml({ name: h(v, 'Alice Smith'), url: u(v, `${APP}/verify-email?token=abc123`), unsubscribeToken: v === 'minimal' ? undefined : 'unsub-token' }),
  },
  {
    name: 'PasswordReset',
    urls: [`${APP}/reset-password?token=reset456`],
    texts: ['Bob Jones'],
    render: (v) => renderPasswordResetHtml({ name: h(v, 'Bob Jones'), url: u(v, `${APP}/reset-password?token=reset456`) }),
  },
  {
    name: 'TeamInvite',
    urls: [`${APP}/invite/accept?token=inv789`],
    texts: ['Acme Product Team', 'Diana Manager', 'MEMBER'],
    render: (v) => renderTeamInviteHtml({ to: 'c@acme.com', teamName: h(v, 'Acme Product Team'), inviterName: h(v, 'Diana Manager'), joinUrl: u(v, `${APP}/invite/accept?token=inv789`), role: h(v, 'MEMBER'), expiresAt: date }),
  },
  {
    name: 'MeetingSummary',
    urls: [`${APP}/meetings/m101`],
    texts: ['Eve Lead', 'Sprint Planning Sync', 'Discussed the Q3 roadmap & allocated API work.'],
    render: (v) => renderMeetingSummaryHtml({ name: h(v, 'Eve Lead'), meetingTitle: h(v, 'Sprint Planning Sync'), summary: v === 'minimal' ? '' : h(v, 'Discussed the Q3 roadmap & allocated API work.'), commitmentsCount: 5, actionItemsCount: 3, viewUrl: u(v, `${APP}/meetings/m101`) }),
  },
  {
    name: 'DeadlineReminder',
    urls: [`${APP}/commitments`],
    texts: ['Frank Engineer', 'Deploy search service'],
    render: (v) => renderDeadlineReminderHtml({ name: h(v, 'Frank Engineer'), commitments: [{ id: 'c1', text: h(v, 'Deploy search service'), dueDate: date }, ...(v === 'minimal' ? [] : [{ id: 'c2', text: h(v, 'Update OpenAPI docs'), dueDate: date }])], actionUrl: u(v, `${APP}/commitments`) }),
  },
  {
    name: 'CommitmentMissed',
    urls: [`${APP}/commitments/c3`],
    texts: ['Grace Dev', 'Fix memory leak in redis worker'],
    render: (v) => renderCommitmentMissedHtml({ name: h(v, 'Grace Dev'), commitmentText: h(v, 'Fix memory leak in redis worker'), dueDate: date, actionUrl: u(v, `${APP}/commitments/c3`) }),
  },
  {
    name: 'ManagerAlert',
    urls: [`${APP}/dashboard`],
    texts: ['Hannah Director', 'Grace Dev', 'Fix memory leak in redis worker'],
    render: (v) => renderManagerAlertHtml({ name: h(v, 'Hannah Director'), assigneeName: h(v, 'Grace Dev'), commitmentText: h(v, 'Fix memory leak in redis worker'), dueDate: date, actionUrl: u(v, `${APP}/dashboard`) }),
  },
  {
    name: 'PaymentFailed',
    urls: [`${APP}/settings/billing`],
    texts: ['Starlight Corp', '$149.00', 'Card declined by issuing bank'],
    render: (v) => renderPaymentFailedHtml({ teamName: h(v, 'Starlight Corp'), amountDue: h(v, '$149.00'), retryUrl: u(v, `${APP}/settings/billing`), reason: v === 'minimal' ? undefined : h(v, 'Card declined by issuing bank') }),
  },
  {
    name: 'PaymentSuccess',
    urls: [`${APP}/settings/billing`, 'https://paddle.example/invoice/inv_1'],
    texts: ['Priya Patel', 'Starlight Corp', 'Growth', '$99.00', 'txn_01hexample', 'Visa •••• 4242'],
    render: (v) =>
      renderPaymentSuccessHtml(
        v === 'minimal'
          ? { teamName: 'Starlight Corp', planName: 'Growth', amountPaid: '$99.00', paymentDate: 'December 31, 2026', billingUrl: `${APP}/settings/billing` }
          : { customerName: h(v, 'Priya Patel'), teamName: h(v, 'Starlight Corp'), planName: h(v, 'Growth'), amountPaid: h(v, '$99.00'), billingInterval: 'monthly', paymentDate: 'December 31, 2026', nextBillingDate: 'January 31, 2027', invoiceId: h(v, 'txn_01hexample'), paymentMethod: h(v, 'Visa •••• 4242'), hostedInvoiceUrl: u(v, 'https://paddle.example/invoice/inv_1'), billingUrl: u(v, `${APP}/settings/billing`) }
      ),
  },
  {
    name: 'PlanLimit',
    urls: [`${APP}/settings/billing/upgrade`],
    texts: ['Starlight Corp', 'meetings'],
    render: (v) => renderPlanLimitHtml({ teamName: h(v, 'Starlight Corp'), resource: h(v, 'meetings'), used: 48, limit: 50, upgradeUrl: u(v, `${APP}/settings/billing/upgrade`) }),
  },
  {
    name: 'IntegrationWarning',
    urls: [`${APP}/settings/integrations`],
    texts: ['Slack', 'Acme Workspace'],
    render: (v) => renderIntegrationWarningHtml({ providerName: h(v, 'Slack'), workspaceName: v === 'minimal' ? undefined : h(v, 'Acme Workspace'), settingsUrl: u(v, `${APP}/settings/integrations`) }),
  },
  {
    name: 'IntegrationDeactivated',
    urls: [`${APP}/settings/integrations`],
    texts: ['Linear', 'Acme Workspace'],
    render: (v) => renderIntegrationDeactivatedHtml({ providerName: h(v, 'Linear'), workspaceName: v === 'minimal' ? undefined : h(v, 'Acme Workspace'), settingsUrl: u(v, `${APP}/settings/integrations`) }),
  },
  {
    name: 'OwnerWelcome',
    urls: [`${APP}/dashboard`],
    texts: ['Jordan Lee', 'Acme Workspace'],
    render: (v) => renderOwnerWelcomeHtml({ ownerName: h(v, 'Jordan Lee'), ownerEmail: 'jordan@acme.com', workspaceName: h(v, 'Acme Workspace'), dashboardUrl: u(v, `${APP}/dashboard`), supportEmail: v === 'minimal' ? undefined : 'help@rapto.cloud', checklist: v === 'hostile' ? [{ step: 1, title: XSS, description: XSS }] : undefined }),
  },
  {
    name: 'TeamMemberWelcome',
    urls: [`${APP}/dashboard`],
    texts: ['Sam Rivera', 'Acme Workspace', 'Jordan Lee', 'MEMBER'],
    render: (v) => renderTeamMemberWelcomeHtml({ memberName: h(v, 'Sam Rivera'), memberEmail: 's@acme.com', workspaceName: h(v, 'Acme Workspace'), inviterName: h(v, 'Jordan Lee'), role: h(v, 'MEMBER'), dashboardUrl: u(v, `${APP}/dashboard`), capabilities: v === 'hostile' ? [{ icon: XSS, title: XSS, description: XSS }] : undefined }),
  },
  {
    name: 'SubscriptionUpgraded',
    urls: [`${APP}/dashboard`],
    texts: ['Priya Patel', 'Starlight Corp', 'Starter', 'Growth', '$99.00'],
    render: (v) =>
      renderSubscriptionUpgradedHtml({
        customerName: v === 'minimal' ? undefined : h(v, 'Priya Patel'),
        teamName: h(v, 'Starlight Corp'),
        oldPlanName: h(v, 'Starter'),
        newPlanName: h(v, 'Growth'),
        amountPaid: h(v, '$99.00'),
        billingInterval: 'monthly',
        effectiveDate: 'December 31, 2026',
        features: v === 'hostile' ? [XSS] : undefined,
        dashboardUrl: u(v, `${APP}/dashboard`),
      }),
  },
  {
    name: 'SubscriptionCancelled',
    urls: [`${APP}/settings/billing`],
    texts: ['Priya Patel', 'Starlight Corp'],
    render: (v) => renderSubscriptionCancelledHtml({ customerName: v === 'minimal' ? undefined : h(v, 'Priya Patel'), teamName: h(v, 'Starlight Corp'), effectiveDate: v === 'minimal' ? undefined : 'December 31, 2026', billingUrl: u(v, `${APP}/settings/billing`) }),
  },
  {
    name: 'WeeklyDigest',
    urls: [`${APP}/team`],
    texts: ['Quinn Adams', 'Acme Product Team', 'Rowan Kim', 'Ship the billing fix'],
    render: (v) =>
      renderWeeklyDigestHtml({
        recipientName: h(v, 'Quinn Adams'),
        teamName: h(v, 'Acme Product Team'),
        healthScore: 82,
        healthScoreChange: v === 'minimal' ? 0 : 4,
        fulfilledCount: 14,
        missedCount: 2,
        mostImproved: v === 'minimal' ? [] : [{ name: h(v, 'Rowan Kim'), change: 9, currentScore: 91 }],
        mostDeclined: v === 'minimal' ? [] : [{ name: h(v, 'Sky Ortiz'), change: -6, currentScore: 64 }],
        upcomingDeadlines: v === 'minimal' ? [] : [{ text: h(v, 'Ship the billing fix'), ownerName: h(v, 'Rowan Kim'), dueDate: 'Jan 4' }],
        dashboardUrl: u(v, `${APP}/team`),
      }),
  },
]
