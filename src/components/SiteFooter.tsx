"use client";
import { useAppContext } from './AppContext';

export default function SiteFooter() {
  const { t } = useAppContext();
  return <footer className="shrink-0 flex flex-wrap justify-center items-center gap-x-4 gap-y-1 px-3 py-2 bg-gray-900 border-t border-gray-800 text-xs text-gray-400">
    <span>{t('Author')}: <a href="https://lens4web.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline"><bdi>lens4web</bdi></a></span>
    <a href="https://lens4web.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">{t('Feedback')}</a>
  </footer>;
}
