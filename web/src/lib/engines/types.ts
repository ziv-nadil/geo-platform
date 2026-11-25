/**
 * Engine adapter contract (docs/research/ai-engine-methodology.md section 8).
 *
 * An adapter sends ONE tracked prompt to ONE AI engine with its search tool forced on, and
 * returns the answer text, normalized citations, fan-out queries, usage and cost. Adapters never
 * throw anything but EngineError.
 */

export const ENGINE_IDS = [
  'chatgpt',
  'perplexity',
  'gemini',
  'claude',
  'google_aio',
  'google_ai_mode',
] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

export const LLM_ENGINES: readonly EngineId[] = ['chatgpt', 'perplexity', 'gemini', 'claude'];
export const SERP_ENGINES: readonly EngineId[] = ['google_aio', 'google_ai_mode'];

export function isEngineId(v: string): v is EngineId {
  return (ENGINE_IDS as readonly string[]).includes(v);
}

export interface Locale {
  /** ISO 3166-1 alpha-2, e.g. 'US'. */
  country: string;
  /** BCP-47, e.g. 'en', 'pt-BR'. */
  language: string;
  region?: string;
  city?: string;
  /** IANA time zone. */
  timezone?: string;
  /** DataForSEO location_code (google_* adapters). Derived from country when absent. */
  locationCode?: number;
  device?: 'desktop' | 'mobile';
}

export interface RunOptions {
  /** Override the configured default model (calibration runs). */
  model?: string;
  /** Cap on search tool calls (cost control). */
  maxSearches?: number;
  /** Per-attempt timeout. Default 120 s. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface Citation {
  /** As returned by the engine (after redirect resolution where possible). */
  url: string;
  /** Normalized: tracking params stripped, host lowercased, no fragment. */
  urlCanonical: string;
  /** Registrable domain (Public Suffix List). */
  domain: string;
  title?: string;
  /** Claude cited_text, Perplexity snippet, AIO passage... */
  snippet?: string;
  /** 1-based order of first appearance. */
  position: number;
  /** true = inline citation/annotation; false = consulted only (in search results). */
  cited: boolean;
  /** Character ranges of `text` that this source supports. */
  spans?: Array<{ start: number; end: number }>;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  searchCalls?: number;
  costUsd: number;
  /** Version of the price table used to compute costUsd (or 'vendor' when the API reports cost). */
  priceVersion: string;
}

export interface EngineResult {
  engine: EngineId;
  text: string;
  citations: Citation[];
  fanOutQueries: string[];
  /** Model string reported by the API ('google-ai-overview' etc. for SERP surfaces). */
  model: string;
  locale: Locale;
  usage: Usage;
  latencyMs: number;
  /** google_aio only: whether an AI Overview was shown for the query. */
  aioPresent?: boolean;
  /** Full vendor JSON (trimmed before storage). */
  raw: unknown;
  adapterVersion: string;
}

export type EngineErrorKind =
  | 'not_configured'
  | 'rate_limited'
  | 'transient'
  | 'auth'
  | 'invalid_request'
  | 'content_blocked'
  | 'no_answer'
  | 'timeout';

export class EngineError extends Error {
  readonly kind: EngineErrorKind;
  readonly retryAfterMs?: number;
  /** Missing env var names when kind = 'not_configured'. */
  readonly missing?: string[];
  /** Spend already incurred by a failed attempt (e.g. search fees on an empty answer). */
  readonly costUsd?: number;

  constructor(
    message: string,
    kind: EngineErrorKind,
    extra: { retryAfterMs?: number; missing?: string[]; costUsd?: number; cause?: unknown } = {},
  ) {
    super(message, extra.cause !== undefined ? { cause: extra.cause } : undefined);
    this.name = 'EngineError';
    this.kind = kind;
    this.retryAfterMs = extra.retryAfterMs;
    this.missing = extra.missing;
    this.costUsd = extra.costUsd;
  }

  get retryable(): boolean {
    return this.kind === 'rate_limited' || this.kind === 'transient' || this.kind === 'timeout';
  }
}

export type EngineStatus =
  | { status: 'configured'; model: string }
  | { status: 'not_configured'; missing: string[] };

export interface EngineAdapter {
  readonly id: EngineId;
  readonly version: string;
  readonly capabilities: {
    supportsLocale: Array<keyof Locale>;
    exposesFanOut: boolean;
    maxConcurrency: number;
    requestsPerMinute: number;
  };
  /** Env-based configuration status. Never throws. */
  status(): EngineStatus;
  /** One synchronous run with the search tool forced on. Throws only EngineError. */
  run(prompt: string, locale: Locale, opts?: RunOptions): Promise<EngineResult>;
  /** Cheap credential check for "Test connection" (may cost a fraction of a cent). */
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}
