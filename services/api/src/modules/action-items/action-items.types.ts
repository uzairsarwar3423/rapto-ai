import { PriorityLevel } from '@prisma/client'

export interface ListActionItemsQuery {
  assigneeId?: string
  completed?: boolean
  priority?: PriorityLevel | PriorityLevel[]
  meetingId?: string
  hasJiraTicket?: boolean
  hasLinearIssue?: boolean
  from?: string
  to?: string
  search?: string
  cursor?: string
  limit?: number
  sortBy?: 'createdAt' | 'dueDate' | 'priority'
  sortOrder?: 'asc' | 'desc'
}

export interface UpdateActionItemDto {
  completed?: boolean
  assigneeId?: string
  dueDate?: string
  priority?: PriorityLevel
  text?: string
}

export interface SyncActionItemDto {
  provider: 'JIRA' | 'LINEAR' | 'NOTION'
}

export type { AutoSyncProvider } from '../../config/team-settings.config'

export interface AutoSyncJobCandidate {
  actionItemId: string
  provider: 'JIRA' | 'LINEAR' | 'NOTION'
}

