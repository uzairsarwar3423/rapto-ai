// ─────────────────────────────────────────────────────────────────────────────
// extract.worker.ts
// BullMQ worker: extract queue → /extract → PostgreSQL commits → resolve queue
//
// FLOW:
//  1. Fetch cleaned_transcript from MongoDB (or raw in degraded mode)
//  2. Fetch meeting metadata + participants from PostgreSQL
//  3. Fetch team_timezone from team settings (required for date resolution)
//  4. Build ExtractRequest and call AI Pipeline /extract
//  5. On HTTP 200: write all extracted data to PostgreSQL in a single transaction:
//       - commitments, action_items, decisions, blockers
//       - meeting status → EXTRACTED, summary, extraction metadata
//  6. On HTTP 206: write partial data, mark EXTRACTED_PARTIAL
//  7. On total failure: mark EXTRACTION_FAILED, fail job (Bull retries)
//  8. Push to resolve queue with partial flag
//  9. Emit Socket.io event + notify queue
//
// IDEMPOTENCY: commitments use skipDuplicates=true on the dedup_key.
//   Retrying an extract job after a DB write timeout is safe — duplicate keys
//   are silently skipped.
//
// QUEUE CONFIG: concurrency=3, retries=3, backoff=exponential(10s)
// ─────────────────────────────────────────────────────────────────────────────

import { Worker, Job } from 'bullmq'
import { logger } from '../../config/logger'
import { prisma } from '../../db/client'
import { mongoService } from '../../services/mongo.service'
import { resolveQueue, notifyQueue } from '../queue.client'
import { ExtractJobData } from '../jobs/extract.job'
import { aipipelineClient } from '../../services/ai-pipeline/ai-pipeline.client'
import {
  AIPipelinePartialError,
  AIPipelineTotalFailureError,
} from '../../services/ai-pipeline/ai-pipeline.errors'
import {
  ExtractRequest,
  ParticipantInfo,
  CleanedTranscriptTurn,
  ExtractionResultWithMeta,
  ParsedCommitment,
} from '../../services/ai-pipeline/ai-pipeline.types'
import { SERVER_EVENTS } from '../../realtime/socket.events'
import { teamRoom } from '../../realtime/rooms.manager'
import { ResolveJobData } from '../jobs/resolve.job'

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve owner_id from the participant name map.
 * Falls back to the first participant's userId, then 'unknown'.
 * This is best-effort — the resolver will re-check owner identity via name matching.
 */
