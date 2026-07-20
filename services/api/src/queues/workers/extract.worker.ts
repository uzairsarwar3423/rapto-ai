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
import { resolveParticipantToUserId } from '../../utils/participant-matcher'

// (Helpers removed: Using resolveParticipantToUserId instead)
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

    let transcriptTurns = transcriptDoc.normalized_transcript
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
      // In degraded mode, the transcript is a list of RawTranscriptTurns.
      // We must map it to CleanedTranscriptTurn so it passes Pydantic validation on the /extract endpoint.
      const crypto = require('crypto');
      transcriptTurns = transcriptTurns.map((t: any) => ({
        turn_id: t.id || crypto.randomUUID(),
        cleaned_text: t.text || '',
        original_text: t.text || ' ',
        speaker_name: t.speaker_tag || t.speaker || t.speaker_name || 'Unknown Speaker',
        speaker_user_id: null,
        start_time: t.start_time ?? t.start_timestamp ?? 0,
        end_time: t.end_time ?? t.end_timestamp ?? 0,
        filler_words_removed: 0,
        was_modified: false,
        was_modified_suspiciously: false,
        uncertain: false,
        confidence_detail: null,
      }))
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
      select: { id: true, name: true, email: true }
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

    // ── STEP 6: Build pool for participant matching ────────────────────────
    // Combine teamUsers and meeting participants that have a userId.
    // teamUsers already has { id, name, email }.
    // For meeting participants, we only care about those who somehow got a userId 
    // but maybe their team user name was empty or different from speakerTag.
    // However, resolveParticipantToUserId mostly needs { id, name, email }.
    const userPool: { id: string, name: string, email: string | null }[] = [...teamUsers]
    
    for (const p of meeting.participants) {
      if (p.userId && !userPool.some(u => u.id === p.userId)) {
        userPool.push({ id: p.userId, name: p.name, email: p.email })
      }
    }

    // ── STEP 7: Pre-process extracted entities ─────────────────────────────
    const validCommitments: any[] = []
    const fallbackActionItems: any[] = []

    for (const c of result.commitments) {
      const ownerId = resolveParticipantToUserId(c.owner_name, userPool)
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

    const actionItemsData = result.action_items.map((a) => ({
      meetingId,
      teamId,
      text:            a.text,
      assigneeId:      resolveParticipantToUserId(a.assignee_name, userPool),
      assigneeNameRaw: a.assignee_name,
      confidenceScore: a.confidence,
      dueDateRaw:      a.due_date_raw,
      priority:        a.priority,
    })).concat(fallbackActionItems)

    // ── STEP 8: PostgreSQL transaction — ALL writes or NONE ────────────────
    await prisma.$transaction(async (tx) => {
      // ── 8a. Commitments ───────────────────────────────────────────────────
      if (validCommitments.length > 0) {
        await tx.commitment.createMany({
          data: validCommitments,
          skipDuplicates: true,  // dedup_key uniqueness — safe on retry
        })
      }

      // ── 8b. Action Items ──────────────────────────────────────────────────

      if (actionItemsData.length > 0) {
        await tx.actionItem.createMany({
          data: actionItemsData,
          skipDuplicates: true,
        })
      }

      // ── 8c. Decisions ─────────────────────────────────────────────────────
      if (result.decisions.length > 0) {
        await tx.decision.createMany({
          data: result.decisions.map((d) => ({
            meetingId,
            teamId,
            text:           d.text,
            madeBy:         d.made_by ?? null,
            decisionType:   d.decision_type ?? null,
            confidenceScore: d.confidence,
          })),
          skipDuplicates: true,
        })
      }

      // ── 8d. Blockers ──────────────────────────────────────────────────────
      if (result.blockers.length > 0) {
        await tx.blocker.createMany({
          data: result.blockers.map((b) => ({
            meetingId,
            teamId,
            text:           b.text,
            blockedWork:    b.blocked_work ?? null,
            affectedUser:   b.affected_name ?? null,
            blockingParty:  b.blocking_party ?? null,
            severity:       b.severity ?? null,
            confidenceScore: b.confidence,
          })),
          skipDuplicates: true,
        })
      }

      // ── 8e. Risks ─────────────────────────────────────────────────────────
      if (result.risks && result.risks.length > 0) {
        await tx.risk.createMany({
          data: result.risks.map((r) => ({
            meetingId,
            teamId,
            text:             r.text,
            description:      r.description ?? null,
            category:         r.category ?? null,
            raisedBy:         r.raised_by ?? null,
            impact:           r.impact ?? null,
            triggerCondition: r.trigger_condition ?? null,
            confidenceScore:  r.confidence,
          })),
          skipDuplicates: true,
        })
      }

      // ── 8e. Meeting status + summary + extraction metadata ───────────────
      await tx.meeting.update({
        where: { id: meetingId },
        data: {
          status:                 isPartial ? 'EXTRACTED_PARTIAL' : 'EXTRACTED',
          summary:                result.summary,
          commitmentCount:        validCommitments.length,
          actionItemCount:        actionItemsData.length,
          decisionCount:          result.decisions.length,
          blockerCount:           result.blockers.length,
          riskCount:              result.risks ? result.risks.length : 0,
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
        risks:            result.risks ? result.risks.length : 0,
        chunksTotal:      result.chunks_total,
        chunksSucceeded:  result.chunks_succeeded,
        costUsd:          result.total_cost.estimated_cost_usd,
        processingMs:     result.processing_time_ms,
        model:            result.extraction_model,
      },
      'extract.worker: PostgreSQL writes complete'
    )

    // ── STEP 9: Update MongoDB with extraction metadata ────────────────────
    await mongoService.updateTranscript(mongoTranscriptId, {
      ai_extraction: {
        commitments_count:  validCommitments.length,
        action_items_count: actionItemsData.length,
        decisions_count:    result.decisions.length,
        blockers_count:     result.blockers.length,
        risks_count:        result.risks ? result.risks.length : 0,
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

    // ── STEP 10: Emit Socket.io event ────────────────────────────────────────
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
        riskCount:        result.risks ? result.risks.length : 0,
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

    // ── STEP 11: Push to resolve queue ─────────────────────────────────────
    const resolveJobData: ResolveJobData = {
      meetingId,
      teamId,
      partial_extraction: isPartial,
    }

    await resolveQueue.add('resolve-commitments', resolveJobData)

    // ── STEP 12: Push to notify queue ──────────────────────────────────────
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
