import { emailService } from '../../src/modules/notifications/email.service'
import { env } from '../../src/config/env'

describe('Email Notifications Integration Suite', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('dispatches meeting summary email without throwing when Brevo is configured or unconfigured', async () => {
    await expect(
      emailService.sendMeetingSummary({
        to: 'user@example.com',
        name: 'Test User',
        meetingTitle: 'Sync Meeting',
        summary: 'Highlights',
        commitmentsCount: 2,
        actionItemsCount: 1,
        viewUrl: 'http://localhost:3000/meetings/m1',
      })
    ).resolves.not.toThrow()
  })

  it('dispatches commitment missed alert cleanly', async () => {
    await expect(
      emailService.sendCommitmentMissed({
        to: 'user@example.com',
        name: 'Test User',
        commitmentText: 'Review PR #42',
        dueDate: new Date(),
        actionUrl: 'http://localhost:3000/commitments',
      })
    ).resolves.not.toThrow()
  })

  it('dispatches manager alert cleanly', async () => {
    await expect(
      emailService.sendManagerAlert({
        to: 'manager@example.com',
        name: 'Manager Name',
        assigneeName: 'IC Name',
        commitmentText: 'Build feature X',
        dueDate: new Date(),
        actionUrl: 'http://localhost:3000/dashboard',
      })
    ).resolves.not.toThrow()
  })

  it('dispatches payment failed notification cleanly', async () => {
    await expect(
      emailService.sendPaymentFailedEmail({
        to: 'owner@example.com',
        teamName: 'Acme Inc',
        amountDue: '$99.00',
        retryUrl: 'http://localhost:3000/settings/billing',
      })
    ).resolves.not.toThrow()
  })

  it('dispatches plan limit notification cleanly', async () => {
    await expect(
      emailService.sendPlanLimitEmail({
        to: 'owner@example.com',
        teamName: 'Acme Inc',
        resource: 'meetings',
        used: 50,
        limit: 50,
        upgradeUrl: 'http://localhost:3000/settings/billing/upgrade',
      })
    ).resolves.not.toThrow()
  })
})
