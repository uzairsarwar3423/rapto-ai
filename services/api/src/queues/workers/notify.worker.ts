import { Worker, Job } from 'bullmq'
import { logger } from '../../config/logger'
import { NotifyJobData } from '../jobs/notify.job'
import { prisma } from '../../db/client'
import { NotificationType } from '@prisma/client'
import { emailService } from '../../modules/notifications/email.service'
import { notificationsService } from '../../modules/notifications/notifications.service'
import { slackNotifyService } from '../../modules/notifications/slack-notify.service'
import { NOTIFICATION_DEDUP_TTL } from '../../config/notification-dedup.config'
import { env } from '../../config/env'
import { socketEmitter } from '../../realtime/socket.emitter'
import { userRoom } from '../../realtime/rooms.manager'
import { SERVER_EVENTS } from '../../realtime/socket.events'
import { notifyQueue } from '../queue.client'
import { slackProvider } from '../../modules/integrations/providers/slack.provider'

const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'

async function createInAppNotification(data: {
  userId: string
  teamId: string
  type: NotificationType
  title: string
  body?: string
  meetingId?: string
  commitmentId?: string
  actionUrl?: string
}) {
  const notification = await prisma.inAppNotification.create({ data })
  try {
    socketEmitter.to(userRoom(data.userId)).emit(SERVER_EVENTS.NOTIFICATION_CREATED, notification)
  } catch (err) {
    logger.error({ err, userId: data.userId }, 'notify.worker: failed to emit notification:created socket event')
  }
  return notification
}

