import { NextRequest, NextResponse } from 'next/server';
import { buildRequest, ValidationError } from '../../../lib/requests';
import { modelKind } from '../../../lib/models';
import { errorMessage, normalizeResponse, object } from '../../../lib/responses';
import { beginGeneration, getSession, limitSession, readBoundedJson, redactSecrets, requireSameOrigin, SecurityError } from '../../../lib/security';
import { downloadVideo } from '../../../lib/video';
import { receiveImages } from '../../../lib/images';
import { readMediaBytes } from '../../../lib/media';

export const runtime = 'nodejs';
const baseUrl = 'https://api.x.ai/v1';
const headers = { 'Cache-Control': 'no-store', Vary: 'Cookie, Origin, Sec-Fetch-Site' };
function json(data: unknown, status = 200) { return NextResponse.json(redactSecrets(data), { status, headers }); }

async function upstream(req: NextRequest, endpoint: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${endpoint}`, {
    ...init, cache: 'no-store', redirect: 'error',
    signal: AbortSignal.any([req.signal, AbortSignal.timeout(endpoint === '/responses' ? 3_600_000 : endpoint === '/tts' ? 600_000 : 120_000)]),
    headers: { Authorization: `Bearer ${getSession(req).key}`, ...init.headers },
  });
}
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try { return JSON.parse(text); } catch {
    return { error: `xAI: HTTP ${response.status}; ответ не в формате JSON. ${text.replace(/<[^>]*>/g, '').slice(0, 200)}` };
  }
}
async function upstreamError(response: Response) {
  const message = errorMessage(await readJson(response));
  const result = json({ error: message }, response.status >= 400 && response.status <= 599 ? response.status : 502);
  const retry = response.headers.get('retry-after');
  if (retry) result.headers.set('Retry-After', retry);
  return result;
}
function failure(error: unknown) {
  if (error instanceof SecurityError) { const response = json({ error: error.message }, error.status); if (error.status === 429) response.headers.set('Retry-After', '60'); return response; }
  if (error instanceof ValidationError || error instanceof SyntaxError) return json({ error: error.message }, 400);
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return json({ error: 'Запрос прерван или превышено время ожидания xAI.' }, 504);
  return json({ error: error instanceof Error ? error.message : 'Ошибка обращения к xAI.' }, 502);
}

export async function POST(req: NextRequest) {
  let release: (() => void) | undefined;
  try {
    requireSameOrigin(req);
    const session = getSession(req);
    limitSession(session, true);
    release = beginGeneration(session);
    const { model, endpoint, body, input } = buildRequest(await readBoundedJson(req));
    const kind = modelKind(model);
    if (kind === 'video' && session.jobs.size >= 100) throw new SecurityError(429, 'Video history limit reached. Reconnect your key to start a new session.');
    let requestBody: BodyInit;
    let requestHeaders: Record<string, string> = {};
    if (kind === 'stt') {
      const form = new FormData();
      for (const [key, val] of Object.entries(body)) {
        if (key === 'keyterms') { for (const term of val as string[]) form.append('keyterm', term); }
        else if (val !== '') form.append(key, String(val));
      }
      const file = input.files[0];
      const bytes = Buffer.from(file.url.split(',')[1], 'base64');
      form.append('file', new Blob([bytes], { type: file.mime }), file.name);
      requestBody = form;
    } else {
      requestHeaders = { 'Content-Type': 'application/json' };
      requestBody = JSON.stringify(body);
    }
    const response = await upstream(req, endpoint, { method: 'POST', headers: requestHeaders, body: requestBody });
    if (!response.ok) return upstreamError(response);
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (kind === 'tts' && (contentType.startsWith('audio/') || contentType === 'application/octet-stream')) {
      const bytes = await readMediaBytes(response, 256 * 1024 * 1024, AbortSignal.any([req.signal, AbortSignal.timeout(120000)]));
      if (!bytes.length) throw new Error('API вернул пустой аудиофайл.');
      const codecMimes: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', pcm: 'audio/pcm', mulaw: 'audio/basic', alaw: 'audio/alaw' };
      const mime = contentType.startsWith('audio/') ? contentType : codecMimes[String(input.parameters.codec)];
      return json({ result: { type: 'audio', content: `data:${mime};base64,${bytes.toString('base64')}`, mime } });
    }
    const data = object(await readJson(response));
    if (kind === 'realtime') {
      if (typeof data.value !== 'string' || !data.value) throw new Error(errorMessage(data));
      return NextResponse.json({ token: data.value, expires_at: data.expires_at }, { headers });
    }
    if (kind === 'video' && typeof data.request_id === 'string') { session.jobs.add(data.request_id); return json({ request_id: data.request_id, status: 'pending' }, 202); }
    const result = normalizeResponse(kind, data);
    return json({ result: kind === 'image' ? await receiveImages(result, AbortSignal.any([req.signal, AbortSignal.timeout(120000)])) : result });
  } catch (error) { return failure(error); } finally { release?.(); }
}

// Each status check is a short request; video generation never holds a server connection for minutes.
export async function GET(req: NextRequest) {
  let release: (() => void) | undefined;
  try {
    requireSameOrigin(req);
    const session = getSession(req);
    limitSession(session);
    if (req.nextUrl.searchParams.get('action') === 'voices') {
      const response = await upstream(req, '/tts/voices');
      if (!response.ok) return upstreamError(response);
      const data = object(await readJson(response));
      if (!Array.isArray(data.voices)) throw new Error('Некорректный список голосов xAI.');
      return json({ voices: data.voices.map(v => object(v)).filter(v => typeof v.voice_id === 'string').map(v => ({ voice_id: v.voice_id, name: v.name })) });
    }
    const requestId = req.nextUrl.searchParams.get('request_id');
    if (!requestId || !/^[a-zA-Z0-9_-]{1,200}$/.test(requestId)) return json({ error: 'Некорректный request_id.' }, 400);
    if (!session.jobs.has(requestId)) throw new SecurityError(403, 'This video job does not belong to your session.');
    const download = req.nextUrl.searchParams.get('action') === 'download';
    if (download) release = beginGeneration(session);
    const response = await upstream(req, `/videos/${encodeURIComponent(requestId)}`);
    if (!response.ok) return upstreamError(response);
    const data = object(await readJson(response));
    if (data.status === 'pending') return json({ status: 'pending', request_id: requestId }, 202);
    if (data.status !== 'done' && data.status !== 'failed' && data.status !== 'expired') throw new Error(errorMessage(data));
    const result = normalizeResponse('video', data);
    if (download) {
      const bytes = await downloadVideo(result.content, AbortSignal.any([req.signal, AbortSignal.timeout(120000)]));
      return new NextResponse(new Blob([bytes as BlobPart], { type: 'video/mp4' }), { headers: { ...headers, 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.byteLength), 'X-Content-Type-Options': 'nosniff' } });
    }
    return json({ result });
  } catch (error) { return failure(error); } finally { release?.(); }
}
