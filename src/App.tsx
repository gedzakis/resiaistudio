import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { CodeLabView } from './components/CodeLabView.tsx';
import { Header } from './components/Header.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { HomeView } from './components/HomeView.tsx';
import { ProfessorView } from './components/ProfessorView.tsx';
import { QuizView } from './components/QuizView.tsx';
import { SolverView } from './components/SolverView.tsx';
import { ToolsView } from './components/ToolsView.tsx';
import { tr } from './i18n/serbian.ts';
import type {
  ActiveTab,
  QuotaStatus,
  ScriptMode,
  SolvedHistoryItem,
  SolveResponse,
  SubjectId,
  ThemeMode,
  ToolsSubTab,
} from './types/resi.ts';
import { apiRequest } from './utils/api.ts';
import { detectDeviceProfile, type DeviceProfile } from './utils/device.ts';
import {
  loadHistory,
  loadScript,
  loadTheme,
  saveHistory,
  saveScript,
  saveTheme,
} from './utils/storage.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [toolsSubTab, setToolsSubTab] = useState<ToolsSubTab>('documents');
  const [script, setScript] = useState<ScriptMode>(() => loadScript());
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [device, setDevice] = useState<DeviceProfile>(() => detectDeviceProfile());
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [history, setHistory] = useState<SolvedHistoryItem[]>(() => loadHistory());

  // Solver session state
  const [solverSubject, setSolverSubject] = useState<SubjectId | 'auto'>('auto');
  const [solverPrefill, setSolverPrefill] = useState('');
  const [cameraToken, setCameraToken] = useState(0);
  const [activeSolution, setActiveSolution] = useState<SolveResponse | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  // Professor attached context
  const [professorTask, setProfessorTask] = useState<SolveResponse | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    saveScript(script);
  }, [script]);

  useEffect(() => {
    const onResize = () => setDevice(detectDeviceProfile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    void apiRequest<QuotaStatus>('/api/quota')
      .then((q) => setQuota(q))
      .catch(() => {
        // QuotaBanner handles offline/unconfigured states cleanly
      });
  }, []);

  const handleNavigate = (tab: ActiveTab, sub?: ToolsSubTab) => {
    if (sub) setToolsSubTab(sub);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartCamera = () => {
    setSolverSubject('auto');
    setSolverPrefill('');
    setActiveTab('solve');
    setCameraToken((t) => t + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartManual = (subj: SubjectId | 'auto' = 'auto', prefill = '') => {
    setSolverSubject(subj);
    setSolverPrefill(prefill);
    setActiveTab('solve');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSolutionReady = (sol: SolveResponse, promptSnippet: string) => {
    setActiveSolution(sol);
    if (!sol.readable) return;

    const newId = `sol_${Date.now()}`;
    const newItem: SolvedHistoryItem = {
      id: newId,
      createdAt: new Date().toISOString(),
      subject: sol.subject,
      subjectLabel: sol.subjectLabel,
      topic: sol.topic,
      promptSnippet,
      finalAnswer: sol.finalAnswer,
      favorite: false,
      solution: sol,
    };
    const updated = [newItem, ...history].slice(0, 40);
    setHistory(updated);
    saveHistory(updated);
    setActiveHistoryId(newId);
  };

  const handleToggleFavorite = (id: string) => {
    const updated = history.map((item) =>
      item.id === id ? { ...item, favorite: !item.favorite } : item,
    );
    setHistory(updated);
    saveHistory(updated);
  };

  const handleDeleteHistoryItem = (id: string) => {
    const updated = history.filter((item) => item.id !== id);
    setHistory(updated);
    saveHistory(updated);
    if (activeHistoryId === id) {
      setActiveHistoryId(null);
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    saveHistory([]);
    setActiveHistoryId(null);
  };

  const handleOpenHistoryItem = (item: SolvedHistoryItem) => {
    setActiveSolution(item.solution);
    setActiveHistoryId(item.id);
    setActiveTab('solve');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAskProfessorAbout = (sol: SolveResponse) => {
    setProfessorTask(sol);
    setActiveTab('professor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentIsFavorite = activeHistoryId
    ? Boolean(history.find((i) => i.id === activeHistoryId)?.favorite)
    : false;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <Header
        activeTab={activeTab}
        onNavigate={(tab) => handleNavigate(tab)}
        onCaptureStart={handleStartCamera}
        script={script}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {activeTab === 'home' && (
              <HomeView
                script={script}
                onScriptChange={setScript}
                theme={theme}
                onThemeChange={setTheme}
                device={device}
                quota={quota}
                history={history}
                onStartCamera={handleStartCamera}
                onStartManual={handleStartManual}
                onNavigate={handleNavigate}
                onOpenHistoryItem={handleOpenHistoryItem}
                onToggleFavorite={handleToggleFavorite}
              />
            )}

            {activeTab === 'solve' && (
              <SolverView
                script={script}
                device={device}
                quota={quota}
                onQuotaUpdate={setQuota}
                initialSubject={solverSubject}
                initialText={solverPrefill}
                triggerCameraToken={cameraToken}
                activeSolution={activeSolution}
                onSolutionReady={handleSolutionReady}
                onAskProfessorAbout={handleAskProfessorAbout}
                isFavorite={currentIsFavorite}
                onToggleFavoriteCurrent={
                  activeHistoryId ? () => handleToggleFavorite(activeHistoryId) : undefined
                }
              />
            )}

            {activeTab === 'professor' && (
              <ProfessorView
                script={script}
                quota={quota}
                onQuotaUpdate={setQuota}
                attachedSolution={professorTask}
                onClearAttached={() => setProfessorTask(null)}
              />
            )}

            {activeTab === 'codelab' && (
              <CodeLabView script={script} quota={quota} onQuotaUpdate={setQuota} />
            )}

            {activeTab === 'quiz' && (
              <QuizView script={script} quota={quota} onQuotaUpdate={setQuota} />
            )}

            {activeTab === 'tools' && (
              <ToolsView
                script={script}
                quota={quota}
                onQuotaUpdate={setQuota}
                initialSubTab={toolsSubTab}
              />
            )}

            {activeTab === 'history' && (
              <HistoryView
                script={script}
                history={history}
                onOpenItem={handleOpenHistoryItem}
                onToggleFavorite={handleToggleFavorite}
                onDeleteItem={handleDeleteHistoryItem}
                onClearAll={handleClearHistory}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="font-medium text-slate-700 dark:text-slate-300">
            {tr('REŠI — Tvoj AI profesor je uvek uz tebe.', script)}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => handleNavigate('solve')}
              className="hover:text-slate-900 dark:hover:text-white"
            >
              {tr('Reši zadatak', script)}
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('history')}
              className="hover:text-slate-900 dark:hover:text-white"
            >
              {tr('Lokalna istorija', script)}
            </button>
            <button
              type="button"
              onClick={() => setScript((s) => (s === 'lat' ? 'cyr' : 'lat'))}
              className="hover:text-slate-900 dark:hover:text-white"
            >
              {script === 'lat' ? 'Ћирилица' : 'Latinica'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
