import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { integrateQueue } from '../../queues/queue.client'
import { actionItemsRepository } from './action-items.repository'
import { AppError, ForbiddenError, NotFoundError } from '../../utils/errors'
import { PriorityLevel } from '@prisma/client'
import type { ListActionItemsQuery, UpdateActionItemDto } from './action-items.types'
import { env } from '../../config/env'
import { IdentityResolutionService } from '../../services/commitment-resolver.service'

function getReconnectUrl(provider: string): string {
  const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'
  return `${frontendUrl}/settings/integrations?reconnect=${provider.toLowerCase()}`
}

async function listActionItems(teamId: string, query: ListActionItemsQuery) {
  return actionItemsRepository.listActionItems(teamId, query)
}

async function updateActionItem(
  actionItemId: string,
  teamId: string,
  userId: string,
  userRole: string,
  data: UpdateActionItemDto
) {
  const actionItem = await actionItemsRepository.findById(actionItemId, teamId)
  if (!actionItem) {
    throw new NotFoundError('ActionItem', actionItemId)
  }

  // Authorization checks
  const isAssignee = actionItem.assigneeId === userId
  const isManagerOrAbove = ['OWNER', 'ADMIN', 'MANAGER'].includes(userRole)

  // 1. Assignee and Priority modification rules: Assignee or MANAGER+ only
  if (data.assigneeId !== undefined || data.priority !== undefined) {
    if (!isAssignee && !isManagerOrAbove) {
      throw new ForbiddenError(
        'You do not have permission to modify priority or assignment of this action item.'
      )
    }
  }

  // 2. Text modification rules: Assignee or MANAGER+ only
  if (data.text !== undefined) {
    if (!isAssignee && !isManagerOrAbove) {
      throw new ForbiddenError('You can only edit action items assigned to you.')
    }
  }

  // 3. Completion modification rules: Assignee or MANAGER+ only
  if (data.completed !== undefined) {
    if (!isAssignee && !isManagerOrAbove) {
      throw new ForbiddenError('You can only update the completion status of your own action items.')
    }
  }

  const updatePayload: any = {}

  if (data.text !== undefined) {
    updatePayload.text = data.text
  }

  if (data.priority !== undefined) {
    updatePayload.priority = data.priority
  }

  if (data.dueDate !== undefined) {
    updatePayload.dueDate = data.dueDate ? new Date(data.dueDate) : null
  }

  // Handle assignee change
  if (data.assigneeId !== undefined) {
    if (data.assigneeId === null) {
      updatePayload.assigneeId = null
    } else {
      // Verify assignee belongs to the team
      const member = await prisma.user.findFirst({
        where: { id: data.assigneeId, teamId }
      })
      if (!member) {
        throw new AppError('ASSIGNEE_NOT_IN_TEAM', 400, 'Assignee must be an active member of the same team')
      }
      updatePayload.assigneeId = data.assigneeId

      // TIER 3 SELF-HEALING: If the action item is being manually assigned/reassigned,
      // and it has an extracted raw name, we train the Identity Resolution System.
      if (actionItem.assigneeId !== data.assigneeId && actionItem.assigneeNameRaw) {
        // Fire and forget, don't block the API response
        IdentityResolutionService.trainSystemWithAlias(data.assigneeId, actionItem.assigneeNameRaw)
          .catch(err => console.error("Failed to train identity system:", err));
      }
    }
  }

  // Handle completion state transition
  if (data.completed !== undefined) {
    if (data.completed && !actionItem.completed) {
      updatePayload.completed = true
      updatePayload.completedAt = new Date()
      updatePayload.completedById = userId

      // Sync downstream to Jira or Linear if issue ID exists and integration is connected
      const integrations = await prisma.teamIntegration.findMany({
        where: { teamId, isActive: true }
      })

      const hasJira = integrations.some(i => i.provider === 'JIRA')
      const hasLinear = integrations.some(i => i.provider === 'LINEAR')

      if ((hasJira && actionItem.jiraIssueId) || (hasLinear && actionItem.linearIssueId)) {
        await integrateQueue.add(
          'sync-action-item',
          {
            teamId,
            actionItemId: actionItem.id,
            provider: actionItem.jiraIssueId ? 'JIRA' : 'LINEAR',
            attempt: 1
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 10_000 }
          }
        )
      }
    } else if (!data.completed && actionItem.completed) {
      updatePayload.completed = false
      updatePayload.completedAt = null
      updatePayload.completedById = null
    }
  }

  return actionItemsRepository.update(actionItemId, teamId, updatePayload)
}

