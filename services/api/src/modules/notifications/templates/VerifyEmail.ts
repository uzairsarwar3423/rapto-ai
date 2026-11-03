import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailMuted, renderEmailLinkFallback, strong } from './shared/EmailContent'

export interface VerifyEmailProps {
  name: string
  url: string
  unsubscribeToken?: string
}

export function renderVerifyEmailHtml(props: VerifyEmailProps): string {
  const { name, url, unsubscribeToken } = props

  const content = [
    renderEmailHeading('Verify your email address'),
    renderEmailText(`Welcome to Rapto, ${strong(name)}. Confirm your email address to activate your workspace.`),
    renderEmailText('Confirming helps us secure your account and workspace data.'),
    renderEmailButton({ href: url, label: 'Verify Email Address', variant: 'primary', align: 'left' }),
    renderEmailMuted('This link expires in 24 hours.'),
    renderEmailLinkFallback(url),
  ].join('')

  return renderEmailLayout({
    title: 'Verify your Rapto account',
    previewText: `Welcome ${name}! Confirm your email address to get started with Rapto.`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'VERIFICATION_EMAIL', unsubscribeToken }),
  })
}
