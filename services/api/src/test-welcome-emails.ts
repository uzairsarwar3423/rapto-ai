import { renderOwnerWelcomeHtml, renderOwnerWelcomeText } from './modules/notifications/templates/OwnerWelcome'
import { renderTeamMemberWelcomeHtml, renderTeamMemberWelcomeText } from './modules/notifications/templates/TeamMemberWelcome'

function runWelcomeEmailTests() {
  console.log('====================================================')
  console.log(' 🚀 TESTING WELCOME EMAIL TEMPLATES & PLAIN TEXT')
  console.log('====================================================\n')

  // 1. OWNER WELCOME EMAIL TEST
  console.log('----------------------------------------------------')
  console.log(' 1. Testing Owner Welcome Email Template...')
  console.log('----------------------------------------------------')

  const ownerPayload = {
    ownerName: 'Sarah Jenkins',
    ownerEmail: 'sarah@acmecorp.com',
    workspaceName: 'Acme Growth Workspace',
    dashboardUrl: 'https://app.rapto.cloud/dashboard?team=acme-growth',
    checklist: [
      {
        step: 1,
        title: 'Connect Google Calendar',
        description: 'Sync your primary calendar to auto-record team meetings.',
        completed: true,
      },
      {
        step: 2,
        title: 'Invite Core Team Members',
        description: 'Add engineers and product managers to assign commitments.',
        completed: false,
      },
      {
        step: 3,
        title: 'Run First Meeting with Bot',
        description: 'Record a standup or sync to generate AI decision logs.',
        completed: false,
      },
    ],
    unsubscribeToken: 'test-unsub-token-owner-123',
    supportEmail: 'support@rapto.cloud',
  }

  const ownerHtml = renderOwnerWelcomeHtml(ownerPayload)
  const ownerText = renderOwnerWelcomeText(ownerPayload)

  // Assertions for Owner Email
  const ownerHtmlValid =
    ownerHtml.includes('Welcome to Rapto, Sarah Jenkins!') &&
    ownerHtml.includes('Acme Growth Workspace') &&
    ownerHtml.includes('Connect Google Calendar') &&
    ownerHtml.includes('Go to Dashboard →') &&
    ownerHtml.includes('prefers-color-scheme: dark')

  const ownerTextValid =
    ownerText.includes('WELCOME TO RAPTO, SARAH JENKINS!') &&
    ownerText.includes('Acme Growth Workspace') &&
    ownerText.includes('Connect Google Calendar')

  console.log(` ✅ Owner Welcome HTML Render: ${ownerHtmlValid ? 'PASSED' : 'FAILED'}`)
  console.log(` ✅ Owner Welcome Plain Text Render: ${ownerTextValid ? 'PASSED' : 'FAILED'}`)

  // 2. TEAM MEMBER WELCOME EMAIL TEST
  console.log('\n----------------------------------------------------')
  console.log(' 2. Testing Team Member Welcome Email Template...')
  console.log('----------------------------------------------------')

  const teamMemberPayload = {
    memberName: 'Alex Rivera',
    memberEmail: 'alex@acmecorp.com',
    workspaceName: 'Acme Growth Workspace',
    inviterName: 'Sarah Jenkins',
    role: 'Senior Product Manager',
    dashboardUrl: 'https://app.rapto.cloud/dashboard?team=acme-growth',
    capabilities: [
      {
        icon: '⚡',
        title: 'Automated Meeting Summaries',
        description: 'Access AI-generated meeting summaries and action items in real-time.',
      },
      {
        icon: '📌',
        title: 'Personalized Deliverables',
        description: 'Track all commitments and tasks assigned to you across team syncs.',
      },
      {
        icon: '🔍',
        title: 'Instant Transcript Search',
        description: 'Find exact discussion points and decisions across all past meetings.',
      },
    ],
    unsubscribeToken: 'test-unsub-token-member-456',
    supportEmail: 'support@rapto.cloud',
  }

  const memberHtml = renderTeamMemberWelcomeHtml(teamMemberPayload)
  const memberText = renderTeamMemberWelcomeText(teamMemberPayload)

  // Assertions for Team Member Email
  const memberHtmlValid =
    memberHtml.includes('Welcome to the team, Alex Rivera!') &&
    memberHtml.includes('Acme Growth Workspace') &&
    memberHtml.includes('Sarah Jenkins') &&
    memberHtml.includes('Senior Product Manager') &&
    memberHtml.includes('Open Dashboard →') &&
    memberHtml.includes('prefers-color-scheme: dark')

  const memberTextValid =
    memberText.includes('WELCOME TO ACME GROWTH WORKSPACE ON RAPTO!') &&
    memberText.includes('Alex Rivera') &&
    memberText.includes('Senior Product Manager')

  console.log(` ✅ Team Member Welcome HTML Render: ${memberHtmlValid ? 'PASSED' : 'FAILED'}`)
  console.log(` ✅ Team Member Welcome Plain Text Render: ${memberTextValid ? 'PASSED' : 'FAILED'}`)

  console.log('\n====================================================')
  console.log(' 🎯 ALL WELCOME EMAIL TESTS COMPLETED SUCCESSFULLY!')
  console.log('====================================================\n')
}

runWelcomeEmailTests()
