import { Download, PlusSquare, Share, WifiOff, X } from 'lucide-react';
import { useState } from 'react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall.ts';
import { tr } from '../i18n/serbian.ts';
import type { ScriptMode } from '../types/resi.ts';

export function PWAInstallButton({ script }: { script: ScriptMode }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 whitespace-nowrap shrink-0 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-slate-800 dark:hover:text-blue-300"
      >
        <Download className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        <span>{tr('Instaliraj aplikaciju', script)}</span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4 dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3
                id="pwa-install-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-white"
              >
                {tr(isIOS ? 'Instaliraj REŠI na iPhone / iPad' : 'Instaliraj REŠI aplikaciju', script)}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label={tr('Zatvori', script)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2.5">
                  <Share className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span>
                    {tr('1. Dodirni dugme', script)}{' '}
                    <strong>Share</strong> ({tr('Podeli', script)}){' '}
                    {tr('u donjoj traci Safari pregledača.', script)}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span>
                    {tr('2. Pomeri naniže i izaberi', script)}{' '}
                    <strong>Add to Home Screen</strong> ({tr('Dodaj na početni ekran', script)}).
                  </span>
                </li>
              </ol>
            ) : (
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {tr(
                  'Otvori meni pregledača (tri tačke u gornjem uglu) i izaberi opciju „Instaliraj aplikaciju“ ili „Dodaj na početni ekran“.',
                  script,
                )}
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 dark:bg-blue-600"
            >
              {tr('Razumem', script)}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator({ script }: { script: ScriptMode }) {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-950 shadow-md dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span>{tr('Nema interneta — prikazuje se keširani interfejs', script)}</span>
    </div>
  );
}
