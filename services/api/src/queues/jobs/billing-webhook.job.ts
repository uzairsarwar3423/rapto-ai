// The Paddle payload lives in Postgres (paddle_webhook_events); the queue only carries the reference,
// keeping customer data out of Redis and making the inbox the single source of truth.
export interface BillingWebhookJobData {
  eventId: string
  eventType: string
  receivedAt: string
}
