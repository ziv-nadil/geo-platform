/**
 * Engine configuration: env vars, default models and price tables.
 *
 * Models and prices move fast, so every default here can be overridden by env var without a code
 * change, and every run stores the model the API actually reported plus PRICE_VERSION.
 * Prices are USD. Sources: docs/research/ai-engine-methodology.md section 5 (verify on the first
 * invoice; [V?] items there are unconfirmed) and the Anthropic model table (2026-11).
 */
import type { EngineId } from './types';

export const PRICE_VERSION = '2026-11-24';

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

export function readRequired(names: readonly string[]): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const n of names) {
    const v = env(n);
    if (v === undefined) missing.push(n);
    else values[n] = v;
  }
  return { values, missing };
}

/** Env vars each engine needs. */
export const ENGINE_ENV: Record<EngineId, readonly string[]> = {
  chatgpt: ['OPENAI_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY'],
  gemini: ['GEMINI_API_KEY'],
  claude: ['ANTHROPIC_API_KEY'],
  google_aio: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'],
  google_ai_mode: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'],
};

/** Token prices per 1M tokens. */
export interface TokenPrice {
  input: number;
  cachedInput?: number;
  output: number;
}

export const OPENAI_PRICES: Record<string, TokenPrice> = {
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
  'gpt-5.4': { input: 2.5, cachedInput: 0.25, output: 15 },
  'gpt-5.4-nano': { input: 0.2, cachedInput: 0.02, output: 1.25 },
};
/** Per web_search call (Responses API). */
export const OPENAI_WEB_SEARCH_PER_CALL = 0.01;

export const ANTHROPIC_PRICES: Record<string, TokenPrice & { inputOver100k?: number; outputOver100k?: number }> = {
  'claude-haiku-5-5': { input: 0.1, cachedInput: 0.01, output: 0.5, inputOver100k: 0.5, outputOver100k: 2.5 },
  'claude-sonnet-5-5': { input: 2, cachedInput: 0.1, output: 10 },
  'claude-haiku-4-5': { input: 1, cachedInput: 0.1, output: 5 },
};
export const ANTHROPIC_WEB_SEARCH_PER_CALL = 0.01;

export const GEMINI_PRICES: Record<string, TokenPrice> = {
  // [V?] intro price reported by third-party trackers; the methodology budgets $1.50/$9.00.
  'gemini-3.8-flash': { input: 0.75, cachedInput: 0.075, output: 3.75 },
};
/** Grounding with Google Search, per search query (conservative: billed per query, not per prompt). */
export const GEMINI_GROUNDING_PER_QUERY = 0.014;

/** Perplexity reports its own cost in usage.cost; this is the fallback estimate per search call. */
export const PERPLEXITY_SEARCH_PER_CALL = 0.0025;

/** Unknown model: fall back to the most expensive known row so we over- rather than under-estimate. */
export function priceFor<T extends TokenPrice>(table: Record<string, T>, model: string): T {
  if (table[model]) return table[model];
  const base = Object.keys(table).find((k) => model.startsWith(k));
  if (base) return table[base];
  return Object.values(table).reduce((a, b) => (b.input > a.input ? b : a));
}

export function tokenCost(p: TokenPrice, input = 0, output = 0, cachedInput = 0): number {
  const uncached = Math.max(0, input - cachedInput);
  return (uncached * p.input + cachedInput * (p.cachedInput ?? p.input) + output * p.output) / 1e6;
}

export const ENGINE_DEFAULTS = {
  chatgpt: {
    model: () => env('OPENAI_ENGINE_MODEL') ?? 'gpt-5.4-mini',
    reasoningEffort: () => (env('OPENAI_REASONING_EFFORT') ?? 'low') as 'low' | 'medium' | 'high' | 'minimal',
  },
  perplexity: {
    /** Agent API effort preset (fast/low/medium/high/xhigh); replaces Sonar model names. */
    effort: () => env('PERPLEXITY_EFFORT') ?? 'low',
    model: () => env('PERPLEXITY_ENGINE_MODEL'),
    searchType: () => (env('PERPLEXITY_SEARCH_TYPE') ?? 'fast') as 'web' | 'fast',
  },
  gemini: {
    model: () => env('GEMINI_ENGINE_MODEL') ?? 'gemini-3.8-flash',
  },
  claude: {
    /** Cheapest current Claude model; Haiku 5.5 takes the basic web search tool version. */
    model: () => env('ANTHROPIC_ENGINE_MODEL') ?? 'claude-haiku-5-5',
    webSearchTool: () =>
      (env('ANTHROPIC_WEB_SEARCH_TOOL') ?? 'web_search_20250305') as 'web_search_20250305' | 'web_search_20260209',
    maxUses: () => Number(env('ANTHROPIC_WEB_SEARCH_MAX_USES') ?? 3),
  },
  dataforseo: {
    /** 'standard' = task_post + task_get (cheapest); 'live' = synchronous. Manual runs always use live. */
    mode: () => (env('DATAFORSEO_MODE') ?? 'standard') as 'standard' | 'live',
  },
  judge: {
    anthropicModel: () => env('JUDGE_ANTHROPIC_MODEL') ?? 'claude-haiku-5-5',
    openaiModel: () => env('JUDGE_OPENAI_MODEL') ?? 'gpt-5.4-nano',
  },
} as const;

export const DEFAULT_TIMEOUT_MS = 120_000;
export const MAX_ATTEMPTS = 3;
