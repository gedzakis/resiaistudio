import { GoogleGenAI, Type } from '@google/genai';
import * as math from 'mathjs';
import type {
  CodeDebugResponse,
  DocumentStudyResponse,
  EducationLevel,
  FlashcardsResponse,
  PresentationResponse,
  ProfessorLevel,
  ProfessorResponse,
  QuizResponse,
  ScriptMode,
  SolveResponse,
  SubjectId,
} from '../src/types/resi.ts';
import type { ExtractedDocument } from './documents.ts';

const GEMINI_TIMEOUT_MS = 55000;

export class GeminiServiceError extends Error {
  code:
    | 'API_KEY_MISSING'
    | 'API_KEY_INVALID'
    | 'MODEL_NOT_FOUND'
    | 'QUOTA_EXCEEDED'
    | 'TIMEOUT'
    | 'NETWORK_ERROR'
    | 'PARSE_ERROR'
    | 'UNKNOWN';
  statusCode: number;

  constructor(
    message: string,
    code: GeminiServiceError['code'],
    statusCode: number = 500,
  ) {
    super(message);
    this.name = 'GeminiServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function getConfiguredModel(): string {
  return (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim() || 'gemini-3.5-flash-lite';
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiServiceError(
      'Gemini API ključ nije podešen na serveru. Dodaj GEMINI_API_KEY u podešavanja okruženja.',
      'API_KEY_MISSING',
      503,
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function scriptInstruction(script: ScriptMode): string {
  return script === 'cyr'
    ? 'OBAVEZNO piši sav tekst na srpskom jeziku koristeći ĆIRILICU (српска ћирилица), osim matematičkih simbola, LaTeX formula i programskog koda.'
    : 'OBAVEZNO piši sav tekst na srpskom jeziku koristeći LATINICU (srpska latinica), osim matematičkih simbola, LaTeX formula i programskog koda.';
}

async function runWithTimeout<T>(promise: Promise<T>, ms: number = GEMINI_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new GeminiServiceError(
          'Gemini AI servis nije odgovorio na vreme (timeout). Pokušaj ponovo za nekoliko trenutaka.',
          'TIMEOUT',
          504,
        ),
      );
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isTransientError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('econnreset')
  );
}

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [600, 1400];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await runWithTimeout(fn());
    } catch (err) {
      lastErr = err;
      if (attempt < delays.length && isTransientError(err)) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function classifyGeminiError(err: unknown): GeminiServiceError {
  if (err instanceof GeminiServiceError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403') || lower.includes('401')) {
    return new GeminiServiceError(
      'Gemini API ključ nije važeći ili nema dozvolu za pristup modelu.',
      'API_KEY_INVALID',
      403,
    );
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return new GeminiServiceError(
      `Konfigurisani Gemini model (${getConfiguredModel()}) nije pronađen. Proveri GEMINI_MODEL promenljivu okruženja.`,
      'MODEL_NOT_FOUND',
      404,
    );
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return new GeminiServiceError(
      'Gemini API kvota je privremeno prekoračena. Pokušaj ponovo uskoro.',
      'QUOTA_EXCEEDED',
      429,
    );
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand') || lower.includes('overloaded')) {
    return new GeminiServiceError(
      'Gemini AI servis je trenutno preopterećen. Pokušaj ponovo za nekoliko sekundi — tvoje dnevno pitanje nije potrošeno.',
      'NETWORK_ERROR',
      503,
    );
  }
  if (lower.includes('fetch failed') || lower.includes('enotfound') || lower.includes('econnrefused') || lower.includes('network')) {
    return new GeminiServiceError(
      'Nije moguće uspostaviti vezu sa Gemini AI servisom. Proveri internet konekciju.',
      'NETWORK_ERROR',
      502,
    );
  }
  return new GeminiServiceError(
    `Došlo je do greške pri obradi AI zahteva. Pokušaj ponovo.`,
    'UNKNOWN',
    500,
  );
}

function parseJsonResponse<T>(rawText: string | undefined): T {
  if (!rawText || !rawText.trim()) {
    throw new GeminiServiceError('AI je vratio prazan odgovor. Pokušaj ponovo.', 'PARSE_ERROR', 502);
  }
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new GeminiServiceError('Odgovor AI modela nije u očekivanom formatu. Pokušaj ponovo.', 'PARSE_ERROR', 502);
  }
}

function tryMathJsVerify(finalAnswer: string, checkExpression?: string): string | null {
  const candidates = [checkExpression, finalAnswer].filter((v): v is string => Boolean(v && v.trim()));
  for (const raw of candidates) {
    const cleaned = raw
      .replace(/\$+/g, '')
      .replace(/\\cdot/g, '*')
      .replace(/\\times/g, '*')
      .replace(/\\div/g, '/')
      .trim();
    if (/^[0-9+\-*/().^\s=]+$/.test(cleaned) && cleaned.includes('=')) {
      const [lhs, rhs] = cleaned.split('=');
      if (lhs && rhs) {
        try {
          const lVal = Number(math.evaluate(lhs));
          const rVal = Number(math.evaluate(rhs));
          if (Number.isFinite(lVal) && Number.isFinite(rVal)) {
            const equal = Math.abs(lVal - rVal) < 1e-6;
            return equal
              ? `Računska provera (mathjs): ${lhs.trim()} = ${lVal}, što je jednako ${rVal}.`
              : `Upozorenje provere (mathjs): ${lhs.trim()} = ${lVal}, dok je desna strana ${rVal}.`;
          }
        } catch {
          // ignore non-evaluable expressions
        }
      }
    }
  }
  return null;
}

export async function solveTaskWithGemini(params: {
  text?: string;
  file?: { mimeType: string; base64Data: string; fileName: string };
  subjectHint?: SubjectId | 'auto';
  level?: EducationLevel;
  script: ScriptMode;
}): Promise<Omit<SolveResponse, 'quota'>> {
  const ai = getClient();
  const model = getConfiguredModel();

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (params.file) {
    const cleanB64 = params.file.base64Data.includes(',')
      ? params.file.base64Data.split(',')[1]
      : params.file.base64Data;
    parts.push({
      inlineData: {
        mimeType: params.file.mimeType,
        data: cleanB64,
      },
    });
  }

  const levelDesc =
    params.level === 'osnovna'
      ? 'osnovna škola (jednostavno, jasno i prilagođeno učenicima od 1. do 8. razreda)'
      : params.level === 'fakultet'
        ? 'fakultet (rigorozan akademski nivo, detaljni dokazi, napredne formule i jedinice)'
        : 'srednja škola (jasan školski metod, postupnost, formule i provera)';

  const promptText = [
    `Zadatak za analizu i rešavanje.`,
    params.subjectHint && params.subjectHint !== 'auto'
      ? `Očekivani predmet: ${params.subjectHint}.`
      : `Samostalno prepoznaj predmet (matematika, fizika, hemija, programiranje, biologija, srpski, istorija, geografija, jezici ili opšte).`,
    `Nivo objašnjenja: ${levelDesc}.`,
    params.text ? `Tekst koji je korisnik uneo:\n"""\n${params.text.slice(0, 8000)}\n"""` : '',
    `Ako je priložena fotografija ili PDF mutna, isečena, nečitljiva ili nema jasnog zadatka, OBAVEZNO postavi readable=false i u clarificationNeeded napiši šta tačno treba da se fotografiše ponovo. NIKADA ne izmišljaj tekst zadatka.`,
    `Sve formule obavezno formatiraj u LaTeX sintaksi unutar $...$ za inline ili čist LaTeX u polju latex / mathLatex.`,
    `Ako je zadatak iz matematike (funkcija, jednačina, geometrija), fizike (vektori sila, kretanje, optika) ili hemije (reakcija), popuni opciono polje visualization tako da grafikon ili dijagram direktno odgovara stvarnim brojevima iz ovog zadatka.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  parts.push({ text: promptText });

  try {
    const response = await callWithRetry(() =>
      ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          systemInstruction: `Ti si REŠI, vrhunski srpski AI profesor za osnovnu školu, srednju školu i fakultet. ${scriptInstruction(params.script)} Uvek proveri računske rezultate pre nego što ih prikažeš. Jasno razlikuj tačne proverene rezultate od procena. Budi precizan, pedagoški topao i pregledan.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              readable: { type: Type.BOOLEAN },
              clarificationNeeded: { type: Type.STRING },
              subject: {
                type: Type.STRING,
                description:
                  'Jedno od: matematika, fizika, hemija, programiranje, biologija, srpski, istorija, geografija, jezici, opste',
              },
              subjectLabel: { type: Type.STRING },
              topic: { type: Type.STRING },
              educationLevel: { type: Type.STRING },
              recognizedText: { type: Type.STRING },
              whatIsAsked: { type: Type.STRING },
              formulas: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    latex: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ['name', 'latex', 'description'],
                },
              },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    stepNumber: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    mathLatex: { type: Type.STRING },
                  },
                  required: ['stepNumber', 'title', 'explanation'],
                },
              },
              finalAnswer: { type: Type.STRING },
              verification: {
                type: Type.OBJECT,
                properties: {
                  method: { type: Type.STRING },
                  result: { type: Type.STRING },
                  isVerified: { type: Type.BOOLEAN },
                  isEstimate: { type: Type.BOOLEAN },
                  note: { type: Type.STRING },
                },
                required: ['method', 'result', 'isVerified', 'isEstimate', 'note'],
              },
              alternativeMethod: { type: Type.STRING },
              additionalExample: {
                type: Type.OBJECT,
                properties: {
                  problem: { type: Type.STRING },
                  solution: { type: Type.STRING },
                },
                required: ['problem', 'solution'],
              },
              visualization: {
                type: Type.OBJECT,
                properties: {
                  kind: {
                    type: Type.STRING,
                    description: 'Jedno od: function_plot, geometry, physics_diagram, chemistry_diagram',
                  },
                  title: { type: Type.STRING },
                  xLabel: { type: Type.STRING },
                  yLabel: { type: Type.STRING },
                  xMin: { type: Type.NUMBER },
                  xMax: { type: Type.NUMBER },
                  yMin: { type: Type.NUMBER },
                  yMax: { type: Type.NUMBER },
                  expressions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        expr: { type: Type.STRING, description: 'JavaScript/mathjs izraz po x, npr: x^2 - 4*x + 3 ili sin(x)' },
                        color: { type: Type.STRING },
                      },
                      required: ['label', 'expr'],
                    },
                  },
                  points: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER },
                        label: { type: Type.STRING },
                      },
                      required: ['x', 'y', 'label'],
                    },
                  },
                  shapes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        type: { type: Type.STRING },
                        label: { type: Type.STRING },
                        points: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              x: { type: Type.NUMBER },
                              y: { type: Type.NUMBER },
                              name: { type: Type.STRING },
                            },
                            required: ['x', 'y'],
                          },
                        },
                        center: {
                          type: Type.OBJECT,
                          properties: {
                            x: { type: Type.NUMBER },
                            y: { type: Type.NUMBER },
                          },
                          required: ['x', 'y'],
                        },
                        radius: { type: Type.NUMBER },
                      },
                      required: ['type'],
                    },
                  },
                  vectors: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        fromX: { type: Type.NUMBER },
                        fromY: { type: Type.NUMBER },
                        toX: { type: Type.NUMBER },
                        toY: { type: Type.NUMBER },
                        label: { type: Type.STRING },
                        color: { type: Type.STRING },
                      },
                      required: ['fromX', 'fromY', 'toX', 'toY', 'label'],
                    },
                  },
                  bodyLabel: { type: Type.STRING },
                  caption: { type: Type.STRING },
                  reactants: { type: Type.ARRAY, items: { type: Type.STRING } },
                  products: { type: Type.ARRAY, items: { type: Type.STRING } },
                  conditions: { type: Type.STRING },
                  enthalpyChange: { type: Type.STRING },
                },
                required: ['kind', 'title'],
              },
            },
            required: [
              'readable',
              'subject',
              'subjectLabel',
              'topic',
              'educationLevel',
              'recognizedText',
              'whatIsAsked',
              'formulas',
              'steps',
              'finalAnswer',
              'verification',
            ],
          },
        },
      }),
    );

    const parsed = parseJsonResponse<Omit<SolveResponse, 'quota'>>(response.text);

    // Server-side mathematical cross-check when applicable
    if (parsed.readable && parsed.verification) {
      const serverCheck = tryMathJsVerify(parsed.finalAnswer, parsed.verification.result);
      if (serverCheck) {
        parsed.verification.note = `${parsed.verification.note} ${serverCheck}`.trim();
      }
    }

    // Drop empty visualization shells if model emitted kind without payload
    if (parsed.visualization) {
      const v = parsed.visualization as unknown as Record<string, unknown>;
      const hasPlot = v.kind === 'function_plot' && Array.isArray(v.expressions) && v.expressions.length > 0;
      const hasGeo = v.kind === 'geometry' && Array.isArray(v.shapes) && v.shapes.length > 0;
      const hasPhys = v.kind === 'physics_diagram' && Array.isArray(v.vectors) && v.vectors.length > 0;
      const hasChem = v.kind === 'chemistry_diagram' && Array.isArray(v.reactants) && v.reactants.length > 0;
      if (!hasPlot && !hasGeo && !hasPhys && !hasChem) {
        delete parsed.visualization;
      }
    }

    return parsed;
  } catch (err) {
    throw classifyGeminiError(err);
  }
}

