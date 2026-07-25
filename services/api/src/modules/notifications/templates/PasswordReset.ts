import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors } from './shared/email-tokens'

export interface PasswordResetProps {
  name: string
  url: string
  unsubscribeToken?: string
}

export function renderPasswordResetHtml(props: PasswordResetProps): string {
  const { name, url, unsubscribeToken } = props

  const content = `
<h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">Reset your password</h2>
<p>Hi ${name},</p>
<p>We received a request to reset the password for your Vocaply account. Click the button below to set a new password:</p>

${renderEmailButton({ href: url, label: 'Reset Password', variant: 'primary' })}

<p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 24px;">
  If the button above does not work, copy and paste this link into your web browser:<br />
  <a href="${url}" style="color: ${EmailColors.brandPrimary}; word-break: break-all;">${url}</a>
</p>
<p style="font-size: 12px; color: ${EmailColors.textMuted}; margin-top: 16px;">
  This password reset link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.
</p>`

  const footer = renderEmailFooter({
    notificationType: 'PASSWORD_RESET_EMAIL',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: 'Reset your Vocaply password',
    previewText: 'Password reset request for your Vocaply account',
    childrenHtml: content,
    footerHtml: footer,
  })
}
