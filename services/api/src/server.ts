/**
 * server.ts — Production-Grade Startup with Listen-First Architecture
 *
 * BOOT ORDER (critical for Docker healthchecks):
 *
 *   1. httpServer.listen()           ← Express binds to port 5000 IMMEDIATELY
 *   2. Docker /health probe fires    ← always returns 200 (liveness)
 *   3. DB connections run async      ← Postgres, MongoDB, Redis connect in background
 *   4. Socket.io initializes         ← after Redis is connected
 *   5. Server marks itself "ready"   ← /ready returns 200, NGINX routes traffic
 *
 * WHY listen-first:
 *   The old approach connected ALL databases before calling listen(). If any
 *   single DB connection failed or timed out (even transiently), process.exit(1)
 *   fired before the HTTP server ever bound to the port. Docker's healthcheck
 *   probe then got ECONNREFUSED, marked the container unhealthy, and aborted
 *   the deployment — even though every database was perfectly healthy.
 *
 *   With listen-first, the container is ALWAYS healthy (port is open), and
 *   /ready truthfully reports whether the app can serve traffic.
 */

import { createServer } from 'http'
import app from './app'
import { env } from './config/env'
import { prisma } from './db/client'
import { redis } from './config/redis'
import { connectMongoDB } from './db/mongo.client'
import { initializeSocketServer, setIO } from './realtime/socket.server'
import { setServerReady } from './config/server-state'

const PORT = env.PORT || 5000
const MAX_CONNECT_RETRIES = 10
const RETRY_DELAY_MS = 3000

// ── Global readiness state — via server-state.ts (no circular exports) ────────

// ── Utility: sleep ──────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── Utility: connect with exponential retry ─────────────────────────────────────
async function connectWithRetry(
    name: string,
    connectFn: () => Promise<void>,
    maxRetries = MAX_CONNECT_RETRIES,
): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await connectFn()
            console.log(`✅ ${name} connected (attempt ${attempt})`)
            return
        } catch (err: any) {
            const isLast = attempt === maxRetries
            console.error(
                `❌ ${name} connection failed (attempt ${attempt}/${maxRetries}): ${err?.message ?? err}`
            )
            if (isLast) throw err
            const delay = Math.min(RETRY_DELAY_MS * attempt, 15000)
            console.log(`⏳ Retrying ${name} in ${delay}ms...`)
            await sleep(delay)
        }
    }
}

async function startServer() {
    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1: Start HTTP server immediately
    // Docker healthcheck GET /health will pass from this point forward.
    // ──────────────────────────────────────────────────────────────────────────
    const httpServer = createServer(app)

    await new Promise<void>((resolve) => {
        httpServer.listen(PORT, () => {
            console.log(`🚀 HTTP server listening on :${PORT} (databases connecting in background)`)
            resolve()
        })
    })

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2: Connect all databases with exponential retry
    // If these fail, the container stays up, /health=200, /ready=503.
    // ──────────────────────────────────────────────────────────────────────────
    try {
        await connectWithRetry('PostgreSQL (Prisma)', () => prisma.$connect())

        await connectWithRetry('MongoDB', async () => {
            await connectMongoDB()
        })

        await connectWithRetry('Redis', async () => {
            if (redis.status === 'wait') {
                await redis.connect()
            } else if (redis.status === 'reconnecting' || redis.status === 'connecting') {
                // Already attempting — wait for it
                await new Promise<void>((resolve, reject) => {
                    redis.once('ready', resolve)
                    redis.once('error', reject)
                })
            }
        })

        // ──────────────────────────────────────────────────────────────────────
        // STEP 3: Initialize Socket.io (requires Redis to be connected)
        // ──────────────────────────────────────────────────────────────────────
        const io = initializeSocketServer(httpServer)
        setIO(io)
        console.log('🔌 Socket.io initialized with Redis adapter')

        // ──────────────────────────────────────────────────────────────────────
        // ── STEP 4: Mark server as ready — /ready now returns 200 ────────────────
        setServerReady(true)
        console.log('✅ All systems connected — server is READY to serve traffic')

        // ──────────────────────────────────────────────────────────────────────
        // Graceful Shutdown
        // ──────────────────────────────────────────────────────────────────────
        const shutdown = async (signal: string) => {
            console.log(`🛑 ${signal} received — starting graceful shutdown...`)
            setServerReady(false)

            io.close()

            httpServer.close(async () => {
                await prisma.$disconnect()
                redis.disconnect()
                console.log('✅ Graceful shutdown complete.')
                process.exit(0)
            })

            // Force-exit after 10s if graceful shutdown hangs
            setTimeout(() => {
                console.error('⚠️ Graceful shutdown timed out. Force exiting.')
                process.exit(1)
            }, 10_000)
        }

        process.on('SIGINT', () => shutdown('SIGINT'))
        process.on('SIGTERM', () => shutdown('SIGTERM'))
    } catch (error: any) {
        // Database connections permanently failed after all retries.
        // Keep HTTP server alive so /health still returns 200 (container stays up)
        // and ops can inspect without triggering a rollback.
        console.error('❌ Critical: database connection failed after all retries:', error?.message ?? error)
        console.error('⚠️ Server stays UP for debugging. /ready returns 503. Manual intervention required.')
        // Do NOT call process.exit(1) — that would trigger an unhealthy → rollback loop
    }
}

startServer()