import { NextRequest, NextResponse } from 'next/server';
import { revokeSession, validateSessionToken } from '@/core/security/auth';

/**
 * POST /api/auth/logout
 * Revokes the current session and clears the session cookie.
 */
export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('sentinai_session')?.value;

  if (sessionToken) {
    // Validate then revoke
    const session = validateSessionToken(sessionToken);
    if (session) {
      revokeSession(sessionToken);
    }
  }

  const response = NextResponse.json({ success: true });

  // Clear the session cookie
  response.cookies.set('sentinai_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // Expire immediately
  });

  return response;
}
