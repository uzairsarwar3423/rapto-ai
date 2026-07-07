import "server-only";

import { cookies } from "next/headers";
import axios from "axios";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";

const backendUrl = process.env.API_URL || "http://localhost:5000";

/**
 * De-duplicated server-side fetch of a fresh access token using the user's HttpOnly refresh cookie.
 * React cache() ensures that even if 4 different RSC widgets invoke this in parallel, only 1 request is sent.
 */
const getAccessToken = cache(async (): Promise<string | null> => {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("rapto_access")?.value;
    return accessToken || null;
  } catch (error: any) {
    console.error("Failed to retrieve server-side access token:", error?.message || error);
    return null;
  }
});

export const serverApiClient = {
  async get<T>(url: string, config?: { params?: Record<string, any> }): Promise<T> {
    const accessToken = await getAccessToken();

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
        const { redirect } = await import('next/navigation');
        redirect('/login');
      }
      throw error;
    }
  },

  async post<T>(url: string, data?: any, config?: { params?: Record<string, any> }): Promise<T> {
    const accessToken = await getAccessToken();

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
        const { redirect } = await import('next/navigation');
        redirect('/login');
      }
      throw error;
    }
  },
};

/**
 * Centralized handler for server-side query errors.
 * Ensures Next.js internal redirect and not-found errors are propagated,
 * logs unexpected API errors cleanly, and handles expected API errors (404/403) with a fallback.
 */
export function handleServerQueryError<T>(error: unknown, context: string, fallbackValue: T): T {
  // Rethrow Next.js internal control flow errors (redirects, not-found, etc.)
  unstable_rethrow(error);

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const responseData = error.response?.data;

    if (status === 401) {
      const { redirect } = require("next/navigation");
      redirect("/login");
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


