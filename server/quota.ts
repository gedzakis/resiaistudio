import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import type { QuotaStatus } from '../src/types/resi.ts';

export const DAILY_FREE_LIMIT = 3;
const DEVICE_COOKIE_NAME = 'resi_did';
const QUOTA_COOKIE_NAME = 'resi_q';
const DATA_DIR = path.resolve(process.cwd(), '.data');
const QUOTA_FILE = path.join(DATA_DIR, 'quota-store.json');

interface DeviceRecord {
  count: number;
  updatedAt: string;
}

interface QuotaFileState {
  days: Record<string, Record<string, DeviceRecord>>;
}

export interface CookieQuotaPayload {
  dateKey: string;
  used: number;
}

export interface DeviceIdentity {
  deviceKey: string;
  cookieId: string;
  cookieQuota: CookieQuotaPayload;
  isProductionCookie: boolean;
}

export interface QuotaReservation {
  id: string;
  mode: QuotaStatus['persistenceMode'];
  dateKey: string;
  deviceKey: string;
  previousUsed: number;
  reservedUsed: number;
  isProductionCookie: boolean;
  committed: boolean;
  released: boolean;
}

function getHmacSecret(): string {
  return process.env.QUOTA_HMAC_SECRET || 'resi-dev-ephemeral-hmac-key-change-in-prod';
}

function signToken(payload: string): string {
  const sig = crypto.createHmac('sha256', getHmacSecret()).update(payload).digest('hex').slice(0, 24);
  return `${payload}.${sig}`;
}

function verifyToken(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const dotIdx = raw.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  const payload = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', getHmacSecret()).update(payload).digest('hex').slice(0, 24);
  if (sig.length !== expected.length) return null;
  try {
    if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return payload;
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

function shouldUseSecureCookie(req: Request): boolean {
  const host = (req.hostname || req.headers.host || '').toLowerCase();
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  if (isLocalhost) {
    return req.secure || req.headers['x-forwarded-proto'] === 'https';
  }
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https'
  );
}

function readSignedQuotaCookie(req: Request, todayKey: string): CookieQuotaPayload | null {
  const raw = req.cookies?.[QUOTA_COOKIE_NAME];
  const verified = verifyToken(raw);
  if (!verified) return null;
  try {
    const parsed = JSON.parse(Buffer.from(verified, 'base64url').toString('utf8')) as {
      dateKey?: string;
      used?: number;
    };
    if (!parsed || parsed.dateKey !== todayKey) {
      // New day in Europe/Belgrade -> reset counter to 0
      return { dateKey: todayKey, used: 0 };
    }
    const used = Math.min(DAILY_FREE_LIMIT, Math.max(0, Math.floor(Number(parsed.used) || 0)));
    return { dateKey: todayKey, used };
  } catch {
    return null;
  }
}

function writeSignedQuotaCookie(
  res: Response,
  payload: CookieQuotaPayload,
  secureCookie: boolean,
): void {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  res.cookie(QUOTA_COOKIE_NAME, signToken(encoded), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    path: '/',
    maxAge: 2 * 24 * 60 * 60 * 1000,
  });
}

export function resolveDeviceIdentity(req: Request, res: Response): DeviceIdentity {
  const todayKey = getBelgradeDateKey();
  const secureCookie = shouldUseSecureCookie(req);

  const existingDid = verifyToken(req.cookies?.[DEVICE_COOKIE_NAME]);
  let cookieId = existingDid && existingDid.length >= 16 ? existingDid : null;

  if (!cookieId) {
    cookieId = crypto.randomUUID();
    res.cookie(DEVICE_COOKIE_NAME, signToken(cookieId), {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie,
      path: '/',
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
  }

  const parsedQuota = readSignedQuotaCookie(req, todayKey);
  const cookieQuota: CookieQuotaPayload = parsedQuota ?? { dateKey: todayKey, used: 0 };

  if (!parsedQuota || req.cookies?.[QUOTA_COOKIE_NAME] === undefined) {
    writeSignedQuotaCookie(res, cookieQuota, secureCookie);
  }

  const deviceKey = crypto
    .createHmac('sha256', getHmacSecret())
    .update(`did:${cookieId}`)
    .digest('hex')
    .slice(0, 32);

  return {
    deviceKey,
    cookieId,
    cookieQuota,
    isProductionCookie: secureCookie,
  };
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

// In-flight reservation guard per device within the same server process
const inFlightDevices = new Map<string, number>();

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
    mode: 'cookie-signed',
    protected: true,
  };
}

function buildQuotaStatus(
  used: number,
  dateKey: string,
  persistence: ReturnType<typeof getPersistenceInfo>,
): QuotaStatus {
  const clampedUsed = Math.min(DAILY_FREE_LIMIT, Math.max(0, used));
  const apiKeyConfigured = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
  );
  return {
    used: clampedUsed,
    remaining: Math.max(0, DAILY_FREE_LIMIT - clampedUsed),
    limit: DAILY_FREE_LIMIT,
    dateKey,
    timezone: 'Europe/Belgrade',
    nextResetIso: getNextBelgradeMidnightIso(),
    persistenceMode: persistence.mode,
    persistenceProtected: persistence.protected,
    warningMessage: persistence.warningMessage,
    apiKeyConfigured,
    activeModel: getActiveModelName(),
  };
}

