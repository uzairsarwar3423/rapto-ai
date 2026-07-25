import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'

import { env } from './config/env'
import { requestLogger } from './middleware/request-logger.middleware'
import { ipRateLimiter } from './middleware/rate-limit.middleware'
import { errorMiddleware } from './middleware/error.middleware'
import { NotFoundError } from './utils/errors'
import { authRouter } from './modules/auth/auth.routes'
import { teamsRouter } from './modules/teams/teams.routes'
import { meetingsRouter } from './modules/meetings/meetings.routes'
import { commitmentsRouter } from './modules/commitments/commitments.routes'
import { actionItemsRouter } from './modules/action-items/action-items.routes'
import { integrationsRouter } from './modules/integrations/integrations.routes'
import { webhookRoutes } from './modules/webhooks/webhooks.routes'
import { notificationsRouter } from './modules/notifications/notifications.routes'
import { analyticsRouter } from './modules/analytics/analytics.routes'
import { billingRouter } from './modules/billing/billing.routes'
import { setupBullBoard } from './config/bull-board'

const app = express()

// ──────────────────────────────────────────────────────────────────────────────
// HEALTH PROBES — registered FIRST, before ALL middleware.
//
// WHY: Docker healthcheck and NGINX upstream checks must NEVER be blocked by:
//   - Rate limiter   (Redis call → fails if Redis not yet connected)
//   - Request logger (unnecessary for internal probes)
//   - CORS / Helmet  (internal probes don't send Origin headers)
//   - Body parsers   (probes send no body)
//
// Placing /health after ipRateLimiter was causing Docker to mark the container
// unhealthy on the VERY FIRST probe because the rate limiter called redis.ping()
// before redis.connect() completed, throwing ECONNREFUSED.
// ──────────────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'rapto-api',
        timestamp: new Date().toISOString(),
    })
})

// /ready — deep readiness: Redis + MongoDB must be reachable
app.get('/ready', async (_req, res) => {
    // Import serverReady flag — set by server.ts after all DB connections succeed
    // This avoids doing live pings on every probe (cheaper, more accurate)
    const { serverReady } = await import('./server').catch(() => ({ serverReady: false }))

    if (!serverReady) {
        return res.status(503).json({
            status: 'not_ready',
            reason: 'Database connections still initializing',
            timestamp: new Date().toISOString(),
        })
    }

    const checks: Record<string, boolean> = {}
    let healthy = true

    try {
        const { redis } = await import('./config/redis')
        await redis.ping()
        checks.redis = true
    } catch {
        checks.redis = false
        healthy = false
    }

    try {
        const { getMongoDB } = await import('./db/mongo.client')
        const db = getMongoDB()
        await db.command({ ping: 1 })
        checks.mongodb = true
    } catch {
        checks.mongodb = false
        healthy = false
    }

    try {
        const { aipipelineClient } = await import('./services/ai-pipeline/ai-pipeline.client')
        const r = await aipipelineClient.ready({ timeoutMs: 2000 })
        checks.ai_pipeline = r.status === 'ready'
        // AI pipeline down does NOT block readiness
    } catch {
        checks.ai_pipeline = false
    }

    res.status(healthy ? 200 : 503).json({
        status: healthy ? 'ready' : 'not_ready',
        checks,
        timestamp: new Date().toISOString(),
    })
})

// ──────────────────────────────────────────────────────────────────────────────
// Security & Utility Middleware
// ──────────────────────────────────────────────────────────────────────────────
app.use(
    cors({
        origin: env.APP_URL,
        credentials: true,
    })
)
app.use(helmet())
app.use(express.json({
    limit: '10mb',
    verify: (req: any, _res, buf) => {
        req.rawBody = buf
    },
}))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// Custom Request Logging & Rate Limiting
app.use(requestLogger())
app.use(ipRateLimiter)

// ── X-Request-ID ──────────────────────────────────────────────────────────────
app.use((_req, res, next) => {
    res.setHeader('X-Request-ID', crypto.randomUUID())
    next()
})

// ──────────────────────────────────────────────────────────────────────────────
// API Routes
// ──────────────────────────────────────────────────────────────────────────────
// Google Console redirects directly to /auth/google/callback
app.get('/auth/google/callback', (req, res) => {
    const query = req.url.split('?')[1]
    res.redirect(`/api/v1/auth/google/callback${query ? '?' + query : ''}`)
})

app.use('/api/v1/auth', authRouter)
app.use('/api/v1/teams', teamsRouter)
app.use('/api/v1/meetings', meetingsRouter)
app.use('/api/v1/commitments', commitmentsRouter)
app.use('/api/v1/action-items', actionItemsRouter)
app.use('/api/v1/integrations', integrationsRouter)
app.use('/api/v1/notifications', notificationsRouter)
app.use('/api/v1/analytics', analyticsRouter)
app.use('/api/v1/billing', billingRouter)
app.use('/api/webhooks', webhookRoutes)

// BullBoard — must be mounted BEFORE the 404 catch-all
setupBullBoard(app)

// 404 catch-all
app.use((req, _res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.path}`))
})

// Global Error Handler (MUST BE LAST)
app.use(errorMiddleware)

export default app