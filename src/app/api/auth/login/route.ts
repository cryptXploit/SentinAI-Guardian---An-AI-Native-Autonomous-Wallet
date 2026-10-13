import { NextRequest, NextResponse } from 'next/server';
import { createSession, validateSessionToken } from '@/core/security/auth';

// Rate limiting: track failed attempts per IP
const failedAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const record = failedAttempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.lastAttempt > LOCKOUT_MS) {
    failedAttempts.delete(ip);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(ip: string): void {
  const record = failedAttempts.get(ip) || { count: 0, lastAttempt: 0 };
  record.count += 1;
  record.lastAttempt = Date.now();
  failedAttempts.set(ip, record);
}

function clearFailedAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

/**
 * POST /api/auth/login
 * Authenticates the operator with OPERATOR_PASSWORD env variable.
 * Sets an HTTP-only session cookie on success.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many failed attempts. Try again later.' },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string') {
      recordFailedAttempt(ip);
      return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
    }

    const configuredPassword = process.env.OPERATOR_PASSWORD;
    if (!configuredPassword) {
      return NextResponse.json(
        { error: 'Authentication is not configured. Set OPERATOR_PASSWORD in .env.local' },
        { status: 503 }
      );
    }

    // Constant-time comparison is not critical for demo but we validate correctly
    if (password !== configuredPassword) {
      recordFailedAttempt(ip);
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
    }

    clearFailedAttempts(ip);

    // Create server-side session
    const { token, session } = createSession('operator-1');

    // Build response with HTTP-only cookie
    const response = NextResponse.json({
      success: true,
      userId: session.userId,
      expiresAt: session.expiresAt,
    });

    const isProduction = process.env.NODE_ENV === 'production';

    response.cookies.set('sentinai_session', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 60, // 30 minutes in seconds
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
}

/**
 * GET /api/auth/login
 * Checks if the current session is valid.
 */
export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('sentinai_session')?.value;
  const session = validateSessionToken(sessionToken);

  if (session) {
    return NextResponse.json({
      authenticated: true,
      userId: session.userId,
      expiresAt: session.expiresAt,
    });
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