export async function getQuotaStatus(identity: DeviceIdentity): Promise<QuotaStatus> {
  const dateKey = getBelgradeDateKey();
  const persistence = getPersistenceInfo();

  let used = identity.cookieQuota.dateKey === dateKey ? identity.cookieQuota.used : 0;

  if (persistence.mode === 'redis-atomic') {
    try {
      const devRedisKey = `resi:q:${dateKey}:d:${identity.deviceKey}`;
      const raw = await redisCommand(['GET', devRedisKey]);
      used = raw ? Math.max(0, Number(raw) || 0) : 0;
    } catch {
      // Fallback to signed cookie counter if Redis is momentarily unreachable
      used = identity.cookieQuota.dateKey === dateKey ? identity.cookieQuota.used : 0;
      return buildQuotaStatus(used, dateKey, {
        mode: 'cookie-signed',
        protected: true,
      });
    }
  } else if (persistence.mode === 'file-atomic') {
    used = await withFileLock(async () => {
      const state = readQuotaFile();
      return state.days[dateKey]?.[identity.deviceKey]?.count ?? 0;
    });
  }

  return buildQuotaStatus(used, dateKey, persistence);
}

export async function reserveQuota(
  identity: DeviceIdentity,
  res?: Response,
): Promise<{
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
    try {
      const devRedisKey = `resi:q:${dateKey}:d:${identity.deviceKey}`;
      const luaScript = `
        local dev = tonumber(redis.call('GET', KEYS[1]) or '0')
        if dev >= tonumber(ARGV[1]) then
          return {0, dev}
        end
        local newDev = redis.call('INCR', KEYS[1])
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
        return {1, newDev}
      `;

      const result = (await redisCommand([
        'EVAL',
        luaScript,
        1,
        devRedisKey,
        DAILY_FREE_LIMIT,
        ttlSeconds,
      ])) as [number, number];

      const code = Number(result?.[0] ?? 0);
      const newCount = Number(result?.[1] ?? 0);
      const status = buildQuotaStatus(newCount, dateKey, persistence);

      if (code === 1) {
        return {
          allowed: true,
          reservation: {
            id: crypto.randomUUID(),
            mode: 'redis-atomic',
            dateKey,
            deviceKey: identity.deviceKey,
            previousUsed: Math.max(0, newCount - 1),
            reservedUsed: newCount,
            isProductionCookie: identity.isProductionCookie,
            committed: false,
            released: false,
          },
          status,
        };
      }

      return {
        allowed: false,
        reason: 'Dostigao si dnevni limit od 3 besplatna pitanja. Vrati se sutra i nastavi sa učenjem!',
        status,
      };
    } catch {
      // Seamless fallback to signed HttpOnly cookie when Redis fails
    }
  }

  if (persistence.mode === 'file-atomic') {
    const resOutcome = await withFileLock(async () => {
      const state = readQuotaFile();
      if (!state.days[dateKey]) {
        state.days[dateKey] = {};
      }
      const dayMap = state.days[dateKey];
      const devEntry = dayMap[identity.deviceKey] || {
        count: 0,
        updatedAt: new Date().toISOString(),
      };

      if (devEntry.count >= DAILY_FREE_LIMIT) {
        return { allowed: false, prev: devEntry.count, next: devEntry.count };
      }

      const prev = devEntry.count;
      devEntry.count += 1;
      devEntry.updatedAt = new Date().toISOString();
      dayMap[identity.deviceKey] = devEntry;
      writeQuotaFileAtomic(state, dateKey);
      return { allowed: true, prev, next: devEntry.count };
    });

    const status = buildQuotaStatus(resOutcome.next, dateKey, persistence);
    if (!resOutcome.allowed) {
      return {
        allowed: false,
        reason: 'Dostigao si dnevni limit od 3 besplatna pitanja. Vrati se sutra i nastavi sa učenjem!',
        status,
      };
    }

    return {
      allowed: true,
      reservation: {
        id: crypto.randomUUID(),
        mode: 'file-atomic',
        dateKey,
        deviceKey: identity.deviceKey,
        previousUsed: resOutcome.prev,
        reservedUsed: resOutcome.next,
        isProductionCookie: identity.isProductionCookie,
        committed: false,
        released: false,
      },
      status,
    };
  }

  // Fallback mechanism: Signed HttpOnly cookie counter (no Redis/KV required)
  const baseUsed = identity.cookieQuota.dateKey === dateKey ? identity.cookieQuota.used : 0;
  const inFlightKey = `${dateKey}:${identity.deviceKey}`;
  const inFlight = inFlightDevices.get(inFlightKey) ?? 0;
  const effectiveUsed = baseUsed + inFlight;

  const cookiePersistence: ReturnType<typeof getPersistenceInfo> = {
    mode: 'cookie-signed',
    protected: true,
  };

  if (effectiveUsed >= DAILY_FREE_LIMIT) {
    const status = buildQuotaStatus(DAILY_FREE_LIMIT, dateKey, cookiePersistence);
    return {
      allowed: false,
      reason: 'Dostigao si dnevni limit od 3 besplatna pitanja. Vrati se sutra i nastavi sa učenjem!',
      status,
    };
  }

  const nextUsed = effectiveUsed + 1;
  inFlightDevices.set(inFlightKey, inFlight + 1);
  if (res) {
    writeSignedQuotaCookie(
      res,
      { dateKey, used: nextUsed },
      identity.isProductionCookie,
    );
  }

  return {
    allowed: true,
    reservation: {
      id: crypto.randomUUID(),
      mode: 'cookie-signed',
      dateKey,
      deviceKey: identity.deviceKey,
      previousUsed: baseUsed,
      reservedUsed: nextUsed,
      isProductionCookie: identity.isProductionCookie,
      committed: false,
      released: false,
    },
    status: buildQuotaStatus(nextUsed, dateKey, cookiePersistence),
  };
}

