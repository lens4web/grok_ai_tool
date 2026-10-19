export function requestHeaders(json = false): Record<string, string> { return { 'X-Grok-Request': '1', ...(json ? { 'Content-Type': 'application/json' } : {}) }; }
import { errorMessage, object, type GenerationResult } from './responses';
export async function readApiResponse(response: Response, reportExpiredSession = true): Promise<Record<string, unknown>> {
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error(`Сервер вернул ответ не в JSON (HTTP ${response.status}).`); }
  if (reportExpiredSession && response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('grok-session-expired'));
  if (!response.ok) throw new Error(errorMessage(data));
  return object(data);
}
export async function localizeImages(result: GenerationResult, signal: AbortSignal): Promise<GenerationResult> {
  const urls: string[] = [];
  try {
    for (const source of result.urls ?? [result.content]) {
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(source)) throw new Error('Сервер не вернул файл изображения.');
      const blob = await (await fetch(source, { signal })).blob();
      signal.throwIfAborted();
      if (!blob.size) throw new Error('Сервер вернул пустое изображение.');
      urls.push(URL.createObjectURL(blob));
    }
    return { ...result, content: urls[0], urls, sourceUrl: result.sourceUrl ?? result.content };
  } catch (error) { urls.forEach(url => URL.revokeObjectURL(url)); throw error; }
}
export async function pollVideo(requestId: string, signal: AbortSignal, onStatus: (value: string) => void): Promise<GenerationResult> {
  const deadline = Date.now() + 15 * 60 * 1000;
  let failures = 0;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetch(`/api/grok?request_id=${encodeURIComponent(requestId)}`, { headers: requestHeaders(), signal });
    } catch (error) {
      signal.throwIfAborted();
      if (++failures > 5) throw error;
      onStatus(`Сеть недоступна. Повтор проверки (${failures}/5)…`);
      await abortableDelay(5000, signal);
      continue;
    }
    if ([429, 500, 502, 503, 504].includes(response.status)) {
      if (++failures > 5) throw new Error('Не удалось проверить статус видео. Можно возобновить ожидание по request_id.');
      onStatus(`Повтор проверки статуса (${failures}/5)…`);
    } else {
      const data = await readApiResponse(response);
      failures = 0;
      if (data.result) {
        const result = data.result as unknown as GenerationResult;
        onStatus('Получение видеофайла…');
        const media = await fetch(`/api/grok?action=download&request_id=${encodeURIComponent(requestId)}`, { headers: requestHeaders(), signal });
        if (!media.ok) await readApiResponse(media);
        if (media.headers.get('content-type')?.split(';')[0] !== 'video/mp4') throw new Error('Сервер не вернул готовый MP4-файл. Повторите проверку задания.');
        const blob = await media.blob();
        signal.throwIfAborted();
        if (!blob.size) throw new Error('Сервер вернул пустой видеофайл.');
        return { ...result, sourceUrl: result.content, content: URL.createObjectURL(blob), mime: 'video/mp4' };
      }
      if (data.status !== 'pending') throw new Error('Неизвестный статус задания видео.');
      onStatus(`Видео генерируется. Задание: ${requestId}`);
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    await abortableDelay(Math.min(60000, Math.max(5000, Number.isFinite(retryAfter) ? retryAfter * 1000 : 5000)), signal);
  }
  throw new Error('Ожидание видео превысило 15 минут. Можно продолжить проверку по request_id.');
}
export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
