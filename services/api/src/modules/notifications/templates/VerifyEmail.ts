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
<div style="text-align: center; margin-bottom: 24px;">
  <div style="display: inline-block; width: 48px; height: 48px; background-color: #ECFDF5; border-radius: 12px; line-height: 48px; font-size: 24px; margin-bottom: 12px;">
    ✉️
  </div>
  <h2 class="email-headline-text" style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: ${EmailColors.textHeadline}; letter-spacing: -0.5px;">
    Verify your email address
  </h2>
  <p style="margin: 0; font-size: 14px; color: ${EmailColors.textMuted};">
    Welcome to Rapto, ${name}! One click left to activate your workspace.
  </p>
</div>

<div style="background-color: #FAFAFA; border: 1px solid #F4F4F5; border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
  <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: ${EmailColors.textBody};">
    Please confirm your email address by clicking the button below. This helps us secure your account and workspace data.
  </p>

  ${renderEmailButton({ href: url, label: 'Verify Email Address →', variant: 'primary', align: 'center' })}

  <p style="margin: 16px 0 0 0; font-size: 12px; color: ${EmailColors.textMuted}; font-style: italic;">
    This link expires in 24 hours.
  </p>
</div>

<div style="border-top: 1px solid #F4F4F5; padding-top: 20px; margin-top: 24px;">
  <p style="font-size: 12px; color: ${EmailColors.textMuted}; margin: 0 0 8px 0; font-weight: 600;">
    Button not working? Copy and paste this link into your browser:
  </p>
  <div style="background-color: #F4F4F5; border-radius: 6px; padding: 10px 12px; font-family: monospace; font-size: 11px; word-break: break-all; color: #059669; border: 1px dashed #D1D5DB;">
    <a href="${url}" style="color: #059669; text-decoration: underline;">${url}</a>
  </div>
</div>`

  const footer = renderEmailFooter({
    notificationType: 'VERIFICATION_EMAIL',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: 'Verify your Rapto account',
    previewText: `Welcome ${name}! Confirm your email address to get started with Rapto.`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
