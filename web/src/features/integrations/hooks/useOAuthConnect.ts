import { useState } from "react";
import { toast } from "sonner";
import { initiateOAuthConnectClient } from "../api/integrations.api";

export function useOAuthConnect() {
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const connect = async (provider: string, context?: 'settings' | 'onboarding') => {
    setConnectingProvider(provider);
    try {
      const authUrl = await initiateOAuthConnectClient(provider, context);
      if (!authUrl || typeof authUrl !== "string") {
        throw new Error(`Invalid OAuth URL received for ${provider}`);
      }
      window.location.href = authUrl;
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || err?.message || `Failed to initiate connection for ${provider}`);
      setConnectingProvider(null);
    }
  };

  return { connect, connectingProvider };
}
