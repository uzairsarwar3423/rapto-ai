import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { EmailColors } from './shared/email-tokens'

export interface IntegrationDeactivatedEmailProps {
  providerName: string
  workspaceName?: string
  settingsUrl: string
  unsubscribeToken?: string
}

export function renderIntegrationDeactivatedHtml(props: IntegrationDeactivatedEmailProps): string {
  const { providerName, workspaceName, settingsUrl, unsubscribeToken } = props

  const cardHtml = `
<p style="margin: 0; font-weight: 600; color: ${EmailColors.stateDangerText};">
  🚨 Disconnected Integration: ${providerName}
</p>
<p style="margin: 4px 0 0 0; font-size: 13px; color: ${EmailColors.stateDangerText};">
  Target Workspace: ${workspaceName || 'Connected Workspace'}
</p>`

  const content = `
<h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">Integration Deactivated</h2>
<p>We encountered multiple consecutive errors while attempting to sync with your <strong>${providerName}</strong> account. To protect your security and rate limits, this integration has been deactivated.</p>

${renderEmailCard({ contentHtml: cardHtml, variant: 'danger' })}

<p>To resume automatic syncing, please reconnect your account in settings:</p>

${renderEmailButton({ href: settingsUrl, label: 'Reconnect Integration', variant: 'danger' })}

<p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 24px;">
  Direct link: <a href="${settingsUrl}" style="color: ${EmailColors.brandPrimary}; word-break: break-all;">${settingsUrl}</a>
</p>`

  const footer = renderEmailFooter({
    notificationType: 'INTEGRATION_DEACTIVATED',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `🚨 Action Required: ${providerName} integration has been disconnected`,
    previewText: `${providerName} integration was disconnected due to sync errors`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
