"use client";
import { useAppContext } from './AppContext';
import { modelInfo, formatReleaseDate } from '@/lib/model-info';

export default function ModelSummary() {
  const { selectedModel, t, locale } = useAppContext();
  const info = modelInfo[selectedModel.id];
  if (!info) return null;
  return <div className="space-y-1 text-sm">
    <p>{t(info.summary)}</p>
    <p className="text-xs text-gray-400">{t(info.earlyAccess ? 'API early access' : 'API release')}: {' '}
      <a href={info.source} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2">{info.released ? <time dateTime={info.released}>{formatReleaseDate(info.released, locale)}</time> : t('Release unconfirmed')}</a>
    </p>
  </div>;
}
