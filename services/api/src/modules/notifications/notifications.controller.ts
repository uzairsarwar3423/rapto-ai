import type { Request, Response, NextFunction } from 'express'
import { asyncHandler } from '../../utils/async-handler'
import { notificationsService } from './notifications.service'
import { prisma } from '../../db/client'
import { slackProvider } from '../integrations/providers/slack.provider'
import { emailService } from './email.service'

export const notificationsController = {
  /**
   * GET /api/v1/notifications/preferences
   * Returns user's notification preferences (or defaults if no row exists).
   * Pure read — never writes to DB on a miss.
   */
  getPreferences: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id

    const preferences = await notificationsService.getPreferences(userId)

    return res.json({ data: { preferences } })
  }),

  /**
   * PATCH /api/v1/notifications/preferences
   * Partially updates notification preferences (deep merge).
   * Unknown keys rejected with 422 (via validator middleware).
   */
  updatePreferences: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id
    const partialUpdate = req.body

    const preferences = await notificationsService.updatePreferences(userId, partialUpdate)

    return res.json({ data: { preferences } })
  }),

  /**
   * GET /api/v1/notifications/in-app
   * Returns cursor-paginated in-app notifications for the user.
   */
  listInApp: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id
    const { limit, cursor } = req.query as any

    const result = await notificationsService.listInApp(userId, { limit, cursor })
    return res.json({ data: result })
  }),

  /**
   * GET /api/v1/notifications/unread-count
   * Returns the count of unread in-app notifications.
   */
  getUnreadCount: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id
    const count = await notificationsService.getUnreadCount(userId)
    return res.json({ data: { count } })
  }),

  /**
   * PATCH /api/v1/notifications/in-app/:id/read
   * Marks a single in-app notification as read.
   */
  markRead: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id
    const id = req.params.id as string

    await notificationsService.markRead(userId, id)
    return res.json({ data: { success: true } })
  }),

  /**
   * POST /api/v1/notifications/in-app/read-all
   * Marks all in-app notifications for the user as read.
   */
  markAllRead: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id

    await notificationsService.markAllRead(userId)
    return res.json({ data: { success: true } })
  }),

  /**
   * POST /api/v1/notifications/test
   * Sends a test notification to the requested channel(s).
   */
  testNotification: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new Error('User not found')
    
    const teamId = user.teamId
    if (!teamId) throw new Error('User not in a team')

    const channel = req.body.channel as 'slack' | 'email' | undefined
    const results: { channel: string; success: boolean; error?: string }[] = []

    if (!channel || channel === 'email') {
      try {
        await emailService.sendMeetingSummary({
          to: user.email,
          name: user.name,
          meetingTitle: 'Test Meeting',
          summary: 'This is a sample meeting summary for test notification purposes.',
          commitmentsCount: 0,
          actionItemsCount: 0,
          viewUrl: 'http://localhost:3000'
        })
        results.push({ channel: 'email', success: true })
      } catch (e: any) {
        results.push({ channel: 'email', success: false, error: e.message })
      }
    }

    if (!channel || channel === 'slack') {
      const slackIntegration = await prisma.teamIntegration.findUnique({
        where: { teamId_provider: { teamId, provider: 'SLACK' } }
      })
      if (!slackIntegration || !slackIntegration.isActive) {
        results.push({ channel: 'slack', success: false, error: 'Slack not connected' })
      } else {
        const meta = slackIntegration.metadata as any
        if (!meta?.defaultChannelId) {
          results.push({ channel: 'slack', success: false, error: 'No default channel configured' })
        } else {
          const sampleMeeting = { id: 'test', title: 'Test Meeting' }
          const counts = { commitments: 0, actionItems: 0 }
          const commitments: any[] = []
          try {
            const result = await slackProvider.sendMeetingSummaryToChannel(
              slackIntegration,
              sampleMeeting,
              counts,
              commitments
            )
            if (result.ok) {
              results.push({ channel: 'slack', success: true })
            } else {
              results.push({ channel: 'slack', success: false, error: result.error })
            }
          } catch (e: any) {
            results.push({ channel: 'slack', success: false, error: e.message })
          }
        }
      }
    }

    return res.json({ success: true, data: { results } })
  }),
}
