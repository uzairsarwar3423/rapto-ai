/**
 * Production Enterprise CORS Policy & Origin Validator
 *
 * Enforces strict, multi-tenant CORS rules allowing https://rapto.cloud,
 * subdomains (*.rapto.cloud), configured env origins (FRONTEND_URL/APP_URL),
 * and local development origins (http://localhost:3000).
 */

import { env } from './env'

const STATIC_ALLOWED_ORIGINS = [
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
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-ID',
        'X-Requested-With',
        'Accept',
        'Origin',
    ],
    exposedHeaders: [
        'X-Request-ID',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'Retry-After',
    ],
    maxAge: 86400, // Cache preflight for 24 hours
}
