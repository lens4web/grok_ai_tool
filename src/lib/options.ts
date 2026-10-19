import { type AIModel, modelKind } from './models';

export type Parameters = Record<string, string | number | boolean>;
export type VideoMode = 'text' | 'image' | 'reference' | 'edit' | 'extend';
export interface Attachment {
  url: string;
  name: string;
  mime: string;
  role?: 'first' | 'last' | 'reference' | 'keyframe' | 'source';
  timestamp?: number;
  duration?: number;
}
export interface Option {
  key: string;
  label: string;
  type: 'select' | 'number' | 'boolean' | 'text';
  values?: readonly (string | number)[];
  min?: number;
  max?: number;
  step?: number;
  default: string | number | boolean;
}
export const voices = ['eve', 'ara', 'leo', 'rex', 'sal', 'altair', 'atlas', 'aurora', 'carina', 'castor', 'celeste', 'cosmo', 'helios', 'helix', 'iris', 'kepler', 'liora', 'lumen', 'luna', 'lux', 'naksh', 'orion', 'perseus', 'rigel', 'sirius', 'ursa', 'zagan', 'zenith'];
export const sampleRates = [8000, 16000, 22050, 24000, 44100, 48000];
export const imageRatios = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20', '21:9', '5:2'];
export const videoRatios = ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9', '5:2'];
export const ttsLanguages = ['auto', 'ru', 'en', 'ar-EG', 'ar-SA', 'ar-AE', 'bn', 'zh', 'fr', 'de', 'hi', 'id', 'it', 'ja', 'ko', 'pt-BR', 'pt-PT', 'es-MX', 'es-ES', 'tr', 'vi'];
const sttLanguages = ['', 'ru', 'en', 'ar', 'cs', 'da', 'nl', 'fil', 'fr', 'de', 'hi', 'id', 'it', 'ja', 'ko', 'mk', 'ms', 'fa', 'pl', 'pt', 'ro', 'es', 'sv', 'th', 'tr', 'vi'];
const select = (key: string, label: string, values: Option['values'], value: string | number): Option => ({ key, label, type: 'select', values, default: value });
const number = (key: string, label: string, min: number, max: number, value: number, step = 1): Option => ({ key, label, type: 'number', min, max, default: value, step });
const bool = (key: string, label: string, value = false): Option => ({ key, label, type: 'boolean', default: value });
const text = (key: string, label: string): Option => ({ key, label, type: 'text', default: '' });

export function videoModes(model: AIModel): VideoMode[] {
  if (model.id === 'grok-imagine-video-1.5-lite') return ['text', 'image'];
  if (model.id === 'grok-imagine-video-1.5') return ['text', 'image', 'reference'];
  return ['text', 'image', 'reference', 'edit', 'extend'];
}

