// ─────────────────────────────────────────────────────────────────────────────
// ai-pipeline.client.ts
// The single HTTP client for ALL AI Pipeline calls.
//
// ARCHITECTURE INVARIANTS:
// 1. Workers NEVER contain HTTP logic. All HTTP calls go through this class.
// 2. Auth headers are ALWAYS injected by this client. Workers never set auth.
// 3. Retry logic lives HERE, not in workers.
// 4. Circuit breaker lives HERE. Workers see AIPipelineCircuitOpenError.
// 5. Logs NEVER include the shared secret (X-Internal-Service-Key) or
//    full request bodies (which contain PII transcript content).
// 6. The singleton is exported from this module. Workers import the singleton.
// ─────────────────────────────────────────────────────────────────────────────

import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { CircuitBreaker, CircuitState } from './ai-pipeline.circuit-breaker';
import type {
  CleanupRequest,
  CleanupResult,
  ExtractRequest,
  ExtractionResultWithMeta,
  PartialExtractionFailure,
  ResolveRequest,
  PipelineResult,
  HealthResponse,
  ReadyResponse,
} from './ai-pipeline.types';
import {
  AIPipelineNetworkError,
  AIPipelineTimeoutError,
  AIPipelineAuthError,
  AIPipelineValidationError,
  AIPipelinePartialError,
  AIPipelineTotalFailureError,
  AIPipelineInvariantError,
  AIPipelineCircuitOpenError,
} from './ai-pipeline.errors';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

interface AIPipelineClientConfig {
  baseUrl: string;
  sharedSecret: string;
  timeoutMs: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT
// ─────────────────────────────────────────────────────────────────────────────

export class AIPipelineClient {
  private readonly axios: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly config: AIPipelineClientConfig;

  constructor(config: AIPipelineClientConfig) {
    this.config = config;

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: env.AI_PIPELINE_CIRCUIT_FAILURE_THRESHOLD,
      windowMs:         env.AI_PIPELINE_CIRCUIT_WINDOW_MS,
      openTimeoutMs:    env.AI_PIPELINE_CIRCUIT_OPEN_TIMEOUT_MS,
    });

