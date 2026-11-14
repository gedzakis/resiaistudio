import { jsPDF } from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import type { PresentationResponse, SolveResponse } from '../types/resi.ts';

function sanitizeForPdf(text: string): string {
  // Strip raw LaTeX delimiters for readable plain-text PDF export and normalize Serbian chars if needed
  return text
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)')
    .replace(/\\cdot/g, '*')
    .replace(/\\times/g, 'x')
    .replace(/\\pm/g, '+/-')
    .replace(/\\leq/g, '<=')
    .replace(/\\geq/g, '>=')
    .replace(/\\neq/g, '!=')
    .replace(/\\approx/g, '~=')
    .replace(/č/g, 'c')
    .replace(/ć/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'dj')
    .replace(/Č/g, 'C')
    .replace(/Ć/g, 'C')
    .replace(/Š/g, 'S')
    .replace(/Ž/g, 'Z')
    .replace(/Đ/g, 'Dj');
}

export async function exportPresentationPptx(pres: PresentationResponse): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = pres.topic;
  pptx.author = 'REŠI AI Obrazovna Platforma';

  // Cover slide
  const cover = pptx.addSlide();
  cover.background = { color: '1E3A8A' };
  cover.addText('RESI — Obrazovna prezentacija', {
    x: 0.8,
    y: 1.0,
    w: 8.4,
    fontSize: 13,
    color: '93C5FD',
    bold: true,
  });
  cover.addText(pres.topic, {
    x: 0.8,
    y: 1.9,
    w: 8.4,
    h: 1.4,
    fontSize: 32,
    color: 'FFFFFF',
    bold: true,
  });
  cover.addText(pres.subtitle, {
    x: 0.8,
    y: 3.4,
    w: 8.4,
    h: 1.0,
    fontSize: 16,
    color: 'DBEAFE',
  });

  // Content slides
  for (const s of pres.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: 'F8FAFC' };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 10,
      h: 0.85,
      fill: { color: '1D4ED8' },
    });
    slide.addText(`${s.slideNumber}. ${s.title}`, {
      x: 0.6,
      y: 0.18,
      w: 8.8,
      h: 0.5,
      fontSize: 20,
      color: 'FFFFFF',
      bold: true,
    });

    const bulletObjects = s.bullets.map((b) => ({
      text: b,
      options: { bullet: true, breakLine: true, fontSize: 15, color: '1E293B', paraSpaceAfter: 10 },
    }));

    slide.addText(bulletObjects, {
      x: 0.6,
      y: 1.15,
      w: 6.1,
      h: 3.6,
      valign: 'top',
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 7.0,
      y: 1.15,
      w: 2.5,
      h: 3.5,
      fill: { color: 'EFF6FF' },
      line: { color: 'BFDBFE', width: 1 },
    });
    slide.addText(`Predlog vizuala:\n${s.visualSuggestion}`, {
      x: 7.15,
      y: 1.3,
      w: 2.2,
      h: 3.2,
      fontSize: 11,
      color: '1E40AF',
      valign: 'top',
    });

    slide.addNotes(s.speakerNotes);
  }

  // Conclusion slide
  const endSlide = pptx.addSlide();
  endSlide.background = { color: 'EFF6FF' };
  endSlide.addText('Zakljucak', {
    x: 0.8,
    y: 1.1,
    w: 8.4,
    fontSize: 28,
    color: '1D4ED8',
    bold: true,
  });
  endSlide.addText(pres.conclusion, {
    x: 0.8,
    y: 2.0,
    w: 8.4,
    h: 2.5,
    fontSize: 16,
    color: '0F172A',
    valign: 'top',
  });

  const safeName = pres.topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'prezentacija';
  await pptx.writeFile({ fileName: `resi-${safeName}.pptx` });
}

export function exportPresentationPdf(pres: PresentationResponse): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 56;

  doc.setFontSize(18);
  doc.setTextColor(29, 78, 216);
  doc.text(sanitizeForPdf(pres.topic), 44, y, { maxWidth: pageWidth - 88 });
  y += 30;

  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(sanitizeForPdf(pres.subtitle), 44, y, { maxWidth: pageWidth - 88 });
  y += 34;

  for (const slide of pres.slides) {
    if (y > 700) {
      doc.addPage();
      y = 56;
    }
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(sanitizeForPdf(`${slide.slideNumber}. ${slide.title}`), 44, y, { maxWidth: pageWidth - 88 });
    y += 20;

    doc.setFontSize(10.5);
    doc.setTextColor(51, 65, 85);
    for (const bullet of slide.bullets) {
      const lines = doc.splitTextToSize(`• ${sanitizeForPdf(bullet)}`, pageWidth - 104) as string[];
      if (y + lines.length * 14 > 770) {
        doc.addPage();
        y = 56;
      }
      doc.text(lines, 56, y);
      y += lines.length * 14 + 4;
    }
    y += 12;
  }

  if (y > 700) {
    doc.addPage();
    y = 56;
  }
  doc.setFontSize(13);
  doc.setTextColor(29, 78, 216);
  doc.text('Zakljucak', 44, y);
  y += 18;
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  const concLines = doc.splitTextToSize(sanitizeForPdf(pres.conclusion), pageWidth - 88) as string[];
  doc.text(concLines, 44, y);

  doc.save('resi-prezentacija.pdf');
}

export function exportSolutionPdf(sol: SolveResponse): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 52;

  const addBlock = (heading: string, body: string, color: [number, number, number] = [15, 23, 42]) => {
    if (y > 720) {
      doc.addPage();
      y = 52;
    }
    doc.setFontSize(12);
    doc.setTextColor(29, 78, 216);
    doc.text(sanitizeForPdf(heading), 44, y);
    y += 16;

    doc.setFontSize(10.5);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(sanitizeForPdf(body), pageWidth - 88) as string[];
    for (const line of lines) {
      if (y > 775) {
        doc.addPage();
        y = 52;
      }
      doc.text(line, 44, y);
      y += 14;
    }
    y += 10;
  };

  doc.setFontSize(16);
  doc.setTextColor(29, 78, 216);
  doc.text(sanitizeForPdf(`RESI Resenje — ${sol.subjectLabel}: ${sol.topic}`), 44, y, {
    maxWidth: pageWidth - 88,
  });
  y += 30;

  addBlock('Prepoznat zadatak', sol.recognizedText);
  addBlock('Sta se trazi', sol.whatIsAsked);

  if (sol.formulas.length > 0) {
    addBlock(
      'Formule',
      sol.formulas.map((f) => `${f.name}: ${f.latex} (${f.description})`).join('\n'),
    );
  }

  for (const step of sol.steps) {
    addBlock(
      `Korak ${step.stepNumber}: ${step.title}`,
      `${step.explanation}${step.mathLatex ? `\n${step.mathLatex}` : ''}`,
    );
  }

  addBlock('Konacan rezultat', sol.finalAnswer, [5, 150, 105]);
  addBlock('Provera', `${sol.verification.method}: ${sol.verification.result}\n${sol.verification.note}`);

  doc.save('resi-resenje.pdf');
}