export function getOptions(model: AIModel, params: Parameters = {}, mode: VideoMode = 'text'): Option[] {
  switch (modelKind(model)) {
    case 'chat': return [
      select('sampling', 'Управление вариативностью', ['default', 'temperature', 'top_p'], 'default'),
      ...(params.sampling === 'temperature' ? [number('temperature', 'Температура', 0, 2, 0.7, 0.1)] : []),
      ...(params.sampling === 'top_p' ? [number('top_p', 'Top P', 0, 1, 1, 0.05)] : []),
      number('max_output_tokens', 'Лимит токенов (0 = API по умолчанию)', 0, model.contextWindow ?? 128000, 0),
      ...(model.supportedParams?.reasoningEfforts ? [select('reasoning_effort', 'Усилие рассуждений', model.supportedParams.reasoningEfforts, model.id === 'grok-4.3' ? 'low' : 'high')] : []),
      select('response_format', 'Формат ответа', ['text', 'json_object', 'json_schema'], 'text'),
      ...(params.response_format === 'json_schema' ? [text('json_schema', 'JSON Schema: {name, schema, strict}')] : []),
      select('image_detail', 'Детализация входных изображений', ['auto', 'low', 'high'], 'auto'),
      text('instructions', 'Системная инструкция'),
      bool('web_search', 'Поиск в интернете'), bool('x_search', 'Поиск в X'),
    ];
    case 'image': return [
      select('resolution', 'Разрешение', model.supportedParams?.resolutions ?? ['1k', '2k'], '1k'),
      select('aspect_ratio', 'Пропорции', model.id === 'grok-imagine-image-2.0' ? imageRatios : imageRatios.filter(r => !['21:9', '5:2'].includes(r)), 'auto'),
      number('n', 'Количество изображений', 1, 10, 1),
      select('response_format', 'Формат изображения', ['url', 'b64_json'], 'url'),
      ...(model.id === 'grok-imagine-image-2.0' ? [select('quality', 'Качество', ['auto', 'low', 'medium'], 'auto')] : []),
    ];
    case 'video': return [
      ...(mode !== 'edit' ? [number('duration', mode === 'extend' ? 'Продление, секунд' : 'Длительность, секунд', mode === 'extend' ? 2 : 1, mode === 'extend' ? 10 : model.id === 'grok-imagine-video' && mode === 'reference' ? 10 : 15, mode === 'extend' ? 6 : 8)] : []),
      ...(!['edit', 'extend'].includes(mode) ? [
        select('resolution', 'Разрешение', ['grok-imagine-video-1.5', 'grok-imagine-video-1.5-lite'].includes(model.id) && mode !== 'reference' ? ['480p', '720p', '1080p'] : ['480p', '720p'], '480p'),
        select('aspect_ratio', 'Пропорции', ['', ...videoRatios], ''),
      ] : []),
      ...((['grok-imagine-video-1.5', 'grok-imagine-video-1.5-lite'].includes(model.id)) ? [bool('generate_audio', 'Генерировать звук', true)] : []),
    ];
    case 'tts': return [
      select('voice_id', 'Голос', voices, 'eve'), text('custom_voice_id', 'Свой voice_id (заменяет выбранный голос)'),
      select('language', 'Язык', ttsLanguages, 'auto'),
      select('codec', 'Аудиоформат', ['mp3', 'wav', 'pcm', 'mulaw', 'alaw'], 'mp3'),
      select('sample_rate', 'Частота, Гц', sampleRates, 24000),
      ...(params.codec === undefined || params.codec === 'mp3' ? [select('bit_rate', 'Битрейт MP3', [32000, 64000, 96000, 128000, 192000], 128000)] : []),
      number('speed', 'Скорость речи', 0.7, 1.5, 1, 0.1),
      bool('text_normalization', 'Нормализация текста'), bool('with_timestamps', 'Таймкоды символов'),
      text('replace', 'Замены произношения (JSON)'),
    ];
    case 'stt': return [
      select('language', 'Язык форматирования', params.format ? sttLanguages.filter(Boolean) : sttLanguages, params.format ? 'ru' : ''), bool('format', 'Форматировать числа и валюты'),
      bool('diarize', 'Различать говорящих'), bool('multichannel', 'Разделять аудиоканалы'), bool('filler_words', 'Слова-паразиты'),
      number('vad_threshold', 'Порог активности речи', 0, 1, 0.5, 0.05),
      select('audio_format', 'Формат входа', ['', 'pcm', 'mulaw', 'alaw'], ''),
      ...(params.audio_format ? [select('sample_rate', 'Частота RAW, Гц', sampleRates, 24000), ...(params.multichannel ? [number('channels', 'Каналы RAW', 2, 8, 2)] : [])] : []),
      text('keyterms', 'Ключевые слова (по одному на строку)'),
    ];
    case 'realtime': return [
      select('voice', 'Голос', voices, 'eve'), text('custom_voice_id', 'Свой voice_id (заменяет выбранный голос)'),
      select('reasoning_effort', 'Рассуждения', ['none', 'high'], 'high'),
      number('speed', 'Скорость речи', 0.7, 1.5, 1, 0.1),
      text('instructions', 'Системная инструкция'),
    ];
  }
}

// Used by UI and server: controls that disappear cannot leak into the next request.
export function normalizeParameters(model: AIModel, params: Parameters, mode: VideoMode): Parameters {
  return Object.fromEntries(getOptions(model, params, mode).map(option => {
    let value = params[option.key] ?? option.default;
    if (option.values && !['voice', 'voice_id'].includes(option.key) && !option.values.includes(value as string | number)) value = option.default;
    if (option.type === 'number' && typeof value === 'number') value = Math.max(option.min!, Math.min(option.max!, value));
    return [option.key, value];
  }));
}

export interface VideoConfiguration {
  mode: VideoMode;
  parameters: Parameters;
  files: Attachment[];
  referenceVoices: string[];
}

// A preset voice selects reference-to-video even without reference images.
export function configureVideoVoices(model: AIModel, current: VideoConfiguration, referenceVoices: string[]): VideoConfiguration {
  let { mode, files } = current;
  if (referenceVoices.length) {
    if (mode === 'image') files = files.map(file => ({ ...file, role: 'first' }));
    mode = 'reference';
  } else if (mode === 'reference') {
    if (!files.length) mode = 'text';
    else if (files.length === 1 && files[0].role === 'first') mode = 'image';
  }
  const parameters = normalizeParameters(model, {
    ...current.parameters,
    ...(referenceVoices.length ? { generate_audio: true } : {}),
    ...(mode === 'reference' && current.parameters.resolution === '1080p' ? { resolution: '720p' } : {}),
  }, mode);
  return { mode, files, parameters, referenceVoices };
}
