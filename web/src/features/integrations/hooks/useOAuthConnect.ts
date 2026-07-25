import { useState } from "react";
import { toast } from "sonner";
import { initiateOAuthConnectClient } from "../api/integrations.api";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { getPublicApiUrl } from "@/lib/api/config";

export function useOAuthConnect() {
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const accessToken = useAuthStore((state) => state.accessToken);

  const connect = async (provider: string) => {
    setConnectingProvider(provider);
    try {
      const apiBase = getPublicApiUrl();
      if (provider === "GOOGLE_CALENDAR") {
        window.location.href = `${apiBase}/api/v1/auth/google-calendar?token=${accessToken}`;
      } else if (provider === "OUTLOOK_CALENDAR") {
        window.location.href = `${apiBase}/api/v1/integrations/outlook-calendar/connect?token=${accessToken}`;
      } else {
        const authUrl = await initiateOAuthConnectClient(provider);
        window.location.href = authUrl;
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || `Failed to initiate connection for ${provider}`);
      setConnectingProvider(null);
    }
  };

  return { connect, connectingProvider };
}
