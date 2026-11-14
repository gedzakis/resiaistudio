import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { SUBJECTS, tr } from '../i18n/serbian.ts';
import type { QuotaStatus, QuizResponse, ScriptMode } from '../types/resi.ts';
import { apiRequest, ApiClientError } from '../utils/api.ts';
import { MathText } from './MathText.tsx';
import { QuotaBanner } from './QuotaBanner.tsx';

interface QuizViewProps {
  script: ScriptMode;
  quota: QuotaStatus | null;
  onQuotaUpdate: (q: QuotaStatus) => void;
}

export function QuizView({ script, quota, onQuotaUpdate }: QuizViewProps) {
  const [subject, setSubject] = useState('Matematika');
  const [topic, setTopic] = useState('Kvadratne jednačine i funkcije');
  const [difficulty, setDifficulty] = useState('Srednja škola');
  const [count, setCount] = useState(5);
  const [examSimulation, setExamSimulation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!quiz || submitted || !examSimulation) return;
    if (secondsLeft <= 0) {
      setSubmitted(true);
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setSubmitted(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [quiz, submitted, examSimulation, secondsLeft]);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError(tr('Unesi oblast ili lekciju za test.', script));
      return;
    }
    setLoading(true);
    setError(null);
    setSubmitted(false);
    setAnswers({});

    try {
      const res = await apiRequest<QuizResponse>('/api/quiz/generate', {
        method: 'POST',
        body: { subject, topic: topic.trim(), difficulty, count, examSimulation, script },
        onQuotaUpdate,
      });
      setQuiz(res);
      if (examSimulation) {
        setSecondsLeft((res.recommendedMinutes || count * 2) * 60);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : tr('Greška pri generisanju testa.', script));
    } finally {
      setLoading(false);
    }
  };

  const correctCount = quiz
    ? quiz.questions.filter((q) => answers[q.id] === q.correctIndex).length
    : 0;
  const totalCount = quiz ? quiz.questions.length : 0;
  const percentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  const schoolGrade =
    percentage >= 88 ? 5 : percentage >= 72 ? 4 : percentage >= 56 ? 3 : percentage >= 41 ? 2 : 1;
  const uniGrade =
    percentage >= 91 ? 10 : percentage >= 81 ? 9 : percentage >= 71 ? 8 : percentage >= 61 ? 7 : percentage >= 51 ? 6 : 5;

  const isExhausted = quota ? quota.remaining <= 0 : false;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <div className="space-y-6">
      <QuotaBanner quota={quota} script={script} />

      {/* Generator Setup */}
      {!quiz && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {tr('Generator testova i simulacija ispita', script)}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {tr('Kreiraj test za vežbanje ili vremenski ograničenu simulaciju kontrolnog zadatka i ispita.', script)}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
              <span>{tr('Predmet', script)}</span>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {SUBJECTS.map((s) => (
                  <option key={s.id} value={s.name}>
                    {tr(s.name, script)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
              <span>{tr('Oblast / lekcija', script)}</span>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={tr('Npr. Njutnovi zakoni, Hemijske veze, Izvodi...', script)}
                className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <label className="space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
              <span>{tr('Težina', script)}</span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="Osnovna škola">{tr('Osnovna škola', script)}</option>
                <option value="Srednja škola">{tr('Srednja škola', script)}</option>
                <option value="Takmičarski nivo">{tr('Takmičarski nivo', script)}</option>
                <option value="Fakultetski ispit">{tr('Fakultetski ispit', script)}</option>
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
              <span>{tr('Broj pitanja', script)}</span>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value={5}>5 {tr('pitanja', script)}</option>
                <option value={10}>10 {tr('pitanja', script)}</option>
                <option value={15}>15 {tr('pitanja', script)}</option>
              </select>
            </label>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm dark:border-slate-800 dark:bg-slate-950/60">
            <input
              type="checkbox"
              checked={examSimulation}
              onChange={(e) => setExamSimulation(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">
                {tr('Simulacija kontrolnog / ispita sa tajmerom', script)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tr('Aktivira odbrojavanje vremena i automatsku predaju po isteku roka.', script)}
              </p>
            </div>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>{tr(error, script)}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || isExhausted}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{tr('REŠI analizira tvoj zadatak...', script)}</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                <span>{tr('Generiši test', script)}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Active Quiz */}
      {quiz && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {tr(quiz.subject, script)} · {tr(quiz.difficulty, script)}
              </p>
              <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                {tr(quiz.title, script)}
              </h3>
            </div>

            <div className="flex items-center gap-3">
              {examSimulation && !submitted && (
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 font-mono text-sm font-bold text-amber-900 tabular-nums dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                  <Clock className="h-4 w-4" />
                  <span>
                    {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setQuiz(null);
                  setSubmitted(false);
                  setAnswers({});
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{tr('Novi test', script)}</span>
              </button>
            </div>
          </div>

          {/* Score Summary after Submit */}
          {submitted && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-5 dark:border-blue-900/60 dark:bg-blue-950/30">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Award className="h-8 w-8 text-blue-700 dark:text-blue-400" />
                  <div>
                    <p className="font-display text-xl font-bold text-slate-900 tabular-nums dark:text-white">
                      {tr(`Rezultat: ${correctCount}/${totalCount} (${percentage}%)`, script)}
                    </p>
                    <p className="text-xs text-slate-600 tabular-nums dark:text-slate-300">
                      {tr(`Školska ocena: ${schoolGrade} · Fakultetska ocena: ${uniGrade}`, script)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Questions List */}
          <div className="space-y-4">
            {quiz.questions.map((q, qIdx) => {
              const chosen = answers[q.id];
              const isRight = chosen === q.correctIndex;
              return (
                <div
                  key={q.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-slate-900"
                >
                  <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    {qIdx + 1}. <MathText text={q.question} script={script} />
                  </p>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {q.options.map((opt, optIdx) => {
                      const selected = chosen === optIdx;
                      const showCorrect = submitted && optIdx === q.correctIndex;
                      const showWrong = submitted && selected && optIdx !== q.correctIndex;
                      return (
                        <button
                          key={optIdx}
                          type="button"
                          disabled={submitted}
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: optIdx }))}
                          className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${
                            showCorrect
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100'
                              : showWrong
                                ? 'border-red-500 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100'
                                : selected
                                  ? 'border-blue-600 bg-blue-50 text-blue-950 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-100'
                                  : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span>
                            <MathText text={opt} script={script} />
                          </span>
                          {showCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                          {showWrong && <XCircle className="h-4 w-4 shrink-0 text-red-600" />}
                        </button>
                      );
                    })}
                  </div>

                  {submitted && (
                    <div
                      className={`rounded-xl border p-3 text-xs ${
                        isRight
                          ? 'border-emerald-200 bg-emerald-50/60 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200'
                          : 'border-amber-200 bg-amber-50/60 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200'
                      }`}
                    >
                      <span className="font-bold">
                        {tr(isRight ? 'Tačno:' : 'Objašnjenje tačnog odgovora:', script)}{' '}
                      </span>
                      <MathText text={q.explanation} script={script} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!submitted && (
            <button
              type="button"
              onClick={() => setSubmitted(true)}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {tr('Završi i proveri odgovore', script)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
