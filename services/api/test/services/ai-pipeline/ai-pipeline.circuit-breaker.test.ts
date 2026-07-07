// ─────────────────────────────────────────────────────────────────────────────
// ai-pipeline.circuit-breaker.test.ts
// Unit tests for the three-state circuit breaker.
//
// TEST MATRIX:
//   ✅ 5 consecutive qualifying failures → OPEN
//   ✅ Non-qualifying failures (auth, validation) do NOT count
//   ✅ 30s elapsed → HALF_OPEN
//   ✅ Successful probe → CLOSED
//   ✅ Failed probe → back to OPEN
//   ✅ Concurrent HALF_OPEN probes are blocked
//   ✅ Failures outside the window don't count
//   ✅ Failure count resets after sliding window expires
// ─────────────────────────────────────────────────────────────────────────────

import { CircuitBreaker, CircuitState } from '../../src/services/ai-pipeline/ai-pipeline.circuit-breaker'
import {
  AIPipelineNetworkError,
  AIPipelineTimeoutError,
  AIPipelineAuthError,
  AIPipelineValidationError,
  AIPipelineCircuitOpenError,
} from '../../src/services/ai-pipeline/ai-pipeline.errors'

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Creates a network error that counts as a circuit failure */
function makeNetworkError(): AIPipelineNetworkError {
  return new AIPipelineNetworkError('network failure', {} as any, null, null)
}

/** Creates a timeout error that counts as a circuit failure */
function makeTimeoutError(): AIPipelineTimeoutError {
  return new AIPipelineTimeoutError('timeout', 5000, null, null)
}

/** Creates an auth error that does NOT count as a circuit failure */
function makeAuthError(): AIPipelineAuthError {
  return new AIPipelineAuthError('auth failed', null, null)
}

/**
 * Simulates N consecutive failures through the circuit breaker.
 * Returns the last error thrown.
 */
