import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailCard } from './shared/EmailCard'
import { EmailColors } from './shared/email-tokens'

export interface TeamInviteProps {
  to: string
  teamName: string
  inviterName: string
  joinUrl: string
  role: string
  expiresAt: Date
  unsubscribeToken?: string
}

export function renderTeamInviteHtml(props: TeamInviteProps): string {
  const { teamName, inviterName, joinUrl, role, expiresAt, unsubscribeToken } = props
  const expiryStr = expiresAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const cardHtml = `
<p style="margin: 0; font-weight: 500; color: ${EmailColors.textHeadline};">
  Invitation Details
</p>
<p style="margin: 4px 0 0 0; font-size: 13px; color: ${EmailColors.textMuted};">
  Workspace: <strong>${teamName}</strong> &bull; Role: <strong>${role}</strong> &bull; Invited by: <strong>${inviterName}</strong>
</p>`

  const content = `
<h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${EmailColors.textHeadline};">You've been invited to join ${teamName}</h2>
<p><strong>${inviterName}</strong> has invited you to join their workspace on Rapto as a <strong>${role}</strong>.</p>
<p>Rapto tracks meeting commitments and team accountability automatically.</p>

${renderEmailCard({ contentHtml: cardHtml, variant: 'neutral' })}

${renderEmailButton({ href: joinUrl, label: 'Accept Invitation', variant: 'primary' })}

<p style="font-size: 13px; color: ${EmailColors.textMuted}; margin-top: 24px;">
  This invitation will expire on <strong>${expiryStr}</strong>.<br />
  Direct link: <a href="${joinUrl}" style="color: ${EmailColors.brandPrimary}; word-break: break-all;">${joinUrl}</a>
</p>`

  const footer = renderEmailFooter({
    notificationType: 'TEAM_INVITE_EMAIL',
    unsubscribeToken,
  })

  return renderEmailLayout({
    title: `${inviterName} invited you to join ${teamName} on Rapto`,
    previewText: `${inviterName} invited you to join the ${teamName} workspace`,
    childrenHtml: content,
    footerHtml: footer,
  })
}
