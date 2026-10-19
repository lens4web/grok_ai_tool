import messages from './locales/messages.json';

export const languages = [
  ['en', 'English'], ['ru', 'Русский'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'],
  ['pt', 'Português'], ['it', 'Italiano'], ['zh', '中文'], ['ja', '日本語'], ['ko', '한국어'],
  ['ar', 'العربية'], ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['tr', 'Türkçe'], ['id', 'Bahasa Indonesia'],
  ['vi', 'Tiếng Việt'], ['th', 'ไทย'], ['uk', 'Українська'], ['fa', 'فارسی'], ['ur', 'اردو'],
] as const;
export type Locale = typeof languages[number][0];
export type LanguagePreference = Locale | 'system';
export type ThemePreference = 'system' | 'light' | 'dark';
export const isLocale = (value: unknown): value is Locale => languages.some(([code]) => code === value);
export function detectLocale(preferred: readonly string[]): Locale {
  for (const language of preferred) {
    const code = language.toLowerCase().split(/[-_]/)[0];
    if (isLocale(code)) return code;
  }
  return 'en';
}
export function direction(locale: Locale) { return ['ar', 'fa', 'ur'].includes(locale) ? 'rtl' : 'ltr'; }
export function translate(locale: Locale, key: string): string {
  const entry = (messages as Record<string, Partial<Record<Locale, string>>>)[key];
  return entry?.[locale] ?? entry?.en ?? key;
}
export const optionLabels: Record<string, string> = {
  sampling: 'Sampling', temperature: 'Temperature', top_p: 'Top P', max_output_tokens: 'Token limit', reasoning_effort: 'Reasoning',
  response_format: 'Response format', json_schema: 'JSON Schema: {name, schema, strict}', image_detail: 'Image detail', instructions: 'Instructions',
  web_search: 'Web search', x_search: 'X search', resolution: 'Resolution', aspect_ratio: 'Aspect ratio', n: 'Image count', quality: 'Quality',
  duration: 'Duration', generate_audio: 'Generate audio', voice_id: 'Voice', voice: 'Voice', custom_voice_id: 'Custom', language: 'Speech language',
  codec: 'Audio format', sample_rate: 'Frequency', bit_rate: 'Bitrate', speed: 'Speed', text_normalization: 'Normalization', with_timestamps: 'Timestamps',
  replace: 'Pronunciation', format: 'Number formatting', diarize: 'Speakers', multichannel: 'Multichannel', filler_words: 'Filler words',
  vad_threshold: 'VAD', audio_format: 'Audio format', channels: 'Channels', keyterms: 'Keyterms',
};
// Protocol names, model IDs, codecs, schema fields and voice IDs are never translated.
export function optionValue(locale: Locale, value: string | number) {
  const labels: Record<string, string> = { '': 'Automatic', auto: 'Automatic', default: 'Automatic', none: 'None', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'High', text: 'Text' };
  return typeof value === 'string' && labels[value] ? translate(locale, labels[value]) + (value === 'xhigh' ? ' (xhigh)' : '') : String(value);
}
