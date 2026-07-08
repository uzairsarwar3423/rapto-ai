import axios from 'axios';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env') });

import { prisma } from './src/db/client';
import { mongoService } from './src/services/mongo.service';
import crypto from 'crypto';

async function test() {
  const meetingId = "cmrbzicng0009h2kkkh18aus2";
  const teamId = "cmr91tvwb000dh2ajv379ofgu";
  
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, include: { participants: true }});
  const transcriptDoc = await mongoService.findTranscript(meeting.mongoTranscriptId);
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { settings: true } });
  
  let transcriptTurns = transcriptDoc.normalized_transcript;
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
  }));
  
  const participants = meeting.participants.length > 0
    ? meeting.participants.map((p: any) => ({
        name: p.name,
        user_id: p.userId ?? null,
        email: p.email ?? null,
        speaker_tag: p.speakerTag ?? 'Unknown Speaker',
      }))
    : [{ name: 'Unknown Speaker', user_id: null, email: null, speaker_tag: 'Unknown Speaker' }];
    
  const payload = {
    meeting_id: meetingId,
    team_id: teamId,
    meeting_title: meeting.title,
    meeting_date: meeting.scheduledAt.toISOString(),
    meeting_duration_seconds: (meeting.durationMinutes ?? 30) * 60,
    team_timezone: (team?.settings as any)?.timezone || 'UTC',
    participants,
    cleaned_transcript: transcriptTurns,
  };
  
  try {
    const res = await axios.post('http://127.0.0.1:8001/api/v1/extract', payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Key': process.env.AI_PIPELINE_SECRET || 'dev-secret-key',
        'X-Service-Name': 'vocaply-api'
      }
    });
    console.log("Success!", res.data.success);
  } catch (err: any) {
    if (err.response) {
      console.log("HTTP", err.response.status, JSON.stringify(err.response.data, null, 2));
    } else {
      console.log("Network err", err.message);
    }
  }
  process.exit(0);
}
test();
