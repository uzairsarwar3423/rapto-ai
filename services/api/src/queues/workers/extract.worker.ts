import { Worker, Job } from 'bullmq'
import { logger } from '../../config/logger'
import { prisma } from '../../db/client'
import { mongoService } from '../../services/mongo.service'
import { notifyQueue } from '../queue.client'
import { ExtractJobData } from '../jobs/extract.job'
import { updateMeetingStatus } from '../../modules/meetings/meetings.service'
import { SERVER_EVENTS } from '../../realtime/socket.events'
import { teamRoom } from '../../realtime/rooms.manager'

export const extractWorker = new Worker<ExtractJobData>(
  'extract',
  async (job: Job<ExtractJobData>) => {
    const { meetingId, teamId, mongoTranscriptId } = job.data
    logger.info({ jobId: job.id, meetingId }, 'extract.worker: processing')

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    })

    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`)
    }

    const transcriptDoc = await mongoService.findTranscript(mongoTranscriptId)
    if (!transcriptDoc || !transcriptDoc.normalized_transcript) {
      throw new Error(`Transcript doc missing or no normalized_transcript for ${mongoTranscriptId}`)
    }

    const aiPayload = {
      meeting_id: meetingId,
      team_id: teamId,
      meeting_title: meeting.title,
      meeting_date: meeting.scheduledAt.toISOString(),
      meeting_duration_seconds: (meeting.durationMinutes || 30) * 60,
      participants: meeting.participants.length > 0
        ? meeting.participants.map(p => ({
            name: p.name,
            email: p.email || "",
            user_id: p.userId || "",
            speaker_tag: p.speakerTag || `Speaker ${p.name}`,
          }))
        : [
            {
              name: "Unknown Speaker",
              email: "",
              user_id: "",
              speaker_tag: "Speaker 0",
            }
          ],
      cleaned_transcript: transcriptDoc.normalized_transcript,
    }

    const aiUrl = `${process.env.AI_PIPELINE_URL || 'http://127.0.0.1:8001'}/api/v1/extract`
    const aiSecret = process.env.INTERNAL_API_SECRET || process.env.API_SHARED_SECRET || 'test-shared-secret-for-internal-auth-32chars'

    logger.info({ jobId: job.id, meetingId, url: aiUrl }, 'extract.worker: calling Python AI Pipeline')

    const response = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Key': aiSecret,
        'X-Request-Id': `req_${job.id}`
      },
      body: JSON.stringify(aiPayload),
    })

    if (!response.ok && response.status !== 206 && response.status !== 422) {
      const errorText = await response.text()
      throw new Error(`AI Pipeline returned ${response.status}: ${errorText}`)
    }

    const responseData = await response.json() as any

    // 422 means complete failure across all chunks
    if (response.status === 422) {
      logger.error({ jobId: job.id, meetingId, responseData }, 'extract.worker: AI Pipeline full failure')
      throw new Error(`AI Pipeline full extraction failure: ${JSON.stringify(responseData)}`)
    }

    const result = responseData.result || responseData.partial_result
    const isPartial = response.status === 206

    const extractedData = {
      commitments: result?.commitments || [],
      actionItems: result?.action_items || [],
      decisions: result?.decisions || [],
      blockers: result?.blockers || [],
      summary: result?.summary || (isPartial ? 'Partial extraction completed.' : 'Extraction completed.'),
      meta: {
        isPartial,
        chunksTotal: result?.chunks_total || 0,
        chunksSucceeded: result?.chunks_succeeded || 0,
        cost: result?.total_cost || null,
        processingTimeMs: result?.processing_time_ms || 0
      }
    }

    // Update Postgres
    await updateMeetingStatus(meetingId, 'DONE', {
      summary: extractedData.summary,
      commitmentCount: extractedData.commitments.length,
      actionItemCount: extractedData.actionItems.length,
      decisionCount: extractedData.decisions.length,
      blockerCount: extractedData.blockers.length,
    })

    // Update Mongo
    await mongoService.updateTranscript(mongoTranscriptId, {
      ai_extraction: extractedData,
      processing_status: 'done',
      processing_completed_at: new Date(),
    })

    try {
      const { socketEmitter } = await import('../../realtime/socket.emitter')
      socketEmitter.to(teamRoom(teamId)).emit(SERVER_EVENTS.MEETING_PROCESSED, {
        meetingId,
        summary: extractedData.summary,
        commitmentCount: extractedData.commitments.length,
        actionItemCount: extractedData.actionItems.length,
      })
    } catch (e) {
      logger.warn({ err: e }, 'Socket emit failed in extract.worker')
    }

    await notifyQueue.add('meeting-processed', {
      type: 'MEETING_PROCESSED',
      teamId,
      meetingId,
    })

    logger.info({ jobId: job.id, meetingId, isPartial }, 'extract.worker: done')
  },
  {
    connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT ?? '6379') },
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_EXTRACT || '3', 10),
  }
)

extractWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'extract.worker: job failed')
})
