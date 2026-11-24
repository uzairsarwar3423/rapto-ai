-- Recall.ai webhooks and updateMeetingStatus() look meetings up by recallBotId on
-- every bot lifecycle event; without an index each lookup is a sequential scan.
CREATE INDEX IF NOT EXISTS "meetings_recallBotId_idx" ON "meetings"("recallBotId");
