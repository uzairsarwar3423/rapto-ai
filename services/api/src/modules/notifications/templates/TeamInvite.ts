import { renderEmailLayout } from './shared/EmailLayout'
import { renderEmailButton } from './shared/EmailButton'
import { renderEmailFooter } from './shared/EmailFooter'
import { renderEmailCard } from './shared/EmailCard'
import { renderEmailHeading, renderEmailText, renderEmailMuted, renderEmailLinkFallback, renderEmailDetails, strong } from './shared/EmailContent'

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
  const expiryStr = expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const content = [
    renderEmailHeading(`You've been invited to join ${teamName}`),
    renderEmailText(`${strong(inviterName)} has invited you to join their workspace on Rapto as a ${strong(role)}.`),
    renderEmailText('Rapto tracks meeting commitments and team accountability automatically.'),
    renderEmailCard({
      variant: 'neutral',
      contentHtml: renderEmailDetails([
        { label: 'Workspace', value: teamName, strong: true },
        { label: 'Role', value: role },
        { label: 'Invited by', value: inviterName },
        { label: 'Expires', value: expiryStr },
      ]),
    }),
    renderEmailButton({ href: joinUrl, label: 'Accept Invitation', variant: 'primary', align: 'left' }),
    renderEmailMuted(`This invitation will expire on ${strong(expiryStr)}.`),
    renderEmailLinkFallback(joinUrl),
  ].join('')

  return renderEmailLayout({
    title: `${inviterName} invited you to join ${teamName} on Rapto`,
    previewText: `${inviterName} invited you to join the ${teamName} workspace`,
    childrenHtml: content,
    footerHtml: renderEmailFooter({ notificationType: 'TEAM_INVITE_EMAIL', unsubscribeToken }),
  })
}
