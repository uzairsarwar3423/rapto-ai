import 'dotenv/config'
import { z } from 'zod'
import dns from 'node:dns'

// Fix Node.js 18+ undici fetch timeout issues when IPv6 is available in DNS but blackholed by the network
dns.setDefaultResultOrder('ipv4first')

const envSchema = z.object({
    NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .default('development'),

    PORT: z.coerce.number().default(5000),

    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),

    MONGODB_URL: z.string().min(1),

    REDIS_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),

    APP_URL: z.string(),
    FRONTEND_URL: z.string().optional(),
    API_URL: z.string().optional(),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().optional(),

    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    RECALL_API_KEY: z.string().optional(),
    RECALL_WEBHOOK_SECRET: z.string().optional(),

    BREVO_API_KEY: z.string().optional(),
    BREVO_FROM_EMAIL: z.string().optional(),

    JIRA_CLIENT_ID: z.string().min(1),
    JIRA_CLIENT_SECRET: z.string().min(1),
    JIRA_CALLBACK_URL: z.string().min(1),
    JIRA_WEBHOOK_SECRET: z.string().min(1),

    // Day 22: Slack
    SLACK_CLIENT_ID: z.string().optional(),
    SLACK_CLIENT_SECRET: z.string().optional(),
    SLACK_SIGNING_SECRET: z.string().optional(),
    SLACK_CALLBACK_URL: z.string().optional(),

    // Day 22: Linear
    LINEAR_CLIENT_ID: z.string().optional(),
    LINEAR_CLIENT_SECRET: z.string().optional(),
    LINEAR_CALLBACK_URL: z.string().optional(),

    // Day 22: Notion
    NOTION_CLIENT_ID: z.string().optional(),
    NOTION_CLIENT_SECRET: z.string().optional(),
    NOTION_CALLBACK_URL: z.string().optional(),

    // Day 22: Google Calendar (distinct callback from Google login)
    GOOGLE_CALENDAR_CALLBACK_URL: z.string().optional(),

    // AI Pipeline
    AI_PIPELINE_URL: z.string().url().default('http://ai-pipeline:8000'),
    AI_PIPELINE_SECRET: z.string().min(32).default('change-me-min-32-chars-in-production-please-use-a-secure-secret'),
    AI_PIPELINE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    AI_PIPELINE_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(3),
    AI_PIPELINE_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1000),
    AI_PIPELINE_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
    AI_PIPELINE_CIRCUIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    AI_PIPELINE_CIRCUIT_OPEN_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error(
        '❌ Invalid environment variables:',
        parsed.error.flatten().fieldErrors
    )

    process.exit(1)
}

// Trigger tsx watch reload to read updated .env variables
export const env = parsed.data