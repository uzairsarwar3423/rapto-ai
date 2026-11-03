import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailMuted, renderEmailLinkFallback, strong } from './shared/EmailContent'

export interface PasswordResetProps {
  name: string
  url: string
  unsubscribeToken?: string
}

export function renderPasswordResetHtml(props: PasswordResetProps): string {
  const { name, url, unsubscribeToken } = props

  const content = [
    renderEmailHeading('Reset your password'),
    renderEmailText(`Hi ${strong(name)},`),
    renderEmailText('We received a request to reset the password for your Rapto account. Use the button below to choose a new password.'),
    renderEmailButton({ href: url, label: 'Reset Password', variant: 'primary', align: 'left' }),
    renderEmailMuted('This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.'),
    renderEmailLinkFallback(url, 'If the button does not work, copy and paste this link into your browser:'),
  ].join('')

  return renderEmailLayout({
    title: 'Reset your Rapto password',
    previewText: 'Password reset request for your Rapto account',
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'PASSWORD_RESET_EMAIL', unsubscribeToken }),
  })
}
