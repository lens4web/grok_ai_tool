export interface GenerationResult {
  type: 'text' | 'image' | 'audio' | 'video';
  content: string;
  urls?: string[];
  mime?: string;
  sourceUrl?: string;
  metadata?: unknown;
}
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function errorMessage(value: unknown): string {
  const data = object(value);
  if (typeof data.error === 'string') return data.error;
  if (typeof object(data.error).message === 'string') return String(object(data.error).message);
  if (typeof data.message === 'string') return data.message;
  return 'Неизвестная ошибка API xAI.';
}
function mediaUrl(value: unknown, type: string): string | undefined {
  if (typeof value !== 'string') return;
  if (value.startsWith('https://')) {
    try { const url = new URL(value); if (!url.username && !url.password) return value; } catch { return; }
  }
  const mimes: Record<string, string> = { image: '(?:png|jpeg|webp)', audio: '(?:mpeg|wav|pcm|basic)', video: 'mp4' };
  if (new RegExp(`^data:${type}/${mimes[type]};base64,[A-Za-z0-9+/]+={0,2}$`).test(value)) return value;
}
export function normalizeResponse(kind: string, value: unknown): GenerationResult {
  const data = object(value);
  if (data.error) throw new Error(errorMessage(data));
  if (kind === 'chat' || kind === 'stt') {
    if (data.status === 'failed') throw new Error(errorMessage(data));
    let text = typeof data.text === 'string' ? data.text : typeof data.output_text === 'string' ? data.output_text : '';
    if (!text && Array.isArray(data.output)) text = data.output.flatMap(item => {
      const output = object(item);
      if (output.type !== 'message' || !Array.isArray(output.content)) return [];
      return output.content.map(part => {
        const content = object(part);
        return typeof content.text === 'string' ? content.text : typeof content.refusal === 'string' ? content.refusal : '';
      });
    }).join('\n');
    if (!text && Array.isArray(data.choices)) text = String(object(object(data.choices[0]).message).content ?? '');
    if (!text.trim()) throw new Error(data.status === 'incomplete' ? 'Ответ не завершён: проверьте лимит токенов, включая рассуждения.' : 'API вернул пустой текстовый ответ.');
    return { type: 'text', content: text, metadata: { status: data.status, usage: data.usage, ...(data.status === 'incomplete' ? { warning: 'Ответ не завершён.', incomplete_details: data.incomplete_details } : {}), ...(kind === 'stt' ? { language: data.language, duration: data.duration, words: data.words, channels: data.channels } : {}) } };
  }
  if (kind === 'image') {
    const urls = Array.isArray(data.data) ? data.data.map(item => {
      const image = object(item);
      return mediaUrl(image.url, 'image') ?? (typeof image.b64_json === 'string' ? mediaUrl(`data:${typeof image.mime_type === 'string' ? image.mime_type : 'image/jpeg'};base64,${image.b64_json}`, 'image') : undefined);
    }).filter((url): url is string => !!url) : [];
    if (!urls.length) throw new Error('В ответе API нет изображений.');
    return { type: 'image', content: urls[0], urls, metadata: data.usage };
  }
  if (kind === 'video') {
    if (data.status === 'failed' || data.status === 'expired') throw new Error(data.status === 'expired' ? 'Задание генерации видео истекло.' : errorMessage(data));
    const video = object(data.video);
    if (video.respect_moderation === false) throw new Error('Видео заблокировано модерацией xAI.');
    const url = mediaUrl(video.url, 'video');
    if (!url) throw new Error('В завершённом ответе API нет video.url.');
    return { type: 'video', content: url, metadata: { duration: video.duration, model: data.model } };
  }
  if (kind === 'tts') {
    const mime = typeof data.content_type === 'string' && data.content_type.startsWith('audio/') ? data.content_type : 'audio/mpeg';
    if (typeof data.audio !== 'string' || !data.audio) throw new Error('API вернул пустой аудиоответ.');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data.audio) || data.audio.length % 4 !== 0) throw new Error('API вернул некорректный base64-аудиоответ.');
    return { type: 'audio', content: `data:${mime};base64,${data.audio}`, mime, metadata: { duration: data.duration, audio_timestamps: data.audio_timestamps } };
  }
  throw new Error('Неизвестный тип ответа.');
}
