import { xaiModels, modelKind, type AIModel } from './models';
import { getOptions, videoModes, type Attachment, type Parameters, type VideoMode } from './options';

export class ValidationError extends Error {}
export interface GenerateInput {
  model: string;
  prompt: string;
  parameters: Parameters;
  files: Attachment[];
  mode: VideoMode;
  referenceVoices: string[];
}
export interface BuiltRequest { model: AIModel; endpoint: string; body: Record<string, unknown>; input: GenerateInput }
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message);
}
const imageMimes = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const sttExtensions = /\.(mp3|wav|flac|ogg|opus|m4a|mp4|aac|webm|aiff|aif|amr|caf|pcm|raw|mulaw|alaw)$/i;

export function validateAttachment(file: Attachment, kind: ReturnType<typeof modelKind>, mode: VideoMode) {
  assert(file && typeof file.url === 'string' && typeof file.name === 'string' && typeof file.mime === 'string', 'Некорректное вложение.');
  const image = kind === 'chat' || kind === 'image' || (kind === 'video' && !['edit', 'extend'].includes(mode));
  if (image) assert((kind === 'chat' ? ['image/jpeg', 'image/png'] : imageMimes).includes(file.mime), kind === 'chat' ? 'Текстовые модели принимают изображения JPEG или PNG.' : 'Поддерживаются изображения JPEG, PNG, WebP.');
  if (kind === 'video' && !image) assert(file.mime === 'video/mp4' && /\.mp4$/i.test(file.name), 'Для обработки видео требуется MP4.');
  if (kind === 'stt') assert(sttExtensions.test(file.name), 'Неподдерживаемый аудиоформат.');
  if (kind === 'realtime') assert(file.mime.startsWith('audio/') || file.mime === 'video/webm', 'Для голосовой модели требуется аудиофайл.');
  const data = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(file.url);
  assert(data && data[1] === file.mime && data[2].length > 0 && data[2].length % 4 === 0, 'Требуется корректный base64 data URI файла.');
  const bytes = data[2].length * 3 / 4 - (data[2].endsWith('==') ? 2 : data[2].endsWith('=') ? 1 : 0);
  assert(bytes <= (kind === 'chat' ? 20 * 1024 * 1024 : MAX_FILE_BYTES), kind === 'chat' ? 'Изображение для текстовой модели превышает 20 МиБ.' : 'Размер файла превышает 25 МБ.');
}

