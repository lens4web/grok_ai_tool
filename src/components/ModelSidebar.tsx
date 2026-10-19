"use client";
import { useAppContext } from './AppContext';
import { xaiModels } from '@/lib/models';
import { Image as ImageIcon, FileText, Video, Mic, Info } from 'lucide-react';
import clsx from 'clsx';
import ModelSummary from './ModelSummary';

export default function ModelSidebar() {
  const { selectedModel: model, setSelectedModel, t } = useAppContext();
  const modality = (value: string) => t(({ TEXT: 'Text', IMAGE: 'Image', VIDEO: 'Video', AUDIO: 'Audio' } as Record<string, string>)[value]);
  const icon = (values: string[]) => values.includes('VIDEO') ? <Video size={16}/> : values.includes('AUDIO') ? <Mic size={16}/> : values.includes('IMAGE') && values.length === 1 ? <ImageIcon size={16}/> : <FileText size={16}/>;
  const price = model.pricing;
  const prices: [string, string][] = [];
  if (price?.prompt !== undefined) prices.push([t('Input'), `$${price.prompt.toFixed(2)} / 1M ${t('Tokens')}`]);
  if (price?.completion !== undefined) prices.push([t('Output'), `$${price.completion.toFixed(2)} / 1M ${t('Tokens')}`]);
  if (price?.image !== undefined) prices.push([t('Image'), `≥ $${price.image.toFixed(2)}`]);
  if (price?.video !== undefined) prices.push([t('Video'), `≥ $${price.video.toFixed(2)} / ${t('Seconds')}`]);
  if (price?.audio !== undefined) prices.push([t('Audio'), `$${price.audio.toFixed(2)} / ${price.audioUnit === 'час' ? t('Hours') : t('Seconds')}`]);
  if (price?.textInput !== undefined) prices.push([t('Input'), `$${price.textInput} / 1k ${t('Characters')}`]);
  if (price?.characters !== undefined) prices.push([t('Text'), `$${price.characters} / 1M ${t('Characters')}`]);
  return <aside className="model-sidebar w-64 lg:w-80 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col h-full overflow-y-auto">
    <div className="compact-model-picker hidden p-2"><label><span className="sr-only">{t('Models')}</span><select aria-label={t('Models')} value={model.id} onChange={event => { const next = xaiModels.find(item => item.id === event.target.value); if (next) setSelectedModel(next); }} className="w-full min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm">{xaiModels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    <div className="model-navigation p-3 lg:p-4 border-b border-gray-800"><h2 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-3">{t('Models')}</h2><div className="model-list flex flex-col gap-2">
      {xaiModels.map(item => <button key={item.id} aria-pressed={model.id === item.id} onClick={() => setSelectedModel(item)} className={clsx('flex items-center gap-3 w-full text-left p-3 rounded-lg border', model.id === item.id ? 'bg-blue-500/10 border-blue-600 text-gray-100' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-blue-600')}>
        <div className={clsx('p-2 rounded-md shrink-0', model.id === item.id ? 'bg-blue-600 text-white' : 'bg-gray-700')}>{icon(item.outputModalities)}</div><div className="min-w-0"><div className="font-medium text-sm break-words">{item.name}</div><div className="text-xs text-gray-500 truncate" dir="ltr">{item.id}</div></div>
      </button>)}
    </div></div>
    <div className="p-3 lg:p-4 text-sm text-gray-300 space-y-4">
      <h2 className="flex items-center gap-2 font-medium text-gray-100"><Info size={18}/>{t('Model info')}</h2>
      <ModelSummary />
      <p>{model.inputModalities.map(modality).join(' / ')} → {model.outputModalities.map(modality).join(' / ')}</p>
      <div><h3 className="text-gray-500 text-xs mb-1">{t('Input')}</h3><div className="flex flex-wrap gap-1">{model.inputModalities.map(value => <span key={value} className="bg-gray-800 text-xs px-2 py-1 rounded">{modality(value)}</span>)}</div></div>
      <p className="text-xs">{t('Attachments')}: {model.maxAttachments ?? '∞'} {model.outputModalities.includes('VIDEO') && ` (${t('Video mode')})`}</p>
      <div><h3 className="text-gray-500 text-xs mb-1">{t('Output')}</h3><div className="flex flex-wrap gap-1">{model.outputModalities.map(value => <span key={value} className="bg-blue-500/10 text-blue-400 text-xs px-2 py-1 rounded">{modality(value)}</span>)}</div></div>
      {model.contextWindow && <div><h3 className="text-gray-500 text-xs mb-1">{t('Context')}</h3>{model.contextWindow / 1000}k {t('Tokens')}</div>}
      {prices.length > 0 && <div className="bg-gray-800 p-3 rounded-md"><h3 className="text-gray-400 text-xs font-bold mb-2">{t('Price')}</h3>{prices.map(([label, value], i) => <div key={i} className="flex flex-wrap justify-between gap-1 border-b border-gray-700 py-1 text-xs"><span>{label}</span><span dir="ltr">{value}</span></div>)}{price?.dynamic && <p className="text-xs text-gray-500 mt-2">{model.outputModalities.includes('TEXT') ? '≥200k: ×2' : `${t('Quality')} / ${t('Resolution')}`}</p>}</div>}
    </div>
  </aside>;
}