function resolveOwnerId(
  ownerName: string | null | undefined,
  participantNameMap: Map<string, string | null | undefined>
): string | null {
  if (!ownerName || typeof ownerName !== 'string') return null;

  const userId = participantNameMap.get(ownerName.trim().toLowerCase())
  if (userId) return userId
  // Try partial match (first name only)
  for (const [name, uid] of participantNameMap.entries()) {
    if (uid && ownerName.toLowerCase().startsWith(name.split(' ')[0])) {
      return uid
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKER
// ─────────────────────────────────────────────────────────────────────────────

export const extractWorker = new Worker<ExtractJobData>(
  'extract',
  async (job: Job<ExtractJobData>) => {
    const { meetingId, teamId, mongoTranscriptId } = job.data

    logger.info({ jobId: job.id, meetingId, teamId }, 'extract.worker: starting')

    // ── STEP 1: Fetch transcript from MongoDB ──────────────────────────────
    const transcriptDoc = await mongoService.findTranscript(mongoTranscriptId)
    if (!transcriptDoc) {
      throw new Error(`Transcript document not found in MongoDB: ${mongoTranscriptId}`)
    }

    // normalized_transcript is the cleaned version (or raw in degraded mode)
    const transcriptTurns = transcriptDoc.normalized_transcript
    if (!transcriptTurns || !Array.isArray(transcriptTurns) || transcriptTurns.length === 0) {
      throw new Error(
        `Transcript document has no normalized_transcript for ${mongoTranscriptId}. ` +
        `cleanup_successful=${transcriptDoc.cleanup_successful ?? 'unknown'}`
      )
    }

    const isDegradedMode = transcriptDoc.cleanup_successful === false

    if (isDegradedMode) {
      logger.warn(
        { jobId: job.id, meetingId },
        'extract.worker: running in degraded mode — using raw transcript (cleanup was unavailable)'
      )
    }

    // ── STEP 2: Fetch meeting + participants from PostgreSQL ────────────────
    const meeting = await prisma.meeting.findUnique({
      where:   { id: meetingId },
      include: { participants: true },
    })

    if (!meeting) {
      throw new Error(`Meeting not found in PostgreSQL: ${meetingId}`)
    }

    const teamUsers = await prisma.user.findMany({
      where: { teamId: teamId },
      select: { id: true, name: true }
    })

    // ── STEP 3: Fetch team timezone ────────────────────────────────────────
    const team = await prisma.team.findUnique({
      where:  { id: teamId },
      select: { settings: true },
    })

    // timezone is stored in team.settings JSON blob as { timezone: 'America/New_York' }
    const teamSettings = (team?.settings ?? {}) as Record<string, unknown>
    const teamTimezone = (teamSettings.timezone as string) || 'UTC'

    // ── STEP 4: Build ExtractRequest ───────────────────────────────────────
    const participants: ParticipantInfo[] = meeting.participants.length > 0
      ? meeting.participants.map((p) => ({
          name:        p.name,
          user_id:     p.userId ?? null,
          email:       p.email ?? null,
          speaker_tag: p.speakerTag ?? 'Unknown Speaker',
        }))
      : [{ name: 'Unknown Speaker', user_id: null, email: null, speaker_tag: 'Unknown Speaker' }]

    const aiPayload: ExtractRequest = {
      meeting_id:               meetingId,
      team_id:                  teamId,
      meeting_title:            meeting.title,
      meeting_date:             meeting.scheduledAt.toISOString(),
      meeting_duration_seconds: (meeting.durationMinutes ?? 30) * 60,
      team_timezone:            teamTimezone,
      participants,
      cleaned_transcript:       transcriptTurns as unknown as CleanedTranscriptTurn[],
    }

    logger.info(
      {
        jobId:         job.id,
        meetingId,
        isDegradedMode,
        transcriptTurns: transcriptTurns.length,
        teamTimezone,
      },
      'extract.worker: calling AI Pipeline /extract'
    )

    // ── STEP 5: Call /extract ──────────────────────────────────────────────
    let isPartial = false
    let result: ExtractionResultWithMeta

    try {
      result = await aipipelineClient.extract(aiPayload)
    } catch (error: unknown) {
      if (error instanceof AIPipelinePartialError) {
        // HTTP 206 — partial success — use the partial data
        result   = error.partialResult as ExtractionResultWithMeta
        isPartial = true
        logger.warn(
          { jobId: job.id, meetingId, request_id: error.requestId },
          'extract.worker: partial extraction (HTTP 206) — proceeding with partial data'
        )
      } else if (error instanceof AIPipelineTotalFailureError) {
        // OpenAI unavailable — mark as failed and let Bull retry
        await prisma.meeting.update({
          where: { id: meetingId },
          data:  { status: 'EXTRACTION_FAILED' },
        }).catch((dbErr) =>
          logger.error({ err: dbErr, meetingId }, 'extract.worker: failed to update meeting status to EXTRACTION_FAILED')
        )
        throw error  // Bull will retry this job per backoff policy
      } else {
        // All other errors (network, timeout, circuit open, invariant)
        throw error
      }
    }

    // ── STEP 6: Build participant name → userId lookup map ─────────────────
    const participantNameMap = new Map<string, string | null | undefined>()
    
    // 6a. Pre-populate with all team users (allows resolving by name even if participant tracking failed)
    for (const u of teamUsers) {
      if (u.name) {
        participantNameMap.set(u.name.trim().toLowerCase(), u.id)
      }
    }

    // 6b. Override with specific meeting participants (if available)
    for (const p of meeting.participants) {
      participantNameMap.set(p.name.trim().toLowerCase(), p.userId)
    }

    // ── STEP 7: PostgreSQL transaction — ALL writes or NONE ────────────────
    await prisma.$transaction(async (tx) => {
      // Pre-process commitments
      const validCommitments: any[] = []
      const fallbackActionItems: any[] = []

      for (const c of result.commitments) {
        const ownerId = resolveOwnerId(c.owner_name, participantNameMap)
        if (ownerId) {
          validCommitments.push({
            meetingId,
            teamId,
            text:           c.text,
            ownerId,
            status:         'PENDING',
            confidenceScore: c.confidence,
            dueDateRaw:     c.due_date_raw,
            dueDate:        c.due_date_utc ? new Date(c.due_date_utc) : null,
            normalizedText: c.normalized_text,
            dedupKey:       c.dedup_key,
            extractionModel: result.extraction_model,
          })
        } else {
          // Fallback to Action Item if owner is not a registered user
          fallbackActionItems.push({
            meetingId,
            teamId,
            text:            c.text,
            assigneeId:      null,
            assigneeNameRaw: c.owner_name,
            confidenceScore: c.confidence,
            dueDateRaw:      c.due_date_raw,
            dueDate:         c.due_date_utc ? new Date(c.due_date_utc) : null,
          })
        }
      }

      // ── 7a. Commitments ───────────────────────────────────────────────────
      if (validCommitments.length > 0) {
        await tx.commitment.createMany({
          data: validCommitments,
          skipDuplicates: true,  // dedup_key uniqueness — safe on retry
        })
      }

      // ── 7b. Action Items ──────────────────────────────────────────────────
      const actionItemsData = result.action_items.map((a) => ({
        meetingId,
        teamId,
        text:            a.text,
        assigneeId:      resolveOwnerId(a.owner_name, participantNameMap),
        assigneeNameRaw: a.owner_name,
        confidenceScore: a.confidence,
      })).concat(fallbackActionItems)

      if (actionItemsData.length > 0) {
        await tx.actionItem.createMany({
          data: actionItemsData,
          skipDuplicates: true,
        })
      }

      // ── 7c. Decisions ─────────────────────────────────────────────────────
      if (result.decisions.length > 0) {
        await tx.decision.createMany({
          data: result.decisions.map((d) => ({
            meetingId,
            teamId,
            text:           d.text,
            confidenceScore: d.confidence,
          })),
          skipDuplicates: true,
        })
      }

      // ── 7d. Blockers ──────────────────────────────────────────────────────
      if (result.blockers.length > 0) {
        await tx.blocker.createMany({
          data: result.blockers.map((b) => ({
            meetingId,
            teamId,
            text:           b.text,
            affectedUser:   b.owner_name,
            confidenceScore: b.confidence,
          })),
          skipDuplicates: true,
        })
      }

      // ── 7e. Meeting status + summary + extraction metadata ───────────────
      await tx.meeting.update({
        where: { id: meetingId },
        data: {
          status:                 isPartial ? 'EXTRACTED_PARTIAL' : 'EXTRACTED',
          summary:                result.summary,
          commitmentCount:        validCommitments.length,
          actionItemCount:        actionItemsData.length,
          decisionCount:          result.decisions.length,
          blockerCount:           result.blockers.length,
          // AI extraction provenance — used for cost audit and model version tracking
          extractionModel:        result.extraction_model,
          extractionPromptVersion: result.prompt_version,
          extractionCostUsd:      result.total_cost.estimated_cost_usd,
          processingCompletedAt:  new Date(),
        },
      })
    })

    logger.info(
      {
        jobId:            job.id,
        meetingId,
        isPartial,
        commitments:      result.commitments.length,
        actionItems:      result.action_items.length,
        decisions:        result.decisions.length,
        blockers:         result.blockers.length,
        chunksTotal:      result.chunks_total,
        chunksSucceeded:  result.chunks_succeeded,
        costUsd:          result.total_cost.estimated_cost_usd,
        processingMs:     result.processing_time_ms,
        model:            result.extraction_model,
      },
      'extract.worker: PostgreSQL writes complete'
    )

    // ── STEP 8: Update MongoDB with extraction metadata ────────────────────
    await mongoService.updateTranscript(mongoTranscriptId, {
      ai_extraction: {
        commitments_count:  validCommitments.length,
        action_items_count: actionItemsData.length,
        decisions_count:    result.decisions.length,
        blockers_count:     result.blockers.length,
        is_partial:         isPartial,
        chunks_total:       result.chunks_total,
        chunks_succeeded:   result.chunks_succeeded,
        extraction_model:   result.extraction_model,
        prompt_version:     result.prompt_version,
        processing_time_ms: result.processing_time_ms,
        total_cost:         result.total_cost,
      },
      processing_status:       'extracted',
      processing_completed_at: new Date(),
    })

    // ── STEP 9: Emit Socket.io event ────────────────────────────────────────
    try {
      const { socketEmitter } = await import('../../realtime/socket.emitter')

      const eventName = isPartial
        ? SERVER_EVENTS.MEETING_EXTRACTED_PARTIAL
        : SERVER_EVENTS.MEETING_EXTRACTED

      socketEmitter.to(teamRoom(teamId)).emit(eventName, {
        meetingId,
        summary:          result.summary,
        commitmentCount:  validCommitments.length,
        actionItemCount:  actionItemsData.length,
        decisionCount:    result.decisions.length,
        blockerCount:     result.blockers.length,
        isPartial,
      })

      // Emit MEETING_PROCESSED as well for backward compatibility with existing
      // frontend listeners that have not yet migrated to MEETING_EXTRACTED
      socketEmitter.to(teamRoom(teamId)).emit(SERVER_EVENTS.MEETING_PROCESSED, {
        meetingId,
        summary:          result.summary,
        commitmentCount:  validCommitments.length,
        actionItemCount:  actionItemsData.length,
      })
    } catch (e) {
      logger.warn({ err: e, meetingId }, 'extract.worker: socket emit failed (non-fatal)')
    }

    // ── STEP 10: Push to resolve queue ─────────────────────────────────────
    const resolveJobData: ResolveJobData = {
      meetingId,
      teamId,
      partial_extraction: isPartial,
    }

    await resolveQueue.add('resolve-commitments', resolveJobData)

    // ── STEP 11: Push to notify queue ──────────────────────────────────────
    await notifyQueue.add('meeting-processed', {
      type:      'MEETING_PROCESSED',
      teamId,
      meetingId,
    })

    logger.info(
      { jobId: job.id, meetingId, isPartial },
      'extract.worker: completed — pushed to resolve and notify queues'
    )
  },
  {
    connection: {
      host:     process.env.REDIS_HOST ?? 'localhost',
      port:     parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD,
    },
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_EXTRACT ?? '3', 10),
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// EVENT HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

extractWorker.on('failed', (job, err) => {
  logger.error(
    {
      jobId:    job?.id,
      meetingId: (job?.data as ExtractJobData)?.meetingId,
      err:      err.message,
      stack:    err.stack,
    },
    'extract.worker: job failed'
  )
})

extractWorker.on('completed', (job) => {
  logger.debug(
    { jobId: job.id, meetingId: (job.data as ExtractJobData).meetingId },
    'extract.worker: job completed'
  )
})
