import { NextRequest, NextResponse } from 'next/server';
import { createSession, deleteSession, getSession, limitConnections, readBoundedJson, requireSameOrigin, SecurityError, sessionCookieName, SESSION_SECONDS, validateKeyFormat } from '../../../lib/security';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store', Vary: 'Cookie, Origin, Sec-Fetch-Site' };
function fail(error: unknown) { return NextResponse.json({ error: error instanceof SecurityError ? error.message : 'Invalid connection request.' }, { status: error instanceof SecurityError ? error.status : 400, headers: { ...headers, ...(error instanceof SecurityError && error.status === 429 ? { 'Retry-After': '60' } : {}) } }); }
function cookie(req: NextRequest, response: NextResponse, id: string, maxAge: number) {
  const origin = process.env.APP_ORIGIN ?? req.nextUrl.origin;
  response.cookies.set(sessionCookieName(req), id, { httpOnly: true, secure: new URL(origin).protocol === 'https:', sameSite: 'strict', path: '/', maxAge });
  return response;
}
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    limitConnections();
    const body = await readBoundedJson(req, 1024) as { key?: unknown };
    if (!body || typeof body.key !== 'string') throw new SecurityError(400, 'Invalid xAI API key.');
    const key = body.key.trim();
    validateKeyFormat(key);
    // Verify credentials without starting a paid generation. Do not echo upstream errors.
    let verification: Response;
    try {
      verification = await fetch('https://api.x.ai/v1/models', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.any([req.signal, AbortSignal.timeout(15000)]) });
    } catch { throw new SecurityError(502, 'Unable to verify the xAI API key. Try again later.'); }
    if (verification.status === 401 || verification.status === 403) throw new SecurityError(401, 'xAI rejected this API key.');
    if (!verification.ok) throw new SecurityError(verification.status === 429 ? 429 : 502, 'Unable to verify the xAI API key. Try again later.');
    await verification.body?.cancel();
    const id = createSession(key);
    deleteSession(req);
    return cookie(req, NextResponse.json({ authenticated: true }, { headers }), id, SESSION_SECONDS);
  } catch (error) { return fail(error); }
}
export async function GET(req: NextRequest) {
  try {
    requireSameOrigin(req);
    try { getSession(req); return NextResponse.json({ authenticated: true }, { headers }); }
    catch { return NextResponse.json({ authenticated: false }, { headers }); }
  } catch (error) { return fail(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    requireSameOrigin(req); deleteSession(req);
    return cookie(req, NextResponse.json({ authenticated: false }, { headers }), '', 0);
  } catch (error) { return fail(error); }
}
