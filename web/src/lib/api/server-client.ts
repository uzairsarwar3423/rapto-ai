import "server-only";

import { cookies } from "next/headers";
import axios from "axios";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { getServerApiUrl } from "./config";

const backendUrl = getServerApiUrl();

/**
 * Attempts a server-to-server token refresh using the HttpOnly `rapto_refresh` cookie.
 * React cache() ensures that even if multiple RSCs call this in parallel during render,
 * only ONE server-to-server refresh request is dispatched.
 */
const refreshServerAccessToken = cache(async (): Promise<string | null> => {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("rapto_refresh")?.value;

    if (!refreshToken) {
      return null;
    }

    const refreshResponse = await axios.post(
      `${backendUrl}/api/v1/auth/refresh`,
      {},
      {
        headers: {
          Cookie: `rapto_refresh=${refreshToken}`,
        },
        validateStatus: () => true,
        timeout: 5000,
      }
    );

    if (refreshResponse.status === 200 && refreshResponse.data?.data?.accessToken) {
      return refreshResponse.data.data.accessToken;
    }

    return null;
  } catch (error: any) {
    console.error("[Server Client] Refresh failed:", error?.message || error);
    return null;
  }
});

/**
 * Retrieves the current access token from cookies or attempts a silent refresh on the server.
 */
const getAccessToken = cache(async (): Promise<string | null> => {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("rapto_access")?.value;
    if (accessToken) {
      return accessToken;
    }

    // Access token expired or missing — attempt silent refresh with refresh cookie
    return await refreshServerAccessToken();
  } catch (error: any) {
    console.error("Failed to retrieve server-side access token:", error?.message || error);
    return null;
  }
});

export const serverApiClient = {
  async get<T>(url: string, config?: { params?: Record<string, any> }): Promise<T> {
    let accessToken = await getAccessToken();

    try {
      const response = await axios.get(`${backendUrl}/api/v1${url}`, {
        ...config,
        headers: {
          Authorization: accessToken ? `Bearer ${accessToken}` : "",
        },
      });

      return response.data.data;
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        // Retry once after forcing a server refresh
        const refreshedToken = await refreshServerAccessToken();
        if (refreshedToken) {
          try {
            const retryResponse = await axios.get(`${backendUrl}/api/v1${url}`, {
              ...config,
              headers: {
                Authorization: `Bearer ${refreshedToken}`,
              },
            });
            return retryResponse.data.data;
          } catch {
            // Retry failed — redirect to login
          }
        }
        const { redirect } = await import("next/navigation");
        redirect("/login");
      }
      throw error;
    }
  },

  async post<T>(url: string, data?: any, config?: { params?: Record<string, any> }): Promise<T> {
    let accessToken = await getAccessToken();

    try {
      const response = await axios.post(`${backendUrl}/api/v1${url}`, data, {
        ...config,
        headers: {
          Authorization: accessToken ? `Bearer ${accessToken}` : "",
        },
      });

      return response.data.data;
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        const refreshedToken = await refreshServerAccessToken();
        if (refreshedToken) {
          try {
            const retryResponse = await axios.post(`${backendUrl}/api/v1${url}`, data, {
              ...config,
              headers: {
                Authorization: `Bearer ${refreshedToken}`,
              },
            });
            return retryResponse.data.data;
          } catch {
            // Retry failed — redirect to login
          }
        }
        const { redirect } = await import("next/navigation");
        redirect("/login");
      }
      throw error;
    }
  },
};

/**
 * Centralized handler for server-side query errors.
 * Ensures Next.js internal redirect and not-found errors are propagated,
 * logs unexpected API errors cleanly, and handles expected API errors with a fallback.
 */
export function handleServerQueryError<T>(error: unknown, context: string, fallbackValue: T): T {
  // Rethrow Next.js internal control flow errors (redirects, not-found, etc.)
  unstable_rethrow(error);

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const responseData = error.response?.data;

    if (status === 401) {
      // Return fallback value so the client page can render and let AuthProvider / AuthGuard rehydrate
      console.warn(`[Server Query] ${context}: Received 401. Returning fallback for client rehydration.`);
      return fallbackValue;
    }

    if (status === 404 || status === 403) {
      console.warn(
        `[Server Query] ${context}: Resource returned ${status} for URL ${error.config?.url || ""}. Returning fallback.`
      );
      return fallbackValue;
    }

    console.error(
      `[Server Query] ${context} failed with status ${status || "network/unknown"}:`,
      responseData || error.message
    );
  } else if (error instanceof Error) {
    console.error(`[Server Query] ${context} failed:`, error.message);
  } else {
    console.error(`[Server Query] ${context} failed:`, error);
  }

  return fallbackValue;
}
