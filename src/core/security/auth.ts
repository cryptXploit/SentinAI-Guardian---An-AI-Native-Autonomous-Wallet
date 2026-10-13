import { randomBytes } from 'crypto';

export type SessionContext = {
  userId: string;
  sessionId: string;
  expiresAt: number; // Unix ms
};

type StoredSession = SessionContext & {
  createdAt: number;
};

// Server-side session store. In production, this would be backed by a database.
const activeSessions = new Map<string, StoredSession>();

// Default session lifetime: 30 minutes
const DEFAULT_SESSION_LIFETIME_MS = 30 * 60 * 1000;

/**
 * Creates a new authenticated session for the given operator.
 * Returns the session token (to be set as HTTP-only cookie) and session context.
 */
export function createSession(
  userId: string,
  lifetimeMs: number = DEFAULT_SESSION_LIFETIME_MS
): { token: string; session: SessionContext } {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  const session: StoredSession = {
    userId,
    sessionId: token,
    expiresAt: now + lifetimeMs,
    createdAt: now,
  };
  activeSessions.set(token, session);
  return { token, session: { userId, sessionId: token, expiresAt: session.expiresAt } };
}

/**
 * Revokes an active session, preventing further use.
 */
export function revokeSession(token: string): boolean {
  return activeSessions.delete(token);
}

/**
 * Revokes all sessions for a given user.
 */
export function revokeAllSessions(userId: string): number {
  let count = 0;
  for (const [token, session] of activeSessions) {
    if (session.userId === userId) {
      activeSessions.delete(token);
      count++;
    }
  }
  return count;
}

/**
 * Validates a session token directly. Used internally and for testing.
 * Returns null if token is missing, invalid, expired, or revoked.
 */
export function validateSessionToken(token: string | undefined | null): SessionContext | null {
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token); // Cleanup expired
    return null;
  }
  return { userId: session.userId, sessionId: session.sessionId, expiresAt: session.expiresAt };
}

/**
 * Verifies the current request's session (R5D).
 * 
 * Authentication sources (checked in order):
 * 1. HTTP-only cookie 'sentinai_session'
 * 2. Authorization: Bearer <token> header
 * 
 * REMOVED: Environment-variable authentication bypass (SENTINAI_AUTH_OVERRIDE).
 * Tests must use _setTestSession() or mock verifySession().
 */
export async function verifySession(): Promise<SessionContext | null> {
  try {
    const { cookies, headers } = await import('next/headers');
    
    // 1. Check HTTP-only cookie
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('sentinai_session')?.value;
    const cookieResult = validateSessionToken(sessionCookie);
    if (cookieResult) return cookieResult;

    // 2. Check Authorization header
    const headerStore = await headers();
    const authHeader = headerStore.get('authorization');
    if (authHeader) {
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const headerResult = validateSessionToken(token);
      if (headerResult) return headerResult;
    }
  } catch {
    // Outside active Next.js request context (e.g. testing)
  }

  return null;
}

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Test helper: clears all sessions.
 */
export function _resetSessionsForTesting(): void {
  activeSessions.clear();
}

/**
 * Test helper: returns the count of active sessions.
 */
export function _getActiveSessionCount(): number {
  return activeSessions.size;
}
