export type SessionContext = {
  userId: string;
};

/**
 * Minimal authentication module for SentinAI Guardian (Milestone R5A)
 * Validates session context via configured DEMO_SESSION_TOKEN in cookies or Authorization header.
 * Returns null if missing or invalid.
 */
export async function verifySession(): Promise<SessionContext | null> {
  const configuredToken = process.env.DEMO_SESSION_TOKEN;
  if (!configuredToken) {
    return null;
  }

  try {
    const { cookies, headers } = await import('next/headers');
    
    // 1. Check HTTP-only cookie
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('sentinai_session')?.value;
    if (sessionCookie && sessionCookie === configuredToken) {
      return { userId: "operator-1" };
    }

    // 2. Check Authorization header
    const headerStore = await headers();
    const authHeader = headerStore.get('authorization');
    if (authHeader && (authHeader === `Bearer ${configuredToken}` || authHeader === configuredToken)) {
      return { userId: "operator-1" };
    }
  } catch {
    // Outside active Next.js request context (e.g. testing or CLI)
  }

  // Fallback environment override for test or headless execution
  if (process.env.SENTINAI_AUTH_OVERRIDE === configuredToken) {
    return { userId: "operator-1" };
  }

  return null;
}
