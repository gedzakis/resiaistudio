import cookieParser from 'cookie-parser';
import express from 'express';
import type { Request, Response } from 'express';
import { processUploadedDocument } from './documents.ts';
import {
  analyzeDocumentWithGemini,
  askProfessorWithGemini,
  debugCodeWithGemini,
  GeminiServiceError,
  generateFlashcardsWithGemini,
  generatePresentationWithGemini,
  generateQuizWithGemini,
  getConfiguredModel,
  solveTaskWithGemini,
} from './gemini.ts';
import {
  commitQuota,
  getPersistenceInfo,
  getQuotaStatus,
  releaseQuota,
  reserveQuota,
  resolveDeviceIdentity,
} from './quota.ts';
import type {
  EducationLevel,
  ProfessorLevel,
  ScriptMode,
  SubjectId,
} from '../src/types/resi.ts';

function normalizeScript(val: unknown): ScriptMode {
  return val === 'cyr' ? 'cyr' : 'lat';
}

export function createApiApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const persistence = getPersistenceInfo();
    res.json({
      ok: true,
      service: 'resi-api',
      model: getConfiguredModel(),
      apiKeyConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
      ),
      persistenceMode: persistence.mode,
      persistenceProtected: persistence.protected,
    });
  });

  app.get('/api/quota', async (req: Request, res: Response) => {
    try {
      const identity = resolveDeviceIdentity(req, res);
      const status = await getQuotaStatus(identity);
      res.json(status);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Greška pri proveri dnevne kvote.',
      });
    }
  });

  app.post('/api/solve', async (req: Request, res: Response) => {
    const identity = resolveDeviceIdentity(req, res);
    const { text, file, subjectHint, level, script } = req.body as {
      text?: string;
      file?: { mimeType: string; base64Data: string; fileName: string };
      subjectHint?: SubjectId | 'auto';
      level?: EducationLevel;
      script?: ScriptMode;
    };

    if (!text?.trim() && !file?.base64Data) {
      res.status(400).json({ error: 'Unesi tekst zadatka ili priloži fotografiju / PDF dokument.' });
      return;
    }

    let reservation;
    try {
      const check = await reserveQuota(identity, res);
      if (!check.allowed || !check.reservation) {
        res.status(check.status.apiKeyConfigured ? 429 : 503).json({
          error: check.reason || 'Dostigao si dnevni limit od 3 besplatna pitanja.',
          quota: check.status,
        });
        return;
      }
      reservation = check.reservation;

      let preparedFile = file;
      let combinedText = text?.trim() || '';

      if (file?.base64Data) {
        const extracted = await processUploadedDocument({
          fileName: file.fileName || 'zadatak',
          mimeType: file.mimeType || 'image/jpeg',
          base64Data: file.base64Data,
        });
        if (extracted.kind === 'inline' && extracted.base64Data) {
          preparedFile = {
            mimeType: extracted.mimeType,
            base64Data: extracted.base64Data,
            fileName: extracted.fileName,
          };
        } else if (extracted.extractedText) {
          preparedFile = undefined;
          combinedText = [combinedText, `Sadržaj priloženog dokumenta:\n${extracted.extractedText}`]
            .filter(Boolean)
            .join('\n\n');
        }
      }

      const result = await solveTaskWithGemini({
        text: combinedText,
        file: preparedFile,
        subjectHint,
        level,
        script: normalizeScript(script),
      });

      if (!result.readable) {
        // Blurry / unreadable photo must NOT consume user's daily free question
        const updatedQuota =
          (await releaseQuota(reservation, res)) ?? (await getQuotaStatus(identity));
        res.json({ ...result, quota: updatedQuota });
        return;
      }

      const updatedQuota =
        (await commitQuota(reservation, res)) ?? (await getQuotaStatus(identity));
      res.json({ ...result, quota: updatedQuota });
    } catch (err) {
      const updatedQuota =
        (await releaseQuota(reservation, res)) ??
        (await getQuotaStatus(identity).catch(() => undefined));
      if (err instanceof GeminiServiceError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code, quota: updatedQuota });
        return;
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Neočekivana greška prilikom rešavanja zadatka.',
        quota: updatedQuota,
      });
    }
  });

  app.post('/api/professor', async (req: Request, res: Response) => {
    const identity = resolveDeviceIdentity(req, res);
    const { message, level, script, history, taskContext } = req.body as {
      message?: string;
      level?: ProfessorLevel;
      script?: ScriptMode;
      history?: Array<{ role: 'user' | 'assistant'; text: string }>;
      taskContext?: string;
    };

    if (!message?.trim()) {
      res.status(400).json({ error: 'Unesi pitanje za AI profesora.' });
      return;
    }

    let reservation;
    try {
      const check = await reserveQuota(identity, res);
      if (!check.allowed || !check.reservation) {
        res.status(check.status.apiKeyConfigured ? 429 : 503).json({
          error: check.reason || 'Dostigao si dnevni limit od 3 besplatna pitanja.',
          quota: check.status,
        });
        return;
      }
      reservation = check.reservation;

      const result = await askProfessorWithGemini({
        message: message.trim(),
        level: level || 'srednji',
        script: normalizeScript(script),
        history: Array.isArray(history) ? history : [],
        taskContext,
      });

      const updatedQuota =
        (await commitQuota(reservation, res)) ?? (await getQuotaStatus(identity));
      res.json({ ...result, quota: updatedQuota });
    } catch (err) {
      const updatedQuota =
        (await releaseQuota(reservation, res)) ??
        (await getQuotaStatus(identity).catch(() => undefined));
      if (err instanceof GeminiServiceError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code, quota: updatedQuota });
        return;
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Greška u komunikaciji sa AI profesorom.',
        quota: updatedQuota,
      });
    }
  });

  app.post('/api/code/debug', async (req: Request, res: Response) => {
    const identity = resolveDeviceIdentity(req, res);
    const { language, code, file, goal, script } = req.body as {
      language?: string;
      code?: string;
      file?: { mimeType: string; base64Data: string };
      goal?: string;
      script?: ScriptMode;
    };

    if (!code?.trim() && !file?.base64Data) {
      res.status(400).json({ error: 'Unesi programski kod ili priloži fotografiju / datoteku sa kodom.' });
      return;
    }

    let reservation;
    try {
      const check = await reserveQuota(identity, res);
      if (!check.allowed || !check.reservation) {
        res.status(check.status.apiKeyConfigured ? 429 : 503).json({
          error: check.reason || 'Dostigao si dnevni limit od 3 besplatna pitanja.',
          quota: check.status,
        });
        return;
      }
      reservation = check.reservation;

      const result = await debugCodeWithGemini({
        language: language || 'Python',
        code,
        file,
        goal,
        script: normalizeScript(script),
      });

      if (!result.readable) {
        const updatedQuota =
          (await releaseQuota(reservation, res)) ?? (await getQuotaStatus(identity));
        res.json({ ...result, quota: updatedQuota });
        return;
      }

      const updatedQuota =
        (await commitQuota(reservation, res)) ?? (await getQuotaStatus(identity));
      res.json({ ...result, quota: updatedQuota });
    } catch (err) {
      const updatedQuota =
        (await releaseQuota(reservation, res)) ??
        (await getQuotaStatus(identity).catch(() => undefined));
      if (err instanceof GeminiServiceError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code, quota: updatedQuota });
        return;
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Greška pri analizi programskog koda.',
        quota: updatedQuota,
      });
    }
  });

  app.post('/api/quiz/generate', async (req: Request, res: Response) => {
    const identity = resolveDeviceIdentity(req, res);
    const { subject, topic, difficulty, count, examSimulation, script } = req.body as {
      subject?: string;
      topic?: string;
      difficulty?: string;
      count?: number;
      examSimulation?: boolean;
      script?: ScriptMode;
    };

    if (!subject?.trim() || !topic?.trim()) {
      res.status(400).json({ error: 'Odaberi predmet i unesi oblast za test.' });
      return;
    }

    let reservation;
    try {
      const check = await reserveQuota(identity, res);
      if (!check.allowed || !check.reservation) {
        res.status(check.status.apiKeyConfigured ? 429 : 503).json({
          error: check.reason || 'Dostigao si dnevni limit od 3 besplatna pitanja.',
          quota: check.status,
        });
        return;
      }
      reservation = check.reservation;

      const result = await generateQuizWithGemini({
        subject: subject.trim(),
        topic: topic.trim(),
        difficulty: difficulty || 'Srednja škola',
        count: Number(count) || 5,
        examSimulation: Boolean(examSimulation),
        script: normalizeScript(script),
      });

      const updatedQuota =
        (await commitQuota(reservation, res)) ?? (await getQuotaStatus(identity));
      res.json({ ...result, quota: updatedQuota });
    } catch (err) {
      const updatedQuota =
        (await releaseQuota(reservation, res)) ??
        (await getQuotaStatus(identity).catch(() => undefined));
      if (err instanceof GeminiServiceError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code, quota: updatedQuota });
        return;
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Greška prilikom generisanja testa.',
        quota: updatedQuota,
      });
    }
  });

  app.post('/api/documents/analyze', async (req: Request, res: Response) => {
    const identity = resolveDeviceIdentity(req, res);
    const { fileName, mimeType, base64Data, userQuestion, script } = req.body as {
      fileName?: string;
      mimeType?: string;
      base64Data?: string;
      userQuestion?: string;
      script?: ScriptMode;
    };

    if (!base64Data || !fileName) {
      res.status(400).json({ error: 'Priloži dokument (PDF, Word, PowerPoint, tekst ili sliku stranice).' });
      return;
    }

    let reservation;
    try {
      const doc = await processUploadedDocument({
        fileName,
        mimeType: mimeType || 'application/octet-stream',
        base64Data,
      });

      const check = await reserveQuota(identity, res);
      if (!check.allowed || !check.reservation) {
        res.status(check.status.apiKeyConfigured ? 429 : 503).json({
          error: check.reason || 'Dostigao si dnevni limit od 3 besplatna pitanja.',
          quota: check.status,
        });
        return;
      }
      reservation = check.reservation;

      const result = await analyzeDocumentWithGemini({
        doc,
        userQuestion,
        script: normalizeScript(script),
      });

      const updatedQuota =
        (await commitQuota(reservation, res)) ?? (await getQuotaStatus(identity));
      res.json({ ...result, quota: updatedQuota });
    } catch (err) {
      const updatedQuota =
        (await releaseQuota(reservation, res)) ??
        (await getQuotaStatus(identity).catch(() => undefined));
      if (err instanceof GeminiServiceError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code, quota: updatedQuota });
        return;
      }
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Greška prilikom analize dokumenta.',
        quota: updatedQuota,
      });
    }
  });

  app.post('/api/presentations/generate', async (req: Request, res: Response) => {
    const identity = resolveDeviceIdentity(req, res);
    const { topic, level, slideCount, script } = req.body as {
      topic?: string;
      level?: EducationLevel;
      slideCount?: number;
      script?: ScriptMode;
    };

    if (!topic?.trim()) {
      res.status(400).json({ error: 'Unesi temu za prezentaciju.' });
      return;
    }

    let reservation;
    try {
      const check = await reserveQuota(identity, res);
      if (!check.allowed || !check.reservation) {
        res.status(check.status.apiKeyConfigured ? 429 : 503).json({
          error: check.reason || 'Dostigao si dnevni limit od 3 besplatna pitanja.',
          quota: check.status,
        });
        return;
      }
      reservation = check.reservation;

      const result = await generatePresentationWithGemini({
        topic: topic.trim(),
        level: level || 'srednja',
        slideCount: Number(slideCount) || 6,
        script: normalizeScript(script),
      });

      const updatedQuota =
        (await commitQuota(reservation, res)) ?? (await getQuotaStatus(identity));
      res.json({ ...result, quota: updatedQuota });
    } catch (err) {
      const updatedQuota =
        (await releaseQuota(reservation, res)) ??
        (await getQuotaStatus(identity).catch(() => undefined));
      if (err instanceof GeminiServiceError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code, quota: updatedQuota });
        return;
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Greška prilikom pravljenja prezentacije.',
        quota: updatedQuota,
      });
    }
  });

  app.post('/api/flashcards/generate', async (req: Request, res: Response) => {
    const identity = resolveDeviceIdentity(req, res);
    const { topic, notes, count, script } = req.body as {
      topic?: string;
      notes?: string;
      count?: number;
      script?: ScriptMode;
    };

    if (!topic?.trim() && !notes?.trim()) {
      res.status(400).json({ error: 'Unesi temu ili beleške za generisanje kartica.' });
      return;
    }

    let reservation;
    try {
      const check = await reserveQuota(identity, res);
      if (!check.allowed || !check.reservation) {
        res.status(check.status.apiKeyConfigured ? 429 : 503).json({
          error: check.reason || 'Dostigao si dnevni limit od 3 besplatna pitanja.',
          quota: check.status,
        });
        return;
      }
      reservation = check.reservation;

      const result = await generateFlashcardsWithGemini({
        topic: topic?.trim() || 'Gradivo iz beleški',
        notes,
        count: Number(count) || 8,
        script: normalizeScript(script),
      });

      const updatedQuota =
        (await commitQuota(reservation, res)) ?? (await getQuotaStatus(identity));
      res.json({ ...result, quota: updatedQuota });
    } catch (err) {
      const updatedQuota =
        (await releaseQuota(reservation, res)) ??
        (await getQuotaStatus(identity).catch(() => undefined));
      if (err instanceof GeminiServiceError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code, quota: updatedQuota });
        return;
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Greška prilikom generisanja kartica za učenje.',
        quota: updatedQuota,
      });
    }
  });

  return app;
}