    this.axios = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      headers: {
        'Content-Type':             'application/json',
        // Auth header always injected here — workers never touch this
        'X-Internal-Service-Key':   config.sharedSecret,
        // Identifies this caller in the AI pipeline's structured logs
        'X-Service-Name':           'vocaply-api',
      },
    });

    this.setupInterceptors();
  }

  // ─── Interceptors ──────────────────────────────────────────────────────────

  private setupInterceptors(): void {
    // REQUEST INTERCEPTOR — inject X-Request-ID, record start time
    this.axios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const requestId = crypto.randomUUID();
      config.headers['X-Request-ID'] = requestId;

      // Attach start time for latency calculation in the response interceptor
      (config as any)._startMs = Date.now();

      // SAFE log: URL, method, meeting_id only — NO auth header, NO body
      logger.info({
        event:      'ai_pipeline_request_start',
        service:    'vocaply-api',
        endpoint:   config.url,
        method:     config.method?.toUpperCase(),
        meeting_id: (config.data as any)?.meeting_id ?? null,
        request_id: requestId,
      }, 'AI Pipeline request starting');

      return config;
    });

    // RESPONSE INTERCEPTOR — log success with latency + cost
    this.axios.interceptors.response.use(
      (response) => {
        const startMs    = (response.config as any)._startMs ?? Date.now();
        const latencyMs  = Date.now() - startMs;
        const requestId  = response.config.headers['X-Request-ID'] as string;

        logger.info({
          event:      'ai_pipeline_request_complete',
          status:     response.status,
          endpoint:   response.config.url,
          request_id: requestId,
          latency_ms: latencyMs,
          // Cost extracted from response — may be null for non-LLM endpoints
          cost_usd:   response.data?.result?.total_cost?.estimated_cost_usd ?? null,
        }, 'AI Pipeline request completed');

        return response;
      },

      // ERROR INTERCEPTOR — convert all Axios errors to typed AIPipelineErrors
      (error: AxiosError) => {
        const requestId = (error.config?.headers?.['X-Request-ID'] as string) ?? null;
        let meetingId: string | null = null;

        // Safely extract meeting_id from request body (it's already been serialised)
        try {
          if (error.config?.data) {
            const body = typeof error.config.data === 'string'
              ? JSON.parse(error.config.data)
              : error.config.data;
            meetingId = body?.meeting_id ?? null;
          }
        } catch {
          // Ignore parse errors
        }

        const startMs   = (error.config as any)?._startMs ?? Date.now();
        const elapsedMs = Date.now() - startMs;

        // ── No response received (network layer failure) ──────────────────────
        if (!error.response) {
          const isTimeout =
            error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT' ||
            (error.message ?? '').toLowerCase().includes('timeout');

          if (isTimeout) {
            throw new AIPipelineTimeoutError(
              `AI Pipeline request timed out after ${elapsedMs}ms`,
              elapsedMs,
              requestId,
              meetingId
            );
          }

          throw new AIPipelineNetworkError(
            `AI Pipeline network error: ${error.code ?? error.message}`,
            error,
            requestId,
            meetingId
          );
        }

        // ── HTTP response received — classify by status + body ────────────────
        const status = error.response.status;
        const data   = error.response.data as Record<string, unknown>;

        // 401 — auth failure
        if (status === 401) {
          throw new AIPipelineAuthError(
            'Authentication failed — check AI_PIPELINE_SECRET matches FastAPI API_SHARED_SECRET',
            requestId,
            meetingId
          );
        }

        // 422 — two very different scenarios share the same HTTP status:
        //   a) Pydantic validation error (detail is an array) → non-retryable payload bug
        //   b) OpenAI total failure → retryable upstream dependency failure
        if (status === 422) {
          // Check for custom validation error envelope from middleware
          if ((data as any)?.error_code === 'VALIDATION_ERROR' && (data as any)?.details?.errors) {
            logger.error({ validationErrors: (data as any).details.errors }, 'Pydantic validation failed');
            throw new AIPipelineValidationError(
              'AI Pipeline rejected request: Pydantic validation error (check TypeScript ↔ Pydantic schema sync)',
              (data as any).details.errors,
              requestId,
              meetingId
            );
          }

          const detail = (data as any)?.detail;
          if (Array.isArray(detail)) {
            logger.error({ validationErrors: detail }, 'Pydantic validation failed');
            // Pydantic validation: the Node.js payload is structurally wrong
            throw new AIPipelineValidationError(
              'AI Pipeline rejected request: Pydantic validation error (check TypeScript ↔ Pydantic schema sync)',
              detail,
              requestId,
              meetingId
            );
          }

          // Total failure: AI pipeline is up but OpenAI call failed internally
          if ((data as any)?.success === false) {
            const resData = (data as any)?.result;
            if (resData && !resData.partial_result && resData.error_summary) {
              throw new AIPipelineTotalFailureError(resData.error_summary, requestId, meetingId);
            }
            if ((data as any)?.error?.error_code && (data as any)?.error?.error_code !== 'VALIDATION') {
              const msg = (data as any)?.error?.message ?? 'Total AI Pipeline failure (OpenAI unavailable)';
              throw new AIPipelineTotalFailureError(msg, requestId, meetingId);
            }
          }
        }

        // 206 — partial success: some chunks/detections failed
        if (status === 206) {
          const partialData = (data as any)?.result ?? (data as any)?.partial_result;
          if (!partialData) {
            // Malformed 206 response — treat as network error
            throw new AIPipelineNetworkError(
              'AI Pipeline returned HTTP 206 with no result payload',
              error,
              requestId,
              meetingId
            );
          }
          throw new AIPipelinePartialError(
            'AI Pipeline returned partial result (HTTP 206)',
            partialData,
            requestId,
            meetingId
          );
        }

        // 500 — either an invariant violation or a generic transient 500
        if (status === 500) {
          if ((data as any)?.error?.non_retryable === true) {
            // Invariant violation: ALERT IMMEDIATELY
            logger.fatal({
              event:         'ai_pipeline_invariant_error',
              request_id:    requestId,
              meeting_id:    meetingId,
              error_code:    (data as any)?.error?.error_code,
              error_message: (data as any)?.error?.message,
            }, '🚨 AI Pipeline invariant error — internal bug detected, page on-call NOW');

            throw new AIPipelineInvariantError(
              `AI Pipeline invariant error: ${(data as any)?.error?.message ?? 'unknown'}`,
              requestId,
              meetingId
            );
          }

          // Generic 500 — treat as transient network error (retryable)
          throw new AIPipelineNetworkError(
            `AI Pipeline returned generic HTTP 500: ${(data as any)?.error?.message ?? 'Internal Server Error'}`,
            error,
            requestId,
            meetingId
          );
        }

        // Any other status — unexpected, treat as network error
        throw new AIPipelineNetworkError(
          `Unexpected HTTP ${status} from AI Pipeline`,
          error,
          requestId,
          meetingId
        );
      }
    );
  }

  // ─── Retry + Circuit Breaker Wrapper ──────────────────────────────────────

  /**
   * Executes an action with exponential backoff + jitter retry logic,
   * wrapped in the circuit breaker.
   *
   * Retry is only performed if error.isRetryable === true.
   * AIPipelineCircuitOpenError is NEVER retried here — the worker handles parking.
   */
  private async executeWithRetry<T>(action: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.config.retryAttempts) {
      try {
        return await this.circuitBreaker.execute(action);
      } catch (error: unknown) {
        lastError = error;

        // Circuit open — propagate immediately; let the worker handle parking
        if (error instanceof AIPipelineCircuitOpenError) {
          throw error;
        }

        // Non-retryable errors — propagate immediately, no more attempts
        const isRetryable = (error as any)?.isRetryable === true;
        if (!isRetryable) {
          throw error;
        }

        // Exhausted all attempts
        if (attempt >= this.config.retryAttempts) {
          break;
        }

        // Compute delay: exponential + jitter, capped at retryMaxDelayMs
        const delay = Math.min(
          this.config.retryBaseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
          this.config.retryMaxDelayMs
        );

        attempt++;

        logger.warn({
          event:       'ai_pipeline_retry',
          attempt,
          max:         this.config.retryAttempts,
          error_type:  (error as any)?.constructor?.name ?? 'Unknown',
          error_msg:   (error as Error)?.message,
          delay_ms:    Math.round(delay),
          circuit_state: this.circuitBreaker.getState(),
        }, `AI Pipeline request failed — retrying (attempt ${attempt}/${this.config.retryAttempts})`);

        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted — log final failure and propagate
    logger.error({
      event:      'ai_pipeline_request_failed',
      attempts:   attempt,
      error_type: (lastError as any)?.constructor?.name ?? 'Unknown',
      error_msg:  (lastError as Error)?.message,
    }, 'AI Pipeline request failed after all retries');

    throw lastError;
  }

  // ─── Public Methods ────────────────────────────────────────────────────────

  /**
   * POST /transcripts/cleanup
   * Cleans a raw Recall.ai transcript: removes fillers, normalizes speech, maps speakers.
   *
   * @param request - Cleanup request with raw transcript and participant map
   * @param customTimeoutMs - Override default timeout (60s recommended for cleanup)
   * @returns Cleaned transcript with metadata
   * @throws AIPipelineNetworkError | AIPipelineTimeoutError | AIPipelineAuthError |
   *         AIPipelineValidationError | AIPipelineInvariantError | AIPipelineCircuitOpenError
   */
  public async cleanup(
    request: CleanupRequest,
    customTimeoutMs?: number
  ): Promise<CleanupResult> {
    return this.executeWithRetry(async () => {
      const response = await this.axios.post<CleanupResult>('/api/v1/transcripts/cleanup', request, {
        timeout: customTimeoutMs ?? this.config.timeoutMs,
      });
      return response.data;
    });
  }

  /**
   * POST /extract
   * Extracts commitments, action items, decisions, and blockers from a cleaned transcript.
   *
   * @returns ExtractionResultWithMeta on HTTP 200
   * @throws AIPipelinePartialError (.partialResult available) on HTTP 206
   * @throws AIPipelineTotalFailureError on HTTP 422 (OpenAI failure)
   * @throws AIPipelineNetworkError | AIPipelineTimeoutError | AIPipelineAuthError |
   *         AIPipelineValidationError | AIPipelineInvariantError | AIPipelineCircuitOpenError
   */
  public async extract(request: ExtractRequest): Promise<ExtractionResultWithMeta> {
    return this.executeWithRetry(async () => {
      const response = await this.axios.post<{ result: ExtractionResultWithMeta }>('/api/v1/extract', request);
      // The result field contains the ExtractionResultWithMeta
      return response.data.result;
    });
  }

  /**
   * POST /resolve
   * Resolves new commitments against historical PENDING/DEFERRED ones.
   *
   * @returns PipelineResult on HTTP 200
   * @throws AIPipelinePartialError (.partialResult available) on HTTP 206
   * @throws AIPipelineTotalFailureError on HTTP 422 (OpenAI failure)
   * @throws AIPipelineNetworkError | AIPipelineTimeoutError | AIPipelineAuthError |
   *         AIPipelineValidationError | AIPipelineInvariantError | AIPipelineCircuitOpenError
   */
  public async resolve(request: ResolveRequest): Promise<PipelineResult> {
    return this.executeWithRetry(async () => {
      const response = await this.axios.post<{ result: PipelineResult }>('/api/v1/resolve', request);
      return response.data.result;
    });
  }

  /**
   * GET /health — liveness probe
   * Returns {status: 'ok'} when the AI pipeline process is alive.
   * Short timeout (2s) — no retries — used by health monitoring only.
   */
  public async health(): Promise<HealthResponse> {
    // Health checks bypass retry and circuit breaker — they're probes, not business calls
    const response = await this.axios.get<HealthResponse>('/health', { timeout: 2_000 });
    return response.data;
  }

  /**
   * GET /ready — readiness probe
   * Returns AI pipeline's own dependency health (MongoDB, Redis, OpenAI).
   * Short timeout (2s) — no retries.
   *
   * @param options.timeoutMs - Override for health check timeout (default 2000ms)
   */
  public async ready(options?: { timeoutMs?: number }): Promise<ReadyResponse> {
    const response = await this.axios.get<ReadyResponse>('/ready', {
      timeout: options?.timeoutMs ?? 2_000,
    });
    return response.data;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON — imported by all workers
//
// Instantiated once at module load from validated env vars (via env.ts Zod schema).
// Using env.* (validated) not process.env.* (raw strings) ensures fail-fast at startup.
// ─────────────────────────────────────────────────────────────────────────────
export const aipipelineClient = new AIPipelineClient({
  baseUrl:          env.AI_PIPELINE_URL,
  sharedSecret:     env.AI_PIPELINE_SECRET,
  timeoutMs:        env.AI_PIPELINE_TIMEOUT_MS,
  retryAttempts:    env.AI_PIPELINE_MAX_RETRIES,
  retryBaseDelayMs: env.AI_PIPELINE_RETRY_BASE_DELAY_MS,
  retryMaxDelayMs:  30_000,
});
