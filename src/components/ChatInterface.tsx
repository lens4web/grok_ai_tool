"use client";

import { useState, useRef, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { useAppContext } from './AppContext';
import { Send, Paperclip, Loader2, Download, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { modelKind, type AIModel } from '@/lib/models';
import { configureVideoVoices, getOptions, normalizeParameters, videoModes, voices as fallbackVoices, type Attachment, type Parameters, type VideoMode } from '@/lib/options';
import { buildRequest, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from '@/lib/requests';
import { object, type GenerationResult } from '@/lib/responses';
import { generateVoice } from '@/lib/realtime';
import { optionLabels, optionValue } from '@/lib/i18n';
import { pollVideo, localizeImages, readApiResponse, requestHeaders } from '@/lib/client';
import ModelSummary from './ModelSummary';
import ConsoleHint from './ConsoleHint';

const modeLabels: Record<VideoMode, string> = { text: 'From text', image: 'Animate image', reference: 'References', edit: 'Edit video', extend: 'Extend video' };
const roleLabels = { first: 'First frame', last: 'Last frame', reference: 'Reference', keyframe: 'Keyframe' };
function markedText(text: string) {
  return text.split(/(<(?:AUDIO|IMAGE)_[0-9]+>)/g).map((part, index) => /^<(?:AUDIO|IMAGE)_/.test(part) ? <bdi dir="ltr" key={index}>{part}</bdi> : part);
}
const fieldClass = 'bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-white outline-none text-sm w-full';

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Не удалось прочитать ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const cleanup = () => { clearTimeout(timer); URL.revokeObjectURL(url); video.removeAttribute('src'); video.load(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Не удалось прочитать длительность видео.')); }, 10000);
    video.onloadedmetadata = () => { const duration = video.duration; cleanup(); resolve(duration); };
    video.onerror = () => { cleanup(); reject(new Error('Файл видео не читается браузером.')); };
    video.preload = 'metadata'; video.src = url;
  });
}

interface ModelDraft {
  prompt: string; mode: VideoMode; params: Parameters; files: Attachment[]; referenceVoices: string[]; pendingId: string;
}
function emptyDraft(model: AIModel): ModelDraft {
  return { prompt: '', mode: 'text', params: normalizeParameters(model, {}, 'text'), files: [], referenceVoices: [], pendingId: '' };
}
export default function ChatInterface() {
  const { selectedModel } = useAppContext();
  // Drafts stay in this page's memory, never in persistent browser storage.
  const [drafts, setDrafts] = useState<Record<string, ModelDraft>>(() => ({ [selectedModel.id]: emptyDraft(selectedModel) }));
  const setDraft = useCallback<Dispatch<SetStateAction<ModelDraft>>>(change => {
    setDrafts(current => {
      const previous = current[selectedModel.id] ?? emptyDraft(selectedModel);
      return { ...current, [selectedModel.id]: typeof change === 'function' ? change(previous) : change };
    });
  }, [selectedModel]);
  return <ModelChat key={selectedModel.id} draft={drafts[selectedModel.id] ?? emptyDraft(selectedModel)} setDraft={setDraft} />;
}

function ModelChat({ draft, setDraft }: { draft: ModelDraft; setDraft: Dispatch<SetStateAction<ModelDraft>> }) {
  const { hasSession, selectedModel, addLog, t, locale } = useAppContext();
  const kind = modelKind(selectedModel);
  const { prompt, mode, params, files, referenceVoices, pendingId } = draft;
  function updateDraft<K extends keyof ModelDraft>(key: K, change: SetStateAction<ModelDraft[K]>) {
    setDraft(current => ({ ...current, [key]: typeof change === 'function' ? (change as (value: ModelDraft[K]) => ModelDraft[K])(current[key]) : change }));
  }
  const setPrompt = (value: SetStateAction<string>) => updateDraft('prompt', value);
  const setMode = (value: SetStateAction<VideoMode>) => updateDraft('mode', value);
  const setParams = (value: SetStateAction<Parameters>) => updateDraft('params', value);
  const setFiles = (value: SetStateAction<Attachment[]>) => updateDraft('files', value);
  const setReferenceVoices = (value: SetStateAction<string[]>) => updateDraft('referenceVoices', value);
  const setPendingId = (value: SetStateAction<string>) => updateDraft('pendingId', value);
  const [voices, setVoices] = useState(fallbackVoices);
  const [isGenerating, setGenerating] = useState(false);
  const [isReading, setReading] = useState(false);
  const [, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<GenerationResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const readVersion = useRef(0);
  const options = getOptions(selectedModel, params, mode);
  const supportsVoices = kind === 'tts' || kind === 'realtime' || (kind === 'video' && selectedModel.id === 'grok-imagine-video-1.5');

  useEffect(() => () => { controller.current?.abort(); readVersion.current++; }, []);
  useEffect(() => {
    const urls = new Set([result?.content, ...(result?.urls ?? [])].filter((url): url is string => !!url?.startsWith('blob:')));
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [result]);
  useEffect(() => {
    if (!hasSession || !supportsVoices) return;
    const abort = new AbortController();
    fetch('/api/grok?action=voices', { headers: requestHeaders(), signal: abort.signal })
      .then(readApiResponse).then(data => {
        const ids = (data.voices as Record<string, unknown>[]).map(v => String(v.voice_id));
        if (ids.length) setVoices(ids);
      }).catch(error => { if (!abort.signal.aborted) addLog('error', 'Не удалось обновить голоса; используется резервный список.', error.message); });
    return () => abort.abort();
  }, [hasSession, supportsVoices, addLog]);

  const updateParam = (key: string, value: string | number | boolean) => {
    if (key === 'generate_audio' && !value) {
      updateVideoVoices([], { ...params, generate_audio: false });
      return;
    }
    setParams(current => normalizeParameters(selectedModel, { ...current, [key]: value }, mode));
  };
  const updateVideoVoices = (nextVoices: string[], parameters = params) => {
    const next = configureVideoVoices(selectedModel, { mode, parameters, files, referenceVoices }, nextVoices);
    setMode(next.mode); setParams(next.parameters); setFiles(next.files); setReferenceVoices(next.referenceVoices); setError('');
  };
  const changeMode = (value: VideoMode) => {
    readVersion.current++;
    setReading(false); setMode(value); setFiles([]); setReferenceVoices([]); setError('');
    setParams(current => normalizeParameters(selectedModel, current, value));
  };
  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const added = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!added.length) return;
    const version = ++readVersion.current;
    setReading(true); setError('');
    try {
      const limit = kind === 'video' ? mode === 'reference' ? selectedModel.id.includes('1.5') ? 13 : 7 : 1 : selectedModel.maxAttachments ?? 50;
      if (files.length + added.length > limit) throw new Error(`Для этого режима допускается не более ${limit} вложений.`);
      if (added.some(file => file.size > (kind === 'chat' ? 20 * 1024 * 1024 : MAX_FILE_BYTES))) throw new Error(kind === 'chat' ? 'Максимум 20 МиБ на изображение для текстовой модели.' : 'Размер одного файла не должен превышать 25 МБ.');
      if (added.reduce((sum, file) => sum + file.size, 0) + files.reduce((sum, file) => sum + file.url.length * 3 / 4, 0) > MAX_TOTAL_BYTES) throw new Error('Общий размер вложений не должен превышать 50 МБ.');
      const attachments = await Promise.all(added.map(async file => {
        // Browsers do not assign MIME types to headerless audio files.
        const mime = file.type || 'application/octet-stream';
        const attachment: Attachment = { name: file.name, mime, url: await readFile(file), role: mode === 'reference' ? 'reference' : 'source' };
        if (kind === 'video' && ['edit', 'extend'].includes(mode)) attachment.duration = await videoDuration(file);
        return attachment;
      }));
      if (version !== readVersion.current) return;
      // Validate file types immediately; full option and mode validation runs before submission.
      const { validateAttachment } = await import('@/lib/requests');
      attachments.forEach(file => validateAttachment(file, kind, mode));
      setFiles(current => [...current, ...attachments]);
    } catch (error) { if (version === readVersion.current) setError(error instanceof Error ? error.message : 'Ошибка чтения файла.'); }
    finally { if (version === readVersion.current) setReading(false); }
  };

  const generate = async (resume = false) => {
    if (controller.current) return;
    if (!hasSession) { setError(t('Connect first')); return; }
    const abort = new AbortController();
    controller.current = abort;
    setGenerating(true); setError(''); setResult(null); setStatus('Ожидание ответа xAI…');
    try {
      let output: GenerationResult;
      if (resume) {
        if (!pendingId.trim()) throw new Error('Укажите request_id.');
        output = await pollVideo(pendingId.trim(), abort.signal, setStatus);
      } else {
        const parameters = normalizeParameters(selectedModel, params, mode);
        const input = { model: selectedModel.id, prompt, files, parameters, mode, referenceVoices };
        buildRequest(input);
        addLog('info', 'Input', { mode, parameters, files: files.map(f => ({ name: f.name, role: f.role, timestamp: f.timestamp })), referenceVoices });
        const response = await fetch('/api/grok', { method: 'POST', headers: requestHeaders(true), body: JSON.stringify(input), signal: abort.signal });
        const data = await readApiResponse(response);
        if (kind === 'realtime') {
          output = await generateVoice(String(data.token), selectedModel.id, prompt, files, parameters, abort.signal);
        } else if (typeof data.request_id === 'string') {
          setPendingId(data.request_id);
          addLog('info', 'Video', { request_id: data.request_id });
          output = await pollVideo(data.request_id, abort.signal, setStatus);
        } else if (data.result) output = data.result as unknown as GenerationResult;
        else throw new Error('Сервер не вернул результат генерации.');
      }
      if (output.type === 'image') output = await localizeImages(output, abort.signal);
      setResult(output);
      addLog('success', 'Output', { type: output.type, count: output.urls?.length, metadata: output.type === 'text' ? undefined : output.metadata });
    } catch (error) {
      const message = abort.signal.aborted ? 'Ожидание отменено. Принятое xAI задание видео продолжает выполняться.' : error instanceof Error ? error.message : 'Ошибка генерации.';
      setError(message); addLog('error', 'Error', message);
    } finally { controller.current = null; setGenerating(false); setStatus(''); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(result?.sourceUrl ?? result?.content ?? ''); addLog('info', 'Copied'); }
    catch { setError('Браузер не разрешил доступ к буферу обмена.'); }
  };
  const download = async (url = result?.content) => {
    if (!url || !result) return;
    try {
      const response = result.type === 'text' ? null : await fetch(url);
      if (response && !response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = response ? await response.blob() : new Blob([url], { type: 'text/markdown;charset=utf-8' });
      const localUrl = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = localUrl;
      const extension = result.type === 'text' ? 'md' : result.type === 'video' ? 'mp4' : result.type === 'image' ? blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg' : result.mime === 'audio/wav' ? 'wav' : result.mime === 'audio/mpeg' ? 'mp3' : String(params.codec ?? 'pcm');
      a.download = `grok_${Date.now()}.${extension}`; a.click();
      setTimeout(() => URL.revokeObjectURL(localUrl), 1000);
    } catch { setError('Браузер не смог скачать файл. Откройте ссылку на результат и сохраните его из новой вкладки.'); }
  };

  const mediaFailure = () => { const message = t('Media playback error'); setError(message); addLog('error', 'Media playback', message); };

  const attachmentsAllowed = kind !== 'tts' && !(kind === 'video' && mode === 'text');
  const accept = kind === 'stt' ? 'audio/*,.mp4,.webm,.pcm,.raw,.mulaw,.alaw' : kind === 'realtime' ? 'audio/*' : kind === 'video' && ['edit', 'extend'].includes(mode) ? 'video/mp4' : kind === 'chat' ? 'image/jpeg,image/png' : 'image/jpeg,image/png,image/webp';
  return (
    <div className="chat-workspace flex flex-col h-full bg-gray-950 p-3 sm:p-4 lg:p-6 overflow-y-auto gap-4">
      <div className="sm:hidden"><ModelSummary /></div>
      <fieldset disabled={isGenerating || isReading} className="min-w-0 bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3 shrink-0 disabled:opacity-70">
        <legend className="text-sm text-gray-300 px-2">{selectedModel.name}</legend>
        {kind !== 'stt' ? <textarea aria-label={t('Prompt')} dir="auto" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={kind === 'tts' ? `${t('Speech text')}…` : `${t('Prompt')} — ${selectedModel.name}…`} className="w-full bg-transparent text-white resize-y outline-none min-h-[90px]" /> : <p className="text-sm text-gray-400">{t('STT help')}</p>}
        {kind === 'video' && <label className="text-sm text-gray-400">{t('Video mode')}<select className={fieldClass} value={mode} onChange={e => changeMode(e.target.value as VideoMode)}>{videoModes(selectedModel).map(value => <option key={value} value={value}>{value === 'reference' && selectedModel.id === 'grok-imagine-video' ? t('Image references') : t(modeLabels[value])}</option>)}</select></label>}
        {kind === 'video' && selectedModel.id === 'grok-imagine-video-1.5' && <p className="text-xs text-gray-400">{t('Limits')}: {t('Reference')} ≤14; {t('Voice')} ≤3; {t('Keyframe')} ≤4; {t('References')}: ≤720p. {t('Edit video')} / {t('Extend video')}: Grok Imagine Video.</p>}
        {kind === 'video' && selectedModel.id === 'grok-imagine-video-1.5-lite' && <p className="text-xs text-gray-400">{t('Limits')}: {t('From text')} / {t('Animate image')} (1 × {t('Image')}). 1080p: апскейл с 720p. {t('References')}, {t('Keyframe')}, {t('Voice')} — Grok Imagine Video 1.5.</p>}
        {kind === 'video' && selectedModel.id === 'grok-imagine-video' && <p className="text-xs text-gray-400">{t('Animate image')}: 1 × {t('First frame')}. {t('Image references')}: ≤7, ≤720p. {t('Video voice')} / {t('Keyframe')}: Video 1.5.</p>}
        {options.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-3 bg-gray-800/50 rounded-lg">
          {options.map(option => {
            const value = params[option.key] ?? option.default;
            const values = ['voice', 'voice_id'].includes(option.key) ? Array.from(new Set([...voices, String(value)])) : option.values;
            return <label key={option.key} className="flex flex-col gap-1 text-xs text-gray-400">
              {t(option.key === 'language' && kind === 'stt' ? 'Transcription language' : optionLabels[option.key])}{option.key === 'custom_voice_id' ? ' voice_id' : option.key === 'duration' ? ` (${t('Seconds')})` : option.key === 'sample_rate' ? ' (Hz)' : option.key === 'bit_rate' ? ' (MP3)' : option.key === 'audio_format' ? ' (RAW)' : ''}
              {option.type === 'select' ? <select className={fieldClass} value={String(value)} onChange={e => updateParam(option.key, typeof option.default === 'number' ? Number(e.target.value) : e.target.value)}>{values?.map(v => <option key={String(v)} value={v}>{option.key === 'language' && v !== '' && v !== 'auto' ? new Intl.DisplayNames([locale], { type: 'language' }).of(String(v)) ?? String(v) : optionValue(locale, v)}</option>)}</select>
                : option.type === 'boolean' ? <input className="h-5 w-5 accent-blue-500" type="checkbox" checked={Boolean(value)} onChange={e => updateParam(option.key, e.target.checked)} />
                : option.type === 'number' ? <input className={fieldClass} type="number" value={Number(value)} min={option.min} max={option.max} step={option.step} onChange={e => updateParam(option.key, e.target.value === '' ? option.default : Number(e.target.value))} />
                : <textarea dir={['custom_voice_id', 'replace', 'json_schema'].includes(option.key) ? 'ltr' : 'auto'} className={fieldClass} rows={2} value={String(value)} onChange={e => updateParam(option.key, e.target.value)} />}
            </label>;
          })}
        </div>}
        {kind === 'video' && selectedModel.id === 'grok-imagine-video-1.5' && <div className="flex flex-col gap-2">
          {(referenceVoices.length ? referenceVoices : ['']).map((voice, i) => <div key={i} className="flex items-end gap-2"><label className="flex flex-col gap-1 text-xs text-gray-400 flex-1">{t('Video voice')}{voice && <bdi dir="ltr">{` (<AUDIO_${i}>)`}</bdi>}<select aria-label={`${t('Video voice')} ${i + 1}`} disabled={params.generate_audio === false} className={fieldClass} value={voice} onChange={e => updateVideoVoices(e.target.value ? referenceVoices.length ? referenceVoices.map((v, index) => index === i ? e.target.value : v) : [e.target.value] : referenceVoices.filter((_, index) => index !== i))}>
            <option value="">{t('Automatic')}</option>{Array.from(new Set([...voices, ...(voice ? [voice] : [])])).map(v => <option key={v} value={v}>{v}</option>)}
          </select></label>{voice && <button className="text-sm text-gray-400 pb-1.5" onClick={() => updateVideoVoices(referenceVoices.filter((_, index) => index !== i))}>{t('Remove')} {i + 1}</button>}</div>)}
          <p className="text-xs text-gray-400">{markedText(t(params.generate_audio === false ? 'Enable sound' : 'Voice help'))}</p>
          {referenceVoices.length > 0 && <button className="text-blue-400 text-sm text-left disabled:opacity-50" disabled={referenceVoices.length >= 3} onClick={() => updateVideoVoices([...referenceVoices, voices.includes('eve') ? 'eve' : voices[0]])}>+ {t('Add voice')}</button>}
        </div>}
        {kind === 'video' && mode === 'reference' && <p className="text-xs text-gray-400">{t('Prompt')}: <bdi dir="ltr">&lt;IMAGE_0&gt;, &lt;IMAGE_1&gt;…</bdi>{selectedModel.id === 'grok-imagine-video-1.5' && markedText(` ${t('First frame')}: <IMAGE_0>; ${t('Image references')}: <IMAGE_1>…`)}</p>}
        {files.map((file, i) => <div key={`${file.name}-${i}`} className="flex flex-wrap items-center gap-2 bg-gray-800 rounded p-2 text-xs">
          <span className="truncate max-w-48">{file.name}</span>
          {kind === 'video' && mode === 'reference' && <>
            <select aria-label={`${t('Reference')} ${file.name}`} className={fieldClass + ' max-w-48'} value={file.role} onChange={e => setFiles(current => current.map((f, index) => index === i ? { ...f, role: e.target.value as Attachment['role'], timestamp: e.target.value === 'keyframe' ? 1 : undefined } : f))}>{Object.entries(roleLabels).filter(([role]) => selectedModel.id === 'grok-imagine-video-1.5' || role === 'reference').map(([role, label]) => <option key={role} value={role}>{t(label)}</option>)}</select>
            {file.role === 'keyframe' && <label>{t('Seconds')} <input aria-label={`${t('Keyframe')} ${file.name}`} type="number" min={1 / 3} max={Number(params.duration) - 1 / 3} step="any" className={fieldClass + ' max-w-24'} value={file.timestamp ?? 1} onChange={e => setFiles(current => current.map((f, index) => index === i ? { ...f, timestamp: Number(e.target.value) } : f))} /></label>}
          </>}
          {file.duration !== undefined && <span>{file.duration.toFixed(2)} {t('Seconds')}</span>}
          <button aria-label={`${t('Remove')} ${file.name}`} onClick={() => setFiles(current => current.filter((_, index) => index !== i))} className="text-red-400">{t('Remove')}</button>
        </div>)}
        {kind === 'tts' && !['mp3', 'wav'].includes(String(params.codec)) && <p className="text-amber-400 text-xs">{t('RAW help')}</p>}
        {kind === 'video' && ['edit', 'extend'].includes(mode) && <p className="text-xs text-gray-400">MP4: {mode === 'edit' ? '≤8.7' : '2–15'} {t('Seconds')}. {mode === 'extend' && `${t('Extend video')}: 2–10 ${t('Seconds')}.`} {t('Resolution')}: ≤720p ({t('Input')}).</p>}
        {attachmentsAllowed && <div className="flex gap-2 items-center text-xs text-gray-400"><input ref={fileInput} type="file" className="hidden" accept={accept} multiple={kind === 'image' || kind === 'chat' || mode === 'reference'} onChange={handleFiles} /><button onClick={() => fileInput.current?.click()} className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded text-gray-200"><Paperclip size={16} />{t('Attach')}</button><span>{t('Limits')}: {kind === 'chat' ? '20' : '25'} MiB / 50 MiB</span></div>}
        <button onClick={() => generate()} disabled={isGenerating || isReading || (!prompt.trim() && !files.length && !referenceVoices.length)} className="self-end flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg"><Send size={16} />{t('Generate')}</button>
      </fieldset>
      {kind === 'video' && <div className="flex items-center gap-2"><input aria-label="request_id" className={fieldClass} value={pendingId} onChange={e => setPendingId(e.target.value)} placeholder="request_id" disabled={isGenerating} /><button disabled={!pendingId.trim() || isGenerating} onClick={() => generate(true)} className="text-sm text-blue-400 disabled:opacity-40 shrink-0">{t('Check video')}</button></div>}
      {isReading && <p className="text-gray-400 text-sm">{t('Reading')}</p>}
      {isGenerating && <div className="flex items-center gap-3 text-blue-400 text-sm"><Loader2 className="animate-spin shrink-0" size={20} /><span className="break-all">{t('Waiting')} {pendingId && <bdi>{pendingId}</bdi>}</span><button className="text-red-400 ml-auto" onClick={() => controller.current?.abort()}>{t('Cancel waiting')}</button></div>}
      {error && <div role="alert" className="bg-red-500/10 border border-red-400 rounded-lg p-4 text-red-400 text-sm">{t('Error')}<details><summary>{t('Details')}</summary><p className="whitespace-pre-wrap break-words">{error}</p></details><div className="mt-3 text-gray-300"><ConsoleHint /></div></div>}
      <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col min-h-40 flex-1">
        <div className="p-3 border-b border-gray-800 flex justify-between items-center"><h3 className="text-gray-300">{t('Result')}</h3>{result && <div className="flex gap-3"><button onClick={copy} className="text-xs flex items-center gap-1"><Copy size={14} />{t('Copy')}</button><button onClick={() => download()} className="text-xs flex items-center gap-1"><Download size={14} />{t('Download')}</button></div>}</div>
        <div className="p-4 text-gray-200">
          {!result && <p className="text-gray-500 text-sm">{t('Empty result')}</p>}
          {result?.type === 'text' && <div className="prose max-w-none break-words"><ReactMarkdown skipHtml components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>, img: ({ alt }) => <span>{alt}</span> }}>{result.content}</ReactMarkdown></div>}
          {result?.type === 'image' && <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{(result.urls ?? [result.content]).map((url, i) => <div key={i}><img src={url} onError={mediaFailure} alt={`${t('Image')} ${i + 1}`} className="max-w-full rounded" /><button className="text-sm text-blue-400 mt-2" onClick={() => download(url)}>{t('Download')} {i + 1}</button><a href={url} target="_blank" rel="noreferrer" className="text-sm text-gray-400 ml-3">{t('Open')}</a></div>)}</div>}
          {result?.type === 'video' && <video src={result.content} onError={mediaFailure} controls className="max-w-full max-h-[65vh] rounded" />}
          {result?.type === 'audio' && (['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp3'].includes(result.mime ?? '') ? <audio src={result.content} onError={mediaFailure} controls className="w-full" /> : <p className="text-sm text-gray-400">{t('RAW help')}</p>)}
          {result && ['video', 'audio'].includes(result.type) && <a href={result.content} target="_blank" rel="noreferrer" className="text-blue-400 text-sm block mt-3">{t('Open')}</a>}
          {result?.type === 'audio' && typeof object(result.metadata).transcript === 'string' && <p className="mt-3 whitespace-pre-wrap">{String(object(result.metadata).transcript)}</p>}
          {result?.metadata !== undefined && <details className="mt-3 text-xs text-gray-400"><summary>{t('Metadata')}</summary><pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(result.metadata, null, 2)}</pre></details>}
        </div>
      </div>
    </div>
  );
}
