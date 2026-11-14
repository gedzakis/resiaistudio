import {
  AlertTriangle,
  Camera,
  Check,
  Code2,
  Copy,
  FileUp,
  Loader2,
  Play,
  ShieldCheck,
  Terminal,
  Wrench,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { tr } from '../i18n/serbian.ts';
import type {
  CodeDebugResponse,
  CodeLanguage,
  QuotaStatus,
  ScriptMode,
} from '../types/resi.ts';
import { apiRequest, ApiClientError } from '../utils/api.ts';
import { optimizeImageFile } from '../utils/imageOptimize.ts';
import { QuotaBanner } from './QuotaBanner.tsx';

interface CodeLabViewProps {
  script: ScriptMode;
  quota: QuotaStatus | null;
  onQuotaUpdate: (q: QuotaStatus) => void;
}

const LANGUAGES: CodeLanguage[] = [
  'Python',
  'JavaScript',
  'TypeScript',
  'Java',
  'C',
  'C++',
  'C#',
  'PHP',
  'HTML',
  'CSS',
  'SQL',
  'Go',
  'Rust',
];

const SAMPLE_SNIPPETS: Record<string, string> = {
  Python: `def prosek(brojevi):\n    zbir = 0\n    for i in range(len(brojevi) + 1):\n        zbir += brojevi[i]\n    return zbir / len(brojevi)\n\nprint(prosek([10, 20, 30]))`,
  JavaScript: `function saberiParne(niz) {\n  let suma = 0;\n  for (let i = 0; i <= niz.length; i++) {\n    if (niz[i] % 2 === 0) {\n      suma += niz[i];\n    }\n  }\n  return suma;\n}\n\nconsole.log("Rezultat:", saberiParne([2, 3, 4, 5, 6]));`,
};

function highlightSyntax(code: string): string {
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/(\/\/.*$|#.*$)/gm, '<span class="text-slate-400 italic">$1</span>')
    .replace(/("(?:\\.|[^"])*"|'(?:\\.|[^'])*')/g, '<span class="text-emerald-400">$1</span>')
    .replace(
      /\b(def|return|if|else|elif|for|while|function|const|let|var|class|import|from|export|public|private|static|void|int|float|double|string|bool|boolean|SELECT|FROM|WHERE|JOIN|GROUP BY|ORDER BY|fn|mut|pub|match|struct|impl|package|func|echo)\b/g,
      '<span class="text-sky-400 font-semibold">$1</span>',
    )
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="text-amber-300">$1</span>');
}

function runIsolatedJsSandbox(code: string): Promise<{ logs: string[]; error?: string }> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.display = 'none';
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const logs: string[] = [];
    let finished = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve({
        logs,
        error: 'Izvršavanje je prekinuto nakon 2 sekunde (zaštita od beskonačne petlje).',
      });
    }, 2000);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { runId?: string; type?: string; payload?: string };
      if (!data || data.runId !== runId) return;
      if (data.type === 'log') {
        logs.push(String(data.payload ?? ''));
      } else if (data.type === 'error') {
        finished = true;
        clearTimeout(timer);
        cleanup();
        resolve({ logs, error: String(data.payload ?? 'Greška pri izvršavanju') });
      } else if (data.type === 'done') {
        finished = true;
        clearTimeout(timer);
        cleanup();
        resolve({ logs });
      }
    };

    window.addEventListener('message', onMessage);

    const safeScript = JSON.stringify(code);
    iframe.srcdoc = `<!doctype html><html><body><script>
      const runId = ${JSON.stringify(runId)};
      const send = (type, payload) => parent.postMessage({ runId, type, payload }, '*');
      console.log = (...args) => send('log', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      console.error = (...args) => send('log', '[ERR] ' + args.join(' '));
      try {
        const fn = new Function(${safeScript});
        const res = fn();
        if (res !== undefined) send('log', '=> ' + String(res));
        send('done', '');
      } catch (e) {
        send('error', e && e.message ? e.message : String(e));
      }
    <\/script></body></html>`;

    document.body.appendChild(iframe);
  });
}

