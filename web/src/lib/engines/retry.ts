import { MAX_ATTEMPTS } from './config';
import { EgressBlockedError } from './http';
import { EngineError, type EngineErrorKind } from './types';

/** Map an HTTP status (from an SDK error or a raw response) to an EngineError kind. */
export function kindForStatus(status: number | undefined): EngineErrorKind {
  if (status === undefined) return 'transient';
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'auth'; // out of credit / billing: needs a human, not a retry
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'transient';
  return 'invalid_request';
}

function headerValue(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name) ?? undefined;
  const rec = headers as Record<string, string | undefined>;
  return rec[name] ?? rec[name.toLowerCase()];
}

export function parseRetryAfter(headers: unknown): number | undefined {
  const ms = headerValue(headers, 'retry-after-ms');
  if (ms && !Number.isNaN(Number(ms))) return Number(ms);
  const s = headerValue(headers, 'retry-after');
  if (!s) return undefined;
  if (!Number.isNaN(Number(s))) return Number(s) * 1000;
  const date = Date.parse(s);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/**
 * Convert anything an SDK or fetch throws into an EngineError. Messages are kept short and never
 * include request headers (API keys).
 */
export function toEngineError(err: unknown, vendor: string): EngineError {
  if (err instanceof EngineError) return err;
  if (err instanceof EgressBlockedError) return new EngineError(err.message, 'invalid_request', { cause: err });
  const e = err as { name?: string; status?: number; message?: string; headers?: unknown; code?: string };
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError' || /timed? ?out/i.test(e?.message ?? '')) {
    return new EngineError(`${vendor}: request timed out`, 'timeout', { cause: err });
  }
  if (typeof e?.status === 'number') {
    const kind = kindForStatus(e.status);
    const msg = (e.message ?? '').slice(0, 300);
    return new EngineError(`${vendor}: HTTP ${e.status} ${msg}`.trim(), kind, {
      retryAfterMs: parseRetryAfter(e.headers),
      cause: err,
    });
  }
  // Network-level failures (DNS, connection reset) are transient.
  return new EngineError(`${vendor}: ${(e?.message ?? String(err)).slice(0, 300)}`, 'transient', { cause: err });
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (attempt: number, err: EngineError, delayMs: number) => void;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Exponential backoff with full jitter; honours retry-after; only retries retryable kinds. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const max = opts.maxAttempts ?? MAX_ATTEMPTS;
  const base = opts.baseDelayMs ?? 1000;
  const cap = opts.maxDelayMs ?? 30_000;
  const sleep = opts.sleep ?? realSleep;
  const rnd = opts.random ?? Math.random;
  let lastErr: EngineError | undefined;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      const ee = err instanceof EngineError ? err : toEngineError(err, 'engine');
      lastErr = ee;
      if (!ee.retryable || attempt === max) throw ee;
      const backoff = Math.min(cap, base * 2 ** (attempt - 1)) * rnd();
      const delay = Math.min(cap, Math.max(backoff, ee.retryAfterMs ?? 0));
      opts.onRetry?.(attempt, ee, delay);
      await sleep(delay);
    }
  }
  throw lastErr ?? new EngineError('retry loop exhausted', 'transient');
}
