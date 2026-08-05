// services/api/src/config/cors.ts
// Legacy CORS middleware wrapper — kept for backward compatibility with any
// code that imports `corsMiddleware` directly.
//
// SOURCE OF TRUTH: cors.config.ts
// This file re-uses the canonical ALLOWED_REQUEST_HEADERS and origin logic
// from cors.config.ts to ensure a single place to add new headers.

import cors, { CorsOptions } from 'cors'
import {
    isOriginAllowed,
    ALLOWED_REQUEST_HEADERS,
    EXPOSED_RESPONSE_HEADERS,
} from './cors.config'

const corsOptions: CorsOptions = {
    origin(origin, callback) {
        if (isOriginAllowed(origin)) {
            return callback(null, true)
        }
        callback(new Error(`CORS blocked for origin: ${origin}`))
    },

    credentials: true,

    methods: [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS',
    ],

    allowedHeaders: ALLOWED_REQUEST_HEADERS,

    exposedHeaders: EXPOSED_RESPONSE_HEADERS,

    maxAge: 86400,
}

export const corsMiddleware = cors(corsOptions)