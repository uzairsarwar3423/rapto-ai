export interface AdminAuditLogEntry {
  id: string
  adminUserId: string | null
  action: string
  targetType?: string | null
  targetId?: string | null
  metadata: Record<string, unknown>
  ipAddress?: string | null
  createdAt: Date
}
