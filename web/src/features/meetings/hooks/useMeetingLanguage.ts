"use client";

import { create } from "zustand";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { translateMeetingClient } from "../api/meetings.queries";
import { useMeetingDetail } from "./useMeetingDetail";
import type { MeetingDisplayLanguage, MeetingTranslation } from "../types";

/**
 * Per-meeting display-language preference. A module-level store (not component state) so
 * the choice survives tab navigation inside the meeting page (Overview ⇄ Action Items ⇄ Commitments).
 */
interface MeetingLanguageStore {
  byMeeting: Record<string, MeetingDisplayLanguage>;
  setLanguage: (meetingId: string, language: MeetingDisplayLanguage) => void;
}

export const useMeetingLanguageStore = create<MeetingLanguageStore>((set) => ({
  byMeeting: {},
  setLanguage: (meetingId, language) =>
    set((s) => ({ byMeeting: { ...s.byMeeting, [meetingId]: language } })),
}));

const TRANSLATION_STALE_MS = 10 * 60 * 1000;

export interface MeetingLanguageView {
  /** Original language of the generated content ("en" | "ur" | "hi"). */
  sourceLanguage: string;
  /** The selector is only offered when the content is not already English and there is content. */
  canTranslate: boolean;
  selected: MeetingDisplayLanguage;
  setSelected: (language: MeetingDisplayLanguage) => void;
  /** English translation, when selected AND available. Otherwise undefined → render the original. */
  translation: MeetingTranslation | undefined;
  /** First-time generation in flight (cached switches never set this). */
  isTranslating: boolean;
  isError: boolean;
  error: unknown;
  retry: () => void;
}

export function useMeetingLanguageView(meetingId: string): MeetingLanguageView {
  const { data: meeting } = useMeetingDetail(meetingId);
  const selected = useMeetingLanguageStore((s) => s.byMeeting[meetingId] ?? "original");
  const setLanguage = useMeetingLanguageStore((s) => s.setLanguage);

  const sourceLanguage = meeting?.language ?? "en";
  const hasContent =
    Boolean(meeting?.summary) ||
    (meeting?.actionItemCount ?? 0) > 0 ||
    (meeting?.commitmentCount ?? 0) > 0;
  const canTranslate = sourceLanguage !== "en" && hasContent;
  const wantsEnglish = canTranslate && selected === "en";

  // `updatedAt` in the key: a re-extraction / edited summary bumps it and drops the stale client cache.
  const query = useQuery<MeetingTranslation>({
    queryKey: queryKeys.meetings.translation(meetingId, "en", meeting?.updatedAt ?? ""),
    queryFn: () => translateMeetingClient(meetingId, "en"),
    enabled: wantsEnglish,
    staleTime: TRANSLATION_STALE_MS,
    gcTime: 30 * 60 * 1000,
    retry: false, // the API/pipeline already retries; never hammer a paid endpoint from the browser
    refetchOnWindowFocus: false,
  });

  return {
    sourceLanguage,
    canTranslate,
    selected,
    setSelected: (language) => setLanguage(meetingId, language),
    translation: wantsEnglish ? query.data : undefined,
    isTranslating: wantsEnglish && query.isFetching && !query.data,
    isError: wantsEnglish && query.isError,
    error: query.error,
    retry: () => void query.refetch(),
  };
}

const RTL_LANGUAGES = new Set(["ur", "ar", "fa", "he"]);

/** Right-to-left scripts need dir="rtl" on the text container (Urdu summaries render RTL). */
export function isRtlLanguage(code: string | null | undefined): boolean {
  return !!code && RTL_LANGUAGES.has(code);
}
