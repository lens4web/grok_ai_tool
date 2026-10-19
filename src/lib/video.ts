import { abortableDelay } from './client';
import { readMediaBytes } from './media';

export const MAX_VIDEO_BYTES = 256 * 1024 * 1024;
export async function downloadVideo(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const asset = new URL(url);
  if (asset.protocol !== 'https:' || !['vidgen.x.ai', 'files-cdn.x.ai'].includes(asset.hostname) || asset.port || asset.username || asset.password) throw new Error('xAI вернул недопустимый адрес видео.');
  for (let attempt = 0; attempt < 3; attempt++) {
    // Never forward the API key to media hosts or follow redirects.
    const response = await fetch(asset.href, { signal, cache: 'no-store', redirect: 'error' });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 404 && attempt < 2) { await abortableDelay(1000, signal); continue; }
      throw new Error(`Файл видео xAI недоступен (HTTP ${response.status}). Повторите проверку задания; если ошибка остаётся, файл отсутствует или временная ссылка истекла.`);
    }
    const bytes = await readMediaBytes(response, MAX_VIDEO_BYTES, signal);
    if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw new Error('xAI вернул некорректный MP4-файл вместо видео.');
    return bytes;
  }
  throw new Error('Файл видео xAI недоступен.');
}