export async function askProfessorWithGemini(params: {
  message: string;
  level: ProfessorLevel;
  script: ScriptMode;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  taskContext?: string;
}): Promise<Omit<ProfessorResponse, 'quota'>> {
  const ai = getClient();
  const model = getConfiguredModel();

  const levelMap: Record<ProfessorLevel, string> = {
    pocetni: 'Početni nivo (osnovna škola, prosti primeri iz svakodnevnog života, bez teških termina)',
    srednji: 'Srednji nivo (srednja škola, jasna struktura, koraci i formule)',
    napredni: 'Napredni nivo (priprema za takmičenja i prijemne ispite, dublja logika i trikovi)',
    fakultetski: 'Fakultetski nivo (rigorozne definicije, teoreme, izvodi i akademski pristup)',
  };

  const recentHistory = params.history.slice(-8).map((m) => `${m.role === 'user' ? 'Učenik' : 'AI Profesor'}: ${m.text}`).join('\n');

  const prompt = [
    params.taskContext ? `Kontekst trenutnog zadatka:\n${params.taskContext.slice(0, 3000)}` : '',
    recentHistory ? `Prethodni tok razgovora:\n${recentHistory}` : '',
    `Novo pitanje učenika:\n${params.message.slice(0, 4000)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const response = await callWithRetry(() =>
      ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: `Ti si AI Profesor u aplikaciji REŠI. Nivo objašnjenja: ${levelMap[params.level]}. ${scriptInstruction(params.script)} Govori jednostavno, razumljivo i ohrabrujuće. Nemoj samo dati krajnji rezultat — objasni logiku i nauči učenika kako samostalno da dođe do rešenja. Koristi LaTeX ($...$) za formule.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING },
              guidingQuestion: { type: Type.STRING, description: 'Jedno kratko pitanje koje podstiče učenika da sam razmisli o sledećem koraku.' },
              keyTakeaway: { type: Type.STRING, description: 'Sažeto zlatno pravilo za pamćenje.' },
            },
            required: ['reply'],
          },
        },
      }),
    );

    return parseJsonResponse<Omit<ProfessorResponse, 'quota'>>(response.text);
  } catch (err) {
    throw classifyGeminiError(err);
  }
}

