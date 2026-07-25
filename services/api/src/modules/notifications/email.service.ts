import { env } from '../../config/env'
import { logger } from '../../config/logger'
import axios from 'axios'
import https from 'https'

import { renderVerifyEmailHtml } from './templates/VerifyEmail'
import { renderPasswordResetHtml } from './templates/PasswordReset'
import { renderTeamInviteHtml } from './templates/TeamInvite'
import { renderMeetingSummaryHtml } from './templates/MeetingSummary'
import { renderCommitmentMissedHtml } from './templates/CommitmentMissed'
import { renderManagerAlertHtml } from './templates/ManagerAlert'
import { renderDeadlineReminderHtml } from './templates/DeadlineReminder'
import { renderIntegrationWarningHtml } from './templates/IntegrationWarning'
import { renderIntegrationDeactivatedHtml } from './templates/IntegrationDeactivated'
import { renderPaymentFailedHtml } from './templates/PaymentFailed'
import { renderPlanLimitHtml } from './templates/PlanLimit'
import { renderOwnerWelcomeHtml } from './templates/OwnerWelcome'
import { renderTeamMemberWelcomeHtml } from './templates/TeamMemberWelcome'
import { renderWeeklyDigestHtml } from './templates/WeeklyDigest'
import { generateUnsubscribeToken } from './unsubscribe.utils'

const isBrevoConfigured =
  env.BREVO_API_KEY &&
  env.BREVO_API_KEY !== 'xkeysib-your_brevo_api_key_here'

/**
 * Dynamically resolves the Frontend URL for email action links.
 * Priority: FRONTEND_URL -> APP_URL -> Production Default (https://rapto.cloud)
 * Prevents links from ever locking to localhost:3000 in production environments.
 */
export function getFrontendUrl(): string {
  const url = env.FRONTEND_URL || env.APP_URL
  if (url && url.trim() !== '' && !url.includes('localhost')) {
    return url.replace(/\/$/, '')
  }
  return 'https://rapto.cloud'
}

const fromEmail = env.BREVO_FROM_EMAIL || 'noreply@rapto.cloud'

