"use client";
import { useAppContext } from './AppContext';

export default function ConsoleHint() {
  const { t } = useAppContext();
  return <p>{t('Console hint')} {' '}<a href="https://console.x.ai/" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">{t('xAI console')}</a></p>;
}
