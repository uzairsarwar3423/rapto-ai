import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useOAuthConnect } from "@/features/integrations/hooks/useOAuthConnect";

/** Shared so the previous step can prefetch it — the answer never changes at runtime. */
export const googleCalendarConfigQuery = {
  queryKey: ["auth", "google-calendar-config"],
  queryFn: async () => {
    const res = await api.get<{ data: { configured: boolean } }>(
      "/auth/google-calendar/check-config"
    );
    return res.data.data;
  },
  staleTime: Infinity,
} as const;

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: "Google Calendar access was not granted. You can try again or skip for now.",
  state_mismatch: "That sign-in attempt expired. Please try connecting again.",
};
const DEFAULT_OAUTH_ERROR = "We couldn't connect Google Calendar. Please try again or skip for now.";

export const useConnectCalendarStep = (onSuccess: () => void) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connect, connectingProvider } = useOAuthConnect();

  const { data: configData, isLoading: isLoadingConfig } = useQuery(googleCalendarConfigQuery);
  const isConfigured = configData?.configured ?? true;

  // Read the OAuth return params once, on arrival. They are stripped from the URL
  // right after, so keep the outcome in state rather than re-deriving it per render.
  const [isConnected] = useState(() => searchParams.get("connected") === "true");
  const [oauthError, setOauthError] = useState<string | null>(() => {
    const code = searchParams.get("error");
    return code ? OAUTH_ERROR_MESSAGES[code] ?? DEFAULT_OAUTH_ERROR : null;
  });

  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    const hasConnected = searchParams.get("connected") === "true";
    const hasError = searchParams.has("error");
    if (!hasConnected && !hasError) return;
    processedRef.current = true;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("connected");
    params.delete("error");
    const query = params.toString();
    router.replace(`${window.location.pathname}${query ? `?${query}` : ""}`, { scroll: false });

    if (hasConnected) onSuccessRef.current(); // calendar is linked — finish onboarding
  }, [searchParams, router]);

  const handleConnect = async () => {
    if (!isConfigured) return;
    setOauthError(null);
    // connect() flips connectingProvider synchronously, so the button shows
    // "Redirecting…" immediately while the OAuth URL is fetched.
    await connect("GOOGLE_CALENDAR", "onboarding");
  };

  const isConnecting = connectingProvider === "GOOGLE_CALENDAR";

  return {
    isConfigured,
    isLoadingConfig,
    isConnecting,
    isConnected,
    oauthError,
    handleConnect,
  };
};
