import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailDivider } from './shared/EmailDivider'
import { renderEmailHeading, renderEmailText, renderEmailMuted, renderEmailDetails, renderEmailSteps, renderEmailEyebrow, link, strong } from './shared/EmailContent'

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
 * Render HTML version of Team Member Welcome Email.
 * (`capabilities[].icon` remains part of the data contract and the plain-text version; the HTML design intentionally
 * uses numbered rows instead of emoji, which render inconsistently across mail clients.)
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

  const content = [
    renderEmailHeading(`Welcome to the team, ${memberName}`),
    renderEmailText(`You now have full access to the ${strong(workspaceName)} workspace on Rapto.`),
    renderEmailCard({
      variant: 'neutral',
      contentHtml: renderEmailDetails([
        { label: 'Workspace', value: workspaceName, strong: true },
        { label: 'Role', value: role },
        { label: 'Invited by', value: inviterName },
      ]),
    }),
    renderEmailEyebrow(`What you can do in ${workspaceName}`),
    renderEmailSteps(capabilities.map((cap, i) => ({ index: i + 1, title: cap.title, description: cap.description }))),
    renderEmailButton({ href: dashboardUrl, label: 'Open Dashboard', variant: 'primary', align: 'left' }),
    renderEmailDivider(),
    renderEmailText(strong('Questions or need assistance?')),
    renderEmailMuted(
      `Reach out to your workspace administrator ${strong(inviterName)} or contact Rapto support at ${link(`mailto:${supportEmail}`, supportEmail)}.`
    ),
  ].join('')

  return renderEmailLayout({
    title: `Welcome to ${workspaceName} on Rapto`,
    previewText: `Hi ${memberName}, welcome to ${workspaceName}! ${inviterName} has invited you to join the team.`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'TEAM_MEMBER_WELCOME_EMAIL', unsubscribeToken }),
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
