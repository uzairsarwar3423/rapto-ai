// ─────────────────────────────────────────────────────────────────────────────
// paddle.errors.ts — turns a Paddle SDK failure into (a) a precise internal diagnosis and (b) a safe client error.
//
// Why this exists: the SDK's ApiError carries { type, code, detail, retryAfter } but NO HTTP status, so callers
// cannot branch on `err.status`. Everything used to collapse into a generic 502 "unable to initialize billing".
//
// Paddle docs (developer.paddle.com/api-reference/about/errors, /errors/shared/forbidden, /errors/shared/not_found):
//   403 forbidden            valid key lacking the permission (e.g. customer.read) — or permissions added to Paddle after the key was made
//   403 authentication_missing   no/stripped Authorization header
//        authentication_malformed / invalid_token   bad key (status not confirmed in the docs read)
//   404 not_found            unknown ID — including an ID that belongs to ANOTHER environment (sandbox id on live API)
//   409 conflict / customer_already_exists
//   400/422 invalid_field …  request validation
//   429 too_many_requests    (+ Retry-After); subscription_immediate_charge_* limits
//   5xx internal_error / bad_gateway / service_unavailable / temporarily_unavailable
//
// HTTP statuses returned to OUR client deliberately avoid 502/504: edge proxies (CDN / API gateway) replace those
// with their own error page, which carries no CORS headers, so the browser reports a misleading "CORS error".
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError } from '@paddle/paddle-node-sdk'
import { AppError } from '../utils/errors'
import { logger } from '../config/logger'

export type PaddleFailureKind =
  | 'permission'      // our key is invalid / lacks permission — an OPERATIONS problem, never retryable
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'rate_limited'
  | 'upstream'        // Paddle 5xx / unavailable
  | 'timeout'
  | 'network'
  | 'unknown'

export interface PaddleFailure {
  kind: PaddleFailureKind
  /** Paddle error code (e.g. "forbidden"), when the SDK supplied one. Safe to log. */
  code?: string
  type?: string
  /** Paddle's human-readable detail (an ID or field name at most — never a credential). INTERNAL ONLY. */
  detail?: string
  retryAfter?: number | null
  /** Whether repeating the same call can help. Permission/validation/not_found/conflict are permanent. */
  retryable: boolean
}

const PERMISSION_CODES = new Set(['forbidden', 'authentication_missing', 'authentication_malformed', 'invalid_token'])
const NOT_FOUND_CODES = new Set(['not_found', 'entity_not_found'])
const CONFLICT_CODES = new Set(['conflict', 'customer_already_exists'])
const VALIDATION_CODES = new Set(['invalid_field', 'bad_request', 'invalid_request', 'unprocessable_entity'])
const UPSTREAM_CODES = new Set(['internal_error', 'bad_gateway', 'service_unavailable', 'temporarily_unavailable'])

/** Defense in depth: nothing credential-shaped may reach a log line, whatever the upstream wrote in `detail`. */
export function redactSecrets(text: string | undefined): string | undefined {
  if (!text) return text
  return text
    .replace(/pdl_(?:live|sdbx|ntfset)_[A-Za-z0-9_]+/g, '[redacted]')
    .replace(/Bearers+[^s"']+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|secret|token)(["'s:=]+)[^s"',]+/gi, '$1$2[redacted]')
    .slice(0, 300)
}

export function classifyPaddleError(err: unknown): PaddleFailure {
  if (err instanceof ApiError) {
    const code = err.code
    const base = { code, type: err.type, detail: redactSecrets(err.detail), retryAfter: err.retryAfter }
    if (PERMISSION_CODES.has(code)) return { ...base, kind: 'permission', retryable: false }
    if (NOT_FOUND_CODES.has(code)) return { ...base, kind: 'not_found', retryable: false }
    if (CONFLICT_CODES.has(code)) return { ...base, kind: 'conflict', retryable: false }
    if (code === 'too_many_requests' || code?.startsWith('subscription_immediate_charge')) {
      return { ...base, kind: 'rate_limited', retryable: true }
    }
    if (VALIDATION_CODES.has(code) || (err.errors && err.errors.length > 0)) return { ...base, kind: 'validation', retryable: false }
    if (UPSTREAM_CODES.has(code) || err.type === 'api_error') return { ...base, kind: 'upstream', retryable: true }
    return { ...base, kind: 'unknown', retryable: false }
  }

  const msg = String((err as any)?.message ?? '')
  if (/timed out|timeout|ETIMEDOUT/i.test(msg)) return { kind: 'timeout', detail: redactSecrets(msg), retryable: true }
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up/i.test(msg)) {
    return { kind: 'network', detail: redactSecrets(msg), retryable: true }
  }
  return { kind: 'unknown', detail: redactSecrets(msg) || undefined, retryable: false }
}

export interface PaddleErrorContext {
  operation: string
  requestId?: string
  userId?: string
  teamId?: string
}

/** Structured internal log: upstream diagnosis, never credentials, headers or payment data. */
export function logPaddleFailure(failure: PaddleFailure, ctx: PaddleErrorContext): void {
  const level = failure.kind === 'permission' ? 'error' : failure.kind === 'rate_limited' || failure.kind === 'not_found' ? 'warn' : 'error'
  logger[level](
    {
      operation: ctx.operation,
      requestId: ctx.requestId,
      userId: ctx.userId,
      teamId: ctx.teamId,
      upstream: 'paddle',
      paddleKind: failure.kind,
      paddleCode: failure.code,
      paddleType: failure.type,
      paddleDetail: failure.detail,
      retryAfter: failure.retryAfter ?? undefined,
      alert: failure.kind === 'permission' ? 'billing.paddle_credentials_or_permissions' : undefined,
    },
    `[paddle] ${ctx.operation} failed (${failure.kind}${failure.code ? `:${failure.code}` : ''})`
  )
}

/** Map a Paddle failure to a safe AppError. Provider details never reach the client. */
export function toClientError(failure: PaddleFailure, fallbackCode: string): AppError {
  switch (failure.kind) {
    case 'permission':
      // Our credentials/permissions are wrong: not the customer's fault and not retryable by them.
      return new AppError('BILLING_UNAVAILABLE', 503, 'Billing is temporarily unavailable. Our team has been notified.')
    case 'rate_limited':
      return new AppError('BILLING_RATE_LIMITED', 429, 'Too many billing requests. Please try again shortly.',
        failure.retryAfter ? { retryAfter: failure.retryAfter } : undefined)
    case 'validation':
      return new AppError('BILLING_REQUEST_INVALID', 422, 'The billing request could not be processed. Please check your details and try again.')
    case 'conflict':
      return new AppError('BILLING_CONFLICT', 409, 'A conflicting billing change is in progress. Please try again in a moment.')
    case 'not_found':
      return new AppError('BILLING_ACCOUNT_NOT_FOUND', 404, 'Billing record not found.')
    case 'upstream':
    case 'timeout':
    case 'network':
      return new AppError('BILLING_UPSTREAM_UNAVAILABLE', 503, 'The payment provider is temporarily unavailable. Please try again in a moment.')
    default:
      return new AppError(fallbackCode, 503, 'Unable to complete the billing request. Please try again.')
  }
}

/** One call for the common case: classify, log with context, return the safe error. */
export function handlePaddleFailure(err: unknown, ctx: PaddleErrorContext, fallbackCode = 'BILLING_ERROR'): AppError {
  const failure = classifyPaddleError(err)
  logPaddleFailure(failure, ctx)
  return toClientError(failure, fallbackCode)
}
