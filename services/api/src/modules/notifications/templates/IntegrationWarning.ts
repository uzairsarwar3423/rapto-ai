import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors } from './shared/email-tokens'

export interface IntegrationWarningEmailProps {
  providerName: string
  workspaceName?: string
  settingsUrl: string
  unsubscribeToken?: string
}

export function renderIntegrationWarningHtml(props: IntegrationWarningEmailProps): string {
  const { providerName, workspaceName, settingsUrl, unsubscribeToken } = props

  const cardHtml = `
<p style="margin: 0; font-weight: 600; color: ${EmailColors.stateWarningText};">
  ⚠️ Connection Warning: ${providerName}
</p>
<p style="margin: 4px 0 0 0; font-size: 13px; color: ${EmailColors.textMuted};">
  Target Workspace: ${workspaceName || 'Connected Workspace'}
</p>`

  const content = `
<h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">Integration Connection Warning</h2>
<p>Rapto experienced temporary issues maintaining a connection with your <strong>${providerName}</strong> integration${workspaceName ? ` (${workspaceName})` : ''}.</p>

${renderEmailCard({ contentHtml: cardHtml, variant: 'warning' })}

<p>Rapto is continuing to retry automatically. No immediate action is required, but you may want to verify your integration credentials in your settings.</p>

${renderEmailButton({ href: settingsUrl, label: 'View Integration Settings', variant: 'warning' })}

<p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 24px;">
  Direct link: <a href="${settingsUrl}" style="color: ${EmailColors.brandPrimary}; word-break: break-all;">${settingsUrl}</a>
</p>`

  const footer = renderEmailFooter({
    notificationType: 'INTEGRATION_WARNING',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `⚠️ Connection Warning: Issue syncing with ${providerName}`,
    previewText: `Temporary sync issues with ${providerName}`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
