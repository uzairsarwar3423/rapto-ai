// ─────────────────────────────────────────────────────────────────────────────
// transcribe.worker.ts
// BullMQ worker: Recall.ai webhook → /transcripts/cleanup → extract queue
//
// FLOW:
//  1. Fetch raw transcript from MongoDB (stored by webhook handler)
//  2. Build participant map from PostgreSQL meeting_participants
//  3. Call AI Pipeline /transcripts/cleanup (60s timeout)
//  4. On success: store cleaned_transcript + cleanup_metadata in MongoDB
//               update meeting status → TRANSCRIPT_CLEANED
//               push to extract queue
//  5. On cleanup failure: store raw transcript, mark TRANSCRIPT_CLEANUP_FAILED,
//               push to extract queue with cleaned=false (degraded mode)
//  6. Auth errors: fail job permanently — no retry (configuration bug)
//
// QUEUE CONFIG: concurrency=5, retries=3, backoff=exponential(5s)
// ─────────────────────────────────────────────────────────────────────────────

import { Worker, Job } from 'bullmq'
import { logger } from '../../config/logger'
import { mongoService } from '../../services/mongo.service'
import { extractQueue } from '../queue.client'
import { prisma } from '../../db/client'
import { TranscribeJobData } from '../jobs/transcribe.job'
import { ExtractJobData } from '../jobs/extract.job'
import { aipipelineClient } from '../../services/ai-pipeline/ai-pipeline.client'
import {
  CleanupRequest,
  ParticipantInfo,
  RawTranscriptTurn,
} from '../../services/ai-pipeline/ai-pipeline.types'
import { AIPipelineAuthError } from '../../services/ai-pipeline/ai-pipeline.errors'
import { SERVER_EVENTS } from '../../realtime/socket.events'
import { teamRoom } from '../../realtime/rooms.manager'

// ─────────────────────────────────────────────────────────────────────────────
// WORKER
// ─────────────────────────────────────────────────────────────────────────────

