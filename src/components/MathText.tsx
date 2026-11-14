import katex from 'katex';
import { useMemo } from 'react';
import { tr } from '../i18n/serbian.ts';
import type { ScriptMode } from '../types/resi.ts';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLatexToHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return `<code>${escapeHtml(latex)}</code>`;
  }
}

export function MathText({
  text,
  script = 'lat',
  className = '',
}: {
  text: string;
  script?: ScriptMode;
  className?: string;
}) {
  const html = useMemo(() => {
    const localized = tr(text || '', script);
    // Split around $$...$$ and $...$ math blocks
    const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g;
    const parts = localized.split(regex);
    return parts
      .map((part) => {
        if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
          return renderLatexToHtml(part.slice(2, -2), true);
        }
        if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
          return renderLatexToHtml(part.slice(1, -1), false);
        }
        // Bold **text** support and line breaks
        const escaped = escapeHtml(part)
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\n/g, '<br />');
        return escaped;
      })
      .join('');
  }, [text, script]);

  return (
    <span
      className={`leading-relaxed break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function MathBlock({ latex, className = '' }: { latex: string; className?: string }) {
  const html = useMemo(() => {
    const clean = latex.replace(/^\$\$|\$\$$/g, '').replace(/^\$|\$$/g, '').trim();
    return renderLatexToHtml(clean, true);
  }, [latex]);

  return (
    <div
      className={`overflow-x-auto py-1 text-slate-900 dark:text-slate-100 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
