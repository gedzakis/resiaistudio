import {
  Atom,
  BookOpen,
  Calculator,
  Camera,
  Code2,
  FileText,
  FlaskConical,
  Globe,
  GraduationCap,
  History,
  Image as ImageIcon,
  Landmark,
  Languages,
  Layers,
  MessageSquare,
  Moon,
  PenLine,
  Presentation,
  Smartphone,
  Star,
  Sun,
  Monitor,
} from 'lucide-react';
import { useState } from 'react';
import heroImage from '../assets/images/resi_hero_study_1794684360720.jpg';
import { SUBJECTS, tr } from '../i18n/serbian.ts';
import type {
  ActiveTab,
  QuotaStatus,
  ScriptMode,
  SolvedHistoryItem,
  SubjectId,
  ThemeMode,
  ToolsSubTab,
} from '../types/resi.ts';
import type { DeviceProfile } from '../utils/device.ts';
import { QuotaBanner } from './QuotaBanner.tsx';

interface HomeViewProps {
  script: ScriptMode;
  onScriptChange: (script: ScriptMode) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  device: DeviceProfile;
  quota: QuotaStatus | null;
  history: SolvedHistoryItem[];
  onStartCamera: () => void;
  onStartManual: (subject?: SubjectId, prefillText?: string) => void;
  onNavigate: (tab: ActiveTab, toolsSubTab?: ToolsSubTab) => void;
  onOpenHistoryItem: (item: SolvedHistoryItem) => void;
  onToggleFavorite: (id: string) => void;
}

const SUBJECT_ICONS: Record<SubjectId, typeof Calculator> = {
  matematika: Calculator,
  fizika: Atom,
  hemija: FlaskConical,
  programiranje: Code2,
  biologija: BookOpen,
  srpski: PenLine,
  istorija: Landmark,
  geografija: Globe,
  jezici: Languages,
  opste: GraduationCap,
};

