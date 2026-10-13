import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as loginPost, GET as loginGet } from '../login/route';
import { POST as logoutPost } from '../logout/route';
import { _resetSessionsForTesting } from '@/core/security/auth';

describe('R5E Authentication API Routes', () => {
  beforeEach(() => {
    _resetSessionsForTesting();
    process.env.OPERATOR_PASSWORD = 'super-secret-operator-password';
  });

  it('L1: Login succeeds with correct password and sets HTTP-only cookie', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'super-secret-operator-password' }),
    });

    const res = await loginPost(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.userId).toBe('operator-1');
    expect(data.expiresAt).toBeDefined();

    // Verify session cookie was set
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('sentinai_session=');
    expect(setCookie).toContain('HttpOnly');
  });

  it('L2: Login fails with incorrect password (401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' }),
    });

    const res = await loginPost(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Invalid credentials.');
  });

  it('L3: Login fails when password is missing (400)', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await loginPost(req);
    expect(res.status).toBe(400);
  });

  it('L4: Logout clears session and removes cookie', async () => {
    // 1. Login first
    const loginReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'super-secret-operator-password' }),
    });
    const loginRes = await loginPost(loginReq);
    const setCookie = loginRes.headers.get('set-cookie') || '';
    const tokenMatch = setCookie.match(/sentinai_session=([^;]+)/);
    const sessionToken = tokenMatch ? tokenMatch[1] : '';

    // 2. Logout with the session cookie
    const logoutReq = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: `sentinai_session=${sessionToken}`,
      },
    });

    const logoutRes = await logoutPost(logoutReq);
    expect(logoutRes.status).toBe(200);

    const logoutCookie = logoutRes.headers.get('set-cookie');
    expect(logoutCookie).toContain('sentinai_session=;');
  });

  it('L5: GET /api/auth/login returns authenticated: false when unauthenticated', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'GET',
    });

    const res = await loginGet(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.authenticated).toBe(false);
  });
});
