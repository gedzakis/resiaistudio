import JSZip from 'jszip';
import mammoth from 'mammoth';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ExtractedDocument {
  kind: 'inline' | 'text';
  mimeType: string;
  base64Data?: string;
  extractedText?: string;
  fileName: string;
}

export async function processUploadedDocument(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
}): Promise<ExtractedDocument> {
  const { fileName, mimeType, base64Data } = params;
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const buffer = Buffer.from(cleanBase64, 'base64');

  if (buffer.byteLength === 0) {
    throw new Error('Datoteka je prazna.');
  }
  if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error('Datoteka je prevelika. Maksimalna dozvoljena veličina je 10 MB.');
  }

  const lowerName = fileName.toLowerCase();

  // Images and PDFs go natively to Gemini multimodal
  if (
    mimeType === 'application/pdf' ||
    lowerName.endsWith('.pdf') ||
    mimeType.startsWith('image/')
  ) {
    const resolvedMime =
      mimeType && mimeType !== 'application/octet-stream'
        ? mimeType
        : lowerName.endsWith('.pdf')
          ? 'application/pdf'
          : 'image/jpeg';
    return {
      kind: 'inline',
      mimeType: resolvedMime,
      base64Data: cleanBase64,
      fileName,
    };
  }

  // Word .docx extraction
  if (
    lowerName.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    if (!text) {
      throw new Error('Nije moguće izvući tekst iz Word dokumenta.');
    }
    return {
      kind: 'text',
      mimeType: 'text/plain',
      extractedText: text.slice(0, 45000),
      fileName,
    };
  }

  // PowerPoint .pptx extraction
  if (
    lowerName.endsWith('.pptx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const na = Number(a.match(/slide(\d+)/i)?.[1] ?? 0);
        const nb = Number(b.match(/slide(\d+)/i)?.[1] ?? 0);
        return na - nb;
      });

    if (slideFiles.length === 0) {
      throw new Error('PowerPoint prezentacija nema prepoznatljive slajdove.');
    }

    const slideTexts: string[] = [];
    for (let i = 0; i < slideFiles.length; i++) {
      const xml = await zip.files[slideFiles[i]].async('string');
      const matches = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map((m) =>
        m[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"'),
      );
      if (matches.length > 0) {
        slideTexts.push(`Slajd ${i + 1}: ${matches.join(' ')}`);
      }
    }

    const combined = slideTexts.join('\n\n').trim();
    if (!combined) {
      throw new Error('PowerPoint prezentacija ne sadrži čitljiv tekst.');
    }
    return {
      kind: 'text',
      mimeType: 'text/plain',
      extractedText: combined.slice(0, 45000),
      fileName,
    };
  }

  // Plain text / code / markdown / CSV
  if (
    mimeType.startsWith('text/') ||
    /\.(txt|md|csv|json|py|js|ts|java|c|cpp|cs|php|html|css|sql|go|rs)$/i.test(lowerName)
  ) {
    const text = buffer.toString('utf8').trim();
    if (!text) {
      throw new Error('Tekstualni dokument je prazan.');
    }
    return {
      kind: 'text',
      mimeType: 'text/plain',
      extractedText: text.slice(0, 45000),
      fileName,
    };
  }

  throw new Error(
    'Nepodržan format datoteke. Podržani su PDF, slike (JPG/PNG/WEBP), Word (.docx), PowerPoint (.pptx) i tekstualni fajlovi (.txt, .md).',
  );
}
