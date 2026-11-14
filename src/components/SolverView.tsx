import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  FileText,
  ImagePlus,
  Loader2,
  MessageSquare,
  RotateCw,
  Send,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SUBJECTS, tr } from '../i18n/serbian.ts';
import type {
  EducationLevel,
  QuotaStatus,
  ScriptMode,
  SolveResponse,
  SubjectId,
} from '../types/resi.ts';
import { apiRequest, ApiClientError } from '../utils/api.ts';
import type { DeviceProfile } from '../utils/device.ts';
import { exportSolutionPdf } from '../utils/exportFiles.ts';
import { optimizeImageFile, readFileAsBase64, rotateImageDataUrl } from '../utils/imageOptimize.ts';
import { MathBlock, MathText } from './MathText.tsx';
import { QuotaBanner } from './QuotaBanner.tsx';
import { Visualizer } from './Visualizer.tsx';

interface SolverViewProps {
  script: ScriptMode;
  device: DeviceProfile;
  quota: QuotaStatus | null;
  onQuotaUpdate: (q: QuotaStatus) => void;
  initialSubject?: SubjectId | 'auto';
  initialText?: string;
  triggerCameraToken?: number;
  activeSolution: SolveResponse | null;
  onSolutionReady: (sol: SolveResponse, promptSnippet: string) => void;
  onAskProfessorAbout: (sol: SolveResponse) => void;
  isFavorite?: boolean;
  onToggleFavoriteCurrent?: () => void;
}

