import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailCard } from './shared/EmailCard'
import { EmailColors, EmailTypography, EmailSpacing } from './shared/email-tokens'

export interface TeamCapability {
  icon: string
  title: string
  description: string
}

export interface TeamMemberWelcomeProps {
  memberName: string
  memberEmail: string
  workspaceName: string
  inviterName: string
  role: string
  dashboardUrl: string
  capabilities?: TeamCapability[]
  unsubscribeToken?: string
  supportEmail?: string
}

const DEFAULT_CAPABILITIES: TeamCapability[] = [
  {
    icon: '⚡',
    title: 'Automated Meeting Summaries',
    description: 'Get concise, AI-powered key takeaways and structured notes immediately after every team meeting.',
  },
  {
    icon: '📌',
    title: 'Commitment & Task Tracking',
    description: 'Never miss a promise or deliverable. Rapto captures verbal commitments and tracks them automatically.',
  },
  {
    icon: '🔍',
    title: 'Searchable Transcripts & Context',
    description: 'Search across your team’s entire meeting history with exact timestamps and speaker attribution.',
  },
  {
    icon: '🔔',
    title: 'Smart Notifications & Integrations',
    description: 'Receive real-time notifications via Slack, Jira, and Linear whenever action items are assigned to you.',
  },
]

/**
 * Render HTML version of Team Member Welcome Email
 */
export function renderTeamMemberWelcomeHtml(props: TeamMemberWelcomeProps): string {
  const {
    memberName,
    workspaceName,
    inviterName,
    role,
    dashboardUrl,
    capabilities = DEFAULT_CAPABILITIES,
    unsubscribeToken,
    supportEmail = 'support@rapto.cloud',
  } = props

  const capabilitiesHtml = capabilities
    .map(
      (cap) => `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid ${EmailColors.borderDivider};">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="32" valign="top" style="padding-right: 12px; font-size: 18px;">
                ${cap.icon}
              </td>
              <td valign="top">
                <p style="margin: 0 0 2px 0; font-size: 14px; font-weight: ${EmailTypography.fontWeightSemiBold}; color: ${EmailColors.textHeadline}; font-family: ${EmailTypography.fontFamily};">
                  ${cap.title}
                </p>
                <p style="margin: 0; font-size: 13px; color: ${EmailColors.textMuted}; line-height: 1.4; font-family: ${EmailTypography.fontFamily};">
                  ${cap.description}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    )
    .join('')

  const cardHtml = `
<div style="margin-bottom: 12px;">
  <span style="display: inline-block; padding: 4px 10px; border-radius: 12px; background-color: ${EmailColors.brandLight}; color: ${EmailColors.brandHover}; font-size: 12px; font-weight: ${EmailTypography.fontWeightSemiBold};">
    Role: ${role}
  </span>
</div>
<p style="margin: 0; font-size: 14px; color: ${EmailColors.textHeadline}; font-weight: ${EmailTypography.fontWeightMedium};">
  You’ve joined <strong>${workspaceName}</strong> workspace on Rapto!
</p>
<p style="margin: 4px 0 0 0; font-size: 13px; color: ${EmailColors.textMuted};">
  Invited by <strong>${inviterName}</strong>
</p>`

  const capabilitiesCardHtml = `
<p style="margin: 0 0 12px 0; font-size: 15px; font-weight: ${EmailTypography.fontWeightSemiBold}; color: ${EmailColors.textHeadline};">
  What you can do in ${workspaceName}
</p>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
  ${capabilitiesHtml}
</table>`

  const content = `
<h2 class="email-headline-text" style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: ${EmailColors.textHeadline}; letter-spacing: -0.5px;">
  Welcome to the team, ${memberName}! 🎉
</h2>
<p style="margin: 0 0 20px 0; font-size: 15px; color: ${EmailColors.textBody}; line-height: 1.5;">
  You now have full access to the <strong>${workspaceName}</strong> workspace on Rapto.
</p>

${renderEmailCard({ contentHtml: cardHtml, variant: 'neutral' })}

${renderEmailCard({ contentHtml: capabilitiesCardHtml, variant: 'neutral' })}

${renderEmailButton({ href: dashboardUrl, label: 'Open Dashboard →', variant: 'primary' })}

<div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid ${EmailColors.borderDivider};">
  <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: ${EmailTypography.fontWeightMedium}; color: ${EmailColors.textHeadline};">
    Questions or need assistance?
  </p>
  <p style="margin: 0; font-size: 13px; color: ${EmailColors.textMuted}; line-height: 1.5;">
    Reach out to your workspace administrator <strong>${inviterName}</strong> or contact Rapto support at <a href="mailto:${supportEmail}" style="color: ${EmailColors.brandPrimary}; text-decoration: underline;">${supportEmail}</a>.
  </p>
</div>`

  const footer = renderEmailFooter({
    notificationType: 'TEAM_MEMBER_WELCOME_EMAIL',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `Welcome to ${workspaceName} on Rapto`,
    previewText: `Hi ${memberName}, welcome to ${workspaceName}! ${inviterName} has invited you to join the team.`,
    childrenHtml: content,
    footerHtml: footer,
  })
}

/**
 * Render Plain Text Fallback version of Team Member Welcome Email
 */
export function renderTeamMemberWelcomeText(props: TeamMemberWelcomeProps): string {
  const { memberName, workspaceName, inviterName, role, dashboardUrl, capabilities = DEFAULT_CAPABILITIES, supportEmail = 'support@rapto.cloud' } = props

  const capabilitiesText = capabilities
    .map((cap) => `  * ${cap.title}: ${cap.description}`)
    .join('\n\n')

  return `
===================================================================
WELCOME TO ${workspaceName.toUpperCase()} ON RAPTO!
===================================================================

Hi ${memberName},

Welcome to the team! You have successfully joined the "${workspaceName}" workspace as a ${role}. You were invited by ${inviterName}.

-------------------------------------------------------------------
WHAT YOU CAN DO IN RAPTO
-------------------------------------------------------------------
${capabilitiesText}

-------------------------------------------------------------------
OPEN YOUR DASHBOARD
-------------------------------------------------------------------
Access your workspace dashboard now:
${dashboardUrl}

-------------------------------------------------------------------
QUESTIONS & SUPPORT
-------------------------------------------------------------------
Reach out to your workspace administrator ${inviterName} or contact Rapto support at ${supportEmail}.

-------------------------------------------------------------------
Rapto Inc. | 100 Enterprise Way, Suite 400
Unsubscribe / Preferences: ${dashboardUrl}/settings/notifications
===================================================================
`.trim()
}
