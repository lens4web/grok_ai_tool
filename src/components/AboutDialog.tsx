"use client";
import { useRef } from 'react';
import { CircleHelp, X } from 'lucide-react';
import { useAppContext } from './AppContext';
import ConsoleHint from './ConsoleHint';

export default function AboutDialog() {
  const { t, selectedModel } = useAppContext();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={opener} onClick={() => dialog.current?.showModal()} className="flex justify-center items-center gap-2 px-2 sm:px-3 py-1.5 text-xs sm:text-base bg-gray-800 hover:bg-gray-700 rounded-md"><CircleHelp size={18} aria-hidden="true"/><span>{t('About')}</span></button>
    <dialog ref={dialog} aria-labelledby="about-title" onClose={() => opener.current?.focus()} className="m-auto bg-gray-900 text-gray-200 border border-gray-700 p-5 rounded-xl shadow-xl w-[min(38rem,calc(100vw-2rem))] max-h-[85dvh] overflow-y-auto backdrop:bg-black/50">
      <div className="flex justify-between items-center gap-4 mb-4"><h2 id="about-title" className="font-semibold text-lg">{t('About')}</h2><button autoFocus aria-label={t('Close')} onClick={() => dialog.current?.close()} className="p-1"><X size={20}/></button></div>
      <div className="space-y-4 text-sm leading-relaxed">
        <p>{t('About intro')}</p>
        <p>{t('About steps')}</p>
        <p>{t('About drafts')}</p>
        <p>{t('About privacy')}</p>
        <ConsoleHint />
        <p>{t('Issue feedback')} {' '}<a href="https://lens4web.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline"><bdi>lens4web</bdi></a></p>
        <p className="text-gray-400">{t('Personal disclaimer')}</p>
        <a href={`https://docs.x.ai/developers/models/${selectedModel.id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline block">{t('Documentation')} xAI · {selectedModel.name}</a>
      </div>
    </dialog>
  </>;
}
