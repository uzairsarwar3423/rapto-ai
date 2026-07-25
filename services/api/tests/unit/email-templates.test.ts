import { renderVerifyEmailHtml } from '../../src/modules/notifications/templates/VerifyEmail'
import { renderPasswordResetHtml } from '../../src/modules/notifications/templates/PasswordReset'
import { renderTeamInviteHtml } from '../../src/modules/notifications/templates/TeamInvite'
import { renderMeetingSummaryHtml } from '../../src/modules/notifications/templates/MeetingSummary'
import { renderDeadlineReminderHtml } from '../../src/modules/notifications/templates/DeadlineReminder'
import { renderCommitmentMissedHtml } from '../../src/modules/notifications/templates/CommitmentMissed'
import { renderManagerAlertHtml } from '../../src/modules/notifications/templates/ManagerAlert'
import { renderPaymentFailedHtml } from '../../src/modules/notifications/templates/PaymentFailed'
import { renderPlanLimitHtml } from '../../src/modules/notifications/templates/PlanLimit'
import { renderIntegrationWarningHtml } from '../../src/modules/notifications/templates/IntegrationWarning'
import { renderIntegrationDeactivatedHtml } from '../../src/modules/notifications/templates/IntegrationDeactivated'

describe('Email Templates Roster Rendering', () => {
  it('1. VerifyEmail renders correct verify link and props', () => {
    const html = renderVerifyEmailHtml({
      name: 'Alice Smith',
      url: 'https://app.vocaply.com/verify-email?token=v123',
    })

    expect(html).toContain('Alice Smith')
    expect(html).toContain('Verify Email Address')
    expect(html).toContain('token=v123')
    expect(html).not.toContain('undefined')
  })

  it('2. PasswordReset renders correct reset link and props', () => {
    const html = renderPasswordResetHtml({
      name: 'Bob Jones',
      url: 'https://app.vocaply.com/reset-password?token=p456',
    })

    expect(html).toContain('Bob Jones')
    expect(html).toContain('Reset Password')
    expect(html).toContain('token=p456')
    expect(html).not.toContain('undefined')
  })

  it('3. TeamInvite renders inviter, team name, and role', () => {
    const html = renderTeamInviteHtml({
      to: 'charlie@acme.com',
      teamName: 'Acme Product Team',
      inviterName: 'Diana Manager',
      joinUrl: 'https://app.vocaply.com/invite/accept?token=t789',
      role: 'MEMBER',
      expiresAt: new Date('2026-12-31'),
    })

    expect(html).toContain('Acme Product Team')
    expect(html).toContain('Diana Manager')
    expect(html).toContain('Accept Invitation')
    expect(html).not.toContain('undefined')
  })

  it('4. MeetingSummary renders title, summary, and stat callouts', () => {
    const html = renderMeetingSummaryHtml({
      name: 'Eve Lead',
      meetingTitle: 'Sprint Planning Sync',
      summary: 'Discussed Q3 roadmap and allocated API work.',
      commitmentsCount: 5,
      actionItemsCount: 3,
      viewUrl: 'https://app.vocaply.com/meetings/m101',
    })

    expect(html).toContain('Sprint Planning Sync')
    expect(html).toContain('Discussed Q3 roadmap and allocated API work.')
    expect(html).toContain('5')
    expect(html).toContain('3')
    expect(html).not.toContain('undefined')
  })

  it('5. DeadlineReminder renders commitment list items', () => {
    const html = renderDeadlineReminderHtml({
      name: 'Frank Engineer',
      commitments: [
        { id: 'c1', text: 'Deploy search service', dueDate: new Date('2026-08-01') },
        { id: 'c2', text: 'Update OpenAPI docs', dueDate: new Date('2026-08-02') },
      ],
      actionUrl: 'https://app.vocaply.com/commitments',
    })

    expect(html).toContain('Deploy search service')
    expect(html).toContain('Update OpenAPI docs')
    expect(html).toContain('Reminder: You have 2 commitments due soon')
    expect(html).not.toContain('undefined')
  })

  it('6. CommitmentMissed renders overdue warning and commitment text', () => {
    const html = renderCommitmentMissedHtml({
      name: 'Grace Dev',
      commitmentText: 'Fix memory leak in redis worker',
      dueDate: new Date('2026-07-20'),
      actionUrl: 'https://app.vocaply.com/commitments/c3',
    })

    expect(html).toContain('Fix memory leak in redis worker')
    expect(html).toContain('Commitment Overdue Alert')
    expect(html).toContain('Resolve Commitment')
    expect(html).not.toContain('undefined')
  })

  it('7. ManagerAlert renders assignee name and commitment details', () => {
    const html = renderManagerAlertHtml({
      name: 'Hannah Director',
      assigneeName: 'Grace Dev',
      commitmentText: 'Fix memory leak in redis worker',
      dueDate: new Date('2026-07-20'),
      actionUrl: 'https://app.vocaply.com/dashboard',
    })

    expect(html).toContain('Grace Dev')
    expect(html).toContain('Fix memory leak in redis worker')
    expect(html).toContain('Manager Accountability Alert')
    expect(html).not.toContain('undefined')
  })

  it('8. PaymentFailed renders team name, amount due, and billing CTA', () => {
    const html = renderPaymentFailedHtml({
      teamName: 'Starlight Corp',
      amountDue: '$149.00',
      retryUrl: 'https://app.vocaply.com/settings/billing',
      reason: 'Card declined by issuing bank',
    })

    expect(html).toContain('Starlight Corp')
    expect(html).toContain('$149.00')
    expect(html).toContain('Card declined by issuing bank')
    expect(html).toContain('Update Payment Details')
    expect(html).not.toContain('undefined')
  })

  it('9. PlanLimit renders usage figure callout and upgrade CTA', () => {
    const html = renderPlanLimitHtml({
      teamName: 'Starlight Corp',
      resource: 'meetings',
      used: 48,
      limit: 50,
      upgradeUrl: 'https://app.vocaply.com/settings/billing/upgrade',
    })

    expect(html).toContain('Starlight Corp')
    expect(html).toContain('48 / 50')
    expect(html).toContain('MEETINGS USED THIS MONTH')
    expect(html).toContain('Upgrade Plan &amp; Capacity')
    expect(html).not.toContain('undefined')
  })

  it('10. IntegrationWarning & IntegrationDeactivated render warning/error details', () => {
    const warningHtml = renderIntegrationWarningHtml({
      providerName: 'Slack',
      workspaceName: 'Acme Workspace',
      settingsUrl: 'https://app.vocaply.com/settings/integrations',
    })
    expect(warningHtml).toContain('Slack')
    expect(warningHtml).toContain('Acme Workspace')
    expect(warningHtml).not.toContain('undefined')

    const deactivatedHtml = renderIntegrationDeactivatedHtml({
      providerName: 'Linear',
      settingsUrl: 'https://app.vocaply.com/settings/integrations',
    })
    expect(deactivatedHtml).toContain('Linear')
    expect(deactivatedHtml).toContain('Reconnect Integration')
    expect(deactivatedHtml).not.toContain('undefined')
  })
})