export function HomeView({
  script,
  onScriptChange,
  theme,
  onThemeChange,
  device,
  quota,
  history,
  onStartCamera,
  onStartManual,
  onNavigate,
  onOpenHistoryItem,
  onToggleFavorite,
}: HomeViewProps) {
  const [imgError, setImgError] = useState(false);
  const recentItems = history.slice(0, 4);

  return (
    <div className="space-y-10">
      {/* Compact Workspace Utility Bar (Script, Theme, Device profile, History) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          {device.kind === 'mobile' ? (
            <Smartphone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          ) : (
            <Monitor className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          )}
          <span>{tr(device.label, script)}</span>
          <span aria-hidden="true">·</span>
          <span>{tr('Bez registracije', script)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Script Toggle */}
          <div
            role="group"
            aria-label={tr('Izbor pisma', script)}
            className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900"
          >
            <button
              type="button"
              onClick={() => onScriptChange('lat')}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                script === 'lat'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Latinica
            </button>
            <button
              type="button"
              onClick={() => onScriptChange('cyr')}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                script === 'cyr'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Ћирилица
            </button>
          </div>

          {/* Light / Dark Toggle */}
          <button
            type="button"
            onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            <span>{tr(theme === 'light' ? 'Tamna tema' : 'Svetla tema', script)}</span>
          </button>

          {/* History Button */}
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <History className="h-3.5 w-3.5" />
            <span>{tr('Istorija', script)} ({history.length})</span>
          </button>
        </div>
      </div>

      {/* Quota Banner */}
      <QuotaBanner quota={quota} script={script} />

      {/* Asymmetric 2-Column Hero */}
      <section className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
        <div className="flex flex-col justify-center space-y-6 lg:col-span-7">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">
              {tr('REŠI · Osnovna škola · Srednja škola · Fakultet', script)}
            </p>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 text-balance sm:text-5xl dark:text-white">
              {tr('Tvoj AI profesor je uvek uz tebe.', script)}
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
              {tr(
                'Uslikaj zadatak mobilnim telefonom ili ubaci fotografiju i PDF sa računara. Dobij postupak korak po korak, formule, grafikon, proveru tačnosti i objašnjenje za tvoj nivo znanja — odmah i bez registracije.',
                script,
              )}
            </p>
          </div>

          {/* Primary Actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={onStartCamera}
              className="inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-blue-700 px-7 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Camera className="h-5 w-5" />
              <span>{tr('USLIKAJ ZADATAK', script)}</span>
            </button>

            <button
              type="button"
              onClick={() => onStartManual()}
              className="inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <PenLine className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>{tr('UNESI ZADATAK', script)}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('professor')}
              className="inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl border border-blue-200 bg-blue-50 px-6 py-3.5 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-100 whitespace-nowrap shrink-0 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-950"
            >
              <MessageSquare className="h-4 w-4" />
              <span>{tr('AI PROFESOR', script)}</span>
            </button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {device.kind === 'mobile'
              ? tr('Na telefonu se kamera otvara direktno ili možeš izabrati sliku iz galerije jednim dodirom.', script)
              : tr('Na računaru možeš prevući fotografiju ili PDF dokument direktno u polje za rešavanje.', script)}
          </p>
        </div>

        {/* Right Hero Image Container */}
        <div className="lg:col-span-5">
          <div className="relative h-full min-h-64 overflow-hidden rounded-2xl border border-slate-200 bg-blue-50 dark:border-slate-800 dark:bg-slate-900">
            {!imgError ? (
              <img
                src={heroImage}
                alt={tr('Matematičke i fizičke beleške sa geometrijskim crtežima i prizmom', script)}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="h-full w-full object-cover lg:h-full"
              />
            ) : (
              <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
                <ImageIcon className="h-10 w-10 text-blue-600 dark:text-blue-400" />
                <p className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {tr('REŠI Laboratorija znanja', script)}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* School Subjects Grid */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {tr('Školski i fakultetski predmeti', script)}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {tr('Izaberi predmet da otvoriš prilagođeno rešavanje sa primerom zadatka.', script)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUBJECTS.map((subj) => {
            const Icon = SUBJECT_ICONS[subj.id];
            return (
              <button
                key={subj.id}
                type="button"
                onClick={() => onStartManual(subj.id, subj.samplePrompt)}
                className="group flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700 dark:hover:bg-slate-800/70"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition-colors group-hover:bg-blue-100 dark:bg-blue-950/70 dark:text-blue-300">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    {tr(subj.name, script)}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {tr(subj.areas, script)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Quick Navigation to Specialized Modules */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          {tr('Specijalizovani AI alati za učenje', script)}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => onNavigate('codelab')}
            className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
          >
            <Code2 className="h-6 w-6 text-blue-700 dark:text-blue-400" />
            <div className="space-y-1">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {tr('AI Code Lab', script)}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {tr('Debugger za 13 jezika, ispravljanje grešaka sa slike i optimizacija koda.', script)}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('quiz')}
            className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
          >
            <GraduationCap className="h-6 w-6 text-blue-700 dark:text-blue-400" />
            <div className="space-y-1">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {tr('Testovi i simulacije', script)}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {tr('Generiši kontrolne i fakultetske ispite sa ocenjivanjem i objašnjenjima.', script)}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('tools', 'documents')}
            className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
          >
            <FileText className="h-6 w-6 text-blue-700 dark:text-blue-400" />
            <div className="space-y-1">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {tr('PDF, skripte i lekcije', script)}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {tr('Sažeci, ključne definicije i odgovori na pitanja iz PDF, Word i PPTX fajlova.', script)}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('tools', 'presentations')}
            className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
          >
            <div className="flex items-center gap-2">
              <Presentation className="h-6 w-6 text-blue-700 dark:text-blue-400" />
              <Layers className="h-5 w-5 text-slate-400" />
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {tr('Prezentacije i kartice', script)}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {tr('Izvoz slajdova u PowerPoint (.pptx) i PDF plus pametne flashcards kartice.', script)}
              </p>
            </div>
          </button>
        </div>
      </section>

      {/* Recent Solved Tasks */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {tr('Poslednji rešeni zadaci', script)}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {tr('Čuva se lokalno u ovom pregledaču bez kreiranja naloga.', script)}
            </p>
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-sm font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0 dark:text-blue-400"
            >
              {tr('Prikaži sve', script)}
            </button>
          )}
        </div>

        {recentItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {tr('Još uvek nemaš rešenih zadataka. Klikni na "USLIKAJ ZADATAK" ili izaberi predmet iznad da započneš.', script)}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {recentItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() => onOpenHistoryItem(item)}
                  className="min-w-0 flex-1 space-y-1 text-left"
                >
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                      {tr(item.subjectLabel, script)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{tr(item.topic, script)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {new Date(item.createdAt).toLocaleDateString('sr-RS')}
                    </span>
                  </div>
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                    {tr(item.promptSnippet, script)}
                  </p>
                  <p className="truncate text-xs text-emerald-700 dark:text-emerald-400">
                    {tr(`Rezultat: ${item.finalAnswer}`, script)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(item.id)}
                  aria-label={tr('Sačuvaj u omiljene', script)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-slate-800"
                >
                  <Star className={`h-4 w-4 ${item.favorite ? 'fill-amber-400 text-amber-500' : ''}`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
