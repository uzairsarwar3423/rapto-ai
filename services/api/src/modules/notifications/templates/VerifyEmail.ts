import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors } from './shared/email-tokens'

export interface VerifyEmailProps {
  name: string
  url: string
  unsubscribeToken?: string
}

export function renderVerifyEmailHtml(props: VerifyEmailProps): string {
  const { name, url, unsubscribeToken } = props

  const content = `
<h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">Verify your email address</h2>
<p>Hi ${name},</p>
<p>Thank you for signing up with Vocaply. Please click the button below to verify your email address and activate your account:</p>

${renderEmailButton({ href: url, label: 'Verify Email Address', variant: 'primary' })}

<p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 24px;">
  If the button above does not work, copy and paste this link into your web browser:<br />
  <a href="${url}" style="color: ${EmailColors.brandPrimary}; word-break: break-all;">${url}</a>
</p>
<p style="font-size: 12px; color: ${EmailColors.textMuted}; margin-top: 16px;">
  This verification link will expire in 24 hours. If you did not create a Vocaply account, no further action is required.
</p>`

  const footer = renderEmailFooter({
    notificationType: 'VERIFICATION_EMAIL',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: 'Verify your Vocaply account',
    previewText: 'Confirm your email address to complete your Vocaply registration',
    childrenHtml: content,
    footerHtml: footer,
  })
}
