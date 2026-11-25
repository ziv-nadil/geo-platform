import { ENGINE_ENV, readRequired } from '../config';
import { EngineError, type EngineId, type EngineStatus } from '../types';

/** Throws EngineError('not_configured') listing missing env vars; returns their values otherwise. */
export function requireEnv(engine: EngineId): Record<string, string> {
  const { values, missing } = readRequired(ENGINE_ENV[engine]);
  if (missing.length) {
    throw new EngineError(`${engine} not configured: missing ${missing.join(', ')}`, 'not_configured', { missing });
  }
  return values;
}

export function envStatus(engine: EngineId, model: string): EngineStatus {
  const { missing } = readRequired(ENGINE_ENV[engine]);
  return missing.length ? { status: 'not_configured', missing } : { status: 'configured', model };
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Keep raw payloads bounded: drop huge encrypted blobs before storage. */
export function trimRaw<T>(raw: T, maxString = 4000): T {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.length > maxString ? `${v.slice(0, maxString)}…[truncated]` : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '[circular]';
      seen.add(v);
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        if (k === 'encrypted_content' || k === 'encrypted_index' || k === 'signature') continue;
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(raw) as T;
}
