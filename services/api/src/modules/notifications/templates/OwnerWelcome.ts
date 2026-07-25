import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailCard } from './shared/EmailCard'
import { EmailColors, EmailTypography, EmailSpacing } from './shared/email-tokens'

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
    description: 'Sync your calendar so Vocaply can automatically join and record your scheduled team meetings.',
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
    description: 'Run your first meeting with Vocaply to generate AI summaries, action items, and decision logs.',
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
    supportEmail = 'support@vocaply.com',
  } = props

  const checklistItemsHtml = checklist
    .map((item) => {
      const isCompleted = item.completed
      const badgeBg = isCompleted ? EmailColors.stateSuccessBg : EmailColors.bgOuter
      const badgeBorder = isCompleted ? EmailColors.stateSuccessBorder : EmailColors.borderCard
      const badgeText = isCompleted ? EmailColors.stateSuccessText : EmailColors.brandPrimary

      return `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid ${EmailColors.borderDivider};">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="36" valign="top" style="padding-right: 12px;">
                <div style="width: 28px; height: 28px; border-radius: 50%; background-color: ${badgeBg}; border: 1px solid ${badgeBorder}; color: ${badgeText}; font-weight: ${EmailTypography.fontWeightBold}; font-size: 13px; text-align: center; line-height: 28px; font-family: ${EmailTypography.fontFamily};">
                  ${isCompleted ? '✓' : item.step}
                </div>
              </td>
              <td valign="top">
                <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: ${EmailTypography.fontWeightSemiBold}; color: ${EmailColors.textHeadline}; font-family: ${EmailTypography.fontFamily};">
                  ${item.title}
                </p>
                <p style="margin: 0; font-size: 13px; color: ${EmailColors.textMuted}; line-height: 1.4; font-family: ${EmailTypography.fontFamily};">
                  ${item.description}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    })
    .join('')

  const cardHtml = `
<p style="margin: 0 0 12px 0; font-size: 15px; font-weight: ${EmailTypography.fontWeightSemiBold}; color: ${EmailColors.textHeadline};">
  🚀 Quick Setup Checklist
</p>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
  ${checklistItemsHtml}
</table>`

  const content = `
<h2 class="email-headline-text" style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: ${EmailColors.textHeadline}; letter-spacing: -0.5px;">
  Welcome to Vocaply, ${ownerName}! 👋
</h2>
<p style="margin: 0 0 20px 0; font-size: 15px; color: ${EmailColors.textBody}; line-height: 1.5;">
  Your workspace <strong>${workspaceName}</strong> is fully set up and ready to go. Vocaply automatically transforms raw team meeting conversations into actionable summaries, commitments, and tracked deliverables.
</p>

${renderEmailCard({ contentHtml: cardHtml, variant: 'neutral' })}

${renderEmailButton({ href: dashboardUrl, label: 'Go to Dashboard →', variant: 'primary' })}

<div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid ${EmailColors.borderDivider};">
  <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: ${EmailTypography.fontWeightMedium}; color: ${EmailColors.textHeadline};">
    💡 Need assistance getting started?
  </p>
  <p style="margin: 0; font-size: 13px; color: ${EmailColors.textMuted}; line-height: 1.5;">
    Our engineering and customer success teams are here for you. Simply reply directly to this email or reach out to <a href="mailto:${supportEmail}" style="color: ${EmailColors.brandPrimary}; text-decoration: underline;">${supportEmail}</a> anytime.
  </p>
</div>`

  const footer = renderEmailFooter({
    notificationType: 'OWNER_WELCOME_EMAIL',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `Welcome to Vocaply - ${workspaceName} is ready!`,
    previewText: `Hi ${ownerName}, welcome to Vocaply! Your workspace ${workspaceName} is ready.`,
    childrenHtml: content,
    footerHtml: footer,
  })
}

/**
 * Render Plain Text Fallback version of Owner Welcome Email
 */
export function renderOwnerWelcomeText(props: OwnerWelcomeProps): string {
  const { ownerName, workspaceName, dashboardUrl, checklist = DEFAULT_CHECKLIST, supportEmail = 'support@vocaply.com' } = props

  const checklistText = checklist
    .map((item) => `  [Step ${item.step}] ${item.title}\n  ${item.description}\n`)
    .join('\n')

  return `
===================================================================
WELCOME TO VOCAPLY, ${ownerName.toUpperCase()}!
===================================================================

Hi ${ownerName},

Your workspace "${workspaceName}" is fully set up and ready to go! Vocaply automatically transforms raw team meeting conversations into actionable summaries, commitments, and tracked deliverables.

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
Vocaply Inc. | 100 Enterprise Way, Suite 400
Unsubscribe / Preferences: ${dashboardUrl}/settings/notifications
===================================================================
`.trim()
}
