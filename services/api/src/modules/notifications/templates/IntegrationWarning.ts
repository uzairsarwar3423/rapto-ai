export interface IntegrationWarningEmailProps {
    providerName: string
    workspaceName?: string
    settingsUrl: string
}

export function renderIntegrationWarningHtml(props: IntegrationWarningEmailProps): string {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Integration Warning</title>
      </head>
      <body style="font-family: sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px 16px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155;">
          <div style="font-size: 24px; font-weight: bold; color: #f59e0b; margin-bottom: 16px;">
            ⚠️ Integration Warning: ${props.providerName}
          </div>
          <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
            We are experiencing temporary issues maintaining a connection with your <strong>${props.providerName}</strong> integration${props.workspaceName ? ` (${props.workspaceName})` : ''}.
          </p>
          <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
            Vocaply is continuing to retry the connection automatically. No immediate action is required, but you may want to verify your integration credentials or access permissions in your settings.
          </p>
          <div style="margin: 32px 0; text-align: center;">
            <a href="${props.settingsUrl}" style="display: inline-block; background-color: #f59e0b; color: #0f172a; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
              View Integration Settings
            </a>
          </div>
          <p style="font-size: 13px; color: #64748b; margin-top: 32px; border-top: 1px solid #334155; padding-top: 16px;">
            Vocaply Integration Health Service • Automated Administrative Alert
          </p>
        </div>
      </body>
    </html>
    `
}
