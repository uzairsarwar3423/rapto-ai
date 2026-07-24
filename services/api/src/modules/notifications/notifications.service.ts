// ─────────────────────────────────────────────────────────────────────────────
// notifications.service.ts — Preferences CRUD + Recipient Resolution + Dedup Helpers
//
// Design decisions (from spec):
//  - getPreferences: returns DEFAULT_PREFERENCES on read-miss (never writes DB)
//  - updatePreferences: true deep merge (not shallow assign), then cache-busts
//    the user cache key so notify.worker's cached preference view stays fresh
//  - getManagersToNotify: central, tenant-isolated team membership query for OWNER, ADMIN, MANAGER roles.
//  - shouldSendSlack & shouldSendEmail: shared preference evaluation logic reused by
//    Slack and Email dispatch workers.
//  - checkAndSetDedup: Redis atomic SET EX NX helper for idempotency.
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '../../config/logger'
import { redis } from '../../config/redis'
import { notificationsRepository } from './notifications.repository'
import {
  DEFAULT_PREFERENCES,
  type NotificationPreferences,
  type PartialNotificationPreferences,
} from './notifications.types'
import { prisma } from '../../db/client'
import { env } from '../../config/env'

const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'

const NOTIFICATION_TYPE_TO_SLACK_PREF_KEY: Record<string, keyof NotificationPreferences['slack']> = {
  MEETING_PROCESSED: 'meetingSummary',
  COMMITMENT_MISSED: 'commitmentMissed',
  DEADLINE_REMINDER: 'deadlineReminder',
  DEADLINE_TODAY: 'deadlineReminder',
  COMMITMENT_FULFILLED: 'commitmentFulfilled',
  MANAGER_ALERT: 'commitmentMissed',
  WEEKLY_DIGEST: 'dailyDigest',
}

const NOTIFICATION_TYPE_TO_EMAIL_PREF_KEY: Record<string, keyof NotificationPreferences['email']> = {
  MEETING_PROCESSED: 'meetingSummary',
  COMMITMENT_MISSED: 'commitmentMissed',
  DEADLINE_REMINDER: 'deadlineReminder',
  DEADLINE_TODAY: 'deadlineReminder',
  COMMITMENT_FULFILLED: 'commitmentFulfilled',
  MANAGER_ALERT: 'commitmentMissed',
  WEEKLY_DIGEST: 'weeklyDigest',
}

// ── Deep Merge ────────────────────────────────────────────────────────────────

/**
 * True deep merge: email.* sub-keys merge independently of slack.* sub-keys.
 * Same philosophy as Day 16's team.settings update logic.
 */
