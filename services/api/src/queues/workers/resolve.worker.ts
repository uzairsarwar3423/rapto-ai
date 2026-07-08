// ─────────────────────────────────────────────────────────────────────────────
// resolve.worker.ts
// BullMQ worker: resolve queue → /resolve → PostgreSQL updates → Socket.io
//
// FLOW:
//  1. Fetch new_commitments for this meeting from PostgreSQL
//  2. Fetch historical commitments (PENDING/DEFERRED, tenant-scoped, other meetings)
//     with owner_name enrichment via joined User records
//  3. Fetch team_timezone from team settings
//  4. Build ResolveRequest and call AI Pipeline /resolve (30s timeout)
//  5. On HTTP 200: single PostgreSQL transaction —
//       - UPDATE resolved commitments → status=FULFILLED (with audit fields)
//       - UPDATE referenced-but-not-resolved commitments (reference_count++)
//       - UPDATE new commitments with enriched normalized_text + dedup_key
//       - UPDATE meeting → status=RESOLVED, resolution_complete=true
//  6. On HTTP 206: apply confirmed resolutions, park failed IDs in pending_detections
//  7. On AIPipelineCircuitOpenError: park the Bull job with a delay
//  8. On total failure: fail the job so Bull retries
//  9. Emit Socket.io events: meeting:resolved + commitment:fulfilled per owner
//
// TENANT SAFETY: every UPDATE includes AND team_id=$teamId — never update
//   another tenant's commitment regardless of how the AI pipeline responds.
//
// QUEUE CONFIG: concurrency=5, retries=3, backoff=exponential(5s)
// ─────────────────────────────────────────────────────────────────────────────

import { Worker, Job, DelayedError } from 'bullmq'
import { logger } from '../../config/logger'
import { prisma } from '../../db/client'
import { aipipelineClient } from '../../services/ai-pipeline/ai-pipeline.client'
import {
  ResolveRequest,
  HistoricalCommitment,
  ParsedCommitment,
  PipelineResult,
  NotResolvedReference,
  ResolvedCommitmentUpdate,
} from '../../services/ai-pipeline/ai-pipeline.types'
import {
  AIPipelinePartialError,
  AIPipelineTotalFailureError,
  AIPipelineCircuitOpenError,
} from '../../services/ai-pipeline/ai-pipeline.errors'
import { SERVER_EVENTS } from '../../realtime/socket.events'
import { teamRoom, userRoom } from '../../realtime/rooms.manager'
import { ResolveJobData } from '../jobs/resolve.job'

// ─────────────────────────────────────────────────────────────────────────────
// WORKER
// ─────────────────────────────────────────────────────────────────────────────

