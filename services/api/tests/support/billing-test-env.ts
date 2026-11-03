// ─────────────────────────────────────────────────────────────────────────────
// billing-test-env.ts — MUST be the FIRST import of every DB-backed billing test.
//
// SAFETY: these tests TRUNCATE tables. They are hard-pinned to the throwaway local Postgres
// (127.0.0.1:55432/rapto_payment_test). Any other DATABASE_URL — including the one in .env — is overridden,
// and the module throws if the resulting URL is not that database. No production credentials are ever used.
// ─────────────────────────────────────────────────────────────────────────────

const TEST_DB =
  process.env.TEST_BILLING_DATABASE_URL ?? 'postgresql://postgres:paymenttest@127.0.0.1:55432/rapto_payment_test'

if (!/@(127\.0\.0\.1|localhost):\d+\/rapto_payment_test$/.test(TEST_DB)) {
  throw new Error('billing-test-env: refusing to run — database must be a local rapto_payment_test database')
}

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = TEST_DB
process.env.DIRECT_URL = TEST_DB
process.env.MONGODB_URL = 'mongodb://127.0.0.1:1/unused'
process.env.REDIS_URL = 'redis://127.0.0.1:1' // never contacted: tests install an in-memory redis
process.env.JWT_ACCESS_SECRET = 'billing-test-access-secret-32-bytes-minimum!!'
process.env.JWT_REFRESH_SECRET = 'billing-test-refresh-secret-32-bytes-minimum!'
process.env.PADDLE_API_KEY = 'pdl_sdbx_apikey_TESTONLY_not_a_real_key'
process.env.PADDLE_ENVIRONMENT = 'sandbox'
process.env.PADDLE_WEBHOOK_SECRET = 'pdl_ntfset_TESTONLY_webhook_secret'
process.env.PADDLE_PRICE_STARTER_M = 'pri_starter_m'
process.env.PADDLE_PRICE_STARTER_Y = 'pri_starter_y'
process.env.PADDLE_PRICE_GROWTH_M = 'pri_growth_m'
process.env.PADDLE_PRICE_GROWTH_Y = 'pri_growth_y'
process.env.PADDLE_PRICE_BUSINESS_M = 'pri_business_m'
process.env.PADDLE_PRICE_BUSINESS_Y = 'pri_business_y'

export const TEST_DATABASE_URL = TEST_DB
