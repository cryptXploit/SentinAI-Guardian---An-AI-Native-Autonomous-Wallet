import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { getDb } from './proposal';

/**
 * Constant-time comparison for passwords and sensitive tokens.
 * Uses SHA-256 pre-hashing to ensure equal buffer lengths and eliminate timing side-channels.
 */
export function verifyPasswordConstantTime(provided: string, expected: string): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const hashA = createHash('sha256').update(provided).digest();
  const hashB = createHash('sha256').update(expected).digest();
  return timingSafeEqual(hashA, hashB);
}

export type SessionContext = {
  userId: string;
  sessionId: string;
  expiresAt: number; // Unix ms
};

type StoredSession = SessionContext & {
  createdAt: number;
};

// In-memory cache for fast access within the active Node.js worker/module context.
const activeSessions = new Map<string, StoredSession>();

// Default session lifetime: 30 minutes
const DEFAULT_SESSION_LIFETIME_MS = 30 * 60 * 1000;

/**
 * Creates a new authenticated session for the given operator.
 * Persists session in memory cache and SQLite store (bridging Next.js Route Handlers and Server Action workers).
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

  try {
    const db = getDb();
    db.prepare(
      'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).run(token, userId, now, session.expiresAt);
  } catch {
    // If DB is unavailable, session remains valid in memory
  }

  return { token, session: { userId, sessionId: token, expiresAt: session.expiresAt } };
}

/**
 * Revokes an active session, preventing further use.
 * Clears from memory cache and SQLite store.
 */
export function revokeSession(token: string): boolean {
  const memoryDeleted = activeSessions.delete(token);
  let dbDeleted = false;
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    dbDeleted = result.changes > 0;
  } catch {
    // Safe ignore
  }
  return memoryDeleted || dbDeleted;
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
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    if (result.changes > count) {
      count = result.changes;
    }
  } catch {
    // Safe ignore
  }
  return count;
}

/**
 * Validates a session token directly. Used internally and for testing.
 * Checks memory cache first, then falls back to persistent SQLite store
 * (bridging Route Handler and Server Action worker contexts in Next.js).
 * Returns null if token is missing, invalid, expired, or revoked.
 */
export function validateSessionToken(token: string | undefined | null): SessionContext | null {
  if (!token) return null;
  const now = Date.now();

  const session = activeSessions.get(token);
  if (session) {
    if (now > session.expiresAt) {
      activeSessions.delete(token);
      try {
        const db = getDb();
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      } catch {
        // Safe ignore
      }
      return null;
    }
    return { userId: session.userId, sessionId: session.sessionId, expiresAt: session.expiresAt };
  }

  // Not found in this worker's memory cache; check persistent SQLite store
  try {
    const db = getDb();
    const row = db.prepare(
      'SELECT token, user_id, created_at, expires_at FROM sessions WHERE token = ?'
    ).get(token) as { token: string; user_id: string; created_at: number; expires_at: number } | undefined;

    if (!row) return null;

    if (now > row.expires_at) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return null;
    }

    const restored: StoredSession = {
      userId: row.user_id,
      sessionId: row.token,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
    activeSessions.set(token, restored);
    return { userId: restored.userId, sessionId: restored.sessionId, expiresAt: restored.expiresAt };
  } catch {
    return null;
  }
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
 * Test helper: clears all sessions from memory and SQLite.
 */
export function _resetSessionsForTesting(): void {
  activeSessions.clear();
  try {
    const db = getDb();
    db.exec('DELETE FROM sessions');
  } catch {
    // Safe ignore
  }
}

/**
 * Test helper: returns the count of active sessions.
 */
export function _getActiveSessionCount(): number {
  try {
    const db = getDb();
    const row = db.prepare(
      'SELECT COUNT(*) as count FROM sessions WHERE expires_at > ?'
    ).get(Date.now()) as { count: number } | undefined;
    if (row && typeof row.count === 'number') {
      return row.count;
    }
  } catch {
    // Safe ignore
  }
  return activeSessions.size;
}