export function buildRequest(raw: unknown): BuiltRequest {
  assert(raw && typeof raw === 'object' && !Array.isArray(raw), 'Требуется JSON объект.');
  const value = raw as Record<string, unknown>;
  const model = xaiModels.find(item => item.id === value.model);
  assert(model, 'Неизвестная модель.');
  const kind = modelKind(model);
  const prompt = value.prompt ?? '';
  assert(typeof prompt === 'string', 'Запрос должен быть строкой.');
  const mode = (value.mode ?? 'text') as VideoMode;
  if (kind === 'video') assert(videoModes(model).includes(mode), 'Режим не поддерживается этой видеомоделью.');
  const files = (value.files ?? []) as Attachment[];
  assert(Array.isArray(files), 'files должен быть массивом.');
  const limit = kind === 'video' ? mode === 'reference' ? model.id === 'grok-imagine-video-1.5' ? 14 : 7 : mode === 'text' ? 0 : 1 : model.maxAttachments ?? 50;
  assert(files.length <= limit, `Максимум вложений для этого режима: ${limit}.`);
  files.forEach(file => validateAttachment(file, kind, mode));
  assert(files.reduce((sum, file) => sum + file.url.length * 3 / 4, 0) <= MAX_TOTAL_BYTES, 'Общий размер вложений превышает 50 МБ.');
  const supplied = (value.parameters ?? {}) as Parameters;
  assert(supplied && typeof supplied === 'object' && !Array.isArray(supplied), 'parameters должен быть объектом.');
  if (kind === 'stt' && supplied.format === true) assert(typeof supplied.language === 'string' && supplied.language.trim(), 'Для форматирования транскрипции выберите язык.');
  const options = getOptions(model, supplied, mode);
  for (const [key, val] of Object.entries(supplied)) {
    const option = options.find(item => item.key === key);
    assert(option, `Параметр ${key} не поддерживается в этом режиме.`);
    if (['voice', 'voice_id'].includes(key)) assert(typeof val === 'string' && /^[a-z0-9_-]{1,100}$/i.test(val), 'Некорректный идентификатор голоса.');
    else if (option.values) assert(option.values.includes(val as string | number), `Недопустимое значение ${key}.`);
    if (option.type === 'boolean') assert(typeof val === 'boolean', `${key} должен быть boolean.`);
    if (option.type === 'text') assert(typeof val === 'string', `${key} должен быть строкой.`);
    if (option.type === 'number') {
      assert(typeof val === 'number' && Number.isFinite(val) && val >= option.min! && val <= option.max!, `${key} вне допустимого диапазона.`);
      if (option.step === 1) assert(Number.isInteger(val), `${key} должен быть целым числом.`);
    }
  }
  const p: Parameters = Object.fromEntries(options.map(option => [option.key, supplied[option.key] ?? option.default]));
  const referenceVoices = (value.referenceVoices ?? []) as string[];
  assert(Array.isArray(referenceVoices) && referenceVoices.length <= 3 && referenceVoices.every(v => typeof v === 'string' && /^[a-z0-9_-]{1,100}$/i.test(v)), 'Допускается до трёх voice_id.');
  assert(referenceVoices.length === 0 || (kind === 'video' && model.id === 'grok-imagine-video-1.5' && mode === 'reference' && p.generate_audio !== false), 'Голоса доступны в режиме референсов Video 1.5 со звуком.');
  if (p.custom_voice_id) assert(typeof p.custom_voice_id === 'string' && /^[a-z0-9_-]{1,100}$/i.test(p.custom_voice_id), 'Некорректный custom voice_id.');
  const input: GenerateInput = { model: model.id, prompt, parameters: p, files, mode, referenceVoices };
  const body: Record<string, unknown> = { model: model.id };
  let endpoint = '/responses';

  if (kind === 'chat') {
    assert(prompt.trim() || files.length, 'Введите текст или приложите изображение.');
    const instructions = [p.instructions, p.response_format === 'json_object' ? 'Return the answer as a valid JSON object.' : ''].filter(Boolean).join('\n');
    body.input = [{ role: 'user', content: [ ...(prompt ? [{ type: 'input_text', text: prompt }] : []), ...files.map(f => ({ type: 'input_image', image_url: f.url, detail: p.image_detail }))] }];
    if (instructions) body.instructions = instructions;
    if (p.sampling === 'temperature') body.temperature = p.temperature;
    if (p.sampling === 'top_p') body.top_p = p.top_p;
    if (p.max_output_tokens) body.max_output_tokens = p.max_output_tokens;
    if (p.reasoning_effort) body.reasoning = { effort: p.reasoning_effort };
    body.text = { format: { type: p.response_format } };
    if (p.response_format === 'json_schema') {
      let schema: unknown;
      try { schema = JSON.parse(String(p.json_schema)); } catch { throw new ValidationError('Введите корректный JSON Schema.'); }
      assert(schema && typeof schema === 'object' && !Array.isArray(schema), 'JSON Schema должен быть объектом.');
      const format = schema as Record<string, unknown>;
      assert(typeof format.name === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(format.name) && format.schema && typeof format.schema === 'object' && !Array.isArray(format.schema), 'JSON Schema требует name и объект schema.');
      assert(format.strict === undefined || typeof format.strict === 'boolean', 'strict должен быть boolean.');
      body.text = { format: { type: 'json_schema', name: format.name, schema: format.schema, ...(format.strict === undefined ? {} : { strict: format.strict }) } };
    }
    body.tools = [ ...(p.web_search ? [{ type: 'web_search' }] : []), ...(p.x_search ? [{ type: 'x_search' }] : [])];
    body.store = false;
  } else if (kind === 'image') {
    assert(prompt.trim(), 'Введите описание изображения или правок.');
    endpoint = files.length ? '/images/edits' : '/images/generations';
    Object.assign(body, { prompt, resolution: p.resolution, aspect_ratio: p.aspect_ratio, n: p.n, response_format: p.response_format });
    if (p.quality) body.quality = p.quality;
    if (files.length === 1) body.image = { url: files[0].url, type: 'image_url' };
    if (files.length > 1) body.images = files.map(f => ({ url: f.url }));
  } else if (kind === 'video') {
    endpoint = mode === 'edit' ? '/videos/edits' : mode === 'extend' ? '/videos/extensions' : '/videos/generations';
    if (mode === 'text' || mode === 'edit' || mode === 'extend') assert(prompt.trim(), 'Для выбранного режима нужен текстовый запрос.');
    if (prompt.trim()) body.prompt = prompt;
    if (mode !== 'edit') body.duration = p.duration;
    if (!['edit', 'extend'].includes(mode)) {
      body.resolution = p.resolution;
      if (mode !== 'image' && p.aspect_ratio) body.aspect_ratio = p.aspect_ratio;
    }
    if (p.generate_audio !== undefined) body.generate_audio = p.generate_audio;
    if (mode === 'image') {
      assert(files.length === 1, 'Для анимации требуется одно изображение.');
      body.image = { url: files[0].url };
    }
    if (mode === 'reference') {
      assert(files.length || referenceVoices.length, 'Добавьте референсы, закреплённые кадры или голос.');
      const first = files.filter(f => f.role === 'first');
      const last = files.filter(f => f.role === 'last');
      const keys = files.filter(f => f.role === 'keyframe');
      const references = files.filter(f => f.role === 'reference');
      assert(first.length + last.length + keys.length + references.length === files.length, 'Укажите роль каждого изображения.');
      assert(first.length <= 1 && last.length <= 1 && keys.length <= 4 && references.length <= 7, 'Лимиты: один первый/последний кадр, четыре ключевых, семь референсов.');
      if (model.id === 'grok-imagine-video') {
        assert(!first.length && !last.length && !keys.length, 'Закреплённые кадры поддерживает только Video 1.5.');
        assert(prompt.trim(), 'Классическая модель требует текст для референсов.');
      }
      if (first.length) body.image = { url: first[0].url };
      if (last.length) body.last_frame = { url: last[0].url };
      if (references.length) body.reference_images = references.map(f => ({ url: f.url }));
      if (referenceVoices.length) {
        assert(prompt.trim() || files.length, 'Для референса только с голосом требуется текст.');
        body.reference_audios = referenceVoices.map(voice_id => ({ voice_id }));
      }
      const slots = new Set<number>();
      for (const file of keys) {
        assert(typeof file.timestamp === 'number' && Number.isFinite(file.timestamp) && file.timestamp > 0 && file.timestamp < Number(p.duration), 'Время ключевого кадра должно быть внутри видео.');
        const slot = Math.round(file.timestamp * 3);
        assert(slot > 0 && slot < Number(p.duration) * 3 && !slots.has(slot), 'Ключевые кадры должны занимать разные позиции сетки 1/3 с внутри видео.');
        slots.add(slot);
      }
      if (keys.length) body.keyframes = keys.map(f => ({ image: { url: f.url }, timestamp_s: f.timestamp })).sort((a, b) => a.timestamp_s! - b.timestamp_s!);
    }
    if (mode === 'edit' || mode === 'extend') {
      assert(files.length === 1, 'Требуется одно исходное MP4 видео.');
      const duration = files[0].duration;
      assert(typeof duration === 'number' && Number.isFinite(duration) && (mode === 'edit' ? duration > 0 && duration <= 8.7 : duration >= 2 && duration <= 15), mode === 'edit' ? 'Редактирование: исходное видео до 8,7 с.' : 'Продление: исходное видео от 2 до 15 с.');
      body.video = { url: files[0].url };
    }
  } else if (kind === 'tts') {
    assert(prompt.trim() && [...prompt].length <= 60000, 'Для TTS нужен текст от 1 до 60 000 символов.');
    endpoint = '/tts';
    delete body.model;
    body.text = prompt;
    body.voice_id = p.custom_voice_id || p.voice_id;
    body.language = p.language;
    body.output_format = { codec: p.codec, sample_rate: p.sample_rate, ...(p.codec === 'mp3' ? { bit_rate: p.bit_rate } : {}) };
    body.speed = p.speed;
    body.text_normalization = p.text_normalization;
    body.with_timestamps = p.with_timestamps;
    if (p.replace) {
      let replace: unknown;
      try { replace = JSON.parse(String(p.replace)); } catch { throw new ValidationError('Замены произношения должны быть JSON объектом.'); }
      assert(replace && typeof replace === 'object' && !Array.isArray(replace), 'Замены произношения должны быть JSON объектом.');
      const entries = Object.entries(replace);
      assert(entries.length <= 200 && entries.every(([key, val]) => key.length <= 100 && /^[\p{L}\p{N}' ]+$/u.test(key) && typeof val === 'string' && val.length > 0 && val.length <= 128), 'Некорректная карта замен произношения.');
      body.replace = replace;
    }
  } else if (kind === 'stt') {
    assert(files.length === 1 && !prompt.trim(), 'Для транскрибации приложите один аудиофайл; текстовый запрос не используется.');
    assert(!p.format || p.language, 'Для форматирования транскрипции выберите язык.');
    const rawAudio = /\.(pcm|raw|mulaw|alaw)$/i.test(files[0].name);
    assert(Boolean(p.audio_format) === rawAudio, rawAudio ? 'Укажите формат RAW аудио и частоту.' : 'Для контейнерного аудио поле RAW формата должно быть пустым.');
    const terms = String(p.keyterms).split('\n').map(s => s.trim()).filter(Boolean);
    assert(terms.length <= 100 && terms.every(t => t.length <= 50), 'Не более 100 ключевых слов, до 50 символов каждое.');
    endpoint = '/stt';
    Object.assign(body, p, { keyterms: terms });
  } else {
    assert(prompt.trim() || files.length, 'Введите текст или приложите аудио.');
    endpoint = '/realtime/client_secrets';
    delete body.model;
    body.expires_after = { seconds: 300 };
  }
  return { model, endpoint, body, input };
}
