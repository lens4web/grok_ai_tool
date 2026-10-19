import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';

export const SESSION_COOKIE = 'grok_session';
export function sessionCookieName(req: NextRequest) { return new URL(process.env.APP_ORIGIN ?? req.nextUrl.origin).protocol === 'https:' ? '__Host-grok_session' : SESSION_COOKIE; }
export const SESSION_SECONDS = 8 * 60 * 60;
export class SecurityError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
interface Session { key: string; expires: number; jobs: Set<string>; active: number; requests: number[]; generations: number[] }
// A single Node process owns the vault. Never expose its contents to client code.
const shared = globalThis as typeof globalThis & { __grokSessions?: Map<string, Session>; __grokLogins?: number[]; __grokCapacity?: { active: number } };
const vault = shared.__grokSessions ??= new Map<string, Session>();
const logins = shared.__grokLogins ??= [];
const capacity = shared.__grokCapacity ??= { active: 0 };
function prune(now = Date.now()) {
  for (const [id, session] of vault) if (session.expires <= now) vault.delete(id);
}
export function requireSameOrigin(req: NextRequest) {
  const configured = process.env.APP_ORIGIN;
  if (process.env.NODE_ENV === 'production' && !configured) throw new SecurityError(503, 'Configure APP_ORIGIN before deployment.');
  let expected: string;
  try { expected = configured ? new URL(configured).origin : req.nextUrl.origin; }
  catch { throw new SecurityError(503, 'Configure a valid APP_ORIGIN before deployment.'); }
  if (process.env.NODE_ENV === 'production' && !expected.startsWith('https://') && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(expected).hostname)) {
    throw new SecurityError(503, 'HTTPS is required.');
  }
  if (req.headers.get('x-grok-request') !== '1') throw new SecurityError(403, 'Request verification failed.');
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') throw new SecurityError(403, 'Cross-site requests are blocked.');
  let source = req.headers.get('origin');
  if (!source) {
    try { source = new URL(req.headers.get('referer') ?? '').origin; } catch { /* Missing source is rejected. */ }
  }
  if (source !== expected && !(source === null && site === 'same-origin')) throw new SecurityError(403, 'Request origin is not allowed.');
}
export function validateKeyFormat(key: string) {
  if (!/^xai-[A-Za-z0-9_-]{10,250}$/.test(key)) throw new SecurityError(400, 'Invalid xAI API key.');
}
export function limitConnections() {
  const now = Date.now(); prune(now);
  while (logins.length && logins[0] < now - 60000) logins.shift();
  if (logins.length >= 20 || vault.size >= 1000) throw new SecurityError(429, 'Too many connections. Try again later.');
  logins.push(now);
}
export function createSession(key: string) {
  validateKeyFormat(key);
  const now = Date.now(); prune(now);
  if (vault.size >= 1000) throw new SecurityError(429, 'Too many connections. Try again later.');
  const id = randomBytes(32).toString('base64url');
  const session: Session = { key, expires: now + SESSION_SECONDS * 1000, jobs: new Set(), active: 0, requests: [], generations: [] };
  vault.set(id, session);
  setTimeout(() => vault.delete(id), SESSION_SECONDS * 1000).unref();
  return id;
}
export function deleteSession(req: NextRequest) { const id = req.cookies.get(sessionCookieName(req))?.value; if (id) vault.delete(id); }
export function getSession(req: NextRequest) {
  prune();
  const session = vault.get(req.cookies.get(sessionCookieName(req))?.value ?? '');
  if (!session) throw new SecurityError(401, 'Session expired. Connect your xAI key again.');
  return session;
}
export function limitSession(session: Session, generation = false) {
  const now = Date.now();
  session.requests = session.requests.filter(time => time > now - 60000);
  session.generations = session.generations.filter(time => time > now - 60000);
  if (session.requests.length >= 100 || (generation && session.generations.length >= 12)) throw new SecurityError(429, 'Request limit reached. Try again later.');
  session.requests.push(now);
  if (generation) session.generations.push(now);
}
export function beginGeneration(session: Session) {
  if (session.active >= 2 || capacity.active >= 4) throw new SecurityError(429, 'Too many active requests.');
  session.active++; capacity.active++;
  let released = false;
  return () => { if (!released) { released = true; session.active--; capacity.active--; } };
}
export { redactSecrets } from './redaction';
export async function readBoundedJson(req: NextRequest, maxBytes = 72 * 1024 * 1024): Promise<unknown> {
  if (!/^application\/json(?:;|$)/i.test(req.headers.get('content-type') ?? '')) throw new SecurityError(415, 'JSON content type is required.');
  if (Number(req.headers.get('content-length')) > maxBytes) throw new SecurityError(413, 'Request body is too large.');
  const reader = req.body?.getReader();
  if (!reader) throw new SecurityError(400, 'Request body is missing.');
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(maxBytes <= 1024 ? 15000 : 120000)]);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      if (signal.aborted) throw new SecurityError(408, 'Upload interrupted or timed out.');
      const { value, done } = await reader.read();
      if (signal.aborted) throw new SecurityError(408, 'Upload interrupted or timed out.');
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new SecurityError(413, 'Request body is too large.'); }
      chunks.push(value);
    }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
