export interface IntegrationDeactivatedEmailProps {
    providerName: string
    workspaceName?: string
    settingsUrl: string
}

export function renderIntegrationDeactivatedHtml(props: IntegrationDeactivatedEmailProps): string {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Integration Deactivated</title>
      </head>
      <body style="font-family: sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px 16px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #ef4444;">
          <div style="font-size: 24px; font-weight: bold; color: #ef4444; margin-bottom: 16px;">
            🚨 Integration Deactivated: ${props.providerName}
          </div>
          <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
            Your <strong>${props.providerName}</strong> integration${props.workspaceName ? ` (${props.workspaceName})` : ''} has been disconnected after 5 consecutive failed connection attempts.
          </p>
          <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
            Automatic background syncing for this integration is currently paused to protect your rate limits and service stability. Please reconnect your account to resume syncing.
          </p>
          <div style="margin: 32px 0; text-align: center;">
            <a href="${props.settingsUrl}" style="display: inline-block; background-color: #ef4444; color: #ffffff; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
              Reconnect Integration Now
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
