import { EmailColors, EmailTypography } from './email-tokens'
import { getFrontendUrl } from '../../email.service'
import { esc, safeUrl } from './email-escape'

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
  PAYMENT_SUCCESS: 'You are receiving this transactional email as a receipt for your workspace subscription payment.',
  SUBSCRIPTION_UPGRADED: 'You are receiving this transactional email regarding a change to your workspace subscription.',
  SUBSCRIPTION_CANCELLED: 'You are receiving this transactional email regarding the cancellation of your workspace subscription.',
  TRIAL_STARTED: 'You are receiving this transactional email regarding your workspace free trial.',
  WEEKLY_DIGEST: 'You are receiving this email because weekly team health digests are enabled for your workspace.',
  PLAN_LIMIT: 'You are receiving this transactional email regarding your team plan usage limits.',
  INTEGRATION_WARNING: 'You are receiving this alert because an integration connected to your workspace needs attention.',
  INTEGRATION_DEACTIVATED: 'You are receiving this alert because an integration connected to your workspace was deactivated.',
}

/**
 * Footer: why the recipient got the email, unsubscribe/preferences link, company line. Hairline rule above.
 * Colours are AA-contrast neutrals; the unsubscribe link is underlined (it must be recognisable without colour).
 */
export function renderEmailFooter(props: EmailFooterProps): string {
  const { notificationType, unsubscribeToken } = props
  const explanation = REASON_EXPLANATIONS[notificationType] || 'You are receiving this transactional email from Rapto.'
  const frontendUrl = getFrontendUrl()

  const unsubscribeUrl = unsubscribeToken
    ? `${frontendUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
    : `${frontendUrl}/settings/notifications`

  const font = EmailTypography.fontFamily
  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
  <tr>
    <td height="1" bgcolor="${EmailColors.borderCard}" class="em-border-bg" style="height: 1px; line-height: 1px; font-size: 1px; mso-line-height-rule: exactly; background-color: ${EmailColors.borderCard};">&nbsp;</td>
  </tr>
  <tr>
    <td class="em-muted" style="padding: 20px 0 0 0; font-family: ${font}; font-size: 12px; line-height: 18px; color: ${EmailColors.textFooter};">
      <p style="margin: 0 0 8px 0;">${esc(explanation)}</p>
      <p style="margin: 0;">
        <a href="${safeUrl(unsubscribeUrl)}" target="_blank" class="em-muted" style="color: ${EmailColors.textMuted}; text-decoration: underline;">Unsubscribe or change preferences</a>
        &nbsp;&bull;&nbsp; Rapto Inc., 100 Enterprise Way, Suite 400
      </p>
    </td>
  </tr>
</table>`
}
