// ─────────────────────────────────────────────────────────────────────────────
// team-slug-test-env.ts — MUST be the FIRST import of the workspace-slug DB test.
//
// SAFETY: that test TRUNCATEs users/teams. It is hard-pinned to a throwaway LOCAL Postgres
// (127.0.0.1:<port>/rapto_slug_test). Any other DATABASE_URL — including the one in .env — is
// overridden, and this module throws if the resulting URL is not such a database.
//
//   docker run -d --name rapto-slug-test-pg -e POSTGRES_PASSWORD=slugtest -e POSTGRES_DB=rapto_slug_test \
//     -p 127.0.0.1:15442:5432 postgres:16-alpine
//   (schema: `prisma db push`, then run prisma/migrations/20261114000000_*/migration.sql)
//
// NB: on Windows, ports 55368–55867 are often reserved by Hyper-V/WSL and cannot be bound.
// ─────────────────────────────────────────────────────────────────────────────

const TEST_DB =
  process.env.TEST_SLUG_DATABASE_URL ?? 'postgresql://postgres:slugtest@127.0.0.1:15442/rapto_slug_test'

if (!/@(127\.0\.0\.1|localhost):\d+\/rapto_slug_test$/.test(TEST_DB)) {
  throw new Error('team-slug-test-env: refusing to run — database must be a local rapto_slug_test database')
}

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = TEST_DB
process.env.DIRECT_URL = TEST_DB
process.env.BREVO_API_KEY = ''
process.env.MONGODB_URL = 'mongodb://127.0.0.1:1/unused'
process.env.REDIS_URL = 'redis://127.0.0.1:1' // never contacted: the test installs an in-memory redis
process.env.JWT_ACCESS_SECRET = 'slug-test-access-secret-32-bytes-minimum!!!'
process.env.JWT_REFRESH_SECRET = 'slug-test-refresh-secret-32-bytes-minimum!!'
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
