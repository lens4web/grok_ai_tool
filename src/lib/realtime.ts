import type { Attachment, Parameters } from './options';
import type { GenerationResult } from './responses';

function encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function pcmWav(chunks: Uint8Array[], rate = 24000): Blob {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(44 + size);
  const view = new DataView(bytes.buffer);
  const word = (offset: number, text: string) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  word(0, 'RIFF'); view.setUint32(4, size + 36, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  word(36, 'data'); view.setUint32(40, size, true);
  let offset = 44;
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.length; });
  return new Blob([bytes], { type: 'audio/wav' });
}
async function inputPcm(file: Attachment): Promise<Uint8Array> {
  const context = new AudioContext();
  try {
    const source = await context.decodeAudioData(await (await fetch(file.url)).arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.ceil(source.duration * 24000), 24000);
    const node = offline.createBufferSource(); node.buffer = source; node.connect(offline.destination); node.start();
    const samples = (await offline.startRendering()).getChannelData(0);
    const pcm = new Uint8Array(samples.length * 2);
    const view = new DataView(pcm.buffer);
    samples.forEach((sample, i) => view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)), true));
    return pcm;
  } finally { await context.close(); }
}
export async function generateVoice(token: string, model: string, prompt: string, files: Attachment[], params: Parameters, signal: AbortSignal): Promise<GenerationResult> {
  // Decode before opening the socket so input can be sent immediately after session.updated.
  const pcm = files[0] ? await inputPcm(files[0]) : undefined;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`wss://api.x.ai/v1/realtime?model=${encodeURIComponent(model)}`, [`xai-client-secret.${token}`]);
    let settled = false;
    let sent = false;
    let transcript = '';
    const chunks: Uint8Array[] = [];
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); socket.close(); };
    const fail = (error: Error) => { if (settled) return; settled = true; cleanup(); reject(error); };
    const abort = () => fail(new DOMException('Генерация отменена.', 'AbortError'));
    const timer = setTimeout(() => fail(new Error('Истекло время ожидания голосовой модели.')), 180000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    const send = (value: unknown) => socket.send(JSON.stringify(value));
    socket.onopen = () => send({ type: 'session.update', session: {
      voice: params.custom_voice_id || params.voice,
      instructions: params.instructions || 'Отвечай на языке пользователя.',
      reasoning: { effort: params.reasoning_effort }, turn_detection: null,
      audio: { input: { format: { type: 'audio/pcm', rate: 24000 } }, output: { format: { type: 'audio/pcm', rate: 24000 }, speed: params.speed } },
    } });
    socket.onerror = () => fail(new Error('Не удалось подключиться к Realtime API xAI.'));
    socket.onclose = () => { if (!settled) fail(new Error('Realtime соединение закрыто до получения ответа.')); };
    socket.onmessage = event => {
      try {
        const data = JSON.parse(String(event.data));
        if (data.type === 'error') { fail(new Error(data.error?.message || 'Ошибка Realtime API.')); return; }
        if (data.type === 'session.updated' && !sent) {
          sent = true;
          if (pcm) {
            for (let i = 0; i < pcm.length; i += 4800) send({ type: 'input_audio_buffer.append', audio: encode(pcm.subarray(i, i + 4800)) });
            send({ type: 'input_audio_buffer.commit' });
          }
          if (prompt.trim()) send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }] } });
          send({ type: 'response.create' });
        }
        if (data.type === 'response.output_audio.delta' || data.type === 'response.audio.delta') chunks.push(Uint8Array.from(atob(data.delta), c => c.charCodeAt(0)));
        if (['response.output_audio_transcript.delta', 'response.audio_transcript.delta', 'response.output_text.delta', 'response.text.delta'].includes(data.type)) transcript += data.delta ?? '';
        if (data.type === 'response.done') {
          if (data.response?.status === 'failed' || data.response?.status === 'cancelled') { fail(new Error(data.response?.status_details?.error?.message || 'Голосовая генерация не завершена.')); return; }
          if (!chunks.length && !transcript) { fail(new Error('Голосовая модель вернула пустой ответ.')); return; }
          settled = true; cleanup();
          resolve(chunks.length ? { type: 'audio', content: URL.createObjectURL(pcmWav(chunks)), mime: 'audio/wav', metadata: { transcript } } : { type: 'text', content: transcript });
        }
      } catch (error) { fail(error instanceof Error ? error : new Error('Некорректное событие Realtime API.')); }
    };
  });
}
