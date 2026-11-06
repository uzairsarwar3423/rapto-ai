/**
 * embed queue: "make this team's recent data searchable by the AI chat".
 * The worker asks the AI service for an incremental, idempotent embedding backfill for the team.
 *
 *  - event-driven (extract.worker): `meetingId` set, default 1-day window
 *  - nightly sweep (embed-sweep.ts): no `meetingId`, `sinceDays` = the wider window it should re-scan
 */
export interface EmbedJobData {
  teamId:     string
  meetingId?: string
  /** How many days back the AI service should re-scan (default 1). */
  sinceDays?: number
}
