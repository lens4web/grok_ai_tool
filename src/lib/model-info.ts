// API availability dates verified against official xAI announcements on 2026-10-04.
// Consumer releases, later feature updates and dates embedded in slugs are different.
const releaseNotes = 'https://docs.x.ai/developers/release-notes';
export interface ModelInfo { summary: string; released?: string; source: string; earlyAccess?: boolean }
export const modelInfo: Record<string, ModelInfo> = {
  'grok-4.7': { summary: 'Model advanced', released: '2026-09-21', source: releaseNotes },
  'grok-4.6': { summary: 'Model advanced', released: '2026-08-12', source: releaseNotes },
  'grok-4.5': { summary: 'Model advanced', released: '2026-07-08', source: releaseNotes },
  'grok-4.3': { summary: 'Model fast', source: 'https://docs.x.ai/developers/models/grok-4.3' },
  'grok-4.20-0309-reasoning': { summary: 'Model reasoning', released: '2026-03-10', source: releaseNotes },
  'grok-4.20-0309-non-reasoning': { summary: 'Model fast', released: '2026-03-10', source: releaseNotes },
  'grok-4.20-multi-agent-0309': { summary: 'Model agents', released: '2026-03-10', source: releaseNotes },
  'grok-build-0.1': { summary: 'Model code', released: '2026-05-19', source: releaseNotes, earlyAccess: true },
  'grok-imagine-image-quality': { summary: 'Model image quality', released: '2026-05-06', source: 'https://x.ai/news/grok-imagine-quality-mode' },
  'grok-imagine-image-2.0': { summary: 'Model image precise', released: '2026-08-07', source: 'https://x.ai/news/grok-imagine-image-2' },
  'grok-imagine-image': { summary: 'Model image', released: '2026-01-28', source: releaseNotes },
  'grok-imagine-video-1.5': { summary: 'Model video references', released: '2026-06-16', source: 'https://x.ai/news/grok-imagine-video-1-5' },
  'grok-imagine-video-1.5-lite': { summary: 'Model video lite', released: '2026-10-04', source: 'https://docs.x.ai/developers/models/grok-imagine-video-1.5-lite' },
  'grok-imagine-video': { summary: 'Model video', released: '2026-01-28', source: 'https://x.ai/news/grok-imagine-api' },
  'grok-voice-think-fast-2.0': { summary: 'Model voice', released: '2026-07-29', source: releaseNotes },
  'grok-voice-transcribe-2.0': { summary: 'Model transcription', released: '2026-09-17', source: releaseNotes },
  'grok-tts': { summary: 'Model speech', released: '2026-03-16', source: releaseNotes },
};
export function formatReleaseDate(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', calendar: 'gregory' }).format(new Date(`${date}T00:00:00Z`));
}
