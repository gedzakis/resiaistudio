import type { QuotaStatus } from '../types/resi.ts';
import { getOrCreateClientDeviceId } from './storage.ts';

export class ApiClientError extends Error {
  status: number;
  quota?: QuotaStatus;

  constructor(message: string, status: number, quota?: QuotaStatus) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.quota = quota;
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    onQuotaUpdate?: (quota: QuotaStatus) => void;
  } = {},
): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiClientError(
      'Nema internet konekcije. Proveri mrežu i pokušaj ponovo.',
      0,
    );
  }

  const deviceId = getOrCreateClientDeviceId();
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Resi-Device': deviceId,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiClientError(
      'Veza sa serverom nije uspela. Proveri internet konekciju i pokušaj ponovo.',
      0,
    );
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ApiClientError(
      `Server je vratio neočekivan odgovor (status ${res.status}).`,
      res.status,
    );
  }

  if (data.quota && options.onQuotaUpdate) {
    options.onQuotaUpdate(data.quota as QuotaStatus);
  }

  if (!res.ok) {
    const message =
      typeof data.error === 'string'
        ? data.error
        : `Greška servera (${res.status}).`;
    throw new ApiClientError(message, res.status, data.quota as QuotaStatus | undefined);
  }

  return data as T;
}
