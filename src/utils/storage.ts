import type { ScriptMode, SolvedHistoryItem, ThemeMode } from '../types/resi.ts';

const HISTORY_KEY = 'resi_history_v1';
const THEME_KEY = 'resi_theme_v1';
const SCRIPT_KEY = 'resi_script_v1';
const DEVICE_KEY = 'resi_client_device_v1';
const FLASHCARD_PROGRESS_KEY = 'resi_flashcard_progress_v1';

export function getOrCreateClientDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing && existing.length >= 16) return existing;
    const generated =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
    localStorage.setItem(DEVICE_KEY, generated);
    return generated;
  } catch {
    return 'ephemeral-client-id';
  }
}

export function loadTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {
    // ignore
  }
  return 'light';
}

export function saveTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

export function loadScript(): ScriptMode {
  try {
    const saved = localStorage.getItem(SCRIPT_KEY);
    if (saved === 'cyr' || saved === 'lat') return saved;
  } catch {
    // ignore
  }
  return 'lat';
}

export function saveScript(script: ScriptMode): void {
  try {
    localStorage.setItem(SCRIPT_KEY, script);
  } catch {
    // ignore
  }
}

export function loadHistory(): SolvedHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(items: SolvedHistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 40)));
  } catch {
    // ignore quota exceeded on localStorage
  }
}

export function loadFlashcardMastery(): Record<string, 'known' | 'review'> {
  try {
    const raw = localStorage.getItem(FLASHCARD_PROGRESS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, 'known' | 'review'>;
  } catch {
    return {};
  }
}

export function saveFlashcardMastery(map: Record<string, 'known' | 'review'>): void {
  try {
    localStorage.setItem(FLASHCARD_PROGRESS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}