async function simulateFailures(
  cb: CircuitBreaker,
  count: number,
  errorFactory = makeNetworkError
): Promise<void> {
  for (let i = 0; i < count; i++) {
    try {
      await cb.execute(async () => { throw errorFactory() })
    } catch {
      // Expected
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // ─── Initial state ─────────────────────────────────────────────────────────
  describe('initial state', () => {
    it('starts in CLOSED state', () => {
      const cb = new CircuitBreaker({ failureThreshold: 5, windowMs: 60_000, openTimeoutMs: 30_000 })
      expect(cb.getState()).toBe(CircuitState.CLOSED)
    })

    it('allows calls through when CLOSED', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 5, windowMs: 60_000, openTimeoutMs: 30_000 })
      const result = await cb.execute(async () => 'hello')
      expect(result).toBe('hello')
    })
  })

  // ─── CLOSED → OPEN transition ─────────────────────────────────────────────
  describe('CLOSED → OPEN transition', () => {
    it('opens after failureThreshold consecutive qualifying failures', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, openTimeoutMs: 30_000 })

      await simulateFailures(cb, 3)

      expect(cb.getState()).toBe(CircuitState.OPEN)
    })

    it('throws AIPipelineCircuitOpenError when OPEN', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, openTimeoutMs: 30_000 })
      await simulateFailures(cb, 3)

      await expect(cb.execute(async () => 'ok')).rejects.toBeInstanceOf(AIPipelineCircuitOpenError)
    })

    it('does NOT count AIPipelineAuthError toward failure threshold', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, openTimeoutMs: 30_000 })
      await simulateFailures(cb, 5, makeAuthError)

      // Auth errors don't count — still CLOSED
      expect(cb.getState()).toBe(CircuitState.CLOSED)
    })

    it('does NOT count AIPipelineValidationError toward failure threshold', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, openTimeoutMs: 30_000 })

      const validationError = () => new AIPipelineValidationError('bad payload', [], null, null)
      await simulateFailures(cb, 5, validationError)

      expect(cb.getState()).toBe(CircuitState.CLOSED)
    })

    it('counts AIPipelineTimeoutError toward failure threshold', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, openTimeoutMs: 30_000 })
      await simulateFailures(cb, 3, makeTimeoutError)

      expect(cb.getState()).toBe(CircuitState.OPEN)
    })

    it('does not open if failures are spread across 2x windows (sliding window)', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 10_000, openTimeoutMs: 30_000 })

      // 2 failures at t=0
      await simulateFailures(cb, 2)
      expect(cb.getState()).toBe(CircuitState.CLOSED)

      // Advance past the window
      jest.advanceTimersByTime(11_000)

      // 2 more failures — first 2 are now outside the window
      await simulateFailures(cb, 2)

      // Still CLOSED: only 2 failures in the current window (threshold is 3)
      expect(cb.getState()).toBe(CircuitState.CLOSED)
    })
  })

  // ─── OPEN → HALF_OPEN transition ──────────────────────────────────────────
  describe('OPEN → HALF_OPEN transition', () => {
    it('transitions to HALF_OPEN after openTimeoutMs has elapsed', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, openTimeoutMs: 30_000 })
      await simulateFailures(cb, 3)
      expect(cb.getState()).toBe(CircuitState.OPEN)

      jest.advanceTimersByTime(30_001)

      expect(cb.getState()).toBe(CircuitState.HALF_OPEN)
    })

    it('stays OPEN before openTimeoutMs has elapsed', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, openTimeoutMs: 30_000 })
      await simulateFailures(cb, 3)

      jest.advanceTimersByTime(29_999)

      expect(cb.getState()).toBe(CircuitState.OPEN)
    })
  })

  // ─── HALF_OPEN → CLOSED (successful probe) ────────────────────────────────
  describe('HALF_OPEN → CLOSED (successful probe)', () => {
    it('closes the circuit on a successful probe call', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, openTimeoutMs: 30_000 })
      await simulateFailures(cb, 3)
      jest.advanceTimersByTime(30_001)
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN)

      await cb.execute(async () => 'probe success')

      expect(cb.getState()).toBe(CircuitState.CLOSED)
    })

    it('resets failure history after closing (clean slate)', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, openTimeoutMs: 30_000 })
      await simulateFailures(cb, 3)
      jest.advanceTimersByTime(30_001)
      await cb.execute(async () => 'probe')

      expect(cb.getState()).toBe(CircuitState.CLOSED)

      // 2 new failures should not open the circuit (counter was reset)
      await simulateFailures(cb, 2)
      expect(cb.getState()).toBe(CircuitState.CLOSED)
    })
  })

  // ─── HALF_OPEN → OPEN (failed probe) ──────────────────────────────────────
  describe('HALF_OPEN → OPEN (failed probe)', () => {
    it('re-opens the circuit on a failed probe', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, openTimeoutMs: 30_000 })
      await simulateFailures(cb, 3)
      jest.advanceTimersByTime(30_001)

      try {
        await cb.execute(async () => { throw makeNetworkError() })
      } catch {
        // Expected
      }

      expect(cb.getState()).toBe(CircuitState.OPEN)
    })

    it('resets the OPEN timeout after a failed probe', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, openTimeoutMs: 30_000 })
      await simulateFailures(cb, 3)
      jest.advanceTimersByTime(30_001)  // → HALF_OPEN

      try {
        await cb.execute(async () => { throw makeNetworkError() })
      } catch {}
      // → OPEN again

      // NOT enough time yet for second window
      jest.advanceTimersByTime(25_000)
      expect(cb.getState()).toBe(CircuitState.OPEN)

      // Full second window elapsed → HALF_OPEN again
      jest.advanceTimersByTime(5_001)
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN)
    })
  })

  // ─── Concurrent HALF_OPEN probe guard ─────────────────────────────────────
  describe('concurrent HALF_OPEN probe guard', () => {
    it('blocks concurrent calls while a probe is in flight', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, openTimeoutMs: 30_000 })
      await simulateFailures(cb, 3)
      jest.advanceTimersByTime(30_001)

      // Start a long-running probe
      const slowProbe = cb.execute(
        () => new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 1000))
      )

      // Second concurrent call should be immediately rejected
      await expect(cb.execute(async () => 'concurrent')).rejects.toBeInstanceOf(AIPipelineCircuitOpenError)

      // Let the probe complete
      jest.runAllTimers()
      await slowProbe
    })
  })

  // ─── Full cycle ────────────────────────────────────────────────────────────
  describe('full CLOSED → OPEN → HALF_OPEN → CLOSED cycle', () => {
    it('completes a full recovery cycle', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 5, windowMs: 60_000, openTimeoutMs: 30_000 })

      // Phase 1: Normal operation
      expect(cb.getState()).toBe(CircuitState.CLOSED)
      await expect(cb.execute(async () => 'healthy')).resolves.toBe('healthy')

      // Phase 2: Service degrades → 5 network failures → OPEN
      await simulateFailures(cb, 5)
      expect(cb.getState()).toBe(CircuitState.OPEN)

      // Phase 3: Calls are blocked while OPEN
      await expect(cb.execute(async () => 'blocked')).rejects.toBeInstanceOf(AIPipelineCircuitOpenError)

      // Phase 4: Timeout elapses → HALF_OPEN
      jest.advanceTimersByTime(30_001)
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN)

      // Phase 5: Successful probe → CLOSED
      await cb.execute(async () => 'recovered')
      expect(cb.getState()).toBe(CircuitState.CLOSED)

      // Phase 6: Normal operation resumed
      await expect(cb.execute(async () => 'back to normal')).resolves.toBe('back to normal')
    })
  })
})
