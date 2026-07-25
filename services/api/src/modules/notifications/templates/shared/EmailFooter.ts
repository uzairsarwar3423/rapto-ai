import { EmailColors, EmailTypography } from './email-tokens'
import { getFrontendUrl } from '../../email.service'

export interface EmailFooterProps {
  notificationType: string
  unsubscribeToken?: string
}

const REASON_EXPLANATIONS: Record<string, string> = {
  VERIFICATION_EMAIL: 'You are receiving this email because a new Rapto account was registered with your address.',
  PASSWORD_RESET_EMAIL: 'You are receiving this email because a password reset request was made for your account.',
  TEAM_INVITE_EMAIL: 'You are receiving this email because you were invited to join a workspace on Rapto.',
  OWNER_WELCOME_EMAIL: 'You are receiving this email because you recently created a workspace owner account on Rapto.',
  TEAM_MEMBER_WELCOME_EMAIL: 'You are receiving this email because you recently joined a team workspace on Rapto.',
  MEETING_PROCESSED: 'You are receiving this email because a meeting you participated in was processed.',
  DEADLINE_REMINDER: 'You are receiving this email based on your notification preferences for upcoming deadlines.',
  DEADLINE_TODAY: 'You are receiving this email based on your notification preferences for upcoming deadlines.',
  COMMITMENT_MISSED: 'You are receiving this email because a commitment assigned to you or your team is overdue.',
  MANAGER_ALERT: 'You are receiving this email as a team manager regarding overdue commitments.',
  PAYMENT_FAILED: 'You are receiving this transactional email regarding your workspace subscription payment.',
  PLAN_LIMIT: 'You are receiving this transactional email regarding your team plan usage limits.',
  INTEGRATION_WARNING: 'You are receiving this alert because an integration connected to your workspace needs attention.',
  INTEGRATION_DEACTIVATED: 'You are receiving this alert because an integration connected to your workspace was deactivated.',
}

export function renderEmailFooter(props: EmailFooterProps): string {
  const { notificationType, unsubscribeToken } = props
  const explanation = REASON_EXPLANATIONS[notificationType] || 'You are receiving this transactional email from Rapto.'
  const frontendUrl = getFrontendUrl()

  const unsubscribeUrl = unsubscribeToken
    ? `${frontendUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
    : `${frontendUrl}/settings/notifications`

  return `
<div style="border-top: 1px solid ${EmailColors.borderDivider}; padding-top: 20px; font-size: ${EmailTypography.fontSizeSmall}; color: ${EmailColors.textFooter}; line-height: 1.5; font-family: ${EmailTypography.fontFamily};">
  <p style="margin: 0 0 8px 0;">${explanation}</p>
  <p style="margin: 0;">
    <a href="${unsubscribeUrl}" style="color: ${EmailColors.textMuted}; text-decoration: underline;">Unsubscribe or change preferences</a> &bull; Rapto Inc., 100 Enterprise Way, Suite 400
  </p>
</div>`
}
