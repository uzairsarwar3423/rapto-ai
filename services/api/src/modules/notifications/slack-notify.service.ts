// ─────────────────────────────────────────────────────────────────────────────
// slack-notify.service.ts — Slack Message Builders & Orchestration Service
//
// Layer 1: Four pure Block Kit builder functions (zero network, zero DB side effects)
// Layer 2: Manager fan-out orchestration with per-recipient preference gating,
//          sequential rate-limited dispatch (~1.1s delay), and cross-recipient failure isolation.
// ─────────────────────────────────────────────────────────────────────────────

import type { TeamIntegration } from '@prisma/client'
import { slackProvider, type SlackBlock, type SlackSendResult } from '../integrations/providers/slack.provider'
import { notificationsService } from './notifications.service'
import type {
  CommitmentMissedBlockInput,
  ManagerAlertBlockInput,
  DeadlineReminderBlockInput,
  CommitmentFulfilledBlockInput,
  ManagerFanOutResult,
} from './notifications.types'
import { NOTIFICATION_DEDUP_TTL } from '../../config/notification-dedup.config'
import { logger } from '../../config/logger'
import { env } from '../../config/env'

const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'

// ─────────────────────────────────────────────────────────────────────────────
// Pure Block Kit Builder Functions (Pure Data In -> JSON Array Out)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build Block Kit payload for an owner-facing "commitment missed" DM.
 * Factual, non-punitive tone with direct action link.
 */
export function buildCommitmentMissedBlocks(input: CommitmentMissedBlockInput): SlackBlock[] {
  const dueInfo = input.dueDateRaw
    ? `\n_Due: ${input.dueDateRaw}_`
    : input.dueDate
    ? `\n_Due: ${new Date(input.dueDate).toLocaleDateString()}_`
    : ''

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '⚠️  Missed Commitment', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `You missed the deadline for:\n*${input.text}*${dueInfo}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Update Commitment', emoji: true },
          url: input.actionUrl,
          action_id: 'view_commitment',
          style: 'primary',
        },
      ],
    },
  ]
}

/**
 * Build Block Kit payload for a manager-facing alert DM.
 * Framed for a third-party observer informing about team member performance.
 */
export function buildManagerAlertBlocks(input: ManagerAlertBlockInput): SlackBlock[] {
  const scoreInfo = input.commitmentScore !== undefined && input.commitmentScore !== null
    ? `\n_Current Commitment Score: ${input.commitmentScore}%_`
    : ''

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🚨  Manager Alert: Missed Commitment', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${input.ownerName}* missed a commitment:\n*${input.text}*${scoreInfo}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Member Profile', emoji: true },
          url: input.profileUrl,
          action_id: 'view_member_profile',
        },
      ],
    },
  ]
}

/**
 * Build Block Kit payload for a "deadline reminder" DM.
 * Forward-looking, helpful accountability tone.
 */
export function buildDeadlineReminderBlocks(input: DeadlineReminderBlockInput): SlackBlock[] {
  const dueInfo = input.dueDateRaw
    ? `\n_Due: ${input.dueDateRaw}_`
    : input.dueDate
    ? `\n_Due: ${new Date(input.dueDate).toLocaleDateString()}_`
    : ''

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '⏰  Deadline Reminder', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Upcoming commitment:\n*${input.text}*${dueInfo}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Mark Fulfilled / Review', emoji: true },
          url: input.actionUrl,
          action_id: 'view_commitment',
          style: 'primary',
        },
      ],
    },
  ]
}

/**
 * Build Block Kit payload for a celebratory "commitment fulfilled" DM.
 * High-reward positive reinforcement framing.
 */
export function buildCommitmentFulfilledBlocks(input: CommitmentFulfilledBlockInput): SlackBlock[] {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🎉  Commitment Fulfilled!', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Nice work! *${input.ownerName}* kept their promise and fulfilled:\n*${input.text}*`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Details', emoji: true },
          url: input.actionUrl,
          action_id: 'view_commitment',
          style: 'primary',
        },
      ],
    },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration Service
// ─────────────────────────────────────────────────────────────────────────────

