export type NotifyJobType =
  | 'MEETING_PROCESSED'
  | 'MEETING_FAILED'
  | 'PAYMENT_FAILED'
  | 'COMMITMENT_MISSED'
  | 'DEADLINE_REMINDER'
  | 'WEEKLY_DIGEST'
  | 'VERIFICATION_EMAIL'
  | 'PASSWORD_RESET_EMAIL'
  | 'TEAM_INVITE_EMAIL'
  | 'EMAIL_MEETING_SUMMARY'
  | 'EMAIL_COMMITMENT_MISSED'
  | 'EMAIL_MANAGER_ALERT'
  | 'EMAIL_DEADLINE_REMINDER'

export interface NotifyJobData {
  type:          NotifyJobType
  teamId?:       string // Made optional because auth emails don't have a teamId
  meetingId?:    string
  commitmentId?: string
  ownerId?:      string
  managerIds?:   string[]
  emailPayload?: any // For transactional emails
}
