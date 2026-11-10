"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { translateTranscriptClient } from "../api/meetings.queries";
import { languageLabel } from "../lib/transcriptLanguage";
import type { TranscriptLanguage } from "../types";

type SpeakerSelection = TranscriptLanguage | "original";

const STALE_MS = 5 * 60 * 1000;

const scopeKey = (lang: TranscriptLanguage, speaker?: string) => `${lang}:${speaker ?? "*"}`;
const pendingKey = (speaker?: string) => (speaker ? `s:${speaker}` : "full");
const queryKeyOf = (meetingId: string, lang: TranscriptLanguage, speaker?: string) =>
  ["meetings", meetingId, "transcript-translation", lang, speaker ?? "*"] as const;

function errorInfo(error: unknown): { code?: string; message: string } {
  const e = (error as { response?: { data?: { error?: { code?: string; message?: string } } } })?.response?.data?.error;
  return { code: e?.code, message: e?.message || "Translation is unavailable right now. Showing the original." };
}

/**
 * Display-only translation state for the transcript. The original turns are never touched:
 * translated text lives in `results` keyed by original segment id and is overlaid at render time.
 *
 *  - `fullLang`   — language chosen for the whole transcript (null = original)
 *  - `speakerSel` — per-speaker override (wins over `fullLang`); "original" pins a speaker back
 *  - `pending`    — in-flight scopes; a scope can't be re-requested while pending (no duplicate calls)
 */
export function useTranscriptTranslation(meetingId: string) {
  const queryClient = useQueryClient();
  const [fullLang, setFullLang] = useState<TranscriptLanguage | null>(null);
  const [speakerSel, setSpeakerSel] = useState<Record<string, SpeakerSelection>>({});
  const [results, setResults] = useState<Record<string, Record<string, string>>>({});
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const pendingRef = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // New meeting → fresh view state.
  useEffect(() => {
    setFullLang(null);
    setSpeakerSel({});
    setResults({});
    pendingRef.current = new Set();
    setPending(new Set());
  }, [meetingId]);

  const translate = useCallback(
    async (lang: TranscriptLanguage, speaker?: string): Promise<void> => {
      const pk = pendingKey(speaker);
      if (pendingRef.current.has(pk)) return; // rapid repeat clicks: one request only
      pendingRef.current.add(pk);
      setPending(new Set(pendingRef.current));

      try {
        const data = await queryClient.fetchQuery({
          queryKey: queryKeyOf(meetingId, lang, speaker),
          queryFn: () => translateTranscriptClient(meetingId, lang, speaker),
          staleTime: STALE_MS,
          retry: false, // the API/pipeline already retries; never hammer a paid endpoint from the browser
        });
        if (!mounted.current) return;
        setResults((prev) => ({ ...prev, [scopeKey(lang, speaker)]: data.segments }));
        if (speaker) {
          setSpeakerSel((prev) => ({ ...prev, [speaker]: lang }));
        } else {
          setFullLang(lang);
          setSpeakerSel({}); // a whole-transcript choice replaces earlier per-speaker overrides
        }
        if (data.partial) {
          // Don't keep a partial result in the client cache: Retry must hit the API (which only pays for the rest).
          queryClient.removeQueries({ queryKey: queryKeyOf(meetingId, lang, speaker) });
          toast.message("Some lines couldn't be translated and are shown in the original.", {
            action: { label: "Retry", onClick: () => void translate(lang, speaker) },
          });
        }
      } catch (error) {
        if (!mounted.current) return;
        const { code, message } = errorInfo(error);
        if (code === "ALREADY_IN_TARGET_LANGUAGE") {
          toast.info(`This is already in ${languageLabel(lang)}.`);
        } else {
          toast.error(message, {
            action: { label: "Retry", onClick: () => void translate(lang, speaker) },
          });
        }
      } finally {
        pendingRef.current.delete(pk);
        if (mounted.current) setPending(new Set(pendingRef.current));
      }
    },
    [meetingId, queryClient]
  );

  /** Back to the original text (instant — nothing is fetched or discarded). */
  const showOriginal = useCallback((speaker?: string) => {
    if (speaker) {
      setSpeakerSel((prev) => ({ ...prev, [speaker]: "original" }));
    } else {
      setFullLang(null);
      setSpeakerSel({});
    }
  }, []);

  /** Language this speaker's lines are currently shown in, or null for the original. */
  const translatedLanguageOf = useCallback(
    (speaker: string): TranscriptLanguage | null => {
      const sel = speakerSel[speaker];
      if (sel === "original") return null;
      return sel ?? fullLang;
    },
    [speakerSel, fullLang]
  );

  /** Text to display for one segment (falls back to the original when it has no translation). */
  const displayText = useCallback(
    (turn: { id: string; speaker: string; text: string }): string => {
      const lang = translatedLanguageOf(turn.speaker);
      if (!lang) return turn.text;
      return results[scopeKey(lang, turn.speaker)]?.[turn.id] ?? results[scopeKey(lang)]?.[turn.id] ?? turn.text;
    },
    [translatedLanguageOf, results]
  );

  return {
    fullLang,
    isFullPending: pending.has("full"),
    isSpeakerPending: (speaker: string) => pending.has(pendingKey(speaker)),
    translate,
    showOriginal,
    translatedLanguageOf,
    displayText,
  };
}
