/**
 * Production Enterprise CORS Policy & Origin Validator
 *
 * Enforces strict, multi-tenant CORS rules allowing https://app.rapto.cloud,
 * subdomains (*.rapto.cloud), configured env origins (FRONTEND_URL/APP_URL),
 * and local development origins (http://localhost:3000).
 *
 * ALLOWED HEADERS — every custom request header the API reads must be listed
 * here, otherwise browsers block the preflight (OPTIONS) request with a CORS
 * policy violation. Add new headers here AND in cors.ts (keep in sync).
 *
 * Current custom headers consumed by the API:
 *  - X-Idempotency-Key   → action-items sync (idempotency dedup)
 *  - X-Request-ID        → request tracing / logging
 *  - X-Requested-With    → legacy XHR detection
 */

import { env } from './env'

const STATIC_ALLOWED_ORIGINS = [
    'https://app.rapto.cloud',
    'https://rapto.cloud',
    'https://www.rapto.cloud',
    'http://localhost:3000',
    'http://localhost:5000',
]

export function getAllowedOrigins(): string[] {
    const origins = new Set<string>(STATIC_ALLOWED_ORIGINS)

    if (env.FRONTEND_URL) origins.add(env.FRONTEND_URL.replace(/\/$/, ''))
    if (env.APP_URL) origins.add(env.APP_URL.replace(/\/$/, ''))

    return Array.from(origins)
}

export function isOriginAllowed(origin: string | undefined): boolean {
    // Allow non-browser requests (server-to-server, curl, mobile apps, Postman)
    if (!origin) return true

    const cleanOrigin = origin.replace(/\/$/, '')
    const allowedOrigins = getAllowedOrigins()

    if (allowedOrigins.includes(cleanOrigin)) {
        return true
    }

    // Allow any *.rapto.cloud subdomain dynamically
    try {
        const url = new URL(cleanOrigin)
        if (url.hostname === 'rapto.cloud' || url.hostname.endsWith('.rapto.cloud')) {
            return true
        }
    } catch {}

    return false
}

/**
 * Master list of request headers allowed by the CORS preflight.
 * RULE: Any header sent by the browser client (Axios, fetch) that the
 * server reads MUST be in this list — or the browser blocks the request
 * before it ever reaches Express.
 */
export const ALLOWED_REQUEST_HEADERS = [
    // Standard headers (always required)
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',

    // Request tracing — sent by Axios interceptor & read by request-logger middleware
    'X-Request-ID',
    'X-Requested-With',

    // Idempotency — sent by frontend for POST /action-items/:id/sync and
    // any other mutation that requires exactly-once semantics
    'X-Idempotency-Key',

    // Cache control (used by some browser clients)
    'Cache-Control',
    'Pragma',
]

/**
 * Response headers exposed to the browser JS client.
 * Only listed headers are readable via response.headers in XHR / fetch.
 */
export const EXPOSED_RESPONSE_HEADERS = [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After',
]

export const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (isOriginAllowed(origin)) {
            callback(null, true)
        } else {
            console.warn(`⚠️ CORS blocked request from unauthorized origin: ${origin}`)
            callback(new Error(`CORS policy violation: Origin '${origin}' is not allowed.`))
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ALLOWED_REQUEST_HEADERS,
    exposedHeaders: EXPOSED_RESPONSE_HEADERS,
    maxAge: 86400, // Cache preflight 24h — browser skips OPTIONS on repeat requests
}
