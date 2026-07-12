import { logger } from './logger'

// ─────────────────────────────────────────────────────────────────────────────
// Metrics Configuration
// Centralized registry for application metrics. 
// In the future this can be wired up to prom-client for Prometheus + Grafana.
// For now, it emits structured logs that can be parsed by log aggregators.
// ─────────────────────────────────────────────────────────────────────────────

export const metrics = {
  increment: (counterName: string, value: number = 1, tags: Record<string, string | undefined> = {}) => {
    // Emit a structured log line that metrics aggregators can pick up
    logger.info({
      event: 'metric.increment',
      metric: counterName,
      value,
      ...tags
    })
  }
}