export function CodeLabView({ script, quota, onQuotaUpdate }: CodeLabViewProps) {
  const [language, setLanguage] = useState<CodeLanguage>('Python');
  const [code, setCode] = useState<string>(SAMPLE_SNIPPETS.Python);
  const [goal, setGoal] = useState('');
  const [photoFile, setPhotoFile] = useState<{
    fileName: string;
    mimeType: string;
    base64Data: string;
    previewUrl: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CodeDebugResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [sandboxOut, setSandboxOut] = useState<{ logs: string[]; error?: string } | null>(null);
  const [runningSandbox, setRunningSandbox] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const lineNumbers = useMemo(() => {
    const count = Math.max(1, code.split('\n').length);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [code]);

  const highlightedHtml = useMemo(() => highlightSyntax(code), [code]);

  const handleUploadCodeFile = async (file: File) => {
    setError(null);
    if (file.size > 512 * 1024) {
      setError(tr('Datoteka sa kodom je prevelika (maks. 512 KB).', script));
      return;
    }
    const text = await file.text();
    setCode(text);
  };

  const handleUploadPhoto = async (file: File) => {
    setError(null);
    try {
      const opt = await optimizeImageFile(file);
      setPhotoFile({
        fileName: opt.fileName,
        mimeType: opt.mimeType,
        base64Data: opt.base64Data,
        previewUrl: opt.previewUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Greška pri učitavanju slike koda.', script));
    }
  };

  const handleAnalyze = async () => {
    if (!code.trim() && !photoFile) {
      setError(tr('Unesi programski kod ili priloži fotografiju koda.', script));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiRequest<CodeDebugResponse>('/api/code/debug', {
        method: 'POST',
        body: {
          language,
          code: code.trim() || undefined,
          file: photoFile
            ? { mimeType: photoFile.mimeType, base64Data: photoFile.base64Data }
            : undefined,
          goal: goal.trim() || undefined,
          script,
        },
        onQuotaUpdate,
      });

      setResult(res);
      if (res.readable && res.extractedCode && !code.trim()) {
        setCode(res.extractedCode);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : tr('Greška pri analizi koda.', script));
    } finally {
      setLoading(false);
    }
  };

  const handleRunSandbox = async () => {
    setRunningSandbox(true);
    setSandboxOut(null);
    const out = await runIsolatedJsSandbox(code);
    setSandboxOut(out);
    setRunningSandbox(false);
  };

  const copyText = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const isExhausted = quota ? quota.remaining <= 0 : false;

  return (
    <div className="space-y-6">
      <QuotaBanner quota={quota} script={script} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Professional Editor */}
        <div className="space-y-4 lg:col-span-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {tr('AI Code Lab & Debugger', script)}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tr('Sintaksno bojenje, pronalaženje grešaka, optimizacija i objašnjenje za početnike.', script)}
                </p>
              </div>

              <select
                value={language}
                onChange={(e) => {
                  const lang = e.target.value as CodeLanguage;
                  setLanguage(lang);
                  if (SAMPLE_SNIPPETS[lang] && (code === SAMPLE_SNIPPETS.Python || code === SAMPLE_SNIPPETS.JavaScript)) {
                    setCode(SAMPLE_SNIPPETS[lang]);
                  }
                }}
                aria-label={tr('Programski jezik', script)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            {/* File / Photo Upload Toolbar */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".py,.js,.ts,.java,.c,.cpp,.cs,.php,.html,.css,.sql,.go,.rs,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUploadCodeFile(f);
                e.target.value = '';
              }}
            />
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUploadPhoto(f);
                e.target.value = '';
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <FileUp className="h-3.5 w-3.5" />
                <span>{tr('Učitaj datoteku koda', script)}</span>
              </button>

              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>{tr('Uslikaj kod', script)}</span>
              </button>

              {language === 'JavaScript' && (
                <button
                  type="button"
                  onClick={handleRunSandbox}
                  disabled={runningSandbox || !code.trim()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>{tr('Pokreni JS (izolovani sandbox)', script)}</span>
                </button>
              )}
            </div>

            {photoFile && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 dark:border-blue-900/60 dark:bg-blue-950/30">
                <span className="truncate text-xs font-medium text-blue-900 dark:text-blue-200">
                  {tr(`Priložena fotografija koda: ${photoFile.fileName}`, script)}
                </span>
                <button
                  type="button"
                  onClick={() => setPhotoFile(null)}
                  className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                >
                  {tr('Ukloni', script)}
                </button>
              </div>
            )}

            {/* Syntax Highlighted Code Editor with Line Numbers */}
            <div className="relative flex overflow-hidden rounded-xl border border-slate-800 bg-slate-950 font-mono text-xs leading-6">
              <div
                aria-hidden="true"
                className="select-none border-r border-slate-800 bg-slate-900/80 px-2.5 py-3 text-right text-slate-500 tabular-nums"
              >
                {lineNumbers.map((n) => (
                  <div key={n}>{n}</div>
                ))}
              </div>
              <div className="relative min-h-64 flex-1 overflow-x-auto">
                <pre
                  aria-hidden="true"
                  className="pointer-events-none m-0 whitespace-pre p-3 text-slate-100"
                  dangerouslySetInnerHTML={{ __html: `${highlightedHtml}\n` }}
                />
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-label={tr('Editor programskog koda', script)}
                  className="absolute inset-0 h-full w-full resize-none bg-transparent p-3 font-mono text-xs leading-6 text-transparent caret-white focus:outline-none"
                />
              </div>
            </div>

            {/* Isolated Sandbox Output */}
            {sandboxOut && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{tr('Izlaz izolovanog sandbox okruženja (bez pristupa serveru)', script)}</span>
                </div>
                {sandboxOut.logs.length > 0 ? (
                  sandboxOut.logs.map((l, idx) => (
                    <div key={idx} className="whitespace-pre-wrap text-slate-100">
                      {l}
                    </div>
                  ))
                ) : !sandboxOut.error ? (
                  <div className="text-slate-400">{tr('(Nema console.log ispisa)', script)}</div>
                ) : null}
                {sandboxOut.error && <div className="text-red-400">{sandboxOut.error}</div>}
              </div>
            )}

            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={tr('Opciono: opiši šta kod treba da uradi ili kakvu grešku dobijaš...', script)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>{tr(error, script)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={loading || isExhausted}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{tr('REŠI analizira tvoj zadatak...', script)}</span>
                </>
              ) : (
                <>
                  <Wrench className="h-4 w-4" />
                  <span>{tr('Analiziraj i ispravi kod', script)}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Debugger Analysis */}
        <div className="lg:col-span-6">
          {loading ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
              <Loader2 className="h-9 w-9 animate-spin text-blue-600" />
              <p className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {tr('REŠI analizira tvoj zadatak...', script)}
              </p>
            </div>
          ) : !result ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900/50">
              <Terminal className="h-9 w-9 text-blue-600 dark:text-blue-400" />
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {tr('Izveštaj AI debuggera', script)}
              </h3>
              <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
                {tr(
                  'Ovde ćeš videti pronađene sintaksne i logičke greške, ispravljen kod, objašnjenje izmena, optimizovano rešenje i vodič za početnike.',
                  script,
                )}
              </p>
            </div>
          ) : !result.readable ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/60 dark:bg-amber-950/30">
              <p className="font-display text-base font-bold text-amber-950 dark:text-amber-100">
                {tr('Slika koda nije dovoljno čitljiva', script)}
              </p>
              <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                {tr(
                  result.clarificationNeeded || 'Fotografiši kod bliže i pri boljem svetlu.',
                  script,
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  {tr(`Analiza koda · ${result.detectedLanguage}`, script)}
                </h3>
                <button
                  type="button"
                  onClick={() => setCode(result.correctedCode)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-200"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  <span>{tr('Ubaci ispravljen kod u editor', script)}</span>
                </button>
              </div>

              {/* Why it fails */}
              <div className="space-y-1">
                <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  {tr('Zašto kod ima grešku', script)}
                </h4>
                <p className="text-sm text-slate-700 dark:text-slate-300">{tr(result.whyItFails, script)}</p>
              </div>

              {/* Syntax & Logical errors */}
              {(result.syntaxErrors.length > 0 || result.logicalErrors.length > 0) && (
                <div className="space-y-2.5">
                  {result.syntaxErrors.map((e, i) => (
                    <div
                      key={`syn-${i}`}
                      className="rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs space-y-1 dark:border-red-900/50 dark:bg-red-950/30"
                    >
                      <p className="font-bold text-red-800 dark:text-red-300">
                        {tr(
                          `Sintaksna greška${e.line ? ` (linija ${e.line})` : ''}: ${e.message}`,
                          script,
                        )}
                      </p>
                      <p className="text-slate-700 dark:text-slate-300">
                        {tr(`Ispravka: ${e.fix}`, script)}
                      </p>
                    </div>
                  ))}
                  {result.logicalErrors.map((e, i) => (
                    <div
                      key={`log-${i}`}
                      className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs space-y-1 dark:border-amber-900/50 dark:bg-amber-950/30"
                    >
                      <p className="font-bold text-amber-900 dark:text-amber-300">
                        {tr(`Logička greška: ${e.description}`, script)}
                      </p>
                      <p className="text-slate-700 dark:text-slate-300">{tr(e.impact, script)}</p>
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        {tr(`Rešenje: ${e.fix}`, script)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Corrected Code */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {tr('Ispravljen kod', script)}
                  </h4>
                  <button
                    type="button"
                    onClick={() => void copyText('corrected', result.correctedCode)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {copiedKey === 'corrected' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{tr(copiedKey === 'corrected' ? 'Kopirano' : 'Kopiraj', script)}</span>
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3.5 font-mono text-xs text-slate-100">
                  <code>{result.correctedCode}</code>
                </pre>
              </div>

              {/* Changes explanation */}
              {result.changesExplanation.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {tr('Šta je tačno izmenjeno', script)}
                  </h4>
                  <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                    {result.changesExplanation.map((chg, idx) => (
                      <li key={idx} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                        <p className="font-semibold text-slate-900 dark:text-white">{tr(chg.whatChanged, script)}</p>
                        <p className="mt-0.5 text-slate-600 dark:text-slate-400">{tr(chg.reason, script)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Optimized Code */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {tr('Optimizovano rešenje', script)}
                  </h4>
                  <button
                    type="button"
                    onClick={() => void copyText('optimized', result.optimizedCode)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {copiedKey === 'optimized' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{tr(copiedKey === 'optimized' ? 'Kopirano' : 'Kopiraj', script)}</span>
                  </button>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">{tr(result.optimizationNotes, script)}</p>
                <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3.5 font-mono text-xs text-slate-100">
                  <code>{result.optimizedCode}</code>
                </pre>
              </div>

              {/* Beginner Walkthrough */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 space-y-1 dark:border-blue-900/50 dark:bg-blue-950/30">
                <h4 className="font-display text-sm font-bold text-blue-950 dark:text-blue-100">
                  {tr('Objašnjenje za početnike', script)}
                </h4>
                <p className="text-xs leading-relaxed text-slate-800 dark:text-slate-200">
                  {tr(result.beginnerWalkthrough, script)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