function deepMergePreferences(
  current: NotificationPreferences,
  partial: PartialNotificationPreferences
): NotificationPreferences {
  return {
    email: { ...current.email, ...partial.email },
    slack: { ...current.slack, ...partial.slack },
    inApp: { ...current.inApp, ...partial.inApp },
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const notificationsService = {
  /**
   * Get notification preferences for a user.
   * Returns DEFAULT_PREFERENCES if no row exists — pure read, never writes on miss.
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const row = await notificationsRepository.findByUserId(userId)
    return row ?? DEFAULT_PREFERENCES
  },

  /**
   * Partially update notification preferences.
   * Deep-merges the patch onto the current (or default) preferences.
   * Invalidates the user cache key so notify.worker's cached view stays fresh.
   */
  async updatePreferences(
    userId: string,
    partialUpdate: PartialNotificationPreferences
  ): Promise<NotificationPreferences> {
    const current = await notificationsService.getPreferences(userId)
    const merged = deepMergePreferences(current, partialUpdate)

    await notificationsRepository.upsert(userId, merged)

    try {
      await redis.del(`cache:user:${userId}`)
    } catch (err) {
      logger.warn({ err, userId }, 'notifications.service: failed to invalidate user cache (non-fatal)')
    }

    logger.info({ userId }, 'notifications.service: preferences updated')
    return merged
  },

  /**
   * Central recipient resolution helper: resolve all users in a team holding MANAGER, ADMIN, or OWNER role.
   * Strictly tenant-scoped to `teamId`.
   */
  async getManagersToNotify(teamId: string): Promise<Array<{ id: string; email: string; name: string }>> {
    return prisma.user.findMany({
      where: {
        teamId,
        role: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    })
  },

  /**
   * Shared preference evaluation for Slack channel.
   * Returns true if sending is allowed, false if opted out by user preference.
   */
  async shouldSendSlack(userId: string, notificationType: string): Promise<boolean> {
    const prefs = await notificationsService.getPreferences(userId)
    const prefKey = NOTIFICATION_TYPE_TO_SLACK_PREF_KEY[notificationType]
    if (prefKey && prefs.slack && prefs.slack[prefKey] === false) {
      return false
    }
    return true
  },

  /**
   * Shared preference evaluation for Email channel.
   * Returns true if sending is allowed, false if opted out by user preference.
   */
  async shouldSendEmail(userId: string, notificationType: string): Promise<boolean> {
    const prefs = await notificationsService.getPreferences(userId)
    const prefKey = NOTIFICATION_TYPE_TO_EMAIL_PREF_KEY[notificationType]
    if (prefKey && prefs.email && prefs.email[prefKey] === false) {
      return false
    }
    return true
  },

  /**
   * Check and set an atomic Redis deduplication slot.
   * @returns true if slot WAS claimed (fresh send), false if slot WAS ALREADY set (duplicate, skip).
   */
  async checkAndSetDedup(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX')
      return result === 'OK'
    } catch (err) {
      logger.warn({ err, key }, 'notifications.service: redis dedup check failed (defaulting to proceed)')
      return true
    }
  },

  /**
   * List user's in-app notifications with cursor-based pagination.
   */
  async listInApp(userId: string, query: { limit: number; cursor?: string }) {
    const limit = query.limit
    const cursor = query.cursor ? { id: query.cursor } : undefined

    const items = await prisma.inAppNotification.findMany({
      where: { userId },
      take: limit + 1,
      ...(cursor && { cursor, skip: 1 }),
      orderBy: { createdAt: 'desc' },
    })

    let nextCursor: string | undefined = undefined
    if (items.length > limit) {
      const nextItem = items.pop()
      nextCursor = nextItem?.id
    }

    return { items, nextCursor }
  },

  /**
   * Get total count of unread in-app notifications.
   */
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.inAppNotification.count({
      where: { userId, isRead: false },
    })
  },

  /**
   * Mark a single in-app notification as read.
   */
  async markRead(userId: string, id: string): Promise<void> {
    const notification = await prisma.inAppNotification.findFirst({
      where: { id, userId },
    })
    if (!notification) return

    await prisma.inAppNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    })

    try {
      const { socketEmitter } = await import('../../realtime/socket.emitter')
      const { userRoom } = await import('../../realtime/rooms.manager')
      const { SERVER_EVENTS } = await import('../../realtime/socket.events')
      socketEmitter.to(userRoom(userId)).emit(SERVER_EVENTS.NOTIFICATION_READ, { id })
    } catch (err) {
      logger.error({ err, userId }, 'notifications.service: failed to emit notification:read socket event')
    }
  },

  /**
   * Mark all unread in-app notifications as read for a user.
   */
  async markAllRead(userId: string): Promise<void> {
    await prisma.inAppNotification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })

    try {
      const { socketEmitter } = await import('../../realtime/socket.emitter')
      const { userRoom } = await import('../../realtime/rooms.manager')
      const { SERVER_EVENTS } = await import('../../realtime/socket.events')
      socketEmitter.to(userRoom(userId)).emit(SERVER_EVENTS.NOTIFICATION_READ, { all: true })
    } catch (err) {
      logger.error({ err, userId }, 'notifications.service: failed to emit notification:read socket event')
    }
  },
}
