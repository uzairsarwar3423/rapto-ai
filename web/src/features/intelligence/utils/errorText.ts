import { chatCopy } from "../copy/chatCopy";
import type { TurnError } from "../state/chatTurnMachine";

/** Maps every error the UI can see (§4.5) to calm copy. Server messages are used only for field-level 422s. */
export function describeError(e: TurnError): string {
  switch (e.code) {
    case "CONTENT_FILTERED": return chatCopy.filtered;
    case "FORBIDDEN": return chatCopy.featureDisabled;
    case "FEATURE_DISABLED": return chatCopy.featureDisabled;
    case "SESSION_BUSY": return chatCopy.sessionBusy;
    case "TOO_MANY_STREAMS": return "Finish or stop another answer first.";
    case "RATE_LIMITED": return e.retryAfterS ? chatCopy.rateLimited(Math.ceil(e.retryAfterS)) : "Slow down for a moment.";
    case "QUOTA_EXCEEDED": return chatCopy.quotaExhausted(null);
    case "NOT_FOUND": return chatCopy.conversationNotFound;
    case "UNAUTHENTICATED": return "Your session expired. Sign in again; your message is kept.";
    case "INVALID_INPUT":
      return e.reason === "token_limit" || /shorten/i.test(e.message) ? "That message is too long for the assistant. Please shorten it." : e.message || "That message couldn't be sent.";
    case "CONNECTION_LOST":
    case "NETWORK":
    case "WATCHDOG":
    case "PROTOCOL": return chatCopy.connectionLost;
    case "VERSION": return chatCopy.updateRequired;
    default: return e.kind === "network" ? chatCopy.connectionLost : chatCopy.errorRetryable;
  }
}
