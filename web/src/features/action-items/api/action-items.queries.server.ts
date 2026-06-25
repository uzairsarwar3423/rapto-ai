import "server-only";

import { cache } from "react";
import { serverApiClient, handleServerQueryError } from "@/lib/api/server-client";
import type { ActionItem } from "../types";

export const getMeetingActionItemsServer = cache(async (meetingId: string): Promise<ActionItem[]> => {
  try {
    const response = await serverApiClient.get<ActionItem[]>("/action-items", {
      params: { meetingId, limit: 100 },
    });
    return response || [];
  } catch (err: any) {
    return handleServerQueryError(err, "getMeetingActionItemsServer", []);
  }
});