export function SolverView({
  script,
  device,
  quota,
  onQuotaUpdate,
  initialSubject = 'auto',
  initialText = '',
  triggerCameraToken = 0,
  activeSolution,
  onSolutionReady,
  onAskProfessorAbout,
  isFavorite = false,
  onToggleFavoriteCurrent,
}: SolverViewProps) {
  const [subject, setSubject] = useState<SubjectId | 'auto'>(initialSubject);
  const [level, setLevel] = useState<EducationLevel>('srednja');
  const [text, setText] = useState(initialText);
  const [attachedFile, setAttachedFile] = useState<{
    fileName: string;
    mimeType: string;
    base64Data: string;
    previewUrl?: string;
    sizeInfo?: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSubject(initialSubject);
  }, [initialSubject]);

  useEffect(() => {
    if (initialText) {
      setText(initialText);
    }
  }, [initialText]);

  useEffect(() => {
    if (triggerCameraToken > 0) {
      // Trigger camera input directly on mobile or file dialog when requested
      setTimeout(() => {
        cameraInputRef.current?.click();
      }, 60);
    }
  }, [triggerCameraToken]);

  const handleSelectedFile = async (file: File) => {
    setError(null);
    if (file.size > 10 * 1024 * 1024) {
      setError(tr('Datoteka je veća od 10 MB. Izaberi manju sliku ili dokument.', script));
      return;
    }

    try {
      if (file.type.startsWith('image/')) {
        const opt = await optimizeImageFile(file);
        const origKb = Math.round(opt.originalBytes / 1024);
        const optKb = Math.round(opt.optimizedBytes / 1024);
        setAttachedFile({
          fileName: opt.fileName,
          mimeType: opt.mimeType,
          base64Data: opt.base64Data,
          previewUrl: opt.previewUrl,
          sizeInfo: `${origKb} KB → ${optKb} KB`,
        });
      } else {
        const b64 = await readFileAsBase64(file);
        setAttachedFile({
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          base64Data: b64,
          sizeInfo: `${Math.round(file.size / 1024)} KB`,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Greška pri učitavanju datoteke.', script));
    }
  };

  const handleRotate = async () => {
    if (!attachedFile?.previewUrl) return;
    const rotated = await rotateImageDataUrl(attachedFile.previewUrl);
    setAttachedFile({
      ...attachedFile,
      base64Data: rotated,
      previewUrl: rotated,
    });
  };

  const handleSolve = async () => {
    if (!text.trim() && !attachedFile) {
      setError(tr('Unesi tekst zadatka ili dodaj fotografiju / PDF dokument.', script));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await apiRequest<SolveResponse>('/api/solve', {
        method: 'POST',
        body: {
          text: text.trim(),
          file: attachedFile
            ? {
                fileName: attachedFile.fileName,
                mimeType: attachedFile.mimeType,
                base64Data: attachedFile.base64Data,
              }
            : undefined,
          subjectHint: subject,
          level,
          script,
        },
        onQuotaUpdate,
      });

      const snippet =
        result.recognizedText?.slice(0, 90) ||
        text.trim().slice(0, 90) ||
        attachedFile?.fileName ||
        'Zadatak sa fotografije';
      onSolutionReady(result, snippet);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(tr('Došlo je do greške pri rešavanju zadatka.', script));
      }
    } finally {
      setLoading(false);
    }
  };

  const isExhausted = quota ? quota.remaining <= 0 : false;

  return (
    <div className="space-y-6">
      <QuotaBanner quota={quota} script={script} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left / Input Column */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                {tr('Uslikaj ili unesi zadatak', script)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tr('Podržani su rukopis, štampani zadaci, formule, grafikoni, hemijske jednačine i PDF dokumenti.', script)}
              </p>
            </div>

            {/* Hidden file inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleSelectedFile(f);
                e.target.value = '';
              }}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleSelectedFile(f);
                e.target.value = '';
              }}
            />
            <input
              ref={docInputRef}
              type="file"
              accept=".pdf,.docx,.txt,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleSelectedFile(f);
                e.target.value = '';
              }}
            />

            {/* Capture & Upload Buttons */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <Camera className="h-4 w-4" />
                <span>{tr('Kamera / Uslikaj', script)}</span>
              </button>

              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                <ImagePlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span>{tr(device.kind === 'mobile' ? 'Iz galerije' : 'Izaberi sliku', script)}</span>
              </button>
            </div>

            {/* Drag and drop zone (especially great on desktop/tablet) */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void handleSelectedFile(f);
              }}
              onClick={() => docInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') docInputRef.current?.click();
              }}
              className={`cursor-pointer rounded-xl border border-dashed p-4 text-center transition-colors ${
                isDragging
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40'
                  : 'border-slate-300 bg-slate-50/70 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950/50'
              }`}
            >
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {tr('Prevuci sliku ili PDF dokument ovde, ili klikni za izbor (maks. 10 MB)', script)}
                </p>
              </div>
            </div>

            {/* Image / File Preview */}
            {attachedFile && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {attachedFile.fileName}
                    </p>
                    {attachedFile.sizeInfo && (
                      <p className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        {tr(`Optimizovano: ${attachedFile.sizeInfo}`, script)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {attachedFile.previewUrl && (
                      <button
                        type="button"
                        onClick={handleRotate}
                        title={tr('Rotiraj sliku', script)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAttachedFile(null)}
                      title={tr('Ukloni datoteku', script)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-red-600 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {attachedFile.previewUrl ? (
                  <img
                    src={attachedFile.previewUrl}
                    alt={tr('Pregled fotografije zadatka', script)}
                    className="max-h-56 w-full rounded-lg object-contain bg-white dark:bg-slate-900"
                  />
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-white p-3 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span>{tr('PDF / dokument je spreman za AI analizu.', script)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Subject & Education Level */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>{tr('Predmet', script)}</span>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value as SubjectId | 'auto')}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="auto">{tr('Automatsko prepoznavanje', script)}</option>
                  {SUBJECTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {tr(s.name, script)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>{tr('Nivo obrazovanja', script)}</span>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as EducationLevel)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="osnovna">{tr('Osnovna škola', script)}</option>
                  <option value="srednja">{tr('Srednja škola', script)}</option>
                  <option value="fakultet">{tr('Fakultet', script)}</option>
                </select>
              </label>
            </div>

            {/* Text Input */}
            <label className="block space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
              <span>{tr('Tekst zadatka ili dodatna napomena', script)}</span>
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={tr(
                  'Npr. Reši jednačinu 2x^2 - 5x + 2 = 0, ili napiši dodatno uputstvo uz fotografiju...',
                  script,
                )}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{tr(error, script)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleSolve}
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
                  <Send className="h-4 w-4" />
                  <span>{tr('REŠI ZADATAK', script)}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right / Output Column */}
        <div className="lg:col-span-7">
          {loading ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
              <Loader2 className="h-9 w-9 animate-spin text-blue-600 dark:text-blue-400" />
              <p className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {tr('REŠI analizira tvoj zadatak...', script)}
              </p>
              <p className="max-w-md text-xs text-slate-500 dark:text-slate-400">
                {tr('Prepoznajemo formule, proveravamo tačnost postupka i pripremamo detaljno objašnjenje.', script)}
              </p>
            </div>
          ) : !activeSolution ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900/50">
              <CheckCircle2 className="h-9 w-9 text-blue-600 dark:text-blue-400" />
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {tr('Detaljno rešenje će se prikazati ovde', script)}
              </h3>
              <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
                {tr(
                  'Dobićeš prepoznat tekst zadatka, potrebne formule, svaki korak računanja, interaktivni grafikon ili dijagram i proveru rezultata.',
                  script,
                )}
              </p>
            </div>
          ) : !activeSolution.readable ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 space-y-3 dark:border-amber-900/60 dark:bg-amber-950/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1">
                  <h3 className="font-display text-lg font-bold text-amber-950 dark:text-amber-100">
                    {tr('Fotografija nije dovoljno čitljiva', script)}
                  </h3>
                  <p className="text-sm text-amber-900 dark:text-amber-200">
                    {tr(
                      activeSolution.clarificationNeeded ||
                        'Molimo te da napraviš oštriju fotografiju pri boljem osvetljenju kako ne bismo pogađali tekst zadatka.',
                      script,
                    )}
                  </p>
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                    {tr('Ovaj pokušaj nije umanjio tvoj dnevni limit besplatnih pitanja.', script)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              {/* Header Metadata & Actions */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                      {tr(activeSolution.subjectLabel, script)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{tr(activeSolution.topic, script)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{tr(activeSolution.educationLevel, script)}</span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                    {tr('Postupak i rešenje zadatka', script)}
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onToggleFavoriteCurrent && (
                    <button
                      type="button"
                      onClick={onToggleFavoriteCurrent}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
                      <span>{tr(isFavorite ? 'Sačuvano' : 'Sačuvaj', script)}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => exportSolutionPdf(activeSolution)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAskProfessorAbout(activeSolution)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-200"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>{tr('Pitaj AI profesora', script)}</span>
                  </button>
                </div>
              </div>

              {/* Recognized Text & What Is Asked */}
              <div className="space-y-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {tr('Prepoznat tekst zadatka', script)}
                  </h4>
                  <p className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                    <MathText text={activeSolution.recognizedText} script={script} />
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {tr('Šta se traži', script)}
                  </h4>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                    <MathText text={activeSolution.whatIsAsked} script={script} />
                  </p>
                </div>
              </div>

              {/* Formulas */}
              {activeSolution.formulas && activeSolution.formulas.length > 0 && (
                <div className="space-y-2 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {tr('Potrebne formule', script)}
                  </h4>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {activeSolution.formulas.map((f, idx) => (
                      <div
                        key={`f-${idx}`}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950"
                      >
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                          {tr(f.name, script)}
                        </p>
                        <MathBlock latex={f.latex} className="text-sm" />
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {tr(f.description, script)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step by Step */}
              <div className="space-y-3">
                <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  {tr('Rešavanje korak po korak', script)}
                </h4>
                <div className="space-y-3">
                  {activeSolution.steps.map((step) => (
                    <div
                      key={step.stepNumber}
                      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60"
                    >
                      <p className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                        {tr(`Korak ${step.stepNumber}: ${step.title}`, script)}
                      </p>
                      <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">
                        <MathText text={step.explanation} script={script} />
                      </p>
                      {step.mathLatex && (
                        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-900">
                          <MathBlock latex={step.mathLatex} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Interactive Visualization */}
              {activeSolution.visualization && (
                <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                  <Visualizer data={activeSolution.visualization} script={script} />
                </div>
              )}

              {/* Final Answer & Verification */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {tr(
                      activeSolution.verification?.isEstimate
                        ? 'Konačan rezultat (procena)'
                        : activeSolution.verification?.isVerified
                          ? 'Konačan rezultat (proveren rezultat)'
                          : 'Konačan rezultat',
                      script,
                    )}
                  </span>
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white">
                  <MathText text={activeSolution.finalAnswer} script={script} />
                </div>
                {activeSolution.verification && (
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    <span className="font-semibold">{tr('Provera:', script)}</span>{' '}
                    <MathText
                      text={`${activeSolution.verification.method} — ${activeSolution.verification.result}. ${activeSolution.verification.note}`}
                      script={script}
                    />
                  </p>
                )}
              </div>

              {/* Alternative Method & Extra Example */}
              {activeSolution.alternativeMethod && (
                <div className="space-y-1 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {tr('Alternativni način rešavanja', script)}
                  </h4>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    <MathText text={activeSolution.alternativeMethod} script={script} />
                  </p>
                </div>
              )}

              {activeSolution.additionalExample?.problem && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 dark:border-slate-800 dark:bg-slate-950">
                  <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {tr('Sličan primer za vežbu', script)}
                  </h4>
                  <p className="text-sm text-slate-800 dark:text-slate-200">
                    <MathText text={activeSolution.additionalExample.problem} script={script} />
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    <MathText text={activeSolution.additionalExample.solution} script={script} />
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
