"use client";
import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Settings, Key, X, Check, Languages, SunMoon } from 'lucide-react';
import { useAppContext } from './AppContext';
import { languages, type LanguagePreference, type ThemePreference } from '@/lib/i18n';
import AboutDialog from './AboutDialog';

export default function Header() {
  const { hasSession, connect, disconnect, language, theme, setLanguage, setTheme, t } = useAppContext();
  const [open, setOpen] = useState(false), [key, setKey] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const close = () => { setOpen(false); setKey(''); setError(''); opener.current?.focus(); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await connect(key.trim()); close(); }
    catch (error) { setKey(''); setError(error instanceof Error ? error.message : 'Connection failed.'); }
    finally { setBusy(false); }
  };
  return <header className="bg-gray-900 border-b border-gray-800 p-3 sm:p-4 flex flex-wrap justify-between items-center gap-3 shrink-0">
    <div className="site-brand flex items-center gap-3"><Image src="/icon.svg" width={36} height={36} alt="" unoptimized className="shrink-0"/><div><h1 className="text-lg sm:text-xl font-semibold">Grok Personal AI</h1><p className="text-xs text-gray-400">{t('Site tagline')}</p></div></div>
    <div className="header-controls grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
      <AboutDialog />
      <button ref={opener} onClick={() => { setKey(''); setError(''); setOpen(true); }} className="flex justify-center items-center gap-2 px-2 sm:px-3 py-1.5 text-xs sm:text-base bg-gray-800 hover:bg-gray-700 rounded-md"><Settings size={18} className="hidden sm:block shrink-0" aria-hidden="true"/><span>{t('API settings')}</span><span className={`w-2 h-2 shrink-0 rounded-full ${hasSession ? 'bg-green-500' : 'bg-red-600'}`} aria-label={t(hasSession ? 'Connected' : 'Not connected')}/></button>
      <label className="flex items-center gap-1 min-w-0"><Languages size={17} aria-hidden="true" className="shrink-0"/><span className="sr-only">{t('Language')}</span><select aria-label={t('Language')} value={language} onChange={e => setLanguage(e.target.value as LanguagePreference)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs sm:text-sm min-w-0 w-full sm:w-auto sm:max-w-44"><option value="system">{t('System')}</option>{languages.map(([code, name]) => <option key={code} value={code} lang={code}>{name}</option>)}</select></label>
      <label className="flex items-center gap-1 min-w-0"><SunMoon size={17} aria-hidden="true" className="shrink-0"/><span className="sr-only">{t('Theme')}</span><select aria-label={t('Theme')} value={theme} onChange={e => setTheme(e.target.value as ThemePreference)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs sm:text-sm min-w-0 w-full sm:w-auto"><option value="system">{t('System')}</option><option value="light">{t('Light')}</option><option value="dark">{t('Dark')}</option></select></label>
    </div>
    <dialog ref={dialog} onCancel={close} onClose={() => { setOpen(false); setKey(''); }} className="m-auto bg-gray-900 text-gray-200 border border-gray-700 p-5 rounded-xl shadow-xl w-[min(28rem,calc(100vw-2rem))] max-h-[85dvh] overflow-y-auto backdrop:bg-black/50">
      <div className="flex justify-between items-center mb-4"><h2 className="font-medium flex items-center gap-2"><Key size={16}/> xAI API</h2><button aria-label={t('Close')} onClick={close}><X size={18}/></button></div>
      <p className="text-sm text-gray-400 mb-4">{t('Key help')}</p>
      <p className="text-sm mb-3">{t(hasSession ? 'Connected' : 'Not connected')}</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-sm">xAI {t('API key')}<input aria-label="xAI API key" type="password" dir="ltr" autoComplete="off" spellCheck={false} maxLength={254} required value={key} onChange={e => setKey(e.target.value)} placeholder="xai-…" className="w-full bg-gray-950 border border-gray-700 rounded p-2 mt-1"/></label>
        {error && <div role="alert" className="text-red-400 text-sm">{t('Error')}<details><summary>{t('Details')}</summary>{error}</details></div>}
        <button type="submit" disabled={busy || !key.trim()} className="bg-blue-600 text-white rounded p-2 disabled:opacity-50 flex items-center justify-center gap-2"><Check size={16}/>{t(busy ? 'Waiting' : 'Connect')}</button>
        {hasSession && <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await disconnect(); close(); } catch { setError('Disconnect failed.'); } finally { setBusy(false); } }} className="text-red-400 p-2">{t('Disconnect')}</button>}
      </form>
    </dialog>
  </header>;
}
