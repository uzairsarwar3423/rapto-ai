import type { PlatformType } from "../types";

export const PLATFORM_LABEL: Record<PlatformType, string> = {
  ZOOM: "Zoom",
  GOOGLE_MEET: "Google Meet",
  TEAMS: "Microsoft Teams",
  WEBEX: "Webex",
  MANUAL: "Manual",
};

/** 45 -> "45 min", 60 -> "1 hr", 135 -> "2 hr 15 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Human label for a meeting status — the single source for badges, headers and the PDF export. */
export function getMeetingStatusLabel(status: string): string {
  switch ((status || "").toUpperCase()) {
    case "BOT_JOINING":
      return "Joining Call";
    case "RECORDING":
      return "Recording Live";
    case "PROCESSING":
    case "TRANSCRIBED":
    case "TRANSCRIPT_CLEANED":
      return "AI Processing";
    case "DONE":
    case "RESOLVED":
    case "EXTRACTED":
      return "Done";
    case "FAILED":
    case "EXTRACTION_FAILED":
    case "RESOLUTION_FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
    case "SCHEDULED":
    default:
      return "Scheduled";
  }
}
