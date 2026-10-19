import { readMediaBytes } from './media';
import type { GenerationResult } from './responses';

export async function receiveImages(result: GenerationResult, signal: AbortSignal): Promise<GenerationResult> {
  const urls: string[] = [];
  let total = 0;
  for (const source of result.urls ?? [result.content]) {
    let bytes: Buffer;
    if (source.startsWith('data:')) {
      const base64 = source.split(',')[1];
      if (!base64 || base64.length % 4 !== 0) throw new Error('xAI вернул некорректное base64-изображение.');
      bytes = Buffer.from(base64, 'base64');
      if (bytes.length > 25 * 1024 * 1024) throw new Error('Изображение превышает лимит результата 25 MiB.');
    } else {
      const url = new URL(source);
      if (url.protocol !== 'https:' || !['imgen.x.ai', 'files-cdn.x.ai'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('xAI вернул недопустимый адрес изображения.');
      const response = await fetch(url.href, { signal, cache: 'no-store', redirect: 'error' });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Изображение xAI недоступно (HTTP ${response.status}).`); }
      bytes = await readMediaBytes(response, 25 * 1024 * 1024, signal);
    }
    const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : undefined;
    if (!mime) throw new Error('xAI вернул некорректный файл изображения.');
    total += bytes.length;
    urls.push(`data:${mime};base64,${bytes.toString('base64')}`);
    if (total > 50 * 1024 * 1024) throw new Error('Изображения превышают общий лимит результата 50 MiB.');
  }
  return { ...result, content: urls[0], urls, ...(result.content.startsWith('https://') ? { sourceUrl: result.content } : {}) };
}
