import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailHeading, renderEmailText, renderEmailMuted, renderEmailSteps, renderEmailEyebrow, link, strong } from './shared/EmailContent'
import { renderEmailDivider } from './shared/EmailDivider'

export interface OnboardingStep {
  step: number
  title: string
  description: string
  completed?: boolean
  actionUrl?: string
  actionLabel?: string
}

export interface OwnerWelcomeProps {
  ownerName: string
  ownerEmail: string
  workspaceName: string
  dashboardUrl: string
  checklist?: OnboardingStep[]
  unsubscribeToken?: string
  supportEmail?: string
}

const DEFAULT_CHECKLIST: OnboardingStep[] = [
  {
    step: 1,
    title: 'Connect Google or Outlook Calendar',
    description: 'Sync your calendar so Rapto can automatically join and record your scheduled team meetings.',
    actionLabel: 'Connect Calendar',
  },
  {
    step: 2,
    title: 'Invite Team Members',
    description: 'Bring your team on board so AI-extracted commitments and action items are assigned instantly.',
    actionLabel: 'Invite Team',
  },
  {
    step: 3,
    title: 'Record or Upload Your First Meeting',
    description: 'Run your first meeting with Rapto to generate AI summaries, action items, and decision logs.',
    actionLabel: 'Start First Meeting',
  },
]

/**
 * Render HTML version of Owner Welcome Email
 */
export function renderOwnerWelcomeHtml(props: OwnerWelcomeProps): string {
  const {
    ownerName,
    workspaceName,
    dashboardUrl,
    checklist = DEFAULT_CHECKLIST,
    unsubscribeToken,
    supportEmail = 'support@rapto.cloud',
  } = props

  const content = [
    renderEmailHeading(`Welcome to Rapto, ${ownerName}`),
    renderEmailText(
      `Your workspace ${strong(workspaceName)} is set up and ready. Rapto turns raw team meeting conversations into actionable summaries, commitments, and tracked deliverables.`
    ),
    renderEmailEyebrow('Quick setup'),
    renderEmailSteps(
      checklist.map((item) => ({
        index: item.completed ? '✓' : item.step,
        title: item.title,
        description: item.description,
      }))
    ),
    renderEmailButton({ href: dashboardUrl, label: 'Go to Dashboard', variant: 'primary', align: 'left' }),
    renderEmailDivider(),
    renderEmailText(strong('Need help getting started?')),
    renderEmailMuted(
      `Reply directly to this email or reach out to ${link(`mailto:${supportEmail}`, supportEmail)} anytime — our team is here to help.`
    ),
  ].join('')

  return renderEmailLayout({
    title: `Welcome to Rapto - ${workspaceName} is ready!`,
    previewText: `Hi ${ownerName}, welcome to Rapto! Your workspace ${workspaceName} is ready.`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'OWNER_WELCOME_EMAIL', unsubscribeToken }),
  })
}

/**
 * Render Plain Text Fallback version of Owner Welcome Email
 */
export function renderOwnerWelcomeText(props: OwnerWelcomeProps): string {
  const { ownerName, workspaceName, dashboardUrl, checklist = DEFAULT_CHECKLIST, supportEmail = 'support@rapto.cloud' } = props

  const checklistText = checklist
    .map((item) => `  [Step ${item.step}] ${item.title}\n  ${item.description}\n`)
    .join('\n')

  return `
===================================================================
WELCOME TO RAPTO, ${ownerName.toUpperCase()}!
===================================================================

Hi ${ownerName},

Your workspace "${workspaceName}" is fully set up and ready to go! Rapto automatically transforms raw team meeting conversations into actionable summaries, commitments, and tracked deliverables.

-------------------------------------------------------------------
QUICK SETUP CHECKLIST
-------------------------------------------------------------------
${checklistText}

-------------------------------------------------------------------
GO TO YOUR DASHBOARD
-------------------------------------------------------------------
Access your workspace dashboard now:
${dashboardUrl}

-------------------------------------------------------------------
NEED HELP?
-------------------------------------------------------------------
Our customer success and engineering teams are here to help. Reply directly to this email or contact us at ${supportEmail}.

-------------------------------------------------------------------
Rapto Inc. | 100 Enterprise Way, Suite 400
Unsubscribe / Preferences: ${dashboardUrl}/settings/notifications
===================================================================
`.trim()
}
