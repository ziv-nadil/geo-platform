/**
 * Google AI Overviews and Google AI Mode via DataForSEO SERP API (methodology sections 2.5, 2.6).
 *
 * - run()      live endpoint (synchronous; used for "run now" and when DATAFORSEO_MODE=live)
 * - submit()   Standard queue task_post (cheapest; scheduled runs)
 * - collect()  task_get/advanced; returns { pending: true } until the task is ready
 *
 * DataForSEO reports the cost of every call; we store that figure (priceVersion 'vendor').
 */
import { buildCitations, type RawCitation } from '../../analysis/citations';
import { DEFAULT_TIMEOUT_MS } from '../config';
import { allowlistedFetch } from '../http';
import { kindForStatus, toEngineError } from '../retry';
import { EngineError, type EngineAdapter, type EngineId, type EngineResult, type Locale, type RunOptions } from '../types';
import { envStatus, requireEnv, round6, trimRaw } from './common';

const VERSION = 'dataforseo-serp@1';
const BASE = 'https://api.dataforseo.com/v3';

type Surface = 'google_aio' | 'google_ai_mode';

/** DataForSEO location_code by ISO country (Google Ads geotargets). Prompt locale may override. */
export const LOCATION_CODES: Record<string, number> = {
  US: 2840, GB: 2826, CA: 2124, AU: 2036, NZ: 2554, IE: 2372, DE: 2276, FR: 2250, ES: 2724, IT: 2380,
  NL: 2528, BE: 2056, CH: 2756, AT: 2040, SE: 2752, NO: 2578, DK: 2208, FI: 2246, PL: 2616, PT: 2620,
  IL: 2376, IN: 2356, SG: 2702, JP: 2392, KR: 2410, BR: 2076, MX: 2484, AR: 2032, ZA: 2710, AE: 2784,
};

export function locationCodeFor(locale: Locale): number {
  if (locale.locationCode) return locale.locationCode;
  const code = LOCATION_CODES[locale.country.toUpperCase()];
  if (!code) {
    throw new EngineError(`dataforseo: no location_code for country ${locale.country}; set prompt locale.locationCode`, 'invalid_request');
  }
  return code;
}

function paths(surface: Surface) {
  return surface === 'google_aio'
    ? { live: '/serp/google/organic/live/advanced', post: '/serp/google/organic/task_post', get: '/serp/google/organic/task_get/advanced' }
    : { live: '/serp/google/ai_mode/live/advanced', post: '/serp/google/ai_mode/task_post', get: '/serp/google/ai_mode/task_get/advanced' };
}

export function buildTask(surface: Surface, prompt: string, locale: Locale): Record<string, unknown> {
  return {
    keyword: prompt.slice(0, 700),
    location_code: locationCodeFor(locale),
    language_code: locale.language.split('-')[0].toLowerCase(),
    device: locale.device ?? 'desktop',
    ...(surface === 'google_aio' ? { load_async_ai_overview: true, depth: 10 } : {}),
  };
}

export interface DfsTask {
  id?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
  result?: Array<{ keyword?: string; markdown?: string; items?: unknown[] | null }> | null;
}
export interface DfsEnvelope {
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: DfsTask[];
}

/** Walk any nested structure collecting objects that look like references ({url, ...}). */
function collectReferences(node: unknown, out: RawCitation[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 8) return;
  if (Array.isArray(node)) {
    for (const n of node) collectReferences(n, out, depth + 1);
    return;
  }
  const o = node as Record<string, unknown>;
  const isRef = typeof o.url === 'string' && (typeof o.type !== 'string' || /reference|source/.test(o.type as string));
  if (isRef) {
    out.push({
      url: o.url as string,
      title: (o.title as string) ?? (o.source as string) ?? undefined,
      snippet: typeof o.text === 'string' ? (o.text as string).slice(0, 500) : undefined,
      cited: true,
    });
  }
  for (const [k, v] of Object.entries(o)) if (k !== 'url' && typeof v === 'object') collectReferences(v, out, depth + 1);
}

function elementText(item: Record<string, unknown>): string {
  if (typeof item.markdown === 'string' && item.markdown.trim()) return item.markdown;
  const parts: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const o = n as Record<string, unknown>;
    if (typeof o.type === 'string' && o.type.includes('reference')) return;
    if (typeof o.title === 'string' && o.type === 'ai_overview_element') parts.push(o.title);
    if (typeof o.text === 'string') parts.push(o.text);
    if (Array.isArray(o.items)) o.items.forEach(walk);
  };
  walk(item.items);
  return parts.join('\n');
}

export interface ParsedSerp {
  text: string;
  citations: RawCitation[];
  aioPresent: boolean;
  costUsd: number;
}

/** Pure parse of a live or task_get envelope. Sources are all treated as cited (section 3.5). */
export function parseDataForSeo(env: DfsEnvelope, surface: Surface): ParsedSerp {
  const task = env.tasks?.[0];
  const result = task?.result?.[0];
  const items = (result?.items ?? []) as Array<Record<string, unknown>>;
  const overviews = items.filter((i) => i?.type === 'ai_overview');
  const texts: string[] = [];
  const refs: RawCitation[] = [];
  for (const ov of overviews) {
    const t = elementText(ov);
    if (t) texts.push(t);
    collectReferences(ov.items, refs);
    collectReferences(ov.references, refs);
  }
  if (surface === 'google_ai_mode' && !texts.length && typeof result?.markdown === 'string') texts.push(result.markdown);
  const text = texts.join('\n\n').trim();
  return {
    text,
    citations: refs,
    aioPresent: overviews.length > 0 && text.length > 0,
    costUsd: round6(env.cost ?? task?.cost ?? 0),
  };
}

