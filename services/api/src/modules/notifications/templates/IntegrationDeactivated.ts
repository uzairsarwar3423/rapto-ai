import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailLinkFallback, renderEmailDetails, renderEmailBadge, strong } from './shared/EmailContent'

export interface IntegrationDeactivatedEmailProps {
  providerName: string
  workspaceName?: string
  settingsUrl: string
  unsubscribeToken?: string
}

export function renderIntegrationDeactivatedHtml(props: IntegrationDeactivatedEmailProps): string {
  const { providerName, workspaceName, settingsUrl, unsubscribeToken } = props

  const content = [
    renderEmailHeading('Integration Deactivated'),
    renderEmailText(
      `We encountered multiple consecutive errors while attempting to sync with your ${strong(providerName)} account. To protect your security and rate limits, this integration has been deactivated.`
    ),
    renderEmailCard({
      variant: 'danger',
      contentHtml:
        `<p style="margin: 0 0 10px 0;">${renderEmailBadge('Disconnected', 'danger')}</p>` +
        renderEmailDetails([
          { label: 'Integration', value: providerName, strong: true },
          { label: 'Workspace', value: workspaceName || 'Connected Workspace' },
        ]),
    }),
    renderEmailText('To resume automatic syncing, reconnect your account in settings:'),
    renderEmailButton({ href: settingsUrl, label: 'Reconnect Integration', variant: 'primary', align: 'left' }),
    renderEmailLinkFallback(settingsUrl, 'Direct link:'),
  ].join('')

  return renderEmailLayout({
    title: `🚨 Action Required: ${providerName} integration has been disconnected`,
    previewText: `${providerName} integration was disconnected due to sync errors`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'INTEGRATION_DEACTIVATED', unsubscribeToken }),
  })
}
