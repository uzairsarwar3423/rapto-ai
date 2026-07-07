// ─────────────────────────────────────────────────────────────────────────────
// ai-pipeline.circuit-breaker.ts
// Three-state circuit breaker: CLOSED → OPEN → HALF_OPEN → CLOSED
//
// DESIGN PRINCIPLES:
// 1. Failure window: only failures within the last WINDOW_MS count toward the
//    threshold. A spike of 5 errors followed by 1h of silence does not reopen.
// 2. Failure scope: only AIPipelineNetworkError and AIPipelineTimeoutError
//    count as circuit failures. OpenAI-level failures (TotalFailure) mean the
//    AI pipeline SERVICE IS UP — the circuit should stay CLOSED.
// 3. HALF_OPEN probe: only ONE call is allowed through when probing.
//    Concurrent calls during HALF_OPEN are rejected (circuit stays half-open)
//    until the probe settles.
// 4. Alert on OPEN: the circuit breaker emits a CRITICAL structured log that
//    monitoring systems can alert on. An open circuit = an on-call page.
// ─────────────────────────────────────────────────────────────────────────────

import { AIPipelineCircuitOpenError } from './ai-pipeline.errors';
import { AIPipelineNetworkError, AIPipelineTimeoutError } from './ai-pipeline.errors';
import { logger } from '../../config/logger';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export enum CircuitState {
  CLOSED    = 'CLOSED',
  OPEN      = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerConfig {
  /** Number of qualifying failures within windowMs that trips the circuit */
  failureThreshold: number;
  /** Sliding window (ms) for failure counting — failures outside this window are ignored */
  windowMs: number;
  /** How long (ms) the circuit stays OPEN before probing (HALF_OPEN) */
  openTimeoutMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CIRCUIT BREAKER
// ─────────────────────────────────────────────────────────────────────────────

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  /** Timestamps (epoch ms) of recent qualifying failures — used for sliding window */
  private readonly failureTimestamps: number[] = [];
  /** Epoch ms when the circuit opened — used to calculate probe timing */
  private openedAt: number = 0;
  /** True while a HALF_OPEN probe call is in flight — rejects concurrent probes */
  private probing: boolean = false;

  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  public getState(): CircuitState {
    // Lazily check if the OPEN timeout has elapsed — transition to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.openedAt + this.config.openTimeoutMs) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }
    return this.state;
  }

  /**
   * Execute an action through the circuit breaker.
   * - CLOSED: runs the action, tracks failures
   * - OPEN: throws AIPipelineCircuitOpenError immediately (no network call)
   * - HALF_OPEN: allows ONE probe through; concurrent calls are rejected
   */
  public async execute<T>(action: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitState.OPEN) {
      const waitMs = Math.max(0, this.openedAt + this.config.openTimeoutMs - Date.now());
      throw new AIPipelineCircuitOpenError('AI pipeline circuit is OPEN — call blocked', waitMs);
    }

    if (currentState === CircuitState.HALF_OPEN) {
      if (this.probing) {
        // Another probe is in flight — reject this call, don't dogpile
        const waitMs = Math.max(0, this.openedAt + this.config.openTimeoutMs - Date.now());
        throw new AIPipelineCircuitOpenError(
          'AI pipeline circuit is HALF_OPEN — probe in flight, call blocked',
          waitMs
        );
      }
      this.probing = true;
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error: unknown) {
      this.onFailure(error);
      throw error;
    } finally {
      // Always release the probe lock, even if it failed
      if (this.state === CircuitState.HALF_OPEN || currentState === CircuitState.HALF_OPEN) {
        this.probing = false;
      }
    }
  }

  // ─── State Transition Handlers ──────────────────────────────────────────────

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      // Probe succeeded — service is back. Close the circuit.
      this.transitionTo(CircuitState.CLOSED);
    } else if (this.state === CircuitState.CLOSED) {
      // Prune stale failures from the sliding window on every success
      this.pruneExpiredFailures();
    }
  }

  private onFailure(error: unknown): void {
    // Only count infrastructure failures (service unreachable / timed out)
    // NOT OpenAI failures, NOT auth errors, NOT validation errors
    const isCircuitFailure =
      error instanceof AIPipelineNetworkError ||
      error instanceof AIPipelineTimeoutError;

    if (!isCircuitFailure) return;

    const now = Date.now();
    this.failureTimestamps.push(now);

    if (this.state === CircuitState.HALF_OPEN) {
      // Probe failed — back to OPEN, reset the timeout
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    if (this.state === CircuitState.CLOSED) {
      // Count failures within the sliding window
      this.pruneExpiredFailures();
      if (this.failureTimestamps.length >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  private pruneExpiredFailures(): void {
    const windowStart = Date.now() - this.config.windowMs;
    // Remove failures older than the window
    while (this.failureTimestamps.length > 0 && this.failureTimestamps[0] < windowStart) {
      this.failureTimestamps.shift();
    }
  }

  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;

    if (newState === CircuitState.OPEN) {
      this.openedAt = Date.now();
      this.probing = false;
      // CRITICAL — this log line is the monitoring alert trigger
      logger.error(
        {
          event:           'ai_pipeline_circuit_open',
          previousState,
          failureCount:    this.failureTimestamps.length,
          failureThreshold: this.config.failureThreshold,
          windowMs:        this.config.windowMs,
          openTimeoutMs:   this.config.openTimeoutMs,
          reopensAt:       new Date(this.openedAt + this.config.openTimeoutMs).toISOString(),
        },
        '🔴 AI Pipeline circuit breaker OPENED — all AI calls are blocked. Page on-call.'
      );
    } else if (newState === CircuitState.HALF_OPEN) {
      logger.warn(
        {
          event:        'ai_pipeline_circuit_half_open',
          previousState,
          openedAt:     new Date(this.openedAt).toISOString(),
        },
        '🟡 AI Pipeline circuit breaker HALF_OPEN — probing with next call'
      );
    } else if (newState === CircuitState.CLOSED) {
      this.failureTimestamps.length = 0; // Clear failure history on recovery
      this.probing = false;
      logger.info(
        {
          event:         'ai_pipeline_circuit_closed',
          previousState,
          openDurationMs: Date.now() - this.openedAt,
        },
        '🟢 AI Pipeline circuit breaker CLOSED — service recovered'
      );
    }
  }
}