export async function debugCodeWithGemini(params: {
  language: string;
  code?: string;
  file?: { mimeType: string; base64Data: string };
  goal?: string;
  script: ScriptMode;
}): Promise<Omit<CodeDebugResponse, 'quota'>> {
  const ai = getClient();
  const model = getConfiguredModel();

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (params.file) {
    const cleanB64 = params.file.base64Data.includes(',')
      ? params.file.base64Data.split(',')[1]
      : params.file.base64Data;
    parts.push({
      inlineData: {
        mimeType: params.file.mimeType,
        data: cleanB64,
      },
    });
  }

  parts.push({
    text: [
      `Analiziraj i ispravi programski kod.`,
      `Odabrani programski jezik: ${params.language}.`,
      params.goal ? `Napomena/cilj korisnika: ${params.goal}` : '',
      params.code ? `Kod:\n\`\`\`\n${params.code.slice(0, 15000)}\n\`\`\`` : 'Prepoznaj kod sa priložene fotografije.',
      `Ako je slika koda nečitljiva, postavi readable=false i traži jasniju fotografiju u clarificationNeeded.`,
    ]
      .filter(Boolean)
      .join('\n\n'),
  });

  try {
    const response = await callWithRetry(() =>
      ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          systemInstruction: `Ti si AI CODE LAB mentor i debugger u aplikaciji REŠI. ${scriptInstruction(params.script)} Pronađi sintaksne i logičke greške, objasni zašto kod ne radi, daj čist ispravljen kod, objasni svaku izmenu, predloži optimizovanu verziju i dodaj jasno objašnjenje za početnike.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              readable: { type: Type.BOOLEAN },
              clarificationNeeded: { type: Type.STRING },
              detectedLanguage: { type: Type.STRING },
              extractedCode: { type: Type.STRING },
              syntaxErrors: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    line: { type: Type.INTEGER },
                    message: { type: Type.STRING },
                    fix: { type: Type.STRING },
                  },
                  required: ['message', 'fix'],
                },
              },
              logicalErrors: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING },
                    impact: { type: Type.STRING },
                    fix: { type: Type.STRING },
                  },
                  required: ['description', 'impact', 'fix'],
                },
              },
              whyItFails: { type: Type.STRING },
              correctedCode: { type: Type.STRING },
              changesExplanation: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    whatChanged: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ['whatChanged', 'reason'],
                },
              },
              optimizedCode: { type: Type.STRING },
              optimizationNotes: { type: Type.STRING },
              beginnerWalkthrough: { type: Type.STRING },
            },
            required: [
              'readable',
              'detectedLanguage',
              'extractedCode',
              'syntaxErrors',
              'logicalErrors',
              'whyItFails',
              'correctedCode',
              'changesExplanation',
              'optimizedCode',
              'optimizationNotes',
              'beginnerWalkthrough',
            ],
          },
        },
      }),
    );

    return parseJsonResponse<Omit<CodeDebugResponse, 'quota'>>(response.text);
  } catch (err) {
    throw classifyGeminiError(err);
  }
}

export async function generateQuizWithGemini(params: {
  subject: string;
  topic: string;
  difficulty: string;
  count: number;
  examSimulation: boolean;
  script: ScriptMode;
}): Promise<Omit<QuizResponse, 'quota'>> {
  const ai = getClient();
  const model = getConfiguredModel();
  const safeCount = Math.min(15, Math.max(3, params.count));

  try {
    const response = await callWithRetry(() =>
      ai.models.generateContent({
        model,
        contents: `Napravi ${params.examSimulation ? 'simulaciju školskog kontrolnog ili fakultetskog ispita' : 'interaktivni kviz za vežbanje'} iz predmeta "${params.subject}", oblast "${params.topic}", težina "${params.difficulty}", sa tačno ${safeCount} pitanja sa po 4 ponuđena odgovora. Koristi LaTeX ($...$) gde su potrebne formule.`,
        config: {
          systemInstruction: `Ti si generator testova u aplikaciji REŠI. ${scriptInstruction(params.script)} Pitanja moraju biti tačna, bez dvosmislenosti, sa detaljnim objašnjenjem tačnog odgovora za svako pitanje.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              subject: { type: Type.STRING },
              topic: { type: Type.STRING },
              difficulty: { type: Type.STRING },
              recommendedMinutes: { type: Type.INTEGER },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                  },
                  required: ['id', 'question', 'options', 'correctIndex', 'explanation'],
                },
              },
            },
            required: ['title', 'subject', 'topic', 'difficulty', 'recommendedMinutes', 'questions'],
          },
        },
      }),
    );

    return parseJsonResponse<Omit<QuizResponse, 'quota'>>(response.text);
  } catch (err) {
    throw classifyGeminiError(err);
  }
}

