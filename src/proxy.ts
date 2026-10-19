import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const nonce = randomBytes(18).toString('base64');
  const dev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' https: blob: data:", "media-src 'self' https: blob: data:",
    `connect-src 'self' https://*.x.ai wss://api.x.ai https://pulse.lens4web.com${dev ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
    "font-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce); requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (request.nextUrl.pathname.startsWith('/api/')) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (request.nextUrl.protocol === 'https:' || process.env.APP_ORIGIN?.trim().toLowerCase().startsWith('https://')) response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  if (!request.nextUrl.pathname.startsWith('/api/')) response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