export const notifyWorker = new Worker<NotifyJobData>(
  'notify',
  async (job: Job<NotifyJobData>) => {
    const { type, teamId, meetingId, commitmentId, ownerId, managerIds } = job.data
    logger.info({ jobId: job.id, type, teamId }, 'notify.worker: processing notification dispatch')

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 1: MEETING_PROCESSED
    // ─────────────────────────────────────────────────────────────────────────
    if (type === 'MEETING_PROCESSED' && meetingId) {
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId }
      })

      if (!meeting) {
        throw new Error(`Meeting ${meetingId} not found for notification dispatch`)
      }

      // Fetch all users in the team
      const members = await prisma.user.findMany({
        where: { teamId }
      })

      for (const member of members) {
        // Create In-App Notification
        await createInAppNotification({
          userId: member.id,
          teamId: meeting.teamId,
          type: 'MEETING_PROCESSED',
          title: `Meeting processed: ${meeting.title}`,
          body: meeting.summary ? meeting.summary.substring(0, 150) + '...' : 'Meeting summary is ready.',
          meetingId: meeting.id,
          actionUrl: `/meetings/${meeting.id}`
        })

        // Check user email preferences
        const emailAllowed = await notificationsService.shouldSendEmail(member.id, 'MEETING_PROCESSED')
        if (emailAllowed) {
          await notifyQueue.add('email-meeting-summary', {
            type: 'EMAIL_MEETING_SUMMARY',
            emailPayload: {
              to: member.email,
              name: member.name,
              meetingTitle: meeting.title,
              summary: meeting.summary || 'Summary extraction completed.',
              commitmentsCount: meeting.commitmentCount,
              actionItemsCount: meeting.actionItemCount,
              viewUrl: `${frontendUrl}/meetings/${meeting.id}`
            }
          })
        }
      }

      // Slack Branch
      try {
        const resolvedTeamId = teamId || meeting.teamId
        const slackIntegration = await prisma.teamIntegration.findUnique({
          where: { teamId_provider: { teamId: resolvedTeamId, provider: 'SLACK' } }
        })

        if (slackIntegration && slackIntegration.isActive) {
          const meta = slackIntegration.metadata as any
          if (!meta?.defaultChannelId) {
            logger.info({ teamId }, 'notify.worker.slack.skipped_unconfigured: Slack connected but no default channel')
          } else {
            const commitments = await prisma.commitment.findMany({ where: { meetingId: meeting.id } })
            
            const slackMeetingInput = {
              id: meeting.id,
              title: meeting.title,
              scheduledAt: meeting.scheduledAt
            }
            const counts = {
              commitments: meeting.commitmentCount,
              actionItems: meeting.actionItemCount
            }
            const slackCommitments = commitments.map(c => ({
              text: c.text,
              dueDate: c.dueDate
            }))
            
            const start = Date.now()
            const result = await slackProvider.sendMeetingSummaryToChannel(
              slackIntegration,
              slackMeetingInput,
              counts,
              slackCommitments
            )
            
            if (result.ok) {
              logger.info({ teamId, notificationType: 'MEETING_PROCESSED', channel: 'channel', durationMs: Date.now() - start }, 'notify.worker.slack.sent')
            } else {
              logger.error({ teamId, notificationType: 'MEETING_PROCESSED', err: result.error }, 'notify.worker.slack.send_failed')
            }
          }
        }
      } catch (err: any) {
        logger.error({ teamId, notificationType: 'MEETING_PROCESSED', err: err.message }, 'notify.worker.slack.send_failed')
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 2: COMMITMENT_MISSED
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'COMMITMENT_MISSED' && commitmentId) {
      const commitment = await prisma.commitment.findUnique({
        where: { id: commitmentId },
        include: { owner: true }
      })

      if (!commitment) {
        throw new Error(`Commitment ${commitmentId} not found for notification dispatch`)
      }

      const { owner } = commitment

      // 1. Notify Assignee / Owner (In-App)
      await createInAppNotification({
        userId: owner.id,
        teamId: commitment.teamId,
        type: 'COMMITMENT_MISSED',
        title: '⚠️ Commitment Overdue',
        body: `You missed the deadline for: "${commitment.text}"`,
        commitmentId: commitment.id,
        actionUrl: `/commitments`
      })

      // 2. Email Owner
      const ownerEmailAllowed = await notificationsService.shouldSendEmail(owner.id, 'COMMITMENT_MISSED')
      if (ownerEmailAllowed) {
        await notifyQueue.add('email-commitment-missed', {
          type: 'EMAIL_COMMITMENT_MISSED',
          emailPayload: {
            to: owner.email,
            name: owner.name,
            commitmentText: commitment.text,
            dueDate: commitment.dueDate || new Date(),
            actionUrl: `${frontendUrl}/commitments`
          }
        })
      }

      // 3. Notify Team Managers / Admins (In-App + Email)
      let managersToNotify: string[] = managerIds || []
      if (managersToNotify.length === 0) {
        const managers = await notificationsService.getManagersToNotify(commitment.teamId)
        managersToNotify = managers.map(m => m.id)
      }

      for (const managerId of managersToNotify) {
        if (managerId === owner.id) continue

        const manager = await prisma.user.findUnique({ where: { id: managerId } })
        if (!manager) continue

        await createInAppNotification({
          userId: manager.id,
          teamId: commitment.teamId,
          type: 'COMMITMENT_MISSED',
          title: `⚠️ Team Overdue Commitment: ${owner.name}`,
          body: `${owner.name} missed the deadline for: "${commitment.text}"`,
          commitmentId: commitment.id,
          actionUrl: `/dashboard`
        })

        const mgrEmailAllowed = await notificationsService.shouldSendEmail(manager.id, 'COMMITMENT_MISSED')
        if (mgrEmailAllowed) {
          await notifyQueue.add('email-manager-alert', {
            type: 'EMAIL_MANAGER_ALERT',
            emailPayload: {
              to: manager.email,
              name: manager.name,
              assigneeName: owner.name,
              commitmentText: commitment.text,
              dueDate: commitment.dueDate || new Date(),
              actionUrl: `${frontendUrl}/dashboard`
            }
          })
        }
      }

      // 4. Slack Branch (Isolated Try/Catch)
      try {
        const slackIntegration = await prisma.teamIntegration.findUnique({
          where: { teamId_provider: { teamId: commitment.teamId, provider: 'SLACK' } }
        })

        if (slackIntegration && slackIntegration.isActive) {
          // A. Owner Slack DM
          try {
            const ownerSlackAllowed = await notificationsService.shouldSendSlack(owner.id, 'COMMITMENT_MISSED')
            if (!ownerSlackAllowed) {
              logger.info({ teamId: commitment.teamId, userId: owner.id, notificationType: 'COMMITMENT_MISSED' }, 'notify.worker.slack.skipped_preference')
            } else {
              const dedupKey = `notif:dedup:COMMITMENT_MISSED:${owner.id}:${commitment.id}`
              const isFresh = await notificationsService.checkAndSetDedup(dedupKey, NOTIFICATION_DEDUP_TTL.COMMITMENT_MISSED)
              
              if (isFresh) {
                const start = Date.now()
                const res = await slackNotifyService.sendCommitmentMissedOwner(
                  slackIntegration,
                  owner.email,
                  {
                    id: commitment.id,
                    text: commitment.text,
                    dueDate: commitment.dueDate,
                    actionUrl: `${frontendUrl}/commitments`
                  }
                )
                if (res.ok) {
                  logger.info({ teamId: commitment.teamId, notificationType: 'COMMITMENT_MISSED', channel: 'dm', durationMs: Date.now() - start }, 'notify.worker.slack.sent')
                } else {
                  logger.error({ teamId: commitment.teamId, notificationType: 'COMMITMENT_MISSED', err: res.error }, 'notify.worker.slack.send_failed')
                }
              } else {
                logger.info({ teamId: commitment.teamId, userId: owner.id }, 'notify.worker.slack.skipped_dedup')
              }
            }
          } catch (err: any) {
            logger.error({ teamId: commitment.teamId, notificationType: 'COMMITMENT_MISSED_OWNER', err: err.message }, 'notify.worker.slack.send_failed')
          }

          // B. Manager Alert DMs (Fan-out)
          try {
            const fanoutResult = await slackNotifyService.sendManagerAlerts(
              {
                id: commitment.id,
                text: commitment.text,
                ownerName: owner.name,
                ownerId: owner.id,
                commitmentScore: owner.commitmentScore,
              },
              commitment.teamId,
              slackIntegration
            )
            logger.info({ teamId: commitment.teamId, fanoutResult }, 'notify.worker.slack.manager_fanout_completed')
          } catch (err: any) {
            logger.error({ teamId: commitment.teamId, notificationType: 'MANAGER_ALERT_FANOUT', err: err.message }, 'notify.worker.slack.send_failed')
          }
        }
      } catch (err: any) {
        logger.error({ teamId: commitment.teamId, notificationType: 'COMMITMENT_MISSED_GLOBAL', err: err.message }, 'notify.worker.slack.send_failed')
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 3: DEADLINE_REMINDER
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'DEADLINE_REMINDER' && ownerId) {
      const user = await prisma.user.findUnique({
        where: { id: ownerId }
      })

      if (!user) {
        throw new Error(`User ${ownerId} not found for deadline reminder dispatch`)
      }

      // Fetch pending commitments due in next 48 hours
      const now = new Date()
      const endOfTomorrow = new Date()
      endOfTomorrow.setDate(now.getDate() + 2)

      const upcomingCommitments = await prisma.commitment.findMany({
        where: {
          ownerId,
          status: 'PENDING',
          dueDate: {
            gte: now,
            lte: endOfTomorrow
          }
        }
      })

      if (upcomingCommitments.length > 0) {
        const resolvedTeamId = teamId || user.teamId || upcomingCommitments[0].teamId
        if (!resolvedTeamId) {
          throw new Error(`No teamId found for user ${ownerId} during deadline reminder dispatch`)
        }

        // Create In-App Notification
        await createInAppNotification({
          userId: ownerId,
          teamId: resolvedTeamId,
          type: 'DEADLINE_TODAY',
          title: `⏰ ${upcomingCommitments.length} Commitments Due Soon`,
          body: `You have ${upcomingCommitments.length} commitments coming due today or tomorrow.`,
          actionUrl: `/commitments`
        })

        const emailAllowed = await notificationsService.shouldSendEmail(ownerId, 'DEADLINE_TODAY')
        if (emailAllowed) {
          await notifyQueue.add('email-deadline-reminder', {
            type: 'EMAIL_DEADLINE_REMINDER',
            emailPayload: {
              to: user.email,
              name: user.name,
              commitments: upcomingCommitments.map(c => ({
                id: c.id,
                text: c.text,
                dueDate: c.dueDate || new Date()
              })),
              actionUrl: `${frontendUrl}/commitments`
            }
          })
        }

        // Slack Branch
        try {
          const slackIntegration = await prisma.teamIntegration.findUnique({
            where: { teamId_provider: { teamId: resolvedTeamId, provider: 'SLACK' } }
          })

          if (slackIntegration && slackIntegration.isActive) {
            const slackAllowed = await notificationsService.shouldSendSlack(ownerId, 'DEADLINE_TODAY')
            if (!slackAllowed) {
              logger.info({ teamId: resolvedTeamId, userId: ownerId, notificationType: 'DEADLINE_TODAY' }, 'notify.worker.slack.skipped_preference')
            } else {
              for (const c of upcomingCommitments) {
                const dedupKey = `notif:dedup:DEADLINE_REMINDER:${ownerId}:${c.id}`
                const isFresh = await notificationsService.checkAndSetDedup(dedupKey, NOTIFICATION_DEDUP_TTL.DEADLINE_REMINDER)

                if (!isFresh) {
                  logger.info({ teamId: resolvedTeamId, userId: ownerId, commitmentId: c.id }, 'notify.worker.slack.skipped_dedup')
                  continue
                }

                try {
                  const start = Date.now()
                  const res = await slackNotifyService.sendDeadlineReminder(
                    slackIntegration,
                    user.email,
                    {
                      id: c.id,
                      text: c.text,
                      dueDate: c.dueDate,
                      actionUrl: `${frontendUrl}/commitments`
                    }
                  )
                  if (res.ok) {
                    logger.info({ teamId: resolvedTeamId, notificationType: 'DEADLINE_REMINDER', channel: 'dm', durationMs: Date.now() - start }, 'notify.worker.slack.sent')
                  } else {
                    logger.error({ teamId: resolvedTeamId, notificationType: 'DEADLINE_REMINDER', err: res.error }, 'notify.worker.slack.send_failed')
                  }
                } catch (err: any) {
                  logger.error({ teamId: resolvedTeamId, notificationType: 'DEADLINE_REMINDER', err: err.message }, 'notify.worker.slack.send_failed')
                }
              }
            }
          }
        } catch (err: any) {
          logger.error({ teamId: resolvedTeamId, notificationType: 'DEADLINE_REMINDER_GLOBAL', err: err.message }, 'notify.worker.slack.send_failed')
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 4: COMMITMENT_FULFILLED
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'COMMITMENT_FULFILLED' && commitmentId) {
      const commitment = await prisma.commitment.findUnique({
        where: { id: commitmentId },
        include: { owner: true }
      })

      if (!commitment) {
        throw new Error(`Commitment ${commitmentId} not found for fulfillment notification dispatch`)
      }

      const { owner } = commitment

      // 1. In-App Notification
      await createInAppNotification({
        userId: owner.id,
        teamId: commitment.teamId,
        type: 'COMMITMENT_FULFILLED',
        title: '🎉 Commitment Fulfilled',
        body: `You fulfilled: "${commitment.text}"`,
        commitmentId: commitment.id,
        actionUrl: `/commitments`
      })

      // 2. Email Notification
      const emailAllowed = await notificationsService.shouldSendEmail(owner.id, 'COMMITMENT_FULFILLED')
      if (emailAllowed) {
        await notifyQueue.add('email-commitment-fulfilled', {
          type: 'EMAIL_COMMITMENT_FULFILLED',
          emailPayload: {
            to: owner.email,
            name: owner.name,
            commitmentText: commitment.text,
            actionUrl: `${frontendUrl}/commitments`
          }
        })
      }

      // 3. Slack Branch
      try {
        const slackIntegration = await prisma.teamIntegration.findUnique({
          where: { teamId_provider: { teamId: commitment.teamId, provider: 'SLACK' } }
        })

        if (slackIntegration && slackIntegration.isActive) {
          const slackAllowed = await notificationsService.shouldSendSlack(owner.id, 'COMMITMENT_FULFILLED')
          if (!slackAllowed) {
            logger.info({ teamId: commitment.teamId, userId: owner.id, notificationType: 'COMMITMENT_FULFILLED' }, 'notify.worker.slack.skipped_preference')
          } else {
            const dedupKey = `notif:dedup:COMMITMENT_FULFILLED:${owner.id}:${commitment.id}`
            const isFresh = await notificationsService.checkAndSetDedup(dedupKey, NOTIFICATION_DEDUP_TTL.COMMITMENT_FULFILLED)

            if (isFresh) {
              const start = Date.now()
              const res = await slackNotifyService.sendCommitmentFulfilled(
                slackIntegration,
                owner.email,
                {
                  id: commitment.id,
                  text: commitment.text,
                  ownerName: owner.name,
                  actionUrl: `${frontendUrl}/commitments`
                }
              )
              if (res.ok) {
                logger.info({ teamId: commitment.teamId, notificationType: 'COMMITMENT_FULFILLED', channel: 'dm', durationMs: Date.now() - start }, 'notify.worker.slack.sent')
              } else {
                logger.error({ teamId: commitment.teamId, notificationType: 'COMMITMENT_FULFILLED', err: res.error }, 'notify.worker.slack.send_failed')
              }
            } else {
              logger.info({ teamId: commitment.teamId, userId: owner.id }, 'notify.worker.slack.skipped_dedup')
            }
          }
        }
      } catch (err: any) {
        logger.error({ teamId: commitment.teamId, notificationType: 'COMMITMENT_FULFILLED_GLOBAL', err: err.message }, 'notify.worker.slack.send_failed')
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 5: VERIFICATION_EMAIL
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'VERIFICATION_EMAIL' && job.data.emailPayload) {
      await emailService.sendVerificationEmail(job.data.emailPayload)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 6: PASSWORD_RESET_EMAIL
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'PASSWORD_RESET_EMAIL' && job.data.emailPayload) {
      await emailService.sendPasswordResetEmail(job.data.emailPayload)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 7: TEAM_INVITE_EMAIL
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'TEAM_INVITE_EMAIL' && job.data.emailPayload) {
      await emailService.sendTeamInviteEmail(job.data.emailPayload)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 8: EMAIL_MEETING_SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'EMAIL_MEETING_SUMMARY' && job.data.emailPayload) {
      await emailService.sendMeetingSummary(job.data.emailPayload)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 9: EMAIL_COMMITMENT_MISSED
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'EMAIL_COMMITMENT_MISSED' && job.data.emailPayload) {
      await emailService.sendCommitmentMissed(job.data.emailPayload)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 10: EMAIL_MANAGER_ALERT
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'EMAIL_MANAGER_ALERT' && job.data.emailPayload) {
      await emailService.sendManagerAlert(job.data.emailPayload)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 11: EMAIL_DEADLINE_REMINDER
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'EMAIL_DEADLINE_REMINDER' && job.data.emailPayload) {
      await emailService.sendDeadlineReminder(job.data.emailPayload)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 12: INTEGRATION_AUTO_DISABLED (Team Integration)
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'INTEGRATION_AUTO_DISABLED' && teamId) {
      const provider = job.data.metadata?.provider || 'Integration'
      const providerName = provider.replace('_', ' ')
      
      const admins = await prisma.user.findMany({
        where: {
          teamId,
          role: { in: ['OWNER', 'ADMIN'] }
        }
      })
      
      for (const admin of admins) {
        await notifyQueue.add('email-integration-disabled', {
          type: 'EMAIL_INTEGRATION_DISABLED',
          emailPayload: {
            to: admin.email,
            name: admin.name,
            providerName,
            reconnectUrl: `${frontendUrl}/settings/integrations`
          }
        })
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 13: CALENDAR_SYNC_FAILED (User Calendar Integration)
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'CALENDAR_SYNC_FAILED' && ownerId) {
      const user = await prisma.user.findUnique({ where: { id: ownerId } })
      if (user) {
        const provider = job.data.metadata?.provider || 'GOOGLE_CALENDAR'
        const providerName = provider.replace('_', ' ')
        await notifyQueue.add('email-integration-disabled', {
          type: 'EMAIL_INTEGRATION_DISABLED',
          emailPayload: {
            to: user.email,
            name: user.name,
            providerName,
            reconnectUrl: `${frontendUrl}/settings/integrations`
          }
        })
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 14: EMAIL_INTEGRATION_DISABLED
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'EMAIL_INTEGRATION_DISABLED' && job.data.emailPayload) {
      await emailService.sendIntegrationDisabledEmail(job.data.emailPayload)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 15: INTEGRATION_WARNING & INTEGRATION_DEACTIVATED
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'INTEGRATION_WARNING' || type === 'INTEGRATION_DEACTIVATED') {
      const { metadata, teamId, ownerId } = job.data
      const provider = metadata?.provider || 'INTEGRATION'
      const providerName = provider.replace('_', ' ')
      const settingsUrl = `${frontendUrl}/settings/integrations`

      let recipients: Array<{ email: string; name: string }> = []

      if (teamId) {
        const admins = await prisma.user.findMany({
          where: { teamId, role: { in: ['ADMIN', 'OWNER'] } },
          select: { email: true, name: true }
        })
        recipients = admins
      } else if (ownerId) {
        const user = await prisma.user.findUnique({
          where: { id: ownerId },
          select: { email: true, name: true }
        })
        if (user) recipients = [user]
      }

      for (const recipient of recipients) {
        if (type === 'INTEGRATION_WARNING') {
          await emailService.sendIntegrationWarningEmail({
            to: recipient.email,
            name: recipient.name,
            providerName,
            settingsUrl,
          })
        } else {
          await emailService.sendIntegrationDeactivatedEmail({
            to: recipient.email,
            name: recipient.name,
            providerName,
            settingsUrl,
          })
        }
      }
    }
  },
  {
    connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT ?? '6379') },
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_NOTIFY || '5', 10),
  }
)

notifyWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'notify.worker: job failed')
})
