import "server-only";

import { cookies } from "next/headers";
import axios from "axios";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { getServerApiUrl } from "./config";

const backendUrl = getServerApiUrl();

/**
 * Fast check to determine if a JWT access token is expired without heavy cryptographic verification.
 */
function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    if (!payload.exp) return true;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

/**
 * Retrieves the current access token from cookies for React Server Components.
 * Note: RSCs must NEVER perform refresh token rotation directly because RSCs
 * cannot write Set-Cookie headers to the client browser during page rendering.
 * Token rotation is safely coordinated by Route Handlers and client-side single-flight refresh.
 */
const getAccessToken = cache(async (): Promise<string | null> => {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("rapto_access")?.value;
    if (accessToken && !isJwtExpired(accessToken)) {
      return accessToken;
    }
    return null;
  } catch (error: any) {
    console.error("Failed to retrieve server-side access token:", error?.message || error);
    return null;
  }
});

export const serverApiClient = {
  async get<T>(url: string, config?: { params?: Record<string, any> }): Promise<T> {
    const accessToken = await getAccessToken();

    const response = await axios.get(`${backendUrl}/api/v1${url}`, {
      ...config,
      headers: {
        Authorization: accessToken ? `Bearer ${accessToken}` : "",
      },
      timeout: 10_000,
    });

    return response.data.data;
  },

  async post<T>(url: string, data?: any, config?: { params?: Record<string, any> }): Promise<T> {
    const accessToken = await getAccessToken();

    const response = await axios.post(`${backendUrl}/api/v1${url}`, data, {
      ...config,
      headers: {
        Authorization: accessToken ? `Bearer ${accessToken}` : "",
      },
      timeout: 10_000,
    });

    return response.data.data;
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
