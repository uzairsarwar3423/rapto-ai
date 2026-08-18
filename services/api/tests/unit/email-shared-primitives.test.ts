import { renderEmailLayout } from '../../src/modules/notifications/templates/shared/EmailLayout'
import { renderEmailButton } from '../../src/modules/notifications/templates/shared/EmailButton'
import { renderEmailCard } from '../../src/modules/notifications/templates/shared/EmailCard'
import { renderEmailDivider } from '../../src/modules/notifications/templates/shared/EmailDivider'
import { renderEmailFooter } from '../../src/modules/notifications/templates/shared/EmailFooter'
import { renderEmailStatCallout } from '../../src/modules/notifications/templates/shared/EmailStatCallout'

describe('Email Shared Primitives', () => {
  describe('EmailLayout', () => {
    it('renders outer container with title, preview text, and brand header', () => {
      const html = renderEmailLayout({
        title: 'Test Email Title',
        previewText: 'This is a preview text for email clients',
        childrenHtml: '<p>Test Body Content</p>',
      })

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('Test Email Title')
      expect(html).toContain('This is a preview text for email clients')
      expect(html).toContain('https://app.rapto.cloud')
      expect(html).toContain('Test Body Content')
    })
  })

  describe('EmailButton', () => {
    it('renders primary CTA button link with correct styling', () => {
      const html = renderEmailButton({
        href: 'https://app.rapto.cloud/action',
        label: 'Click Me',
        variant: 'primary',
      })

      expect(html).toContain('href="https://app.rapto.cloud/action"')
      expect(html).toContain('Click Me')
      expect(html).toContain('background-color: #10B981')
    })

    it('renders warning variant button', () => {
      const html = renderEmailButton({
        href: 'https://app.rapto.cloud/resolve',
        label: 'Fix Issue',
        variant: 'warning',
      })

      expect(html).toContain('Fix Issue')
      expect(html).toContain('background-color: #F59E0B')
    })
  })

  describe('EmailCard', () => {
    it('renders callout card with custom content and variant border', () => {
      const html = renderEmailCard({
        contentHtml: '<span>Important Notice</span>',
        variant: 'warning',
      })

      expect(html).toContain('Important Notice')
      expect(html).toContain('border-left: 4px solid #F59E0B')
    })
  })

  describe('EmailDivider', () => {
    it('renders muted horizontal rule', () => {
      const html = renderEmailDivider()
      expect(html).toContain('<hr')
      expect(html).toContain('margin: 24px 0')
    })
  })

  describe('EmailFooter', () => {
    it('derives correct GitHub-style self-explanation text based on notificationType', () => {
      const htmlMissed = renderEmailFooter({ notificationType: 'COMMITMENT_MISSED' })
      expect(htmlMissed).toContain('You are receiving this email because a commitment assigned to you or your team is overdue.')

      const htmlInvite = renderEmailFooter({ notificationType: 'TEAM_INVITE_EMAIL' })
      expect(htmlInvite).toContain('You are receiving this email because you were invited to join a workspace on Rapto.')

      const htmlPayment = renderEmailFooter({ notificationType: 'PAYMENT_FAILED' })
      expect(htmlPayment).toContain('You are receiving this transactional email regarding your workspace subscription payment.')
    })

    it('includes unsubscribe link with token when provided', () => {
      const html = renderEmailFooter({
        notificationType: 'DEADLINE_REMINDER',
        unsubscribeToken: 'test-token-123',
      })

      expect(html).toContain('/unsubscribe?token=test-token-123')
      expect(html).toContain('Unsubscribe or change preferences')
    })
  })

  describe('EmailStatCallout', () => {
    it('renders stat block with number and label', () => {
      const html = renderEmailStatCallout({
        value: '47 / 50',
        label: 'Meetings Used',
        variant: 'warning',
      })

      expect(html).toContain('47 / 50')
      expect(html).toContain('Meetings Used')
    })
  })
})
