import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Layers,
  Loader2,
  Presentation,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import labBanner from '../assets/images/resi_lab_banner_1794684360556.jpg';
import { tr } from '../i18n/serbian.ts';
import type {
  DocumentStudyResponse,
  EducationLevel,
  FlashcardsResponse,
  PresentationResponse,
  QuotaStatus,
  ScriptMode,
  ToolsSubTab,
} from '../types/resi.ts';
import { apiRequest, ApiClientError } from '../utils/api.ts';
import { exportPresentationPdf, exportPresentationPptx } from '../utils/exportFiles.ts';
import { optimizeImageFile, readFileAsBase64 } from '../utils/imageOptimize.ts';
import { loadFlashcardMastery, saveFlashcardMastery } from '../utils/storage.ts';
import { MathText } from './MathText.tsx';
import { QuotaBanner } from './QuotaBanner.tsx';

interface ToolsViewProps {
  script: ScriptMode;
  quota: QuotaStatus | null;
  onQuotaUpdate: (q: QuotaStatus) => void;
  initialSubTab?: ToolsSubTab;
}

export function ToolsView({
  script,
  quota,
  onQuotaUpdate,
  initialSubTab = 'documents',
}: ToolsViewProps) {
  const [subTab, setSubTab] = useState<ToolsSubTab>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  // Document Analyzer State
  const [docFile, setDocFile] = useState<{
    fileName: string;
    mimeType: string;
    base64Data: string;
    sizeKb: number;
  } | null>(null);
  const [docQuestion, setDocQuestion] = useState('');
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [docResult, setDocResult] = useState<DocumentStudyResponse | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Presentation Generator State
  const [presTopic, setPresTopic] = useState('');
  const [presLevel, setPresLevel] = useState<EducationLevel>('srednja');
  const [slideCount, setSlideCount] = useState(6);
  const [presLoading, setPresLoading] = useState(false);
  const [presError, setPresError] = useState<string | null>(null);
  const [presResult, setPresResult] = useState<PresentationResponse | null>(null);

  // Flashcards State
  const [cardTopic, setCardTopic] = useState('');
  const [cardNotes, setCardNotes] = useState('');
  const [cardCount, setCardCount] = useState(8);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardsResult, setCardsResult] = useState<FlashcardsResponse | null>(null);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [mastery, setMastery] = useState<Record<string, 'known' | 'review'>>(() =>
    loadFlashcardMastery(),
  );

  const isExhausted = quota ? quota.remaining <= 0 : false;

  const handleSelectDoc = async (file: File) => {
    setDocError(null);
    if (file.size > 10 * 1024 * 1024) {
      setDocError(tr('Datoteka prelazi maksimalnu veličinu od 10 MB.', script));
      return;
    }
    try {
      if (file.type.startsWith('image/')) {
        const opt = await optimizeImageFile(file);
        setDocFile({
          fileName: opt.fileName,
          mimeType: opt.mimeType,
          base64Data: opt.base64Data,
          sizeKb: Math.round(opt.optimizedBytes / 1024),
        });
      } else {
        const b64 = await readFileAsBase64(file);
        setDocFile({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64Data: b64,
          sizeKb: Math.round(file.size / 1024),
        });
      }
    } catch (err) {
      setDocError(err instanceof Error ? err.message : tr('Greška pri učitavanju dokumenta.', script));
    }
  };

  const handleAnalyzeDoc = async () => {
    if (!docFile) {
      setDocError(tr('Priloži PDF, Word, PowerPoint, tekstualni fajl ili fotografiju stranice knjige.', script));
      return;
    }
    setDocLoading(true);
    setDocError(null);
    try {
      const res = await apiRequest<DocumentStudyResponse>('/api/documents/analyze', {
        method: 'POST',
        body: {
          fileName: docFile.fileName,
          mimeType: docFile.mimeType,
          base64Data: docFile.base64Data,
          userQuestion: docQuestion.trim() || undefined,
          script,
        },
        onQuotaUpdate,
      });
      setDocResult(res);
    } catch (err) {
      setDocError(err instanceof ApiClientError ? err.message : tr('Greška pri analizi dokumenta.', script));
    } finally {
      setDocLoading(false);
    }
  };

  const handleGeneratePresentation = async () => {
    if (!presTopic.trim()) {
      setPresError(tr('Unesi temu prezentacije.', script));
      return;
    }
    setPresLoading(true);
    setPresError(null);
    try {
      const res = await apiRequest<PresentationResponse>('/api/presentations/generate', {
        method: 'POST',
        body: { topic: presTopic.trim(), level: presLevel, slideCount, script },
        onQuotaUpdate,
      });
      setPresResult(res);
    } catch (err) {
      setPresError(err instanceof ApiClientError ? err.message : tr('Greška pri izradi prezentacije.', script));
    } finally {
      setPresLoading(false);
    }
  };

  const handleGenerateFlashcards = async () => {
    if (!cardTopic.trim() && !cardNotes.trim()) {
      setCardError(tr('Unesi temu ili beleške za kartice.', script));
      return;
    }
    setCardLoading(true);
    setCardError(null);
    setCardIdx(0);
    setFlipped(false);
    try {
      const res = await apiRequest<FlashcardsResponse>('/api/flashcards/generate', {
        method: 'POST',
        body: { topic: cardTopic.trim(), notes: cardNotes.trim() || undefined, count: cardCount, script },
        onQuotaUpdate,
      });
      setCardsResult(res);
    } catch (err) {
      setCardError(err instanceof ApiClientError ? err.message : tr('Greška pri pravljenju kartica.', script));
    } finally {
      setCardLoading(false);
    }
  };

  const markCard = (status: 'known' | 'review') => {
    if (!cardsResult) return;
    const card = cardsResult.cards[cardIdx];
    if (!card) return;
    const key = `${cardsResult.topic}:${card.id}`;
    const updated = { ...mastery, [key]: status };
    setMastery(updated);
    saveFlashcardMastery(updated);
    setFlipped(false);
    if (cardIdx < cardsResult.cards.length - 1) {
      setCardIdx(cardIdx + 1);
    }
  };

  const activeCard = cardsResult?.cards[cardIdx];
  const activeCardKey = cardsResult && activeCard ? `${cardsResult.topic}:${activeCard.id}` : '';
  const knownCount = cardsResult
    ? cardsResult.cards.filter((c) => mastery[`${cardsResult.topic}:${c.id}`] === 'known').length
    : 0;

  return (
    <div className="space-y-6">
      <QuotaBanner quota={quota} script={script} />

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setSubTab('documents')}
          className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
            subTab === 'documents'
              ? 'bg-blue-700 text-white dark:bg-blue-600'
              : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>{tr('PDF, skripte i lekcije', script)}</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('presentations')}
          className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
            subTab === 'presentations'
              ? 'bg-blue-700 text-white dark:bg-blue-600'
              : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <Presentation className="h-4 w-4" />
          <span>{tr('AI Generator prezentacija', script)}</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('flashcards')}
          className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
            subTab === 'flashcards'
              ? 'bg-blue-700 text-white dark:bg-blue-600'
              : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>{tr('AI Kartice za učenje', script)}</span>
        </button>
      </div>

      {/* TAB 1: Documents & Lessons */}
      {subTab === 'documents' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                <img
                  src={labBanner}
                  alt={tr('Naučni i akademski materijali', script)}
                  referrerPolicy="no-referrer"
                  className="h-36 w-full object-cover"
                />
              </div>

              <div>
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {tr('Analiza PDF, skripti i lekcija', script)}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {tr('Dodaj PDF, Word (.docx), PowerPoint (.pptx), tekst (.txt) ili fotografiju stranice knjige (maks. 10 MB).', script)}
                </p>
              </div>

              <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.docx,.pptx,.txt,.md,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleSelectDoc(f);
                  e.target.value = '';
                }}
              />

              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                className="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center hover:border-blue-500 dark:border-slate-700 dark:bg-slate-950"
              >
                <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {docFile ? `${docFile.fileName} (${docFile.sizeKb} KB)` : tr('Izaberi dokument ili sliku stranice', script)}
                </span>
              </button>

              <label className="block space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>{tr('Opciono pitanje iz dokumenta', script)}</span>
                <input
                  type="text"
                  value={docQuestion}
                  onChange={(e) => setDocQuestion(e.target.value)}
                  placeholder={tr('Npr. Koje su glavne razlike opisane u drugom poglavlju?', script)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              {docError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>{tr(docError, script)}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleAnalyzeDoc}
                disabled={docLoading || isExhausted}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600"
              >
                {docLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{tr('REŠI analizira tvoj zadatak...', script)}</span>
                  </>
                ) : (
                  <span>{tr('Analiziraj lekciju', script)}</span>
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-7">
            {!docResult ? (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                {tr('Sažetak, definicije, objašnjenje jednostavnim jezikom i pitanja za ponavljanje pojaviće se ovde.', script)}
              </div>
            ) : (
              <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {tr(docResult.title, script)}
                </h3>

                {docResult.answerToUserQuestion && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 space-y-1 dark:border-blue-900/50 dark:bg-blue-950/30">
                    <p className="text-xs font-bold text-blue-900 dark:text-blue-200">
                      {tr('Odgovor na tvoje pitanje', script)}
                    </p>
                    <p className="text-sm text-slate-800 dark:text-slate-200">
                      <MathText text={docResult.answerToUserQuestion} script={script} />
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {tr('Sažetak gradiva', script)}
                  </h4>
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    <MathText text={docResult.summary} script={script} />
                  </p>
                </div>

                <div className="space-y-1.5">
                  <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {tr('Objašnjeno jednostavnim jezikom', script)}
                  </h4>
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    <MathText text={docResult.simpleExplanation} script={script} />
                  </p>
                </div>

                {docResult.keyDefinitions.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      {tr('Ključne definicije', script)}
                    </h4>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {docResult.keyDefinitions.map((d, i) => (
                        <div key={i} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                          <p className="text-xs font-bold text-blue-700 dark:text-blue-400">
                            {tr(d.term, script)}
                          </p>
                          <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                            <MathText text={d.definition} script={script} />
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {docResult.importantFacts.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      {tr('Najvažnije informacije', script)}
                    </h4>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
                      {docResult.importantFacts.map((fact, i) => (
                        <li key={i}>
                          <MathText text={fact} script={script} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {docResult.reviewQuestions.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      {tr('Pitanja za ponavljanje', script)}
                    </h4>
                    <div className="space-y-2">
                      {docResult.reviewQuestions.map((rq, i) => (
                        <details
                          key={i}
                          className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800"
                        >
                          <summary className="cursor-pointer font-semibold text-slate-900 dark:text-white">
                            <MathText text={rq.question} script={script} />
                          </summary>
                          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                            <MathText text={rq.answer} script={script} />
                          </p>
                        </details>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: AI Presentation Generator */}
      {subTab === 'presentations' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                {tr('AI Generator prezentacija', script)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tr('Unesi temu i dobij kompletnu strukturu slajdova spremnu za izvoz u PowerPoint (.pptx) ili PDF.', script)}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <label className="space-y-1 text-xs font-medium text-slate-700 sm:col-span-2 dark:text-slate-300">
                <span>{tr('Tema prezentacije', script)}</span>
                <input
                  type="text"
                  value={presTopic}
                  onChange={(e) => setPresTopic(e.target.value)}
                  placeholder={tr('Npr. Sunčev sistem, Drugi svetski rat, Baze podataka...', script)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>{tr('Nivo', script)}</span>
                <select
                  value={presLevel}
                  onChange={(e) => setPresLevel(e.target.value as EducationLevel)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="osnovna">{tr('Osnovna škola', script)}</option>
                  <option value="srednja">{tr('Srednja škola', script)}</option>
                  <option value="fakultet">{tr('Fakultet', script)}</option>
                </select>
              </label>

              <label className="space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>{tr('Broj slajdova', script)}</span>
                <select
                  value={slideCount}
                  onChange={(e) => setSlideCount(Number(e.target.value))}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value={5}>5 {tr('slajdova', script)}</option>
                  <option value={6}>6 {tr('slajdova', script)}</option>
                  <option value={8}>8 {tr('slajdova', script)}</option>
                  <option value={10}>10 {tr('slajdova', script)}</option>
                </select>
              </label>
            </div>

            {presError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>{tr(presError, script)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleGeneratePresentation}
              disabled={presLoading || isExhausted}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600"
            >
              {presLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{tr('REŠI analizira tvoj zadatak...', script)}</span>
                </>
              ) : (
                <span>{tr('Napravi prezentaciju', script)}</span>
              )}
            </button>
          </div>

          {presResult && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                    {tr(presResult.topic, script)}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {tr(presResult.subtitle, script)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void exportPresentationPptx(presResult)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 dark:bg-blue-600"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{tr('Preuzmi PowerPoint (.pptx)', script)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportPresentationPdf(presResult)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{tr('Preuzmi PDF', script)}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {presResult.slides.map((s) => (
                  <div
                    key={s.slideNumber}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="space-y-2.5">
                      <p className="text-xs font-semibold text-blue-700 tabular-nums dark:text-blue-400">
                        {tr(`Slajd ${s.slideNumber}`, script)}
                      </p>
                      <h4 className="font-display text-base font-bold text-slate-900 dark:text-white">
                        {tr(s.title, script)}
                      </h4>
                      <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700 dark:text-slate-300">
                        {s.bullets.map((b, i) => (
                          <li key={i}>{tr(b, script)}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <p>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {tr('Ilustracija:', script)}
                        </span>{' '}
                        {tr(s.visualSuggestion, script)}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {tr('Beleške za izlaganje:', script)}
                        </span>{' '}
                        {tr(s.speakerNotes, script)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 dark:border-blue-900/50 dark:bg-blue-950/30">
                <h4 className="font-display text-sm font-bold text-blue-950 dark:text-blue-100">
                  {tr('Zaključak prezentacije', script)}
                </h4>
                <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                  {tr(presResult.conclusion, script)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AI Flashcards */}
      {subTab === 'flashcards' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {tr('AI Kartice za učenje', script)}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tr('Brzo ponavljanje definicija, formula i pojmova uz praćenje naučenog gradiva.', script)}
                </p>
              </div>

              <label className="block space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>{tr('Tema ili predmet', script)}</span>
                <input
                  type="text"
                  value={cardTopic}
                  onChange={(e) => setCardTopic(e.target.value)}
                  placeholder={tr('Npr. Trigonometrijske formule, Ćelijske organele...', script)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="block space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>{tr('Opcione beleške / gradivo', script)}</span>
                <textarea
                  rows={3}
                  value={cardNotes}
                  onChange={(e) => setCardNotes(e.target.value)}
                  placeholder={tr('Nalepi definicije ili lekciju iz koje želiš kartice...', script)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="block space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>{tr('Broj kartica', script)}</span>
                <select
                  value={cardCount}
                  onChange={(e) => setCardCount(Number(e.target.value))}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value={6}>6 {tr('kartica', script)}</option>
                  <option value={8}>8 {tr('kartica', script)}</option>
                  <option value={12}>12 {tr('kartica', script)}</option>
                </select>
              </label>

              {cardError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>{tr(cardError, script)}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerateFlashcards}
                disabled={cardLoading || isExhausted}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600"
              >
                {cardLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{tr('REŠI analizira tvoj zadatak...', script)}</span>
                  </>
                ) : (
                  <span>{tr('Napravi kartice za učenje', script)}</span>
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-7">
            {!cardsResult || !activeCard ? (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                {tr('Generisane kartice sa pitanjima, odgovorima i formulama pojaviće se ovde.', script)}
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-blue-700 dark:text-blue-400">
                    {tr(cardsResult.topic, script)}
                  </span>
                  <span className="tabular-nums">
                    {tr(`Kartica ${cardIdx + 1}/${cardsResult.cards.length} · Naučeno: ${knownCount}`, script)}
                  </span>
                </div>

                {/* Flip Card */}
                <button
                  type="button"
                  onClick={() => setFlipped((prev) => !prev)}
                  className="perspective-1000 block w-full text-left"
                >
                  <div
                    className={`preserve-3d relative min-h-60 w-full transition-transform duration-300 ${
                      flipped ? 'rotate-y-180' : ''
                    }`}
                  >
                    {/* Front */}
                    <div className="backface-hidden absolute inset-0 flex flex-col justify-between rounded-2xl border border-blue-200 bg-blue-50/50 p-6 dark:border-blue-900/60 dark:bg-slate-950">
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                        {tr(activeCard.category, script)} · {tr('Pitanje (klikni za okretanje)', script)}
                      </span>
                      <div className="font-display text-lg font-bold text-slate-900 dark:text-white">
                        <MathText text={activeCard.front} script={script} />
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {mastery[activeCardKey] === 'known'
                          ? tr('Status: Naučeno', script)
                          : mastery[activeCardKey] === 'review'
                            ? tr('Status: Za ponavljanje', script)
                            : tr('Klikni karticu za odgovor', script)}
                      </span>
                    </div>

                    {/* Back */}
                    <div className="backface-hidden rotate-y-180 absolute inset-0 flex flex-col justify-between rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 dark:border-emerald-900/60 dark:bg-slate-950">
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {tr('Odgovor', script)}
                      </span>
                      <div className="space-y-2 text-sm text-slate-900 dark:text-slate-100">
                        <MathText text={activeCard.back} script={script} />
                        {activeCard.formula && (
                          <div className="rounded-lg bg-white px-3 py-1.5 font-mono text-xs dark:bg-slate-900">
                            <MathText text={`$${activeCard.formula}$`} script={script} />
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {tr('Klikni ponovo da vratiš na pitanje', script)}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={cardIdx === 0}
                      onClick={() => {
                        setFlipped(false);
                        setCardIdx((i) => Math.max(0, i - 1));
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                      aria-label={tr('Prethodna kartica', script)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={cardIdx >= cardsResult.cards.length - 1}
                      onClick={() => {
                        setFlipped(false);
                        setCardIdx((i) => Math.min(cardsResult.cards.length - 1, i + 1));
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                      aria-label={tr('Sledeća kartica', script)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => markCard('review')}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>{tr('Ponovi kasnije', script)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => markCard('known')}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>{tr('Naučeno', script)}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
