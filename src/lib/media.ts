export async function readMediaBytes(response: Response, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('Медиафайл превышает лимит скачивания.'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('xAI вернул пустой медиафайл.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Медиафайл превышает лимит скачивания.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (!size) throw new Error('xAI вернул пустой медиафайл.');
  return Buffer.concat(chunks);
}
