"use client";

import { createContext, useContext, useState, useCallback, useEffect, useSyncExternalStore, useMemo, type ReactNode } from 'react';
import { type AIModel, xaiModels } from '@/lib/models';
import { detectLocale, direction, isLocale, translate, type Locale, type LanguagePreference, type ThemePreference } from '@/lib/i18n';
import { readApiResponse, requestHeaders } from '@/lib/client';
import { redactSecrets as safeLog } from '@/lib/redaction';

export interface DebugLog { timestamp: string; type: 'info' | 'error' | 'success'; message: string; details?: unknown }
interface Preferences { language: LanguagePreference; theme: ThemePreference; locale: Locale }
interface AppContextProps {
  hasSession: boolean; connect: (key: string) => Promise<void>; disconnect: () => Promise<void>;
  selectedModel: AIModel; setSelectedModel: (model: AIModel) => void;
  logs: DebugLog[]; addLog: (type: DebugLog['type'], message: string, details?: unknown) => void; clearLogs: () => void;
  locale: Locale; language: LanguagePreference; theme: ThemePreference;
  setLanguage: (value: LanguagePreference) => void; setTheme: (value: ThemePreference) => void; t: (key: string) => string;
}
const AppContext = createContext<AppContextProps | undefined>(undefined);
const listeners = new Set<() => void>();
let preferences: Preferences | undefined;
function getPreferences(): Preferences {
  if (preferences) return preferences;
  let language: LanguagePreference = 'system', theme: ThemePreference = 'system';
  const cookieValue = (name: string) => document.cookie.split('; ').find(value => value.startsWith(name + '='))?.split('=')[1];
  const cookieLanguage = cookieValue('grok_language'), cookieTheme = cookieValue('grok_theme');
  if (isLocale(cookieLanguage)) language = cookieLanguage;
  if (cookieTheme === 'light' || cookieTheme === 'dark') theme = cookieTheme;
  try {
    const saved = JSON.parse(localStorage.getItem('grok_preferences') ?? '{}');
    if (isLocale(saved.language) || saved.language === 'system') language = saved.language;
    if (['light', 'dark', 'system'].includes(saved.theme)) theme = saved.theme;
  } catch { /* System preferences work with blocked storage. */ }
  preferences = { language, theme, locale: language === 'system' ? detectLocale(navigator.languages) : language };
  return preferences;
}
function refreshPreferences() { preferences = undefined; listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('languagechange', refreshPreferences);
  window.addEventListener('storage', refreshPreferences);
  return () => { listeners.delete(listener); window.removeEventListener('languagechange', refreshPreferences); window.removeEventListener('storage', refreshPreferences); };
}
function savePreferences(change: Partial<Pick<Preferences, 'language' | 'theme'>>) {
  const next = { ...getPreferences(), ...change };
  next.locale = next.language === 'system' ? detectLocale(navigator.languages) : next.language;
  preferences = next;
  try { localStorage.setItem('grok_preferences', JSON.stringify({ language: next.language, theme: next.theme })); } catch { /* Keep preference in memory. */ }
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `grok_language=${next.language}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`;
  document.cookie = `grok_theme=${next.theme}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`;
  listeners.forEach(listener => listener());
}
export function AppProvider({ children, initialLocale = 'en', initialLanguage = 'system', initialTheme = 'system' }: { children: ReactNode; initialLocale?: Locale; initialLanguage?: LanguagePreference; initialTheme?: ThemePreference }) {
  const initialPreferences = useMemo(() => ({ locale: initialLocale, language: initialLanguage, theme: initialTheme }), [initialLocale, initialLanguage, initialTheme]);
  const pref = useSyncExternalStore(subscribe, getPreferences, () => initialPreferences);
  const [hasSession, setHasSession] = useState(false);
  const [selectedModel, setSelectedModel] = useState<AIModel>(xaiModels[0]);
  const [logs, setLogs] = useState<DebugLog[]>([]);
  useEffect(() => {
    document.documentElement.lang = pref.locale;
    document.documentElement.dir = direction(pref.locale);
    document.documentElement.dataset.theme = pref.theme;
  }, [pref]);
  useEffect(() => {
    // Remove the former persistent secret without importing it into the session.
    try { localStorage.removeItem('xai_api_key'); } catch { /* Storage may be blocked. */ }
    const abort = new AbortController();
    fetch('/api/session', { headers: requestHeaders(), signal: abort.signal }).then(readApiResponse).then(data => setHasSession(data.authenticated === true)).catch(() => {});
    const expired = () => setHasSession(false);
    window.addEventListener('grok-session-expired', expired);
    return () => { abort.abort(); window.removeEventListener('grok-session-expired', expired); };
  }, []);
  const connect = async (key: string) => {
    const data = await readApiResponse(await fetch('/api/session', { method: 'POST', headers: requestHeaders(true), body: JSON.stringify({ key }) }), false);
    setHasSession(data.authenticated === true);
  };
  const disconnect = async () => {
    await readApiResponse(await fetch('/api/session', { method: 'DELETE', headers: requestHeaders() }));
    setHasSession(false); setLogs([]);
  };
  const addLog = useCallback((type: DebugLog['type'], message: string, details?: unknown) => {
    setLogs(prev => [...prev.slice(-99), { timestamp: new Date().toISOString(), type, message: String(safeLog(message)), details: safeLog(details) }]);
  }, []);
  return <AppContext.Provider value={{ hasSession, connect, disconnect, selectedModel, setSelectedModel, logs, addLog, clearLogs: () => setLogs([]), ...pref, setLanguage: value => savePreferences({ language: value }), setTheme: value => savePreferences({ theme: value }), t: key => translate(pref.locale, key) }}>{children}</AppContext.Provider>;
}
export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}
