/**
 * Centralized API URL Configuration for Rapto Web Client & Server Runtime
 *
 * Provides safe, environment-aware defaults so the frontend seamlessly calls
 * the production API (https://api.rapto.cloud) in production while preserving
 * localhost overrides during local development.
 */

const DEFAULT_PROD_API_URL = 'https://api.rapto.cloud'

/**
 * Returns the public API URL accessible from the browser.
 * Priority: NEXT_PUBLIC_API_URL -> Production Default (https://api.rapto.cloud)
 */
export function getPublicApiUrl(): string {
    const url = process.env.NEXT_PUBLIC_API_URL?.trim()
    if (url && url !== '') {
        return url.replace(/\/$/, '')
    }
    return DEFAULT_PROD_API_URL
}

/**
 * Returns the API URL accessible from Next.js server components / route handlers.
 * Priority: API_URL -> NEXT_PUBLIC_API_URL -> Production Default (https://api.rapto.cloud)
 */
export function getServerApiUrl(): string {
    const serverUrl = process.env.API_URL?.trim()
    if (serverUrl && serverUrl !== '') {
        return serverUrl.replace(/\/$/, '')
    }
    return getPublicApiUrl()
}