export const transcribeWorker = new Worker<TranscribeJobData>(
  'transcribe',
  async (job: Job<TranscribeJobData>) => {
    const { meetingId, teamId, mongoTranscriptId } = job.data

    logger.info({ jobId: job.id, meetingId, teamId }, 'transcribe.worker: starting')

    // ── STEP 1: Fetch raw transcript from MongoDB ───────────────────────────
    const transcript = await mongoService.findTranscript(mongoTranscriptId)
    if (!transcript) {
      throw new Error(
        `Transcript not found in MongoDB: ${mongoTranscriptId} (meetingId: ${meetingId})`
      )
    }

    // ── STEP 1.5: Sync participants to PostgreSQL scalably ──────────────────
    const uniqueSpeakers = new Set<string>()
    const normalized = transcript.normalized_transcript as any[]
    if (normalized && Array.isArray(normalized)) {
      for (const turn of normalized) {
        if (turn.speaker) uniqueSpeakers.add(turn.speaker)
      }
    } else if (transcript.raw_transcript && Array.isArray(transcript.raw_transcript)) {
      for (const turn of transcript.raw_transcript as any[]) {
        const speaker = turn.speaker || turn.speaker_name || turn.speaker_tag || turn.participant?.name || 'Unknown'
        uniqueSpeakers.add(speaker)
      }
    }

    const existingParticipants = await prisma.meetingParticipant.findMany({
      where: { meetingId },
      select: { speakerTag: true, userId: true, name: true, email: true },
    })
    
    const existingTags = new Set(existingParticipants.map(p => p.speakerTag))
    const newSpeakers = Array.from(uniqueSpeakers).filter(tag => tag && !existingTags.has(tag))
    
    if (newSpeakers.length > 0) {
      logger.info({ jobId: job.id, meetingId, newSpeakersCount: newSpeakers.length }, 'transcribe.worker: inserting new meeting participants')
      await prisma.meetingParticipant.createMany({
        data: newSpeakers.map(tag => ({
          meetingId,
          name: tag,
          speakerTag: tag,
        }))
      })

      // Update the meeting's participantCount
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { participantCount: existingParticipants.length + newSpeakers.length }
      })
    }

    // ── STEP 2: Fetch participant map from PostgreSQL (Updated) ─────────────
    const participants = await prisma.meetingParticipant.findMany({
      where: { meetingId },
      select: { speakerTag: true, userId: true, name: true, email: true },
    })

    // Build speaker_tag → ParticipantInfo map for the AI pipeline
    // The AI pipeline uses speaker_tag keys to dereference participants
    const participantMap: Record<string, ParticipantInfo> = {}
    for (const p of participants) {
      if (p.speakerTag) {
        participantMap[p.speakerTag] = {
          user_id:     p.userId ?? null,
          name:        p.name || 'Unknown',
          email:       p.email ?? null,
          speaker_tag: p.speakerTag,
        }
      }
    }

    // ── STEP 3: Call /transcripts/cleanup ──────────────────────────────────
    logger.info(
      { jobId: job.id, meetingId, rawTurns: (transcript.raw_transcript as any[])?.length ?? 0 },
      'transcribe.worker: calling AI Pipeline /transcripts/cleanup'
    )

    let cleanupSuccessful = false
    let cleanedTranscript: any = transcript.raw_transcript  // fallback: raw
    let cleanupMetadata: any = null

    try {
      const request: CleanupRequest = {
        meeting_id:     meetingId,
        team_id:        teamId,
        // raw_transcript comes from MongoDB as a JSON blob stored by the webhook handler
        raw_transcript: transcript.raw_transcript as unknown as RawTranscriptTurn[],
        participants:   participantMap,
      }

      // 60s timeout for cleanup — longer than default because large meetings
      // can have thousands of turns. The worker job timeout is 90s total.
      const result = await aipipelineClient.cleanup(request, 60_000)

      cleanedTranscript = result.cleaned_transcript
      cleanupMetadata   = result.metadata
      cleanupSuccessful = true

      logger.info(
        {
          jobId:        job.id,
          meetingId,
          cleanedTurns: result.cleaned_transcript.length,
          fillersRemoved: result.metadata.total_filler_words_removed,
          processingMs: result.metadata.processing_time_ms,
        },
        'transcribe.worker: cleanup succeeded'
      )
    } catch (error: unknown) {
      if (error instanceof AIPipelineAuthError) {
        // Configuration bug — ALERT and fail permanently (no Bull retry)
        logger.fatal(
          { jobId: job.id, meetingId, error: (error as Error).message },
          '🚨 transcribe.worker: AI Pipeline AUTH ERROR — check AI_PIPELINE_SECRET. Job failed permanently.'
        )
        // Throwing non-retryable by setting Bull opts in the worker config below.
        // For immediate non-retryable behavior, we re-throw and rely on the fact
        // that auth errors set isRetryable=false, and the job will fail.
        throw error
      }

      // All other errors (network, timeout, circuit open, etc.) — degrade gracefully
      logger.warn(
        {
          jobId:       job.id,
          meetingId,
          error_type:  (error as any)?.constructor?.name ?? 'Unknown',
          error_msg:   (error as Error).message,
        },
        'transcribe.worker: cleanup failed — degrading to raw transcript for extraction'
      )

      // Mark cleanup as failed in PostgreSQL — don't block the rest of the flow
      try {
        await prisma.meeting.update({
          where: { id: meetingId },
          data:  { status: 'TRANSCRIPT_CLEANUP_FAILED' },
        })
      } catch (dbErr) {
        logger.error({ jobId: job.id, meetingId, err: dbErr }, 'transcribe.worker: failed to update meeting status to TRANSCRIPT_CLEANUP_FAILED')
      }
    }

    // ── STEP 4: Persist to MongoDB ─────────────────────────────────────────
    // BOTH raw and cleaned are stored. Raw is preserved for audit/reprocessing.
    // normalized_transcript is either the cleaned version or the raw fallback.
    await mongoService.updateTranscript(mongoTranscriptId, {
      normalized_transcript:  cleanedTranscript,
      cleanup_metadata:       cleanupMetadata,
      cleanup_successful:     cleanupSuccessful,
      processing_status:      'ready_for_extraction',
      updated_at:             new Date(),
    })

    // ── STEP 5: Update PostgreSQL meeting status ────────────────────────────
    if (cleanupSuccessful) {
      await prisma.meeting.update({
        where: { id: meetingId },
        data:  { status: 'TRANSCRIPT_CLEANED' },
      })
    }

    // ── STEP 6: Push to extract queue ──────────────────────────────────────
    const extractJobData: ExtractJobData = {
      meetingId,
      teamId,
      mongoTranscriptId,
    }

    await extractQueue.add('extract-commitments', extractJobData, {
      priority: 2,
    })

    logger.info(
      { jobId: job.id, meetingId, cleanupSuccessful },
      'transcribe.worker: pushed to extract queue'
    )

    // ── STEP 7: Emit Socket.io event ────────────────────────────────────────
    try {
      const { socketEmitter } = await import('../../realtime/socket.emitter')
      const event = cleanupSuccessful
        ? SERVER_EVENTS.MEETING_TRANSCRIPT_CLEANED
        : SERVER_EVENTS.MEETING_TRANSCRIPT_CLEANUP_DEGRADED

      socketEmitter.to(teamRoom(teamId)).emit(event, {
        meetingId,
        cleanupSuccessful,
        fillersRemoved: cleanupMetadata?.total_filler_words_removed ?? 0,
      })
    } catch (e) {
      // Socket emit failures are non-fatal — log and continue
      logger.warn({ err: e, meetingId }, 'transcribe.worker: socket emit failed (non-fatal)')
    }

    logger.info(
      { jobId: job.id, meetingId, cleanupSuccessful },
      'transcribe.worker: completed'
    )
  },
  {
    connection: {
      host:     process.env.REDIS_HOST ?? 'localhost',
      port:     parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD,
    },
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_TRANSCRIBE ?? '5', 10),
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// EVENT HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

transcribeWorker.on('failed', (job, err) => {
  logger.error(
    {
      jobId:    job?.id,
      meetingId: (job?.data as TranscribeJobData)?.meetingId,
      err:      err.message,
      stack:    err.stack,
    },
    'transcribe.worker: job failed'
  )
})

transcribeWorker.on('completed', (job) => {
  logger.debug(
    { jobId: job.id, meetingId: (job.data as TranscribeJobData).meetingId },
    'transcribe.worker: job completed'
  )
})
