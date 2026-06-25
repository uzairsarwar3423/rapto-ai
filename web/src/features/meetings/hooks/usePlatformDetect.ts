"use client";

import { useEffect, useState } from "react";
import type { PlatformType } from "../types";

export function detectPlatformAndId(urlStr: string): { platform: PlatformType | null; detectedId: string | null } {
  if (!urlStr || !urlStr.trim()) {
    return { platform: null, detectedId: null };
  }
  
  try {
    // Add protocol if missing to allow standard URL parsing
    const formattedUrl = urlStr.match(/^https?:\/\//i) ? urlStr : `https://${urlStr}`;
    const url = new URL(formattedUrl);
    
    // Zoom
    // e.g., https://zoom.us/j/123456789 or https://company.zoom.us/j/123456789
    if (url.hostname.includes("zoom.us")) {
      const jMatch = url.pathname.match(/\/j\/([0-9]+)/);
      if (jMatch) {
        return { platform: "ZOOM", detectedId: jMatch[1] };
      }
      const myMatch = url.pathname.match(/\/my\/([^/]+)/);
      if (myMatch) {
        return { platform: "ZOOM", detectedId: myMatch[1] };
      }
      return { platform: "ZOOM", detectedId: null };
    }

    // Google Meet
    // e.g., https://meet.google.com/abc-defg-hij
    if (url.hostname === "meet.google.com") {
      const match = url.pathname.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
      if (match) {
        return { platform: "GOOGLE_MEET", detectedId: match[1] };
      }
      return { platform: "GOOGLE_MEET", detectedId: null };
    }

    // Microsoft Teams
    // e.g., https://teams.microsoft.com/l/meetup-join/19%3ameeting_...
    if (url.hostname.includes("teams.microsoft.com") || url.hostname.includes("teams.live.com")) {
      const match = url.pathname.match(/\/meetup-join\/([^/]+)/);
      if (match) {
        try {
          const decoded = decodeURIComponent(match[1]);
          // Keep a short identifiable part of the id (e.g. j/12345 or meeting ID)
          const parts = decoded.split("@");
          const cleanPart = parts[0].replace(/19:meeting_/i, "");
          return { platform: "TEAMS", detectedId: cleanPart.substring(0, 15) };
        } catch {
          return { platform: "TEAMS", detectedId: match[1].substring(0, 15) };
        }
      }
      return { platform: "TEAMS", detectedId: null };
    }

    // Webex
    // e.g., https://company.webex.com/meet/username or company.webex.com/join/username
    if (url.hostname.includes("webex.com")) {
      const meetMatch = url.pathname.match(/\/(?:meet|join|collabs)\/([^/]+)/);
      if (meetMatch) {
        return { platform: "WEBEX", detectedId: meetMatch[1] };
      }
      return { platform: "WEBEX", detectedId: null };
    }

    return { platform: null, detectedId: null };
  } catch {
    return { platform: null, detectedId: null };
  }
}

export function usePlatformDetect(url: string, debounceMs = 300) {
  const [platform, setPlatform] = useState<PlatformType | null>(null);
  const [detectedId, setDetectedId] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  useEffect(() => {
    if (!url.trim()) {
      setPlatform(null);
      setDetectedId(null);
      setIsDetecting(false);
      return;
    }

    setIsDetecting(true);

    const timer = setTimeout(() => {
      const result = detectPlatformAndId(url);
      setPlatform(result.platform);
      setDetectedId(result.detectedId);
      setIsDetecting(false);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [url, debounceMs]);

  return { platform, detectedId, isDetecting };
}