export async function analyzeDocumentWithGemini(params: {
  doc: ExtractedDocument;
  userQuestion?: string;
  script: ScriptMode;
}): Promise<Omit<DocumentStudyResponse, 'quota'>> {
  const ai = getClient();
  const model = getConfiguredModel();

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (params.doc.kind === 'inline' && params.doc.base64Data) {
    parts.push({
      inlineData: {
        mimeType: params.doc.mimeType,
        data: params.doc.base64Data,
      },
    });
  }

  parts.push({
    text: [
      `Analiziraj priloženu lekciju/dokument "${params.doc.fileName}".`,
      params.doc.extractedText ? `Sadržaj dokumenta:\n"""\n${params.doc.extractedText}\n"""` : '',
      params.userQuestion ? `Posebno pitanje korisnika o ovom dokumentu: "${params.userQuestion}"` : '',
      `Napravi jasan sažetak, izdvoj ključne definicije i najvažnije činjenice, objasni lekciju jednostavnim jezikom i pripremi 5 pitanja za ponavljanje sa odgovorima.`,
    ]
      .filter(Boolean)
      .join('\n\n'),
  });

  try {
    const response = await callWithRetry(() =>
      ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          systemInstruction: `Ti si akademski asistent za analizu skripti i udžbenika u aplikaciji REŠI. ${scriptInstruction(params.script)} Drži se isključivo sadržaja dokumenta i naučno proverenih činjenica bez izmišljanja.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              keyDefinitions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    definition: { type: Type.STRING },
                  },
                  required: ['term', 'definition'],
                },
              },
              importantFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
              simpleExplanation: { type: Type.STRING },
              reviewQuestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    answer: { type: Type.STRING },
                  },
                  required: ['question', 'answer'],
                },
              },
              answerToUserQuestion: { type: Type.STRING },
            },
            required: ['title', 'summary', 'keyDefinitions', 'importantFacts', 'simpleExplanation', 'reviewQuestions'],
          },
        },
      }),
    );

    return parseJsonResponse<Omit<DocumentStudyResponse, 'quota'>>(response.text);
  } catch (err) {
    throw classifyGeminiError(err);
  }
}

export async function generatePresentationWithGemini(params: {
  topic: string;
  level: EducationLevel;
  slideCount: number;
  script: ScriptMode;
}): Promise<Omit<PresentationResponse, 'quota'>> {
  const ai = getClient();
  const model = getConfiguredModel();
  const count = Math.min(12, Math.max(4, params.slideCount));

  try {
    const response = await callWithRetry(() =>
      ai.models.generateContent({
        model,
        contents: `Napravi kompletnu obrazovnu prezentaciju na temu "${params.topic}" za nivo "${params.level}" sa tačno ${count} slajdova. Svaki slajd treba da ima jasan naslov, 3 do 5 sažetih teza, beleške za govornika i predlog ilustracije/grafikona. Na kraju napiši zaključak prezentacije.`,
        config: {
          systemInstruction: `Ti si AI dizajner prezentacija za učenike i studente u aplikaciji REŠI. ${scriptInstruction(params.script)} Tekst na slajdovima treba da bude koncizan, jasan i pregledan.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              subtitle: { type: Type.STRING },
              slides: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    slideNumber: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
                    speakerNotes: { type: Type.STRING },
                    visualSuggestion: { type: Type.STRING },
                  },
                  required: ['slideNumber', 'title', 'bullets', 'speakerNotes', 'visualSuggestion'],
                },
              },
              conclusion: { type: Type.STRING },
            },
            required: ['topic', 'subtitle', 'slides', 'conclusion'],
          },
        },
      }),
    );

    return parseJsonResponse<Omit<PresentationResponse, 'quota'>>(response.text);
  } catch (err) {
    throw classifyGeminiError(err);
  }
}

