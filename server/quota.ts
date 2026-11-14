import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import type { QuotaStatus } from '../src/types/resi.ts';

export const DAILY_FREE_LIMIT = 3;
const BUCKET_HARD_CAP = 6;
const COOKIE_NAME = 'resi_did';
const DATA_DIR = path.resolve(process.cwd(), '.data');
const QUOTA_FILE = path.join(DATA_DIR, 'quota-store.json');

interface DeviceRecord {
  count: number;
  updatedAt: string;
}

interface QuotaFileState {
  days: Record<string, Record<string, DeviceRecord>>;
}

export interface DeviceIdentity {
  deviceKey: string;
  bucketKey: string;
  cookieId: string;
}

export interface QuotaReservation {
  id: string;
  dateKey: string;
  deviceKey: string;
  bucketKey: string;
  committed: boolean;
  released: boolean;
}

function getHmacSecret(): string {
  return process.env.QUOTA_HMAC_SECRET || 'resi-dev-ephemeral-hmac-key-change-in-prod';
}

function signCookieValue(id: string): string {
  const sig = crypto.createHmac('sha256', getHmacSecret()).update(id).digest('hex').slice(0, 24);
  return `${id}.${sig}`;
}

function verifyCookieValue(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [id, sig] = parts;
  if (!id || !sig || id.length < 16) return null;
  const expected = crypto.createHmac('sha256', getHmacSecret()).update(id).digest('hex').slice(0, 24);
  try {
    if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return id;
    }
  } catch {
    return null;
  }
  return null;
}

export function getBelgradeDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Belgrade',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getNextBelgradeMidnightIso(now: Date = new Date()): string {
  const currentKey = getBelgradeDateKey(now);
  // Step forward hour-by-hour until Europe/Belgrade date changes, then binary-search exact second
  let probe = now.getTime();
  for (let h = 1; h <= 26; h++) {
    const candidate = new Date(now.getTime() + h * 3600 * 1000);
    if (getBelgradeDateKey(candidate) !== currentKey) {
      let low = probe;
      let high = candidate.getTime();
      while (high - low > 1000) {
        const mid = Math.floor((low + high) / 2);
        if (getBelgradeDateKey(new Date(mid)) === currentKey) {
          low = mid;
        } else {
          high = mid;
        }
      }
      return new Date(high).toISOString();
    }
    probe = candidate.getTime();
  }
  return new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
}

function getSecondsUntilBelgradeMidnight(): number {
  const nextIso = getNextBelgradeMidnightIso();
  const diffSec = Math.ceil((new Date(nextIso).getTime() - Date.now()) / 1000);
  return Math.max(60, diffSec + 120);
}

export function resolveDeviceIdentity(req: Request, res: Response): DeviceIdentity {
  const existingCookie = verifyCookieValue(req.cookies?.[COOKIE_NAME]);
  let cookieId = existingCookie;

  if (!cookieId) {
    cookieId = crypto.randomUUID();
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie(COOKIE_NAME, signCookieValue(cookieId), {
      httpOnly: true,
      sameSite: isHttps ? 'none' : 'lax',
      secure: isHttps,
      path: '/',
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
  }

  const clientDeviceHeader = typeof req.headers['x-resi-device'] === 'string'
    ? req.headers['x-resi-device'].slice(0, 64)
    : '';

  const forwarded = typeof req.headers['x-forwarded-for'] === 'string'
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.ip || 'local';
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : 'unknown';

  const deviceKey = crypto
    .createHmac('sha256', getHmacSecret())
    .update(`did:${cookieId}`)
    .digest('hex')
    .slice(0, 32);

  // Secondary abuse bucket combines IP + UA + optional client header hash (never IP alone)
  const bucketKey = crypto
    .createHmac('sha256', getHmacSecret())
    .update(`bkt:${forwarded}|${ua}|${clientDeviceHeader ? 'hdr' : 'nohdr'}`)
    .digest('hex')
    .slice(0, 32);

  return { deviceKey, bucketKey, cookieId };
}

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    return { url: url.replace(/\/$/, ''), token };
  }
  return null;
}

