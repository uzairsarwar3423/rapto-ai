import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('vocaply_refresh')?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { success: false, error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token provided' } },
      { status: 401 }
    );
  }

  try {
    const backendUrl = process.env.API_URL || 'http://localhost:5000';
    
    // 1. Call backend Express /refresh endpoint to rotate refresh token
    const refreshResponse = await axios.post(
      `${backendUrl}/api/v1/auth/refresh`,
      {},
      {
        headers: {
          Cookie: `vocaply_refresh=${refreshToken}`,
        },
        validateStatus: () => true,
      }
    );

    if (refreshResponse.status !== 200) {
      // Clear cookie locally if refresh failed
      cookieStore.delete('vocaply_refresh');
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

    if (meResponse.status !== 200) {
      // If fetching user profile fails, treat refresh as failed
      cookieStore.delete('vocaply_refresh');
      return NextResponse.json(
        { success: false, error: { code: 'USER_FETCH_FAILED', message: 'Failed to fetch user profile' } },
        { status: 401 }
      );
    }

    const { user } = meResponse.data.data;

    // 3. Extract new refresh token from backend response headers to rotate cookie
    const setCookieHeaders = refreshResponse.headers['set-cookie'];
    let newRefreshToken = '';
    
    if (setCookieHeaders && setCookieHeaders.length > 0) {
      const match = setCookieHeaders[0].match(/vocaply_refresh=([^;]+)/);
      if (match) {
        newRefreshToken = match[1];
      }
    }

    if (newRefreshToken) {
      // Set the HTTP-only cookie locally scoped to the BFF path
      cookieStore.set('vocaply_refresh', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/auth/refresh',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    // Return the rotated access token and fresh user object to the client
    return NextResponse.json({
      accessToken,
      user,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' } },
      { status: 500 }
    );
  }
}
