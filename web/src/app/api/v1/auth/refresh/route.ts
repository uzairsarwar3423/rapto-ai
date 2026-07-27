import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';
import { getServerApiUrl } from '@/lib/api/config';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Shared cookie options — MUST match the backend COOKIE_OPTIONS exactly.
 * In production the refresh cookie is domain=.rapto.cloud + sameSite=none + secure=true.
 * We replicate these here so the Next.js BFF sets/deletes the cookie consistently.
 */
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60, // 30 days
  ...(isProd ? { domain: '.rapto.cloud' } : {}),
};

/**
 * POST /api/v1/auth/refresh
 * Called by the client-side Axios interceptor and AuthProvider to silently
 * refresh the access token using the HttpOnly refresh cookie.
 */
export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('rapto_refresh')?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { success: false, error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token provided' } },
      { status: 401 }
    );
  }

  try {
    const backendUrl = getServerApiUrl();

    // 1. Call backend Express /refresh endpoint to rotate refresh token
    const refreshResponse = await axios.post(
      `${backendUrl}/api/v1/auth/refresh`,
      {},
      {
        headers: {
          Cookie: `rapto_refresh=${refreshToken}`,
        },
        validateStatus: () => true,
      }
    );

    if (refreshResponse.status !== 200) {
      // Delete the stale cookie so browser doesn't keep sending it
      cookieStore.delete('rapto_refresh');
      return NextResponse.json(
        refreshResponse.data,
        { status: refreshResponse.status }
      );
    }

    const { accessToken } = refreshResponse.data.data;

    // 2. Fetch fresh user details using the newly rotated access token
    const meResponse = await axios.get(
      `${backendUrl}/api/v1/auth/me`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        validateStatus: () => true,
      }
    );

    const user = meResponse.status === 200 ? meResponse.data?.data?.user ?? null : null;

    // 3. Extract new refresh token from Set-Cookie header and forward it
    const setCookieHeaders = refreshResponse.headers['set-cookie'];
    let newRefreshToken = '';

    if (setCookieHeaders && setCookieHeaders.length > 0) {
      const match = setCookieHeaders[0].match(/rapto_refresh=([^;]+)/);
      if (match) {
        newRefreshToken = match[1];
      }
    }

    const nextResponse = NextResponse.json({
      accessToken,
      user,
    });

    if (newRefreshToken) {
      // Forward the rotated refresh cookie with correct production attributes
      nextResponse.cookies.set('rapto_refresh', newRefreshToken, REFRESH_COOKIE_OPTIONS);
    }

    return nextResponse;
  } catch (error: any) {
    console.error('[BFF /auth/refresh] Internal error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/auth/refresh?redirect=/dashboard
 * Used by Server Components to silently refresh and redirect.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('rapto_refresh')?.value;
  const { searchParams } = new URL(request.url);
  const redirectUrl = searchParams.get('redirect') || '/dashboard';

  if (!refreshToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const backendUrl = getServerApiUrl();
    const refreshResponse = await axios.post(
      `${backendUrl}/api/v1/auth/refresh`,
      {},
      { headers: { Cookie: `rapto_refresh=${refreshToken}` }, validateStatus: () => true }
    );

    if (refreshResponse.status !== 200) {
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('rapto_refresh');
      response.cookies.delete('rapto_access');
      return response;
    }

    const { accessToken } = refreshResponse.data.data;
    const setCookieHeaders = refreshResponse.headers['set-cookie'];
    let newRefreshToken = '';

    if (setCookieHeaders && setCookieHeaders.length > 0) {
      const match = setCookieHeaders[0].match(/rapto_refresh=([^;]+)/);
      if (match) newRefreshToken = match[1];
    }

    const response = NextResponse.redirect(new URL(redirectUrl, request.url));

    if (newRefreshToken) {
      response.cookies.set('rapto_refresh', newRefreshToken, REFRESH_COOKIE_OPTIONS);
    }

    // Also set the access token as a short-lived readable cookie for SSR
    response.cookies.set('rapto_access', accessToken, {
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      maxAge: 14 * 60, // 14 minutes — slightly less than the 15m JWT expiry
      ...(isProd ? { domain: '.rapto.cloud' } : {}),
    });

    return response;
  } catch (err) {
    console.error('[BFF GET /auth/refresh] Error:', err);
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
