import { env } from "@/config/env";

export function useConnectGoogleCalendar() {
  const connect = () => {
    window.location.href = `${env.API_URL || ""}/api/v1/integrations/google-calendar/connect`;
  };

  return { connect };
}
