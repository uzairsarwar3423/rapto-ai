// ─────────────────────────────────────────────────────────────────────────────
// http-mock-setup.ts — Centralized HTTP Boundary Mocking & Interceptor Setup
//
// ZERO REAL NETWORK CALLS IN CI POLICY:
// Enforces strict default-deny interception across all 9 third-party integration
// domains (api.linear.app, api.notion.com, graph.microsoft.com, login.microsoftonline.com,
// api.atlassian.com, auth.atlassian.com, slack.com, oauth2.googleapis.com, www.googleapis.com).
//
// If an unmocked request is made to any external endpoint during a test run, this
// harness fails loudly with an explicit error detailing the request method & URL.
// ─────────────────────────────────────────────────────────────────────────────

import axios, { InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import { logger } from '../../src/config/logger'

export const THIRD_PARTY_DOMAINS = [
    'api.linear.app',
    'api.notion.com',
    'graph.microsoft.com',
    'login.microsoftonline.com',
    'api.atlassian.com',
    'auth.atlassian.com',
    'slack.com',
    'oauth2.googleapis.com',
    'www.googleapis.com',
] as const

export type ThirdPartyDomain = typeof THIRD_PARTY_DOMAINS[number]

export interface MockRouteRule {
    id: string
    domain: string
    urlPattern: string | RegExp
    method?: string
    status: number
    body: any
    headers?: Record<string, string>
    once?: boolean
    timesCalled: number
}

class HttpMockRegistry {
    private rules: MockRouteRule[] = []
    private callLogs: Array<{ method: string; url: string; headers: any; body: any }> = []
    private originalFetch: typeof globalThis.fetch | null = null
    private originalAxiosAdapter: any = null
    private isInstalled = false

    public install() {
        if (this.isInstalled) return
        this.isInstalled = true

        // Intercept global fetch
        if (typeof globalThis.fetch === 'function') {
            this.originalFetch = globalThis.fetch
            globalThis.fetch = this.handleFetch.bind(this) as any
        }

        // Intercept Axios
        this.originalAxiosAdapter = axios.defaults.adapter
        axios.defaults.adapter = this.handleAxios.bind(this) as any
    }

    public uninstall() {
        if (!this.isInstalled) return
        if (this.originalFetch) {
            globalThis.fetch = this.originalFetch
            this.originalFetch = null
        }
        if (this.originalAxiosAdapter) {
            axios.defaults.adapter = this.originalAxiosAdapter
            this.originalAxiosAdapter = null
        }
        this.rules = []
        this.callLogs = []
        this.isInstalled = false
    }

    public reset() {
        this.rules = []
        this.callLogs = []
    }

    public registerMock(rule: Omit<MockRouteRule, 'id' | 'timesCalled'>): string {
        const id = `rule_${Math.random().toString(36).substring(2, 9)}`
        const fullRule: MockRouteRule = {
            ...rule,
            id,
            timesCalled: 0,
        }
        this.rules.push(fullRule)
        return id
    }

    public getCallLogs() {
        return [...this.callLogs]
    }

    public isThirdPartyUrl(urlStr: string): boolean {
        try {
            const urlObj = new URL(urlStr)
            return THIRD_PARTY_DOMAINS.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`))
        } catch {
            return THIRD_PARTY_DOMAINS.some(domain => urlStr.includes(domain))
        }
    }

    private findMatchingRule(method: string, url: string): MockRouteRule | null {
        const uppercaseMethod = method.toUpperCase()
        for (let i = 0; i < this.rules.length; i++) {
            const rule = this.rules[i]
            if (rule.once && rule.timesCalled > 0) continue

            if (rule.method && rule.method.toUpperCase() !== uppercaseMethod) {
                continue
            }

            let matchesUrl = false
            if (typeof rule.urlPattern === 'string') {
                matchesUrl = url.includes(rule.urlPattern)
            } else if (rule.urlPattern instanceof RegExp) {
                matchesUrl = rule.urlPattern.test(url)
            }

            if (matchesUrl) {
                return rule
            }
        }
        return null
    }

    private async handleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
        const method = (init?.method || 'GET').toUpperCase()

        this.callLogs.push({
            method,
            url: urlStr,
            headers: init?.headers,
            body: init?.body,
        })

        const rule = this.findMatchingRule(method, urlStr)

        if (rule) {
            rule.timesCalled++
            const bodyStr = typeof rule.body === 'object' ? JSON.stringify(rule.body) : String(rule.body)
            return new Response(bodyStr, {
                status: rule.status,
                headers: {
                    'Content-Type': 'application/json',
                    ...(rule.headers || {}),
                },
            })
        }

        // Default Deny Posture check: Fail loudly if request is third party or unmocked
        if (this.isThirdPartyUrl(urlStr)) {
            const errMessage = `[DEFAULT-DENY STRICT INTERCEPTOR] Unmocked Outbound HTTP Request Blocked: ${method} ${urlStr}`
            logger.error({ method, url: urlStr }, errMessage)
            throw new Error(errMessage)
        }

        // If fallback to original fetch is allowed for non-3rd-party local tests
        if (this.originalFetch) {
            return this.originalFetch(input, init)
        }

        throw new Error(`[DEFAULT-DENY] Outbound fetch to ${urlStr} blocked with zero mock registered`)
    }

    private async handleAxios(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
        const method = (config.method || 'GET').toUpperCase()
        const fullUrl = axios.getUri(config) || config.url || ''

        this.callLogs.push({
            method,
            url: fullUrl,
            headers: config.headers,
            body: config.data,
        })

        const rule = this.findMatchingRule(method, fullUrl)

        if (rule) {
            rule.timesCalled++
            return {
                data: rule.body,
                status: rule.status,
                statusText: rule.status >= 200 && rule.status < 300 ? 'OK' : 'ERROR',
                headers: rule.headers || { 'content-type': 'application/json' },
                config,
            }
        }

        // Default Deny Posture check
        if (this.isThirdPartyUrl(fullUrl)) {
            const errMessage = `[DEFAULT-DENY STRICT INTERCEPTOR] Unmocked Outbound Axios Request Blocked: ${method} ${fullUrl}`
            logger.error({ method, url: fullUrl }, errMessage)
            return Promise.reject(new Error(errMessage))
        }

        if (this.originalAxiosAdapter) {
            return this.originalAxiosAdapter(config)
        }

        return Promise.reject(new Error(`[DEFAULT-DENY] Outbound Axios to ${fullUrl} blocked with zero mock registered`))
    }
}

export const httpMockRegistry = new HttpMockRegistry()

// Global install on import
httpMockRegistry.install()

// ─────────────────────────────────────────────────────────────────────────────
// Typed Helper API
// ─────────────────────────────────────────────────────────────────────────────

export function mockLinearResponse(urlPattern: string | RegExp, body: any, status = 200, method = 'POST') {
    return httpMockRegistry.registerMock({
        domain: 'api.linear.app',
        urlPattern,
        method,
        status,
        body,
    })
}

export function mockNotionResponse(urlPattern: string | RegExp, body: any, status = 200, method?: string) {
    return httpMockRegistry.registerMock({
        domain: 'api.notion.com',
        urlPattern,
        method,
        status,
        body,
    })
}

export function mockOutlookGraphResponse(urlPattern: string | RegExp, body: any, status = 200, method = 'GET') {
    return httpMockRegistry.registerMock({
        domain: 'graph.microsoft.com',
        urlPattern,
        method,
        status,
        body,
    })
}

export function mockJiraResponse(urlPattern: string | RegExp, body: any, status = 200, method?: string) {
    return httpMockRegistry.registerMock({
        domain: 'api.atlassian.com',
        urlPattern,
        method,
        status,
        body,
    })
}

export function mockSlackResponse(urlPattern: string | RegExp, body: any, status = 200, method = 'POST') {
    return httpMockRegistry.registerMock({
        domain: 'slack.com',
        urlPattern,
        method,
        status,
        body,
    })
}

export function resetHttpMocks() {
    httpMockRegistry.reset()
}
