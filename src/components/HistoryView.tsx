import { AlertCircle, Search, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { tr } from '../i18n/serbian.ts';
import type { ScriptMode, SolvedHistoryItem } from '../types/resi.ts';

interface HistoryViewProps {
  script: ScriptMode;
  history: SolvedHistoryItem[];
  onOpenItem: (item: SolvedHistoryItem) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
}

export function HistoryView({
  script,
  history,
  onOpenItem,
  onToggleFavorite,
  onDeleteItem,
  onClearAll,
}: HistoryViewProps) {
  const [query, setQuery] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const filtered = useMemo(() => {
    return history.filter((item) => {
      if (onlyFavorites && !item.favorite) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        item.subjectLabel.toLowerCase().includes(q) ||
        item.topic.toLowerCase().includes(q) ||
        item.promptSnippet.toLowerCase().includes(q) ||
        item.finalAnswer.toLowerCase().includes(q)
      );
    });
  }, [history, query, onlyFavorites]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {tr('Istorija rešenih zadataka', script)}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {tr('Brz pristup tvojim prethodnim zadacima i omiljenim rešenjima.', script)}
          </p>
        </div>
        {history.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 self-start dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{tr('Obriši celu istoriju', script)}</span>
          </button>
        )}
      </div>

      {/* LocalStorage Notice */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <span>
          {tr(
            'Aplikacija radi bez registracije: istorija i omiljeni zadaci čuvaju se isključivo lokalno u ovom pregledaču. Brisanjem podataka pregledača ili promenom uređaja sačuvana istorija može nestati.',
            script,
          )}
        </span>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('Pretraži po predmetu, oblasti ili tekstu zadatka...', script)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 self-start dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setOnlyFavorites(false)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              !onlyFavorites
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {tr(`Svi (${history.length})`, script)}
          </button>
          <button
            type="button"
            onClick={() => setOnlyFavorites(true)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              onlyFavorites
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {tr(`Omiljeni (${history.filter((i) => i.favorite).length})`, script)}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
          {tr('Nema zadataka koji odgovaraju ovoj pretrazi.', script)}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => onOpenItem(item)}
                className="min-w-0 flex-1 space-y-1 text-left"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-blue-700 dark:text-blue-400">
                    {tr(item.subjectLabel, script)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{tr(item.topic, script)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {new Date(item.createdAt).toLocaleString('sr-RS')}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {tr(item.promptSnippet, script)}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {tr(`Rešenje: ${item.finalAnswer}`, script)}
                </p>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onToggleFavorite(item.id)}
                  aria-label={tr('Omiljeni', script)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-slate-800"
                >
                  <Star className={`h-4 w-4 ${item.favorite ? 'fill-amber-400 text-amber-500' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  aria-label={tr('Obriši zadatak', script)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
