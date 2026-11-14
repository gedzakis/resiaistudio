import type { ScriptMode, SubjectId } from '../types/resi.ts';

const DIGRAPHS: Array<[string, string]> = [
  ['DŽ', 'Џ'],
  ['Dž', 'Џ'],
  ['dž', 'џ'],
  ['LJ', 'Љ'],
  ['Lj', 'Љ'],
  ['lj', 'љ'],
  ['NJ', 'Њ'],
  ['Nj', 'Њ'],
  ['nj', 'њ'],
];

const CHAR_MAP: Record<string, string> = {
  A: 'А', a: 'а',
  B: 'Б', b: 'б',
  V: 'В', v: 'в',
  G: 'Г', g: 'г',
  D: 'Д', d: 'д',
  Đ: 'Ђ', đ: 'ђ',
  E: 'Е', e: 'е',
  Ž: 'Ж', ž: 'ж',
  Z: 'З', z: 'з',
  I: 'И', i: 'и',
  J: 'Ј', j: 'ј',
  K: 'К', k: 'к',
  L: 'Л', l: 'л',
  M: 'М', m: 'м',
  N: 'Н', n: 'н',
  O: 'О', o: 'о',
  P: 'П', p: 'п',
  R: 'Р', r: 'р',
  S: 'С', s: 'с',
  T: 'Т', t: 'т',
  Ć: 'Ћ', ć: 'ћ',
  U: 'У', u: 'у',
  F: 'Ф', f: 'ф',
  H: 'Х', h: 'х',
  C: 'Ц', c: 'ц',
  Č: 'Ч', č: 'ч',
  Š: 'Ш', š: 'ш',
};

function convertPlainLatinToCyrillic(segment: string): string {
  let out = segment;
  for (const [lat, cyr] of DIGRAPHS) {
    out = out.split(lat).join(cyr);
  }
  let res = '';
  for (const ch of out) {
    res += CHAR_MAP[ch] ?? ch;
  }
  return res;
}

/**
 * Transliterates Serbian Latin text to Cyrillic while preserving LaTeX ($...$),
 * URLs, and Latin-only technical identifiers like PDF, AI, REŠI/РЕШИ, HTML, CSS, SQL.
 */
export function tr(text: string, script: ScriptMode): string {
  if (script === 'lat' || !text) return text;
  // Split around math blocks ($...$ or $$...$$) and technical tokens
  const tokenRegex = /(\$\$[\s\S]*?\$\$|\$[^$]+\$|https?:\/\/\S+|\b(?:PDF|DOCX|PPTX|TXT|HTML|CSS|SQL|JavaScript|TypeScript|Python|Java|PHP|Rust|Go|C\+\+|C#|AI|API|Vercel|KV|Redis|Upstash|pH|CO2|H2O)\b)/g;
  const parts = text.split(tokenRegex);
  return parts
    .map((part, idx) => (idx % 2 === 1 ? part : convertPlainLatinToCyrillic(part)))
    .join('');
}

export interface SubjectDefinition {
  id: SubjectId;
  name: string;
  areas: string;
  samplePrompt: string;
}

export const SUBJECTS: SubjectDefinition[] = [
  {
    id: 'matematika',
    name: 'Matematika',
    areas: 'Algebra · Geometrija · Analiza · Matrice',
    samplePrompt: 'Reši kvadratnu jednačinu 2x^2 - 5x + 2 = 0 i nacrtaj grafik funkcije f(x) = 2x^2 - 5x + 2 sa temenom i nulama.',
  },
  {
    id: 'fizika',
    name: 'Fizika',
    areas: 'Mehanika · Struja · Optika · Termodinamika',
    samplePrompt: 'Telo mase 4 kg miruje na horizontalnoj podlozi. Na njega deluje horizontalna sila od 20 N, dok je sila trenja 4 N. Izračunaj ubrzanje tela i nacrtaj dijagram sila.',
  },
  {
    id: 'hemija',
    name: 'Hemija',
    areas: 'Stehiometrija · Reakcije · pH · Organska',
    samplePrompt: 'Izjednači hemijsku reakciju sagorevanja metana CH4 + O2 -> CO2 + H2O i izračunaj masu vode koja nastaje sagorevanjem 32 g metana.',
  },
  {
    id: 'programiranje',
    name: 'Programiranje',
    areas: 'Python · JS/TS · C/C++ · Java · SQL',
    samplePrompt: 'Napiši funkciju u Python-u koja proverava da li je broj prost i objasni vremensku složenost.',
  },
  {
    id: 'biologija',
    name: 'Biologija',
    areas: 'Ćelija · Genetika · Ekologija · Anatomija',
    samplePrompt: 'Objasni proces fotosinteze: svetlu i tamnu fazu i ulogu hloroplasta.',
  },
  {
    id: 'srpski',
    name: 'Srpski jezik',
    areas: 'Gramatika · Pravopis · Analiza dela',
    samplePrompt: 'Odredi padeže i službu reči u rečenici: "Učenik pažljivo čita zanimljivu knjigu u biblioteci."',
  },
  {
    id: 'istorija',
    name: 'Istorija',
    areas: 'Stari vek · Srednji vek · Moderna istorija',
    samplePrompt: 'Navedi uzroke, tok i glavne posledice Prvog srpskog ustanka (1804–1813).',
  },
  {
    id: 'geografija',
    name: 'Geografija',
    areas: 'Reljef · Klima · Stanovništvo · Privreda',
    samplePrompt: 'Objasni kako nastaje efekat staklene bašte i navedi glavne faktore klime u Srbiji.',
  },
  {
    id: 'jezici',
    name: 'Strani jezici',
    areas: 'Engleski · Nemački · Francuski · Latinski',
    samplePrompt: 'Objasni razliku između Present Perfect i Past Simple vremena u engleskom jeziku sa po 3 primera.',
  },
];