export async function commitQuota(
  reservation: QuotaReservation | undefined,
  res?: Response,
): Promise<QuotaStatus | undefined> {
  if (!reservation || reservation.released) return undefined;
  reservation.committed = true;

  if (reservation.mode === 'cookie-signed') {
    const inFlightKey = `${reservation.dateKey}:${reservation.deviceKey}`;
    const cur = inFlightDevices.get(inFlightKey) ?? 0;
    if (cur <= 1) inFlightDevices.delete(inFlightKey);
    else inFlightDevices.set(inFlightKey, cur - 1);
  }

  if (res) {
    writeSignedQuotaCookie(
      res,
      { dateKey: reservation.dateKey, used: reservation.reservedUsed },
      reservation.isProductionCookie,
    );
  }

  return buildQuotaStatus(reservation.reservedUsed, reservation.dateKey, {
    mode: reservation.mode,
    protected: true,
  });
}

export async function releaseQuota(
  reservation: QuotaReservation | undefined,
  res?: Response,
): Promise<QuotaStatus | undefined> {
  if (!reservation || reservation.committed || reservation.released) return undefined;
  reservation.released = true;

  const { dateKey, deviceKey, mode, previousUsed, isProductionCookie } = reservation;

  try {
    if (mode === 'redis-atomic') {
      const devRedisKey = `resi:q:${dateKey}:d:${deviceKey}`;
      const luaRelease = `
        local dev = tonumber(redis.call('GET', KEYS[1]) or '0')
        if dev > 0 then redis.call('DECR', KEYS[1]) end
        return 1
      `;
      await redisCommand(['EVAL', luaRelease, 1, devRedisKey]);
    } else if (mode === 'file-atomic') {
      await withFileLock(async () => {
        const state = readQuotaFile();
        const dayMap = state.days[dateKey];
        if (!dayMap) return;
        if (dayMap[deviceKey] && dayMap[deviceKey].count > 0) {
          dayMap[deviceKey].count -= 1;
          dayMap[deviceKey].updatedAt = new Date().toISOString();
        }
        writeQuotaFileAtomic(state, dateKey);
      });
    } else if (mode === 'cookie-signed') {
      const inFlightKey = `${dateKey}:${deviceKey}`;
      const cur = inFlightDevices.get(inFlightKey) ?? 0;
      if (cur <= 1) inFlightDevices.delete(inFlightKey);
      else inFlightDevices.set(inFlightKey, cur - 1);
    }

    if (res) {
      writeSignedQuotaCookie(res, { dateKey, used: previousUsed }, isProductionCookie);
    }
  } catch (err) {
    console.error('Greška pri vraćanju kvote nakon neuspešnog zahteva:', err);
  }

  return buildQuotaStatus(previousUsed, dateKey, {
    mode,
    protected: true,
  });
}
