import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailLinkFallback, renderEmailDetails, renderEmailBadge, strong } from './shared/EmailContent'
import { esc } from './shared/email-escape'

export interface IntegrationWarningEmailProps {
  providerName: string
  workspaceName?: string
  settingsUrl: string
  unsubscribeToken?: string
}

export function renderIntegrationWarningHtml(props: IntegrationWarningEmailProps): string {
  const { providerName, workspaceName, settingsUrl, unsubscribeToken } = props

  const content = [
    renderEmailHeading('Integration Connection Warning'),
    renderEmailText(
      `Rapto experienced temporary issues maintaining a connection with your ${strong(providerName)} integration${workspaceName ? ` (${esc(workspaceName)})` : ''}.`
    ),
    renderEmailCard({
      variant: 'warning',
      contentHtml:
        `<p style="margin: 0 0 10px 0;">${renderEmailBadge('Connection warning', 'warning')}</p>` +
        renderEmailDetails([
          { label: 'Integration', value: providerName, strong: true },
          { label: 'Workspace', value: workspaceName || 'Connected Workspace' },
        ]),
    }),
    renderEmailText(
      'Rapto is continuing to retry automatically. No immediate action is required, but you may want to verify your integration credentials in your settings.'
    ),
    renderEmailButton({ href: settingsUrl, label: 'View Integration Settings', variant: 'primary', align: 'left' }),
    renderEmailLinkFallback(settingsUrl, 'Direct link:'),
  ].join('')

  return renderEmailLayout({
    title: `⚠️ Connection Warning: Issue syncing with ${providerName}`,
    previewText: `Temporary sync issues with ${providerName}`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'INTEGRATION_WARNING', unsubscribeToken }),
  })
}
