"use client";

import React, { useState } from 'react';
import { Terminal, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useAppContext } from './AppContext';
import clsx from 'clsx';

export default function DebugConsole() {
  const { logs, clearLogs, t, locale } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={clsx(
      "fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 transition-all duration-300 z-40 flex flex-col",
      isOpen ? "h-64" : "h-10"
    )}>
      <div 
        role="button" tabIndex={0} aria-expanded={isOpen} aria-label={t('Debug')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(!isOpen); } }}
        className="flex items-center justify-between px-4 h-10 cursor-pointer bg-gray-900 hover:bg-gray-800"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 text-gray-400">
          <Terminal size={16} />
          <span className="text-sm font-medium text-white">{t('Debug')}</span>
          <span className="text-xs ml-2 bg-gray-800 px-2 py-0.5 rounded-full">{logs.length}</span>
        </div>
        <div className="flex items-center gap-3">
          {isOpen && (
            <button 
              onClick={(e) => { e.stopPropagation(); clearLogs(); }}
              className="text-gray-400 hover:text-red-400 p-1"
              title={t('Clear')} aria-label={t('Clear')}
            >
              <Trash2 size={16} />
            </button>
          )}
          <span className="text-gray-400">
            {isOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="flex-1 overflow-auto p-4 bg-black font-mono text-xs text-gray-300">
          {logs.length === 0 ? (
            <div className="text-gray-600 italic">{t('Waiting')}</div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="mb-2 border-b border-gray-800 pb-2">
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 whitespace-nowrap">[{new Date(log.timestamp).toLocaleTimeString(locale)}]</span>
                  <span className={clsx(
                    "font-bold",
                    log.type === 'error' ? 'text-red-500' :
                    log.type === 'success' ? 'text-green-500' : 'text-blue-400'
                  )}>
                    [{log.type.toUpperCase()}]
                  </span>
                  <span className="text-gray-100">{t(log.message)}</span>
                </div>
                {log.details !== undefined && (
                  <pre className="mt-1 ml-16 bg-gray-900 p-2 rounded text-gray-400 overflow-x-auto">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
