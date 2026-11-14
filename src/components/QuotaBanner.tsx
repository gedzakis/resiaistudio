import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { tr } from '../i18n/serbian.ts';
import type { QuotaStatus, ScriptMode } from '../types/resi.ts';

function formatCountdown(nextResetIso: string): string {
  const diff = Math.max(0, new Date(nextResetIso).getTime() - Date.now());
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${String(h).padStart(2, '0')}č ${String(m).padStart(2, '0')}m`;
}

export function QuotaBanner({
  quota,
  script,
}: {
  quota: QuotaStatus | null;
  script: ScriptMode;
}) {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!quota?.nextResetIso) return;
    setCountdown(formatCountdown(quota.nextResetIso));
    const timer = setInterval(() => {
      setCountdown(formatCountdown(quota.nextResetIso));
    }, 30000);
    return () => clearInterval(timer);
  }, [quota?.nextResetIso]);

  if (!quota) return null;

  const isExhausted = quota.remaining === 0;

  return (
    <div className="space-y-2">
      <div
        className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
          isExhausted
            ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
            : 'border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
        }`}
      >
        <div className="flex items-start gap-2.5 sm:items-center">
          {isExhausted ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 sm:mt-0 dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 sm:mt-0 dark:text-blue-400" />
          )}
          <div>
            <p className="text-sm font-semibold tabular-nums">
              {isExhausted
                ? tr(
                    'Dostigao si dnevni limit od 3 besplatna pitanja. Vrati se sutra i nastavi sa učenjem!',
                    script,
                  )
                : tr(
                    `Danas imaš još ${quota.remaining} ${
                      quota.remaining === 1 ? 'besplatno pitanje' : 'besplatna pitanja'
                    }.`,
                    script,
                  )}
            </p>
            <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
              {tr(`Preostalo: ${quota.remaining}/${quota.limit}`, script)} ·{' '}
              {tr('Neuspešni zahtevi i lokalne radnje se ne naplaćuju', script)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap shrink-0 dark:text-slate-400">
          <Clock className="h-3.5 w-3.5" />
          <span>{tr(`Reset u ponoć (Beograd): ${countdown}`, script)}</span>
        </div>
      </div>

      {!quota.apiKeyConfigured && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <span>
            {tr(
              'Gemini API ključ (GEMINI_API_KEY) trenutno nije podešen na serveru. AI funkcije će proraditi čim postaviš serversku promenljivu okruženja.',
              script,
            )}
          </span>
        </div>
      )}

      {!quota.persistenceProtected && quota.warningMessage && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{tr(quota.warningMessage, script)}</span>
        </div>
      )}
    </div>
  );
}