function canUsePersistentFilesystem(): boolean {
  if (process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return false;
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const testFile = path.join(DATA_DIR, '.write-check');
    fs.writeFileSync(testFile, 'ok', 'utf8');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

// Serialized async mutex for atomic file operations
let fileMutex: Promise<void> = Promise.resolve();
function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = fileMutex.then(fn, fn);
  fileMutex = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

// Ephemeral in-memory fallback (ONLY used when serverless filesystem is read-only & Redis is not set)
const ephemeralCounts = new Map<string, number>();

function readQuotaFile(): QuotaFileState {
  try {
    if (!fs.existsSync(QUOTA_FILE)) {
      return { days: {} };
    }
    const raw = fs.readFileSync(QUOTA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as QuotaFileState;
    if (!parsed || typeof parsed.days !== 'object') {
      return { days: {} };
    }
    return parsed;
  } catch {
    return { days: {} };
  }
}

function writeQuotaFileAtomic(state: QuotaFileState, currentDayKey: string): void {
  // Prune days older than 3 days to keep file tiny
  const keys = Object.keys(state.days).sort();
  if (keys.length > 3) {
    for (const oldKey of keys.slice(0, keys.length - 3)) {
      if (oldKey !== currentDayKey) {
        delete state.days[oldKey];
      }
    }
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${QUOTA_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpFile, QUOTA_FILE);
}

async function redisCommand(command: Array<string | number>): Promise<unknown> {
  const cfg = getRedisConfig();
  if (!cfg) throw new Error('Redis nije podešen.');
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    throw new Error(`Redis greška (${res.status})`);
  }
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) {
    throw new Error(data.error);
  }
  return data.result;
}

function getActiveModelName(): string {
  return (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim() || 'gemini-3.5-flash-lite';
}

export function getPersistenceInfo(): {
  mode: QuotaStatus['persistenceMode'];
  protected: boolean;
  warningMessage?: string;
} {
  if (getRedisConfig()) {
    return { mode: 'redis-atomic', protected: true };
  }
  if (canUsePersistentFilesystem()) {
    return { mode: 'file-atomic', protected: true };
  }
  return {
    mode: 'ephemeral-warning',
    protected: false,
    warningMessage:
      'Trajno serversko skladište (Upstash Redis / Vercel KV) nije podešeno u ovom serverless okruženju. Dnevni limit se trenutno prati samo po instanci i može se resetovati između hladnih pokretanja. Podesi UPSTASH_REDIS_REST_URL i UPSTASH_REDIS_REST_TOKEN za potpunu zaštitu.',
  };
}

export async function getQuotaStatus(identity: DeviceIdentity): Promise<QuotaStatus> {
  const dateKey = getBelgradeDateKey();
  const nextResetIso = getNextBelgradeMidnightIso();
  const persistence = getPersistenceInfo();
  const apiKeyConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  const activeModel = getActiveModelName();

  let used = 0;

  if (persistence.mode === 'redis-atomic') {
    const devRedisKey = `resi:q:${dateKey}:d:${identity.deviceKey}`;
    const raw = await redisCommand(['GET', devRedisKey]);
    used = raw ? Math.max(0, Number(raw) || 0) : 0;
  } else if (persistence.mode === 'file-atomic') {
    used = await withFileLock(async () => {
      const state = readQuotaFile();
      return state.days[dateKey]?.[identity.deviceKey]?.count ?? 0;
    });
  } else {
    used = ephemeralCounts.get(`${dateKey}:d:${identity.deviceKey}`) ?? 0;
  }

  const clampedUsed = Math.min(DAILY_FREE_LIMIT, Math.max(0, used));

  return {
    used: clampedUsed,
    remaining: Math.max(0, DAILY_FREE_LIMIT - clampedUsed),
    limit: DAILY_FREE_LIMIT,
    dateKey,
    timezone: 'Europe/Belgrade',
    nextResetIso,
    persistenceMode: persistence.mode,
    persistenceProtected: persistence.protected,
    warningMessage: persistence.warningMessage,
    apiKeyConfigured,
    activeModel,
  };
}

export async function reserveQuota(identity: DeviceIdentity): Promise<{
  allowed: boolean;
  reason?: string;
  reservation?: QuotaReservation;
  status: QuotaStatus;
}> {
  const dateKey = getBelgradeDateKey();
  const persistence = getPersistenceInfo();
  const ttlSeconds = getSecondsUntilBelgradeMidnight();

  // Fail closed on unconfigured API key without wasting quota
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const status = await getQuotaStatus(identity);
    return {
      allowed: false,
      reason: 'Gemini API ključ nije podešen na serveru.',
      status,
    };
  }

  if (persistence.mode === 'redis-atomic') {
    const devRedisKey = `resi:q:${dateKey}:d:${identity.deviceKey}`;
    const bktRedisKey = `resi:q:${dateKey}:b:${identity.bucketKey}`;

    const luaScript = `
      local dev = tonumber(redis.call('GET', KEYS[1]) or '0')
      local bkt = tonumber(redis.call('GET', KEYS[2]) or '0')
      if dev >= tonumber(ARGV[1]) then
        return {0, dev}
      end
      if bkt >= tonumber(ARGV[2]) then
        return {-1, dev}
      end
      local newDev = redis.call('INCR', KEYS[1])
      local newBkt = redis.call('INCR', KEYS[2])
      redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
      redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3]))
      return {1, newDev}
    `;

    const result = (await redisCommand([
      'EVAL',
      luaScript,
      2,
      devRedisKey,
      bktRedisKey,
      DAILY_FREE_LIMIT,
      BUCKET_HARD_CAP,
      ttlSeconds,
    ])) as [number, number];

    const code = Number(result?.[0] ?? 0);
    const status = await getQuotaStatus(identity);

    if (code === 1) {
      return {
        allowed: true,
        reservation: {
          id: crypto.randomUUID(),
          dateKey,
          deviceKey: identity.deviceKey,
          bucketKey: identity.bucketKey,
          committed: false,
          released: false,
        },
        status,
      };
    }

    return {
      allowed: false,
      reason:
        code === -1
          ? 'Dostignuto je maksimalno dnevno ograničenje za ovaj uređaj/mrežu.'
          : 'Dostigao si dnevni limit od 3 besplatna pitanja. Vrati se sutra i nastavi sa učenjem!',
      status,
    };
  }

  if (persistence.mode === 'file-atomic') {
    const resOutcome = await withFileLock(async () => {
      const state = readQuotaFile();
      if (!state.days[dateKey]) {
        state.days[dateKey] = {};
      }
      const dayMap = state.days[dateKey];
      const devEntry = dayMap[identity.deviceKey] || { count: 0, updatedAt: new Date().toISOString() };
      const bktKey = `bkt_${identity.bucketKey}`;
      const bktEntry = dayMap[bktKey] || { count: 0, updatedAt: new Date().toISOString() };

      if (devEntry.count >= DAILY_FREE_LIMIT) {
        return { allowed: false, code: 0 };
      }
      if (bktEntry.count >= BUCKET_HARD_CAP) {
        return { allowed: false, code: -1 };
      }

      devEntry.count += 1;
      devEntry.updatedAt = new Date().toISOString();
      bktEntry.count += 1;
      bktEntry.updatedAt = new Date().toISOString();

      dayMap[identity.deviceKey] = devEntry;
      dayMap[bktKey] = bktEntry;
      writeQuotaFileAtomic(state, dateKey);
      return { allowed: true, code: 1 };
    });

    const status = await getQuotaStatus(identity);
    if (!resOutcome.allowed) {
      return {
        allowed: false,
        reason:
          resOutcome.code === -1
            ? 'Dostignuto je maksimalno dnevno ograničenje za ovaj uređaj/mrežu.'
            : 'Dostigao si dnevni limit od 3 besplatna pitanja. Vrati se sutra i nastavi sa učenjem!',
        status,
      };
    }

    return {
      allowed: true,
      reservation: {
        id: crypto.randomUUID(),
        dateKey,
        deviceKey: identity.deviceKey,
        bucketKey: identity.bucketKey,
        committed: false,
        released: false,
      },
      status,
    };
  }

  // Ephemeral fallback with strict in-memory cap
  const devMemKey = `${dateKey}:d:${identity.deviceKey}`;
  const bktMemKey = `${dateKey}:b:${identity.bucketKey}`;
  const curDev = ephemeralCounts.get(devMemKey) ?? 0;
  const curBkt = ephemeralCounts.get(bktMemKey) ?? 0;

  if (curDev >= DAILY_FREE_LIMIT || curBkt >= BUCKET_HARD_CAP) {
    const status = await getQuotaStatus(identity);
    return {
      allowed: false,
      reason: 'Dostigao si dnevni limit od 3 besplatna pitanja. Vrati se sutra i nastavi sa učenjem!',
      status,
    };
  }

  ephemeralCounts.set(devMemKey, curDev + 1);
  ephemeralCounts.set(bktMemKey, curBkt + 1);
  const status = await getQuotaStatus(identity);

  return {
    allowed: true,
    reservation: {
      id: crypto.randomUUID(),
      dateKey,
      deviceKey: identity.deviceKey,
      bucketKey: identity.bucketKey,
      committed: false,
      released: false,
    },
    status,
  };
}

export async function commitQuota(reservation: QuotaReservation | undefined): Promise<void> {
  if (!reservation || reservation.released) return;
  reservation.committed = true;
}

export async function releaseQuota(reservation: QuotaReservation | undefined): Promise<void> {
  if (!reservation || reservation.committed || reservation.released) return;
  reservation.released = true;

  const persistence = getPersistenceInfo();
  const { dateKey, deviceKey, bucketKey } = reservation;

  try {
    if (persistence.mode === 'redis-atomic') {
      const devRedisKey = `resi:q:${dateKey}:d:${deviceKey}`;
      const bktRedisKey = `resi:q:${dateKey}:b:${bucketKey}`;
      const luaRelease = `
        local dev = tonumber(redis.call('GET', KEYS[1]) or '0')
        if dev > 0 then redis.call('DECR', KEYS[1]) end
        local bkt = tonumber(redis.call('GET', KEYS[2]) or '0')
        if bkt > 0 then redis.call('DECR', KEYS[2]) end
        return 1
      `;
      await redisCommand(['EVAL', luaRelease, 2, devRedisKey, bktRedisKey]);
      return;
    }

    if (persistence.mode === 'file-atomic') {
      await withFileLock(async () => {
        const state = readQuotaFile();
        const dayMap = state.days[dateKey];
        if (!dayMap) return;
        if (dayMap[deviceKey] && dayMap[deviceKey].count > 0) {
          dayMap[deviceKey].count -= 1;
          dayMap[deviceKey].updatedAt = new Date().toISOString();
        }
        const bktKey = `bkt_${bucketKey}`;
        if (dayMap[bktKey] && dayMap[bktKey].count > 0) {
          dayMap[bktKey].count -= 1;
          dayMap[bktKey].updatedAt = new Date().toISOString();
        }
        writeQuotaFileAtomic(state, dateKey);
      });
      return;
    }

    const devMemKey = `${dateKey}:d:${deviceKey}`;
    const bktMemKey = `${dateKey}:b:${bucketKey}`;
    ephemeralCounts.set(devMemKey, Math.max(0, (ephemeralCounts.get(devMemKey) ?? 0) - 1));
    ephemeralCounts.set(bktMemKey, Math.max(0, (ephemeralCounts.get(bktMemKey) ?? 0) - 1));
  } catch (err) {
    console.error('Greška pri vraćanju kvote nakon neuspešnog zahteva:', err);
  }
}
