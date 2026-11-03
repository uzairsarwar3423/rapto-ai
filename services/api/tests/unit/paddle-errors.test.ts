import '../support/billing-test-env'
import { ApiError } from '@paddle/paddle-node-sdk'
import { classifyPaddleError, toClientError, handlePaddleFailure } from '../../src/services/paddle.errors'

const api = (code: string, detail = 'detail', type = 'request_error', retryAfter: number | null = null, errors?: any[]) =>
  new ApiError({ type, code, detail, documentation_url: 'https://developer.paddle.com/errors/x', ...(errors ? { errors } : {}) } as any, retryAfter)

describe('classifyPaddleError (real SDK ApiError objects)', () => {
  it.each([
    ['forbidden', 'permission'],
    ['authentication_missing', 'permission'],
    ['authentication_malformed', 'permission'],
    ['invalid_token', 'permission'],
    ['not_found', 'not_found'],
    ['conflict', 'conflict'],
    ['customer_already_exists', 'conflict'],
    ['invalid_field', 'validation'],
    ['bad_request', 'validation'],
    ['too_many_requests', 'rate_limited'],
    ['subscription_immediate_charge_hour_limit_exceeded', 'rate_limited'],
    ['internal_error', 'upstream'],
    ['bad_gateway', 'upstream'],
    ['service_unavailable', 'upstream'],
    ['temporarily_unavailable', 'upstream'],
  ])('%s → %s', (code, kind) => {
    expect(classifyPaddleError(api(code)).kind).toBe(kind)
  })

  it('403 forbidden is permanent: never retryable (no retry of permission errors)', () => {
    expect(classifyPaddleError(api('forbidden')).retryable).toBe(false)
    expect(classifyPaddleError(api('not_found')).retryable).toBe(false)
    expect(classifyPaddleError(api('invalid_field')).retryable).toBe(false)
    expect(classifyPaddleError(api('too_many_requests', 'x', 'api_error', 30)).retryable).toBe(true)
    expect(classifyPaddleError(api('internal_error', 'x', 'api_error')).retryable).toBe(true)
  })

  it('a field-error array classifies as validation even with an unknown code', () => {
    expect(classifyPaddleError(api('weird_code', 'x', 'request_error', null, [{ field: 'email', message: 'bad' }])).kind).toBe('validation')
  })

  it('preserves the upstream code/type/detail/retryAfter for internal diagnostics', () => {
    const f = classifyPaddleError(api('too_many_requests', 'Too many requests', 'api_error', 42))
    expect(f).toMatchObject({ code: 'too_many_requests', type: 'api_error', detail: 'Too many requests', retryAfter: 42 })
  })

  it('non-Paddle errors: timeouts and network failures are retryable, anything else is unknown/permanent', () => {
    expect(classifyPaddleError(new Error('paddle.customers.create timed out after 8000ms')).kind).toBe('timeout')
    expect(classifyPaddleError(new Error('connect ECONNREFUSED 1.2.3.4:443')).kind).toBe('network')
    expect(classifyPaddleError(new Error('boom')).kind).toBe('unknown')
  })
})

describe('toClientError — safe, specific, never 502/504, never leaks provider detail', () => {
  const secret = 'Authorization pdl_live_apikey_SECRET at https://api.paddle.com/customers'
  const cases: Array<[string, number, string]> = [
    ['forbidden', 503, 'BILLING_UNAVAILABLE'],
    ['authentication_malformed', 503, 'BILLING_UNAVAILABLE'],
    ['not_found', 404, 'BILLING_ACCOUNT_NOT_FOUND'],
    ['conflict', 409, 'BILLING_CONFLICT'],
    ['invalid_field', 422, 'BILLING_REQUEST_INVALID'],
    ['too_many_requests', 429, 'BILLING_RATE_LIMITED'],
    ['internal_error', 503, 'BILLING_UPSTREAM_UNAVAILABLE'],
  ]
  it.each(cases)('%s → HTTP %i %s', (code, status, appCode) => {
    const e = handlePaddleFailure(api(code, secret, code === 'too_many_requests' || code === 'internal_error' ? 'api_error' : 'request_error', code === 'too_many_requests' ? 30 : null), { operation: 't' })
    expect(e.statusCode).toBe(status)
    expect(e.code).toBe(appCode)
    expect([502, 504]).not.toContain(e.statusCode)
    expect(JSON.stringify({ m: e.message, d: e.details })).not.toMatch(/pdl_|paddle\.com|Authorization|SECRET/i)
  })

  it('429 carries retryAfter for the Retry-After header', () => {
    const e = toClientError(classifyPaddleError(api('too_many_requests', 'x', 'api_error', 30)), 'X')
    expect(e.details).toEqual({ retryAfter: 30 })
  })

  it('timeouts and network errors are 503 (retryable) not 504', () => {
    expect(toClientError(classifyPaddleError(new Error('x timed out after 8000ms')), 'X').statusCode).toBe(503)
    expect(toClientError(classifyPaddleError(new Error('ECONNRESET')), 'X').statusCode).toBe(503)
  })
})

describe('redaction — credential-shaped text never survives into diagnostics', () => {
  it('scrubs API keys, bearer tokens and secret assignments from upstream detail', () => {
    const f = classifyPaddleError(api('forbidden', 'Authorization: Bearer pdl_live_apikey_01ABCDEF_x_y api_key=pdl_sdbx_apikey_zzz secret: hunter2'))
    expect(f.detail).not.toMatch(/pdl_|hunter2|01ABCDEF/)
    expect(f.detail).toMatch(/\[redacted\]/)
  })
  it('caps very long details', () => {
    expect(classifyPaddleError(api('forbidden', 'x'.repeat(5000))).detail!.length).toBeLessThanOrEqual(300)
  })
})