export const resolveWorker = new Worker<ResolveJobData>(
  'resolve',
  async (job: Job<ResolveJobData>) => {
    const { meetingId, teamId, partial_extraction } = job.data

    logger.info(
      { jobId: job.id, meetingId, teamId, partial_extraction },
      'resolve.worker: starting'
    )

    // ── STEP 1: Fetch new_commitments for THIS meeting ─────────────────────
    // These were just inserted by extract.worker.
    const newCommitmentRecords = await prisma.commitment.findMany({
      where:   { meetingId, teamId },
      include: { owner: { select: { id: true, name: true } } },
    })

    if (newCommitmentRecords.length === 0) {
      logger.info(
        { jobId: job.id, meetingId },
        'resolve.worker: no commitments extracted for this meeting — skipping resolution'
      )
      await prisma.meeting.update({
        where: { id: meetingId },
        data:  { status: 'RESOLVED', resolutionComplete: true },
      })
      return
    }

    const newCommitments: ParsedCommitment[] = newCommitmentRecords.map((c) => ({
      text:             c.text,
      // Use the actual owner name from the joined User record, not the raw ownerId
      owner_name:       c.owner?.name ?? c.ownerId,
      due_date_raw:     c.dueDateRaw ?? null,
      due_date_utc:     c.dueDate ? c.dueDate.toISOString() : null,
      confidence:       c.confidenceScore ?? 0,
      normalized_text:  c.normalizedText ?? c.text,
      dedup_key:        c.dedupKey ?? '',
      calibration_flag: null,
      due_date_resolution: null,
    }))

    // ── STEP 2: Fetch historical commitments ───────────────────────────────
    // Critical query constraints:
    //   a. PENDING or DEFERRED only (not FULFILLED, MISSED, CANCELLED)
    //   b. Tenant-scoped: teamId matches
    //   c. NOT from this meeting (those are new, not historical)
    //   d. Owner-scoped optimization: only fetch for owners who made new commitments
    //      (reduces network payload — the resolver is already owner-scoped)
    //   e. Capped at 500 per the integration spec
    //
    // NOTE on owner filtering: we use owner IDs of new commitments to pre-filter.
    // If an ownerId is 'unknown' (unresolved speaker), we don't filter by that.
    const knownOwnerIds = [
      ...new Set(
        newCommitmentRecords
          .map((c) => c.ownerId)
          .filter((id) => id && id !== 'unknown')
      ),
    ]

    const historicalRecords = await prisma.commitment.findMany({
      where: {
        teamId,
        meetingId: { not: meetingId },
        status:    { in: ['PENDING', 'DEFERRED'] },
        // Only filter by owner if we have known owners — otherwise fetch all
        ...(knownOwnerIds.length > 0 ? { ownerId: { in: knownOwnerIds } } : {}),
      },
      include: {
        owner:   { select: { id: true, name: true } },
        meeting: { select: { scheduledAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take:    500,
    })

    const historicalCommitments: HistoricalCommitment[] = historicalRecords.map((c) => ({
      id:                   c.id,
      owner_id:             c.ownerId,
      owner_name:           c.owner?.name ?? c.ownerId,
      text:                 c.text,
      normalized_text:      c.normalizedText ?? c.text,
      status:               c.status as 'PENDING' | 'DEFERRED',
      due_date_utc:         c.dueDate ? c.dueDate.toISOString() : null,
      created_at:           c.createdAt.toISOString(),
      meeting_id:           c.meetingId,
      source_meeting_date:  c.meeting?.scheduledAt?.toISOString() ?? null,
    }))

    // ── STEP 3: Fetch team timezone ────────────────────────────────────────
    const team = await prisma.team.findUnique({
      where:  { id: teamId },
      select: { settings: true },
    })

    const teamSettings  = (team?.settings ?? {}) as Record<string, unknown>
    const teamTimezone  = (teamSettings.timezone as string) || 'UTC'

    // ── STEP 4: Fetch current meeting date ─────────────────────────────────
    const meeting = await prisma.meeting.findUnique({
      where:  { id: meetingId },
      select: { scheduledAt: true, durationMinutes: true, status: true },
    })

    if (!meeting) {
      throw new Error(`Meeting not found in PostgreSQL: ${meetingId}`)
    }

    // ── STEP 5: Build ResolveRequest ───────────────────────────────────────
    const aiPayload: ResolveRequest = {
      meeting_id:               meetingId,
      team_id:                  teamId,
      meeting_date:             meeting.scheduledAt.toISOString(),
      meeting_duration_seconds: (meeting.durationMinutes ?? 30) * 60,
      team_timezone:            teamTimezone,
      new_commitments:          newCommitments,
      historical_commitments:   historicalCommitments,
    }

    logger.info(
      {
        jobId:             job.id,
        meetingId,
        newCommitments:    newCommitments.length,
        historicalPool:    historicalCommitments.length,
        teamTimezone,
        partial_extraction,
      },
      'resolve.worker: calling AI Pipeline /resolve'
    )

    // ── STEP 6: Call /resolve ──────────────────────────────────────────────
    let isPartial = false
    let result: PipelineResult

    try {
      result = await aipipelineClient.resolve(aiPayload)
    } catch (error: unknown) {

      if (error instanceof AIPipelinePartialError) {
        // HTTP 206 — partial success — use the partial data + log failed IDs
        result    = error.partialResult as PipelineResult
        isPartial = true
        logger.warn(
          {
            jobId:      job.id,
            meetingId,
            request_id: error.requestId,
            failedIds:  result.partial_failure?.failed_historical_ids?.length ?? 0,
          },
          'resolve.worker: partial resolution (HTTP 206) — proceeding with available results'
        )

      } else if (error instanceof AIPipelineCircuitOpenError) {
        // Circuit is OPEN — park the job, do not fail it
        // Bull will re-run the job after the delay
        const waitMs = error.waitMs || 30_000
        logger.warn(
          { jobId: job.id, meetingId, waitMs },
          'resolve.worker: circuit is OPEN — parking job with delay'
        )
        await job.moveToDelayed(Date.now() + waitMs, job.token)
        throw new DelayedError()

      } else if (error instanceof AIPipelineTotalFailureError) {
        // OpenAI unavailable — mark as failed, let Bull retry
        await prisma.meeting.update({
          where: { id: meetingId },
          data:  { resolutionFailed: true },
        }).catch((dbErr) =>
          logger.error({ err: dbErr, meetingId }, 'resolve.worker: failed to update resolutionFailed=true')
        )
        throw error  // Bull retries

      } else {
        // Network error, timeout, auth error, invariant — re-throw for Bull
        throw error
      }
    }

    // ── STEP 7: PostgreSQL transaction — apply all resolution results ───────
    await prisma.$transaction(async (tx) => {

      // ── 7a. Apply RESOLVED updates ──────────────────────────────────────
      // Each resolved update marks a historical commitment as FULFILLED.
      // TENANT SAFETY: AND team_id = $teamId on every update.
      for (const update of result.resolved_updates) {
        await tx.commitment.updateMany({
          where: {
            id:     update.historical_commitment_id,
            teamId,   // Tenant safety guard — NEVER update without this
          },
          data: {
            status:                   'FULFILLED',
            fulfilledAt:              new Date(),
            fulfilledByStatement:     update.resolved_by_new_commitment.text,
            detectionConfidence:      update.detection_confidence,
            similarityScore:          update.similarity_score,
            resolutionPromptVersion:  update.prompt_version,
            resolvedAt:               new Date(),
            resolvedInMeetingId:      meetingId,
          },
        })
      }

      // ── 7b. Handle NOT_RESOLVED references ──────────────────────────────
      // NOT_RESOLVED: commitment referenced in meeting but explicitly not resolved
      // DETECTION_FAILED: Stage 2 OpenAI call failed — we don't know if resolved
      const failedDetectionIds: string[] = []

      for (const ref of result.not_resolved_references) {
        if (ref.detection_status === 'NOT_RESOLVED') {
          // Increment reference count — this commitment is still PENDING
          await tx.commitment.updateMany({
            where: {
              id:     ref.historical_commitment_id,
              teamId,  // Tenant safety
            },
            data: {
              lastReferencedAt: new Date(),
              referenceCount:   { increment: 1 },
            },
          })
        } else if (ref.detection_status === 'DETECTION_FAILED') {
          // Stage 2 call failed for this commitment — park for later retry
          failedDetectionIds.push(ref.historical_commitment_id)
          logger.warn(
            {
              historicalId: ref.historical_commitment_id,
              meetingId,
            },
            'resolve.worker: detection failed for commitment — will park in pending_detections'
          )
        }
      }

      // ── 7c. Store failed detections for retry ────────────────────────────
      // These will be picked up by the next meeting's resolve job OR a cron retry job
      if (failedDetectionIds.length > 0) {
        // Store in MongoDB for async retry — lightweight, non-critical
        // (pending_detections is a MongoDB collection, not PostgreSQL)
        // We do this outside the PostgreSQL transaction below
      }

      // ── 7d. Update new commitments with resolver-enriched fields ─────────
      // The resolver may have updated normalized_text / dedup_key
      for (const c of result.new_commitments) {
        if (c.normalized_text && c.dedup_key) {
          await tx.commitment.updateMany({
            where: {
              meetingId,
              teamId,
              text: c.text,
            },
            data: {
              normalizedText: c.normalized_text,
              dedupKey:       c.dedup_key,
            },
          })
        }
      }

      // ── 7e. Update meeting status ─────────────────────────────────────────
      await tx.meeting.update({
        where: { id: meetingId },
        data: {
          status:              'RESOLVED',
          resolutionComplete:  !isPartial,
          resolutionPartial:   isPartial,
          resolutionFailed:    false,  // Clear any previous failure flag
          processingCompletedAt: new Date(),
        },
      })

      // ── 7f. Increment team meetingsUsed if terminal state reached ──────────
      if (meeting.status !== 'RESOLVED' && meeting.status !== 'DONE') {
        await tx.team.update({
          where: { id: teamId },
          data: { meetingsUsed: { increment: 1 } },
        })
      }
    })

    // Invalidate plan cache to reflect the incremented usage or removed in-flight status
    try {
      const { invalidatePlanCache } = await import('../../middleware/plan-limits.middleware')
      await invalidatePlanCache(teamId)
    } catch (err) {
      logger.warn({ err, teamId }, 'Failed to invalidate plan cache after resolution')
    }

    logger.info(
      {
        jobId:              job.id,
        meetingId,
        isPartial,
        resolvedCount:      result.resolved_updates.length,
        notResolvedCount:   result.not_resolved_references.length,
        unchangedCount:     result.unchanged_commitments.length,
        stage1Matches:      result.stats.stage1_matches,
        stage2Calls:        result.stats.stage2_calls,
        processingMs:       result.stats.processing_time_ms,
      },
      'resolve.worker: PostgreSQL transaction complete'
    )

    // ── STEP 8: Store failed detection IDs in MongoDB ─────────────────────
    // Done outside the PostgreSQL transaction — these are best-effort, non-critical
    const failedIds = result.partial_failure?.failed_historical_ids ?? []
    if (failedIds.length > 0) {
      try {
        const { getMongoDB } = await import('../../db/mongo.client')
        const db = getMongoDB()
        if (db) {
          await db.collection('pending_detections').insertMany(
            failedIds.map((histId) => ({
              historical_commitment_id: histId,
              source_meeting_id:        meetingId,
              team_id:                  teamId,
              created_at:               new Date(),
              retry_count:              0,
              last_error:               result.partial_failure?.error_message ?? 'detection_failed',
            }))
          )
          logger.info(
            { jobId: job.id, meetingId, failedCount: failedIds.length },
            'resolve.worker: stored failed detection IDs in pending_detections (MongoDB)'
          )
        }
      } catch (mongoErr) {
        // Non-fatal — the resolution itself succeeded
        logger.warn(
          { err: mongoErr, meetingId, failedIds: failedIds.length },
          'resolve.worker: failed to write pending_detections to MongoDB (non-fatal)'
        )
      }
    }

    // ── STEP 9: Emit Socket.io events ──────────────────────────────────────
    try {
      const { socketEmitter } = await import('../../realtime/socket.emitter')

      // Team-level event: meeting resolution summary
      const teamEvent = isPartial
        ? SERVER_EVENTS.MEETING_RESOLVED_PARTIAL
        : SERVER_EVENTS.MEETING_RESOLVED

      socketEmitter.to(teamRoom(teamId)).emit(teamEvent, {
        meetingId,
        newCount:         result.new_commitments.length,
        resolvedCount:    result.resolved_updates.length,
        referencedCount:  result.not_resolved_references.filter(
                            (r) => r.detection_status === 'NOT_RESOLVED'
                          ).length,
        unchangedCount:   result.unchanged_commitments.length,
        failedCount:      failedIds.length,
        isPartial,
        stats:            result.stats,
      })

      // Per-owner event: notify each commitment owner whose commitment was fulfilled
      // These go to the user's personal room (user:{ownerId}) for in-app notification
      // We look up ownerId from the historical commitment records we already have
      const historicalById = new Map(
        historicalRecords.map((c) => [c.id, c])
      )

      for (const update of result.resolved_updates) {
        const historicalRecord = historicalById.get(update.historical_commitment_id)
        if (historicalRecord?.ownerId) {
          socketEmitter
            .to(userRoom(historicalRecord.ownerId))
            .emit(SERVER_EVENTS.COMMITMENT_FULFILLED, {
              commitment_id:   update.historical_commitment_id,
              commitment_text: update.historical_commitment_text,
              owner_id:        historicalRecord.ownerId,
              meeting_id:      meetingId,
              confidence:      update.detection_confidence,
            })
        }
      }

    } catch (e) {
      logger.warn({ err: e, meetingId }, 'resolve.worker: socket emit failed (non-fatal)')
    }

    logger.info(
      { jobId: job.id, meetingId, isPartial },
      'resolve.worker: completed'
    )
  },
  {
    connection: {
      host:     process.env.REDIS_HOST ?? 'localhost',
      port:     parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD,
    },
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_RESOLVE ?? '5', 10),
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// EVENT HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

resolveWorker.on('failed', (job, err) => {
  logger.error(
    {
      jobId:     job?.id,
      meetingId: (job?.data as ResolveJobData)?.meetingId,
      err:       err.message,
      stack:     err.stack,
    },
    'resolve.worker: job failed'
  )
})

resolveWorker.on('completed', (job) => {
  logger.debug(
    { jobId: job.id, meetingId: (job.data as ResolveJobData).meetingId },
    'resolve.worker: job completed'
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Re-export the historicalRecords variable used in Socket.io section
// (TypeScript requires it to be in scope — resolved via closure above)
// ─────────────────────────────────────────────────────────────────────────────

// Note: historicalRecords is captured in the closure of the async worker function.
// The Socket.io section references it directly — this is intentional.
// No additional exports needed.