/**
 * Helper to fetch from Brevo API with timeout and error classification.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit
): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> {
  try {
    const response = await axios({
      method: options.method as string,
      url: url,
      headers: options.headers as any,
      data: options.body ? JSON.parse(options.body as string) : undefined,
      timeout: 30000,
      httpsAgent: new https.Agent({ keepAlive: false }),
      validateStatus: () => true,
    })

    if (response.status >= 500) {
      throw new Error(`Brevo Server error: ${response.status}`)
    }

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => (typeof response.data === 'string' ? response.data : JSON.stringify(response.data)),
    }
  } catch (error: any) {
    logger.warn({ error: error.message || error }, 'Email API request failed. Delegating retry to BullMQ...')
    throw error
  }
}

async function sendBrevoEmail(payload: {
  to: { email: string; name?: string }[]
  subject: string
  htmlContent: string
  notificationType: string
  userId?: string
}): Promise<void> {
  const recipientEmail = payload.to[0]?.email || ''
  const token = generateUnsubscribeToken(payload.userId || recipientEmail, payload.notificationType)
  const unsubscribeUrl = `${getFrontendUrl()}/unsubscribe?token=${encodeURIComponent(token)}`

  console.log('\n===================================================================')
  console.log(`📧 EMAIL DISPATCH INITIATED`)
  console.log(` - Type:         ${payload.notificationType}`)
  console.log(` - Recipient:    ${recipientEmail}`)
  console.log(` - Subject:      ${payload.subject}`)
  console.log(` - Sender Email: ${fromEmail}`)
  console.log('===================================================================\n')

  if (!isBrevoConfigured) {
    logger.warn(
      { to: recipientEmail, subject: payload.subject, notificationType: payload.notificationType },
      'BREVO_API_KEY is not configured. Email payload logged to console.'
    )
    console.log('⚠️ BREVO_API_KEY missing or default placeholder. Email simulated.')
    return
  }

  try {
    const response = await fetchWithRetry('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': env.BREVO_API_KEY!,
      },
      body: JSON.stringify({
        sender: { name: 'Rapto', email: fromEmail },
        to: payload.to,
        subject: payload.subject,
        htmlContent: payload.htmlContent,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    })

    const responseText = await response.text()

    if (!response.ok) {
      console.error('\n❌ BREVO API DISPATCH FAILED!')
      console.error(` - Status: ${response.status}`)
      console.error(` - Response: ${responseText}`)
      console.error('===================================================================\n')
      throw new Error(`Brevo API returned status ${response.status}: ${responseText}`)
    }

    console.log('\n===================================================================')
    console.log(`✅ EMAIL DELIVERED TO BREVO API SUCCESSFULLY!`)
    console.log(` - Status:     ${response.status}`)
    console.log(` - Recipient:  ${recipientEmail}`)
    console.log(` - Payload:    ${responseText}`)
    console.log('===================================================================\n')
  } catch (error: any) {
    console.error('\n❌ EMAIL SEND ERROR EXCEPTION:', error.message || error)
    console.error('===================================================================\n')
    throw error
  }
}

export const emailService = {
  /**
   * Sends account verification email.
   */
  async sendVerificationEmail(data: {
    to: string
    name: string
    verificationToken: string
    userId?: string
  }): Promise<void> {
    const url = `${getFrontendUrl()}/verify-email?token=${data.verificationToken}`
    const token = generateUnsubscribeToken(data.userId || data.to, 'VERIFICATION_EMAIL')
    const htmlContent = renderVerifyEmailHtml({
      name: data.name,
      url,
      unsubscribeToken: token,
    })

    logger.info({ to: data.to }, 'email.service: sending verification email')
    await sendBrevoEmail({
      to: [{ email: data.to, name: data.name }],
      subject: 'Verify your Rapto account',
      htmlContent,
      notificationType: 'VERIFICATION_EMAIL',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends password reset email.
   */
  async sendPasswordResetEmail(data: {
    to: string
    name: string
    token: string
    userId?: string
  }): Promise<void> {
    const url = `${getFrontendUrl()}/reset-password?token=${data.token}`
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'PASSWORD_RESET_EMAIL')
    const htmlContent = renderPasswordResetHtml({
      name: data.name,
      url,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to }, 'email.service: sending password reset email')
    await sendBrevoEmail({
      to: [{ email: data.to, name: data.name }],
      subject: 'Reset your Rapto password',
      htmlContent,
      notificationType: 'PASSWORD_RESET_EMAIL',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends team invitation email.
   */
  async sendTeamInviteEmail(data: {
    to: string
    teamName: string
    inviterName: string
    joinUrl: string
    role: string
    expiresAt: Date
    userId?: string
  }): Promise<void> {
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'TEAM_INVITE_EMAIL')
    const htmlContent = renderTeamInviteHtml({
      to: data.to,
      teamName: data.teamName,
      inviterName: data.inviterName,
      joinUrl: data.joinUrl,
      role: data.role,
      expiresAt: data.expiresAt,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to, teamName: data.teamName }, 'email.service: sending team invite email')
    await sendBrevoEmail({
      to: [{ email: data.to }],
      subject: `${data.inviterName} invited you to join ${data.teamName} on Rapto`,
      htmlContent,
      notificationType: 'TEAM_INVITE_EMAIL',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends meeting summary notification email.
   */
  async sendMeetingSummary(data: {
    to: string
    name: string
    meetingTitle: string
    summary: string
    commitmentsCount: number
    actionItemsCount: number
    viewUrl: string
    userId?: string
  }): Promise<void> {
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'MEETING_PROCESSED')
    const htmlContent = renderMeetingSummaryHtml({
      name: data.name,
      meetingTitle: data.meetingTitle,
      summary: data.summary,
      commitmentsCount: data.commitmentsCount,
      actionItemsCount: data.actionItemsCount,
      viewUrl: data.viewUrl,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to, meetingTitle: data.meetingTitle }, 'email.service: sending meeting summary email')
    await sendBrevoEmail({
      to: [{ email: data.to, name: data.name }],
      subject: `Meeting Summary: ${data.meetingTitle}`,
      htmlContent,
      notificationType: 'MEETING_PROCESSED',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends commitment missed notification email to commitment owner.
   */
  async sendCommitmentMissed(data: {
    to: string
    name: string
    commitmentText: string
    dueDate: Date
    actionUrl: string
    userId?: string
  }): Promise<void> {
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'COMMITMENT_MISSED')
    const htmlContent = renderCommitmentMissedHtml({
      name: data.name,
      commitmentText: data.commitmentText,
      dueDate: data.dueDate,
      actionUrl: data.actionUrl,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to }, 'email.service: sending commitment missed email')
    await sendBrevoEmail({
      to: [{ email: data.to, name: data.name }],
      subject: '⚠️ Commitment Overdue: Action required',
      htmlContent,
      notificationType: 'COMMITMENT_MISSED',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends manager alert notification email when team member misses deadline.
   */
  async sendManagerAlert(data: {
    to: string
    name: string
    assigneeName: string
    commitmentText: string
    dueDate: Date
    actionUrl: string
    userId?: string
  }): Promise<void> {
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'MANAGER_ALERT')
    const htmlContent = renderManagerAlertHtml({
      name: data.name,
      assigneeName: data.assigneeName,
      commitmentText: data.commitmentText,
      dueDate: data.dueDate,
      actionUrl: data.actionUrl,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to }, 'email.service: sending manager alert email')
    await sendBrevoEmail({
      to: [{ email: data.to, name: data.name }],
      subject: `Alert: ${data.assigneeName} missed a commitment deadline`,
      htmlContent,
      notificationType: 'MANAGER_ALERT',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends deadline reminder email.
   */
  async sendDeadlineReminder(data: {
    to: string
    name: string
    commitments: Array<{ id: string; text: string; dueDate: Date }>
    actionUrl: string
    userId?: string
  }): Promise<void> {
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'DEADLINE_REMINDER')
    const htmlContent = renderDeadlineReminderHtml({
      name: data.name,
      commitments: data.commitments,
      actionUrl: data.actionUrl,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to }, 'email.service: sending deadline reminder email')
    await sendBrevoEmail({
      to: [{ email: data.to, name: data.name }],
      subject: `Reminder: You have ${data.commitments.length} commitments due soon`,
      htmlContent,
      notificationType: 'DEADLINE_REMINDER',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends integration disabled notification email.
   */
  async sendIntegrationDisabledEmail(data: {
    to: string
    name: string
    providerName: string
    reconnectUrl: string
    userId?: string
  }): Promise<void> {
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'INTEGRATION_DEACTIVATED')
    const htmlContent = renderIntegrationDeactivatedHtml({
      providerName: data.providerName,
      settingsUrl: data.reconnectUrl,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to }, 'email.service: sending integration disabled email')
    await sendBrevoEmail({
      to: [{ email: data.to, name: data.name }],
      subject: `Action Required: Your ${data.providerName} integration has been disconnected`,
      htmlContent,
      notificationType: 'INTEGRATION_DEACTIVATED',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends integration warning email.
   */
  async sendIntegrationWarningEmail(data: {
    to: string
    name: string
    providerName: string
    workspaceName?: string
    settingsUrl: string
    userId?: string
  }): Promise<void> {
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'INTEGRATION_WARNING')
    const htmlContent = renderIntegrationWarningHtml({
      providerName: data.providerName,
      workspaceName: data.workspaceName,
      settingsUrl: data.settingsUrl,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to, providerName: data.providerName }, 'email.service: sending integration warning email')
    await sendBrevoEmail({
      to: [{ email: data.to, name: data.name }],
      subject: `⚠️ Connection Warning: Issue syncing with ${data.providerName}`,
      htmlContent,
      notificationType: 'INTEGRATION_WARNING',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends integration deactivated email.
   */
  async sendIntegrationDeactivatedEmail(data: {
    to: string
    name: string
    providerName: string
    workspaceName?: string
    settingsUrl: string
    userId?: string
  }): Promise<void> {
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'INTEGRATION_DEACTIVATED')
    const htmlContent = renderIntegrationDeactivatedHtml({
      providerName: data.providerName,
      workspaceName: data.workspaceName,
      settingsUrl: data.settingsUrl,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to, providerName: data.providerName }, 'email.service: sending integration deactivated email')
    await sendBrevoEmail({
      to: [{ email: data.to, name: data.name }],
      subject: `🚨 Action Required: ${data.providerName} integration has been disconnected`,
      htmlContent,
      notificationType: 'INTEGRATION_DEACTIVATED',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends billing payment failed email.
   */
  async sendPaymentFailedEmail(data: {
    to: string
    teamName: string
    amountDue: string
    retryUrl: string
    reason?: string
    userId?: string
  }): Promise<void> {
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'PAYMENT_FAILED')
    const htmlContent = renderPaymentFailedHtml({
      teamName: data.teamName,
      amountDue: data.amountDue,
      retryUrl: data.retryUrl,
      reason: data.reason,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to, teamName: data.teamName }, 'email.service: sending payment failed email')
    await sendBrevoEmail({
      to: [{ email: data.to }],
      subject: `Action Required: Payment failed for ${data.teamName}`,
      htmlContent,
      notificationType: 'PAYMENT_FAILED',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends plan usage limit reached email.
   */
  async sendPlanLimitEmail(data: {
    to: string
    teamName: string
    resource: string
    used: number
    limit: number
    upgradeUrl: string
    userId?: string
  }): Promise<void> {
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'PLAN_LIMIT')
    const htmlContent = renderPlanLimitHtml({
      teamName: data.teamName,
      resource: data.resource,
      used: data.used,
      limit: data.limit,
      upgradeUrl: data.upgradeUrl,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to, teamName: data.teamName }, 'email.service: sending plan limit email')
    await sendBrevoEmail({
      to: [{ email: data.to }],
      subject: `Action Required: ${data.teamName} reached its ${data.resource} limit`,
      htmlContent,
      notificationType: 'PLAN_LIMIT',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends owner welcome email after account setup & onboarding.
   */
  async sendOwnerWelcomeEmail(data: {
    to: string
    ownerName: string
    workspaceName: string
    dashboardUrl?: string
    checklist?: Array<{
      step: number
      title: string
      description: string
      completed?: boolean
      actionUrl?: string
      actionLabel?: string
    }>
    userId?: string
  }): Promise<void> {
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'OWNER_WELCOME_EMAIL')
    const dashUrl = data.dashboardUrl || `${getFrontendUrl()}/dashboard`
    const htmlContent = renderOwnerWelcomeHtml({
      ownerName: data.ownerName,
      ownerEmail: data.to,
      workspaceName: data.workspaceName,
      dashboardUrl: dashUrl,
      checklist: data.checklist,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to, workspaceName: data.workspaceName }, 'email.service: sending owner welcome email')
    await sendBrevoEmail({
      to: [{ email: data.to, name: data.ownerName }],
      subject: `Welcome to Rapto! ${data.workspaceName} is ready 🚀`,
      htmlContent,
      notificationType: 'OWNER_WELCOME_EMAIL',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends team member welcome email after accepting invite.
   */
  async sendTeamMemberWelcomeEmail(data: {
    to: string
    memberName: string
    workspaceName: string
    inviterName: string
    role: string
    dashboardUrl?: string
    capabilities?: Array<{
      icon: string
      title: string
      description: string
    }>
    userId?: string
  }): Promise<void> {
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'TEAM_MEMBER_WELCOME_EMAIL')
    const dashUrl = data.dashboardUrl || `${getFrontendUrl()}/dashboard`
    const htmlContent = renderTeamMemberWelcomeHtml({
      memberName: data.memberName,
      memberEmail: data.to,
      workspaceName: data.workspaceName,
      inviterName: data.inviterName,
      role: data.role,
      dashboardUrl: dashUrl,
      capabilities: data.capabilities,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to, workspaceName: data.workspaceName }, 'email.service: sending team member welcome email')
    await sendBrevoEmail({
      to: [{ email: data.to, name: data.memberName }],
      subject: `Welcome to ${data.workspaceName} on Rapto 🎉`,
      htmlContent,
      notificationType: 'TEAM_MEMBER_WELCOME_EMAIL',
      userId: data.userId || data.to,
    })
  },

  /**
   * Sends weekly team health digest email.
   */
  async sendWeeklyDigestEmail(data: {
    to: string
    name: string
    teamName: string
    healthScore: number
    healthScoreChange: number
    fulfilledCount: number
    missedCount: number
    mostImproved: Array<{ name: string; change: number; currentScore: number }>
    mostDeclined: Array<{ name: string; change: number; currentScore: number }>
    upcomingDeadlines: Array<{ text: string; ownerName: string; dueDate: string }>
    dashboardUrl: string
    userId?: string
  }): Promise<void> {
    const unsubToken = generateUnsubscribeToken(data.userId || data.to, 'WEEKLY_DIGEST')
    const htmlContent = renderWeeklyDigestHtml({
      recipientName: data.name,
      teamName: data.teamName,
      healthScore: data.healthScore,
      healthScoreChange: data.healthScoreChange,
      fulfilledCount: data.fulfilledCount,
      missedCount: data.missedCount,
      mostImproved: data.mostImproved,
      mostDeclined: data.mostDeclined,
      upcomingDeadlines: data.upcomingDeadlines,
      dashboardUrl: data.dashboardUrl,
      unsubscribeToken: unsubToken,
    })

    logger.info({ to: data.to, teamName: data.teamName }, 'email.service: sending weekly digest email')
    await sendBrevoEmail({
      to: [{ email: data.to, name: data.name }],
      subject: `Weekly Team Health Digest: ${data.teamName}`,
      htmlContent,
      notificationType: 'WEEKLY_DIGEST',
      userId: data.userId || data.to,
    })
  },
}

