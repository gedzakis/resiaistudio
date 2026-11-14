import { AlertTriangle, BookOpen, HelpCircle, Loader2, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { tr } from '../i18n/serbian.ts';
import type {
  ProfessorLevel,
  ProfessorMessage,
  ProfessorResponse,
  QuotaStatus,
  ScriptMode,
  SolveResponse,
} from '../types/resi.ts';
import { apiRequest, ApiClientError } from '../utils/api.ts';
import { MathText } from './MathText.tsx';
import { QuotaBanner } from './QuotaBanner.tsx';

interface ProfessorViewProps {
  script: ScriptMode;
  quota: QuotaStatus | null;
  onQuotaUpdate: (q: QuotaStatus) => void;
  attachedSolution: SolveResponse | null;
  onClearAttached: () => void;
}

const LEVELS: Array<{ id: ProfessorLevel; label: string; desc: string }> = [
  { id: 'pocetni', label: 'Početni', desc: 'Osnovna škola · jednostavni primeri' },
  { id: 'srednji', label: 'Srednji', desc: 'Srednja škola · jasan postupak' },
  { id: 'napredni', label: 'Napredni', desc: 'Takmičenja i matura' },
  { id: 'fakultetski', label: 'Fakultetski', desc: 'Akademski dokazi i definicije' },
];

export function ProfessorView({
  script,
  quota,
  onQuotaUpdate,
  attachedSolution,
  onClearAttached,
}: ProfessorViewProps) {
  const [level, setLevel] = useState<ProfessorLevel>('srednji');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ProfessorMessage[]>([]);
  const [extraByMsg, setExtraByMsg] = useState<
    Record<string, { guidingQuestion?: string; keyTakeaway?: string }>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isExhausted = quota ? quota.remaining <= 0 : false;

  const taskContext = attachedSolution
    ? `Predmet: ${attachedSolution.subjectLabel} (${attachedSolution.topic})\nZadatak: ${attachedSolution.recognizedText}\nRešenje: ${attachedSolution.finalAnswer}`
    : undefined;

  const sendMessage = async (overrideText?: string) => {
    const query = (overrideText ?? input).trim();
    if (!query || loading) return;

    const userMsg: ProfessorMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: query,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    if (!overrideText) setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await apiRequest<ProfessorResponse>('/api/professor', {
        method: 'POST',
        body: {
          message: query,
          level,
          script,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          taskContext,
        },
        onQuotaUpdate,
      });

      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          text: res.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
      setExtraByMsg((prev) => ({
        ...prev,
        [assistantId]: {
          guidingQuestion: res.guidingQuestion,
          keyTakeaway: res.keyTakeaway,
        },
      }));
    } catch (err) {
      // Remove optimistic user message on error if desired, or keep and show error
      setMessages(messages);
      if (!overrideText) setInput(query);
      setError(err instanceof ApiClientError ? err.message : tr('Greška u razgovoru sa AI profesorom.', script));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <QuotaBanner quota={quota} script={script} />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {tr('AI Profesor', script)}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {tr('Postavljaj dodatna pitanja i uči korak po korak na nivou koji ti najviše odgovara.', script)}
            </p>
          </div>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setExtraByMsg({});
                setError(null);
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 self-start dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{tr('Novi razgovor', script)}</span>
            </button>
          )}
        </div>

        {/* 4 Explanation Levels */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            {tr('Izaberi nivo objašnjenja', script)}
          </p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {LEVELS.map((lv) => {
              const active = level === lv.id;
              return (
                <button
                  key={lv.id}
                  type="button"
                  onClick={() => setLevel(lv.id)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/60'
                      : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:bg-slate-800'
                  }`}
                >
                  <p
                    className={`font-display text-sm font-bold ${
                      active ? 'text-blue-800 dark:text-blue-200' : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {tr(lv.label, script)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {tr(lv.desc, script)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Attached Task Context */}
        {attachedSolution && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 dark:border-blue-900/60 dark:bg-blue-950/30">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-800 dark:text-blue-300">
                <BookOpen className="h-3.5 w-3.5" />
                <span>
                  {tr(`Kontekst zadatka: ${attachedSolution.subjectLabel} · ${attachedSolution.topic}`, script)}
                </span>
              </div>
              <p className="truncate text-xs text-slate-700 dark:text-slate-300">
                {tr(attachedSolution.recognizedText, script)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearAttached}
              aria-label={tr('Ukloni kontekst zadatka', script)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-100 dark:hover:bg-blue-900/50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Messages Area */}
        <div className="min-h-64 max-h-[30rem] space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
              <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">
                {tr(
                  'Pitaj me kako da započneš zadatak, zašto se koristi određena formula ili zatraži sličan zadatak za vežbu.',
                  script,
                )}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  'Objasni mi ovo najjednostavnije moguće.',
                  'Zašto smo u ovom koraku koristili baš ovu formulu?',
                  'Daj mi sličan zadatak da pokušam samostalno.',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={isExhausted}
                    onClick={() => void sendMessage(tr(suggestion, script))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {tr(suggestion, script)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const extra = extraByMsg[msg.id];
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-2xl rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-700 text-white dark:bg-blue-600'
                        : 'border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      <div className="space-y-3">
                        <MathText text={msg.text} script={script} />
                        {extra?.keyTakeaway && (
                          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-2.5 text-xs text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200">
                            <span className="font-bold">{tr('Zapamti:', script)} </span>
                            <MathText text={extra.keyTakeaway} script={script} />
                          </div>
                        )}
                        {extra?.guidingQuestion && (
                          <button
                            type="button"
                            disabled={isExhausted || loading}
                            onClick={() => setInput(tr(extra.guidingQuestion || '', script))}
                            className="flex items-start gap-2 text-left text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                          >
                            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                              {tr('Pitanje za razmišljanje:', script)}{' '}
                              <MathText text={extra.guidingQuestion} script={script} />
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span>{tr('REŠI analizira tvoj zadatak...', script)}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <span>{tr(error, script)}</span>
          </div>
        )}

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isExhausted || loading}
            placeholder={tr('Postavi pitanje AI profesoru...', script)}
            className="min-h-12 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 focus:border-blue-600 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={isExhausted || loading || !input.trim()}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Send className="h-4 w-4" />
            <span>{tr('Pošalji', script)}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
