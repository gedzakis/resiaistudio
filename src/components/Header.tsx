import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { tr } from '../i18n/serbian.ts';
import type { ActiveTab, ScriptMode } from '../types/resi.ts';

interface HeaderProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  onCaptureStart: () => void;
  script: ScriptMode;
}

export function Header({ activeTab, onNavigate, onCaptureStart, script }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: Array<{ id: ActiveTab; label: string }> = [
    { id: 'home', label: 'Početna' },
    { id: 'professor', label: 'AI Profesor' },
    { id: 'codelab', label: 'Code Lab' },
    { id: 'quiz', label: 'Testovi' },
    { id: 'tools', label: 'Alati' },
  ];

  const handleNav = (id: ActiveTab) => {
    setMobileOpen(false);
    onNavigate(id);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleNav('home')}
          className="font-display text-xl font-extrabold tracking-tight text-blue-700 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-blue-400"
        >
          {tr('REŠI', script)}
        </button>

        {/* Zone 2: 5 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 ${
                  isActive
                    ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tr(item.label, script)}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action + Mobile Drawer Trigger */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onCaptureStart();
            }}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {tr('Uslikaj zadatak', script)}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={tr('Otvori meni', script)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 md:hidden dark:border-slate-800 dark:text-slate-200"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <nav className="border-t border-slate-200 bg-white px-4 py-3 md:hidden dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNav(item.id)}
                  className={`flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'
                  }`}
                >
                  {tr(item.label, script)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => handleNav('history')}
              className={`flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'
              }`}
            >
              {tr('Istorija zadataka', script)}
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