async function syncActionItem(
  actionItemId: string,
  teamId: string,
  userId: string,
  provider: 'JIRA' | 'LINEAR' | 'NOTION',
  idempotencyKey: string
) {
  const actionItem = await actionItemsRepository.findById(actionItemId, teamId)
  if (!actionItem) {
    throw new NotFoundError('ActionItem', actionItemId)
  }

  // Check Redis Lock for team synchronization throttling
  const lockKey = `lock:sync:team:${teamId}`
  const acquired = await redis.set(lockKey, 'locked', 'EX', 30, 'NX')
  if (!acquired) {
    throw new AppError(
      'SYNC_IN_PROGRESS',
      429,
      'A sync operation is already in progress for this team. Please wait.'
    )
  }

  try {
    // Verify integration is connected and active
    const integration = await prisma.teamIntegration.findFirst({
      where: { teamId, provider, isActive: true }
    })

    if (!integration) {
      throw new AppError(
        'INTEGRATION_NOT_CONNECTED',
        422,
        `Integration for ${provider} is not connected or inactive.`,
        { reconnectUrl: getReconnectUrl(provider) }
      )
    }

    // Check if the idempotency key was already processed
    const idempotencyKeyRecord = `oauth:idempotency:${idempotencyKey}`
    const alreadyProcessed = await redis.set(idempotencyKeyRecord, 'processed', 'EX', 86400, 'NX')
    if (!alreadyProcessed) {
      return {
        provider,
        status: 'queued',
        queuedAt: new Date(),
        message: 'Request already processed or queued'
      }
    }

    // Queue integration job
    await integrateQueue.add(
      'sync-action-item',
      {
        teamId,
        actionItemId,
        provider,
        idempotencyKey,
        attempt: 1
      },
      {
        jobId: idempotencyKey, // Ensure deduplication at queue layer
        attempts: 3,
        backoff: { type: 'exponential', delay: 20_000 }
      }
    )

    // Write Usage Event
    await prisma.usageEvent.create({
      data: {
        teamId,
        type: 'INTEGRATION_SYNC',
        quantity: 1,
        metadata: {
          actionItemId,
          provider,
          triggeredBy: userId
        }
      }
    })

    return {
      provider,
      status: 'queued',
      queuedAt: new Date()
    }
  } finally {
    // Release the concurrency lock
    await redis.del(lockKey)
  }
}

async function bulkUpdateActionItems(
  teamId: string,
  userId: string,
  userRole: string,
  ids: string[],
  patch: any
) {
  const results = await Promise.all(
    ids.map(id => updateActionItem(id, teamId, userId, userRole, patch))
  )
  return results
}

async function getActionItem(actionItemId: string, teamId: string) {
  const actionItem = await actionItemsRepository.findById(actionItemId, teamId)
  if (!actionItem) {
    throw new NotFoundError('ActionItem', actionItemId)
  }
  return actionItem
}

async function enqueueAutoSyncJobs(meetingId: string, teamId: string) {
  // 1. Fetch team settings
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { settings: true },
  })

  const settings = (team?.settings ?? {}) as Record<string, any>
  const autoSyncEnabled = Boolean(settings.autoSyncEnabled)
  const configuredProviders: string[] = Array.isArray(settings.autoSyncProviders)
    ? settings.autoSyncProviders
    : []

  // Fast no-op if auto-sync is disabled or no providers configured
  if (!autoSyncEnabled || configuredProviders.length === 0) {
    return { enqueuedCount: 0 }
  }

  // 2. Fetch active TeamIntegrations for defense-in-depth runtime check
  const activeIntegrations = await prisma.teamIntegration.findMany({
    where: { teamId, isActive: true },
    select: { provider: true },
  })

  const activeProviderSet = new Set(activeIntegrations.map((i) => i.provider))
  const enabledProviders = configuredProviders.filter(
    (p): p is 'JIRA' | 'LINEAR' | 'NOTION' =>
      ['JIRA', 'LINEAR', 'NOTION'].includes(p) && activeProviderSet.has(p as any)
  )

  if (enabledProviders.length === 0) {
    return { enqueuedCount: 0 }
  }

  // 3. Query eligible action items (confidence >= 0.5, scoped to team & meeting)
  const eligibleItems = await actionItemsRepository.findAutoSyncEligibleItems(meetingId, teamId, 0.5)
  if (eligibleItems.length === 0) {
    return { enqueuedCount: 0 }
  }

  let enqueuedCount = 0

  // 4. Multi-provider fan-out loop
  for (const item of eligibleItems) {
    for (const provider of enabledProviders) {
      // Exclude items already synced for this provider
      if (provider === 'JIRA' && item.jiraIssueId) continue
      if (provider === 'LINEAR' && item.linearIssueId) continue
      if (provider === 'NOTION' && item.notionPageId) continue

      // System-generated deterministic idempotency key
      const idempotencyKey = `auto-sync:${item.id}:${provider}:${meetingId}`

      await integrateQueue.add(
        'sync-action-item',
        {
          teamId,
          actionItemId: item.id,
          provider,
          idempotencyKey,
          meetingId,
          source: 'auto',
        },
        {
          jobId: idempotencyKey,
          attempts: 5,
          backoff: { type: 'exponential', delay: 15_000 },
        }
      )

      enqueuedCount++
    }
  }

  return { enqueuedCount }
}

export const actionItemsService = {
  listActionItems,
  updateActionItem,
  syncActionItem,
  bulkUpdateActionItems,
  getActionItem,
  enqueueAutoSyncJobs,
}