export async function generateFlashcardsWithGemini(params: {
  topic: string;
  notes?: string;
  count: number;
  script: ScriptMode;
}): Promise<Omit<FlashcardsResponse, 'quota'>> {
  const ai = getClient();
  const model = getConfiguredModel();
  const count = Math.min(16, Math.max(4, params.count));

  try {
    const response = await callWithRetry(() =>
      ai.models.generateContent({
        model,
        contents: [
          `Napravi ${count} kartica za učenje (flashcards) na temu "${params.topic}".`,
          params.notes ? `Dodatne beleške/gradivo:\n${params.notes.slice(0, 6000)}` : '',
          `Uključi definicije, formule (u LaTeX-u gde je prikladno) i ključne pojmove.`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        config: {
          systemInstruction: `Ti si sistem za pravljenje kartica za pamćenje u aplikaciji REŠI. ${scriptInstruction(params.script)} Pitanja na prednjoj strani neka budu kratka i jasna, a odgovori na poleđini precizni i laki za pamćenje.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              cards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    front: { type: Type.STRING },
                    back: { type: Type.STRING },
                    category: { type: Type.STRING },
                    formula: { type: Type.STRING },
                  },
                  required: ['id', 'front', 'back', 'category'],
                },
              },
            },
            required: ['topic', 'cards'],
          },
        },
      }),
    );

    return parseJsonResponse<Omit<FlashcardsResponse, 'quota'>>(response.text);
  } catch (err) {
    throw classifyGeminiError(err);
  }
}
