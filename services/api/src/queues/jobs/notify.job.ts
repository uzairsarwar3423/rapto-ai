export type NotifyJobType =
  | 'MEETING_PROCESSED'
  | 'MEETING_FAILED'
  | 'PAYMENT_FAILED'
  | 'COMMITMENT_MISSED'
  | 'DEADLINE_REMINDER'
  | 'COMMITMENT_FULFILLED'
  | 'WEEKLY_DIGEST'
  | 'VERIFICATION_EMAIL'
  | 'PASSWORD_RESET_EMAIL'
  | 'TEAM_INVITE_EMAIL'
  | 'EMAIL_MEETING_SUMMARY'
  | 'EMAIL_COMMITMENT_MISSED'
  | 'EMAIL_MANAGER_ALERT'
  | 'EMAIL_DEADLINE_REMINDER'
  | 'EMAIL_COMMITMENT_FULFILLED'
  | 'INTEGRATION_AUTO_DISABLED'
  | 'CALENDAR_SYNC_FAILED'
  | 'EMAIL_INTEGRATION_DISABLED'
  | 'INTEGRATION_WARNING'
  | 'INTEGRATION_DEACTIVATED'
  | 'EMAIL_PAYMENT_FAILED'
  | 'EMAIL_PLAN_LIMIT'
  | 'EMAIL_OWNER_WELCOME'
  | 'EMAIL_TEAM_MEMBER_WELCOME'
  | 'BILLING_CONFIRMATION'
  | 'EMAIL_PAYMENT_SUCCESS'
  | 'SUBSCRIPTION_UPGRADED'
  | 'EMAIL_SUBSCRIPTION_UPGRADED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'EMAIL_SUBSCRIPTION_CANCELLED'
  | 'TRIAL_STARTED'            // Fired by subscription.created when status = 'trialing'

export interface NotifyJobData {
  type:          NotifyJobType
  teamId?:       string // Made optional because auth emails don't have a teamId
  meetingId?:    string
  commitmentId?: string
  ownerId?:      string
  managerIds?:   string[]
  planId?:       string // Billing: the plan that was activated / upgraded
  trialEndsAt?:  Date   // Billing: trial end date for TRIAL_STARTED
  emailPayload?: any    // For transactional emails
  metadata?:     any    // Optional metadata for generic notification payloads
}