const TASK_PENDING = new Set([40601, 40602]); // Task Handed / Task In Queue

function authHeader(): string {
  const v = requireEnv('google_aio');
  return `Basic ${Buffer.from(`${v.DATAFORSEO_LOGIN}:${v.DATAFORSEO_PASSWORD}`).toString('base64')}`;
}

async function call(method: 'GET' | 'POST', path: string, body: unknown, opts: RunOptions): Promise<DfsEnvelope> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const f = allowlistedFetch('dataforseo', { timeoutMs: timeout });
  let res: Response;
  try {
    res = await f(`${BASE}${path}`, {
      method,
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    throw toEngineError(err, 'dataforseo');
  }
  if (!res.ok) throw new EngineError(`dataforseo: HTTP ${res.status}`, kindForStatus(res.status));
  const env = (await res.json()) as DfsEnvelope;
  // Envelope-level status: 20000 ok; 401xx auth; 402xx payment; 5xxxx server.
  const sc = env.status_code ?? 20000;
  if (sc !== 20000) {
    const kind = sc >= 50000 ? 'transient' : sc >= 40100 && sc < 40300 ? 'auth' : sc === 40202 ? 'rate_limited' : 'invalid_request';
    throw new EngineError(`dataforseo: ${sc} ${env.status_message ?? ''}`.trim(), kind);
  }
  return env;
}

function taskError(task: DfsTask | undefined, costUsd: number): EngineError | null {
  const sc = task?.status_code ?? 0;
  if (sc === 20000 || TASK_PENDING.has(sc)) return null;
  const kind = sc >= 50000 ? 'transient' : sc === 40102 ? 'no_answer' : 'invalid_request';
  return new EngineError(`dataforseo task: ${sc} ${task?.status_message ?? ''}`.trim(), kind, { costUsd });
}

function toResult(surface: Surface, parsed: ParsedSerp, env: DfsEnvelope, locale: Locale, latencyMs: number): EngineResult {
  return {
    engine: surface,
    text: parsed.text,
    citations: buildCitations(parsed.citations),
    fanOutQueries: [],
    model: surface === 'google_aio' ? 'google-ai-overview' : 'google-ai-mode',
    locale,
    usage: { searchCalls: 1, costUsd: parsed.costUsd, priceVersion: 'vendor' },
    latencyMs,
    aioPresent: surface === 'google_aio' ? parsed.aioPresent : undefined,
    raw: trimRaw(env),
    adapterVersion: VERSION,
  };
}

export interface AsyncEngineAdapter extends EngineAdapter {
  submit(prompt: string, locale: Locale, opts?: RunOptions & { tag?: string }): Promise<{ jobId: string; costUsd: number }>;
  collect(jobId: string, locale: Locale, opts?: RunOptions): Promise<EngineResult | { pending: true }>;
}

export function isAsyncAdapter(a: EngineAdapter): a is AsyncEngineAdapter {
  return typeof (a as AsyncEngineAdapter).submit === 'function';
}

export function createDataForSeoAdapter(surface: Surface): AsyncEngineAdapter {
  const p = paths(surface);
  return {
    id: surface as EngineId,
    version: VERSION,
    capabilities: {
      supportsLocale: ['country', 'language', 'locationCode', 'device'],
      exposesFanOut: false,
      maxConcurrency: 8,
      requestsPerMinute: 600,
    },
    status: () => envStatus(surface, surface === 'google_aio' ? 'google-ai-overview' : 'google-ai-mode'),
    async run(prompt, locale, opts = {}) {
      requireEnv(surface);
      const started = Date.now();
      const env = await call('POST', p.live, [buildTask(surface, prompt, locale)], opts);
      const parsed = parseDataForSeo(env, surface);
      const err = taskError(env.tasks?.[0], parsed.costUsd);
      if (err) throw err;
      return toResult(surface, parsed, env, locale, Date.now() - started);
    },
    async submit(prompt, locale, opts = {}) {
      requireEnv(surface);
      const env = await call('POST', p.post, [{ ...buildTask(surface, prompt, locale), ...(opts.tag ? { tag: opts.tag } : {}) }], opts);
      const task = env.tasks?.[0];
      // task_post answers 20100 "Task Created".
      if (!task?.id || (task.status_code !== 20100 && task.status_code !== 20000)) {
        throw new EngineError(`dataforseo task_post: ${task?.status_code} ${task?.status_message ?? ''}`.trim(), 'invalid_request');
      }
      return { jobId: task.id, costUsd: round6(env.cost ?? task.cost ?? 0) };
    },
    async collect(jobId, locale, opts = {}) {
      requireEnv(surface);
      if (!/^[0-9a-f-]{10,64}$/i.test(jobId)) throw new EngineError('dataforseo: bad job id', 'invalid_request');
      const started = Date.now();
      const env = await call('GET', `${p.get}/${jobId}`, undefined, opts);
      const task = env.tasks?.[0];
      if (TASK_PENDING.has(task?.status_code ?? 0)) return { pending: true };
      const parsed = parseDataForSeo(env, surface);
      const err = taskError(task, parsed.costUsd);
      if (err) throw err;
      return toResult(surface, parsed, env, locale, Date.now() - started);
    },
    async healthCheck() {
      try {
        requireEnv(surface);
        const f = allowlistedFetch('dataforseo', { timeoutMs: 15_000 });
        const res = await f(`${BASE}/appendix/user_data`, { headers: { Authorization: authHeader() } });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
        const env = (await res.json()) as DfsEnvelope;
        return env.status_code === 20000 ? { ok: true } : { ok: false, detail: `${env.status_code} ${env.status_message ?? ''}` };
      } catch (err) {
        return { ok: false, detail: toEngineError(err, 'dataforseo').message };
      }
    },
  };
}