export const slackNotifyService = {
  /**
   * Dispatch an owner-facing missed commitment DM.
   */
  async sendCommitmentMissedOwner(
    integration: TeamIntegration,
    ownerEmail: string,
    input: CommitmentMissedBlockInput
  ): Promise<SlackSendResult> {
    const blocks = buildCommitmentMissedBlocks(input)
    return slackProvider.sendDirectMessage(
      integration,
      ownerEmail,
      `⚠️ Missed commitment: ${input.text}`,
      blocks
    )
  },

  /**
   * Manager Alert Fan-Out Logic.
   * Resolves all MANAGER+ role holders for a team, checks per-manager preferences,
   * checks per-manager Redis dedup, and dispatches DMs sequentially with ~1.1s inter-message delay.
   * Wrapped in per-recipient try/catch for failure isolation.
   */
  async sendManagerAlerts(
    commitment: { id: string; text: string; ownerName: string; ownerId: string; commitmentScore?: number | null },
    teamId: string,
    integration: TeamIntegration,
    interMessageDelayMs = 1100
  ): Promise<ManagerFanOutResult> {
    const result: ManagerFanOutResult = { sent: 0, skipped: 0, failed: 0 }

    // 1. Resolve manager-role holders on team
    const managers = await notificationsService.getManagersToNotify(teamId)
    // Filter out owner if they hold a manager role (owner gets owner DM, not manager alert)
    const filteredManagers = managers.filter((m) => m.id !== commitment.ownerId)

    if (filteredManagers.length === 0) {
      logger.info({ teamId, commitmentId: commitment.id }, 'slackNotifyService.sendManagerAlerts: no managers to notify')
      return result
    }

    const profileUrl = `${frontendUrl}/team/members/${commitment.ownerId}`
    const blocks = buildManagerAlertBlocks({
      id: commitment.id,
      text: commitment.text,
      ownerName: commitment.ownerName,
      commitmentScore: commitment.commitmentScore,
      profileUrl,
    })

    // 2. Sequential dispatch loop with rate limiting & error isolation
    for (let i = 0; i < filteredManagers.length; i++) {
      const manager = filteredManagers[i]

      // Check per-manager preference
      const isAllowed = await notificationsService.shouldSendSlack(manager.id, 'COMMITMENT_MISSED')
      if (!isAllowed) {
        logger.info(
          { teamId, userId: manager.id, notificationType: 'MANAGER_ALERT' },
          'slackNotifyService.sendManagerAlerts: skipped (user preference disabled)'
        )
        result.skipped++
        continue
      }

      // Check per-manager dedup key
      const dedupKey = `notif:dedup:COMMITMENT_MISSED:${manager.id}:${commitment.id}`
      const isFresh = await notificationsService.checkAndSetDedup(dedupKey, NOTIFICATION_DEDUP_TTL.COMMITMENT_MISSED)
      if (!isFresh) {
        logger.info(
          { teamId, userId: manager.id, commitmentId: commitment.id },
          'slackNotifyService.sendManagerAlerts: skipped (duplicate alert)'
        )
        result.skipped++
        continue
      }

      // Per-recipient try/catch isolation
      try {
        const sendResult = await slackProvider.sendDirectMessage(
          integration,
          manager.email,
          `🚨 Manager Alert: ${commitment.ownerName} missed commitment "${commitment.text}"`,
          blocks
        )

        if (sendResult.ok) {
          result.sent++
          logger.info(
            { teamId, managerId: manager.id, commitmentId: commitment.id },
            'slackNotifyService.sendManagerAlerts: sent manager alert DM'
          )
        } else {
          result.failed++
          logger.warn(
            { teamId, managerId: manager.id, err: sendResult.error },
            'slackNotifyService.sendManagerAlerts: manager DM send failed'
          )
        }
      } catch (err: any) {
        result.failed++
        logger.error(
          { teamId, managerId: manager.id, err: err.message },
          'slackNotifyService.sendManagerAlerts: threw during manager DM send (isolated)'
        )
      }

      // Inter-message rate-limiting delay (if more managers remain)
      if (i < filteredManagers.length - 1 && interMessageDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, interMessageDelayMs))
      }
    }

    return result
  },

  /**
   * Dispatch a deadline reminder DM.
   */
  async sendDeadlineReminder(
    integration: TeamIntegration,
    ownerEmail: string,
    input: DeadlineReminderBlockInput
  ): Promise<SlackSendResult> {
    const blocks = buildDeadlineReminderBlocks(input)
    return slackProvider.sendDirectMessage(
      integration,
      ownerEmail,
      `⏰ Deadline reminder: ${input.text}`,
      blocks
    )
  },

  /**
   * Dispatch a celebratory commitment fulfilled DM.
   */
  async sendCommitmentFulfilled(
    integration: TeamIntegration,
    ownerEmail: string,
    input: CommitmentFulfilledBlockInput
  ): Promise<SlackSendResult> {
    const blocks = buildCommitmentFulfilledBlocks(input)
    return slackProvider.sendDirectMessage(
      integration,
      ownerEmail,
      `🎉 Commitment fulfilled: ${input.text}`,
      blocks
    )
  },
}
