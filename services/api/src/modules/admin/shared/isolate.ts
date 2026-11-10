import { logger } from '../../../config/logger'

/**
 * Failure isolation for NON-CRITICAL parts of a composite response (health score, integrations, MRR history).
 *
 * A bad moment in one of them — an error OR a slow dependency — yields `fallback` and a warning log; the endpoint
 * itself never 500s and never hangs because of it. The core record (the user / team row) is NOT wrapped: if that
 * fails, the request should fail.
 */
export async function isolate<T>(label: string, work: () => Promise<T>, fallback: T, timeoutMs = 2_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } catch (err: any) {
    logger.warn({ part: label, err: err?.message }, 'admin detail: non-critical part failed — serving fallback')
    return fallback
  } finally {
    if (timer) clearTimeout(timer)
  }
}
