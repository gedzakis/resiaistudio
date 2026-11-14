export type ScriptMode = 'lat' | 'cyr';
export type ThemeMode = 'light' | 'dark';
export type EducationLevel = 'osnovna' | 'srednja' | 'fakultet';
export type ProfessorLevel = 'pocetni' | 'srednji' | 'napredni' | 'fakultetski';

export type SubjectId =
  | 'matematika'
  | 'fizika'
  | 'hemija'
  | 'programiranje'
  | 'biologija'
  | 'srpski'
  | 'istorija'
  | 'geografija'
  | 'jezici'
  | 'opste';

export type ActiveTab =
  | 'home'
  | 'solve'
  | 'professor'
  | 'codelab'
  | 'quiz'
  | 'tools'
  | 'history';

export type ToolsSubTab = 'documents' | 'presentations' | 'flashcards';

export interface QuotaStatus {
  used: number;
  remaining: number;
  limit: number;
  dateKey: string;
  timezone: 'Europe/Belgrade';
  nextResetIso: string;
  persistenceMode: 'redis-atomic' | 'file-atomic' | 'ephemeral-warning';
  persistenceProtected: boolean;
  warningMessage?: string;
  apiKeyConfigured: boolean;
  activeModel: string;
}

export interface FormulaItem {
  name: string;
  latex: string;
  description: string;
}

export interface SolutionStep {
  stepNumber: number;
  title: string;
  explanation: string;
  mathLatex?: string;
}

export interface VerificationResult {
  method: string;
  result: string;
  isVerified: boolean;
  isEstimate: boolean;
  note: string;
}

export interface FunctionPlotData {
  kind: 'function_plot';
  title: string;
  xLabel: string;
  yLabel: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  expressions: Array<{
    label: string;
    expr: string;
    color?: string;
  }>;
  points: Array<{
    x: number;
    y: number;
    label: string;
  }>;
}

export interface GeometryDiagramData {
  kind: 'geometry';
  title: string;
  shapes: Array<{
    type: 'polygon' | 'circle' | 'line' | 'angle';
    label?: string;
    points?: Array<{ x: number; y: number; name?: string }>;
    center?: { x: number; y: number };
    radius?: number;
  }>;
}

export interface PhysicsDiagramData {
  kind: 'physics_diagram';
  title: string;
  subtitle?: string;
  vectors: Array<{
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    label: string;
    color?: string;
  }>;
  bodyLabel?: string;
  caption?: string;
}

export interface ChemistryDiagramData {
  kind: 'chemistry_diagram';
  title: string;
  reactants: string[];
  products: string[];
  conditions?: string;
  enthalpyChange?: 'egzotermna' | 'endotermna' | 'neutralna';
}

export type VisualizationData =
  | FunctionPlotData
  | GeometryDiagramData
  | PhysicsDiagramData
  | ChemistryDiagramData;

export interface SolveResponse {
  readable: boolean;
  clarificationNeeded?: string;
  subject: SubjectId;
  subjectLabel: string;
  topic: string;
  educationLevel: string;
  recognizedText: string;
  whatIsAsked: string;
  formulas: FormulaItem[];
  steps: SolutionStep[];
  finalAnswer: string;
  verification: VerificationResult;
  alternativeMethod?: string;
  additionalExample?: {
    problem: string;
    solution: string;
  };
  visualization?: VisualizationData;
  quota: QuotaStatus;
}

export interface SolvedHistoryItem {
  id: string;
  createdAt: string;
  subject: SubjectId;
  subjectLabel: string;
  topic: string;
  promptSnippet: string;
  finalAnswer: string;
  favorite: boolean;
  solution: SolveResponse;
}

export interface ProfessorMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

export interface ProfessorResponse {
  reply: string;
  guidingQuestion?: string;
  keyTakeaway?: string;
  quota: QuotaStatus;
}

export type CodeLanguage =
  | 'Python'
  | 'JavaScript'
  | 'TypeScript'
  | 'Java'
  | 'C'
  | 'C++'
  | 'C#'
  | 'PHP'
  | 'HTML'
  | 'CSS'
  | 'SQL'
  | 'Go'
  | 'Rust';

export interface CodeDebugResponse {
  readable: boolean;
  clarificationNeeded?: string;
  detectedLanguage: string;
  extractedCode: string;
  syntaxErrors: Array<{ line?: number; message: string; fix: string }>;
  logicalErrors: Array<{ description: string; impact: string; fix: string }>;
  whyItFails: string;
  correctedCode: string;
  changesExplanation: Array<{ whatChanged: string; reason: string }>;
  optimizedCode: string;
  optimizationNotes: string;
  beginnerWalkthrough: string;
  quota: QuotaStatus;
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface QuizResponse {
  title: string;
  subject: string;
  topic: string;
  difficulty: string;
  recommendedMinutes: number;
  questions: QuizQuestion[];
  quota: QuotaStatus;
}

export interface DocumentStudyResponse {
  title: string;
  summary: string;
  keyDefinitions: Array<{ term: string; definition: string }>;
  importantFacts: string[];
  simpleExplanation: string;
  reviewQuestions: Array<{ question: string; answer: string }>;
  answerToUserQuestion?: string;
  quota: QuotaStatus;
}

export interface PresentationSlide {
  slideNumber: number;
  title: string;
  bullets: string[];
  speakerNotes: string;
  visualSuggestion: string;
}

export interface PresentationResponse {
  topic: string;
  subtitle: string;
  slides: PresentationSlide[];
  conclusion: string;
  quota: QuotaStatus;
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  category: string;
  formula?: string;
}

export interface FlashcardsResponse {
  topic: string;
  cards: FlashcardItem[];
  quota: QuotaStatus;
}
