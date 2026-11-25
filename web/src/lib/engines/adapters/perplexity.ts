/**
 * Perplexity surface: Agent API (POST /v1/agent, web_search tool). Sonar chat-completions was
 * retired on 2026-09-27 (methodology section 2.2). The official SDK's `responses.create` targets
 * the `/v1/responses` alias; we post to `/v1/agent` explicitly through the SDK transport so the
 * endpoint matches the spec and SDK auth/serialization are reused.
 */
import Perplexity from '@perplexity-ai/perplexity_ai';
import { buildCitations, type RawCitation } from '../../analysis/citations';
import { DEFAULT_TIMEOUT_MS, ENGINE_DEFAULTS, PERPLEXITY_SEARCH_PER_CALL, PRICE_VERSION } from '../config';
import { allowlistedFetch } from '../http';
import { toEngineError } from '../retry';
import { EngineError, type EngineAdapter, type EngineResult, type Locale, type RunOptions } from '../types';
import { envStatus, requireEnv, round6, trimRaw } from './common';
import type { ParsedEngineOutput } from './openai';

const VERSION = 'perplexity-agent@1';

export interface PerplexityResponseLike {
  model?: string;
  status?: string;
  error?: { message?: string; code?: string } | null;
  output?: Array<{
    type: string;
    queries?: string[];
    results?: Array<{ id?: number; url: string; title?: string; snippet?: string }>;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{ type?: string; url?: string; title?: string; start_index?: number; end_index?: number }>;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cost?: { total_cost?: number; tool_calls_cost?: number };
    tool_calls_details?: Record<string, { invocation?: number; cost_usd?: number }>;
  };
}

export function parsePerplexityResponse(resp: PerplexityResponseLike): ParsedEngineOutput {
  const texts: string[] = [];
  const annotated: RawCitation[] = [];
  const results: Array<{ id?: number; url: string; title?: string; snippet?: string }> = [];
  const queries: string[] = [];
  let searchItems = 0;
  let offset = 0;
  for (const item of resp.output ?? []) {
    if (item.type === 'search_results') {
      searchItems++;
      for (const q of item.queries ?? []) if (q && !queries.includes(q)) queries.push(q);
      for (const r of item.results ?? []) if (r?.url) results.push(r);
    } else if (item.type === 'message') {
      for (const part of item.content ?? []) {
        if (typeof part.text !== 'string') continue;
        if (texts.length) offset += 2;
        for (const a of part.annotations ?? []) {
          if (!a.url) continue;
          const spans =
            typeof a.start_index === 'number' && typeof a.end_index === 'number'
              ? [{ start: offset + a.start_index, end: offset + a.end_index }]
              : undefined;
          annotated.push({ url: a.url, title: a.title, cited: true, spans });
        }
        texts.push(part.text);
        offset += part.text.length;
      }
    }
  }
  const text = texts.join('\n\n');

  // [n] markers index into search results (by result id when present, else 1-based order).
  const markerIds = new Set<number>();
  for (const m of text.matchAll(/\[(\d{1,3})\]/g)) markerIds.add(Number(m[1]));
  const byId = (n: number) => results.find((r) => r.id === n) ?? results[n - 1];
  const markerCited: RawCitation[] = [];
  for (const n of markerIds) {
    const r = byId(n);
    if (r) markerCited.push({ url: r.url, title: r.title, snippet: r.snippet, cited: true });
  }
  // Perplexity exposes a source list; when nothing marks which were used, treat all as cited
  // (methodology section 3.5; flagged in the UI tooltip).
  const noExplicit = annotated.length === 0 && markerCited.length === 0;
  const resultCitations: RawCitation[] = results.map((r) => ({
    url: r.url,
    title: r.title,
    snippet: r.snippet,
    cited: noExplicit,
  }));

  const toolCalls = Object.values(resp.usage?.tool_calls_details ?? {}).reduce((s, d) => s + (d.invocation ?? 0), 0);
  return {
    text,
    citations: [...annotated, ...markerCited, ...resultCitations],
    fanOutQueries: queries,
    searchCalls: toolCalls || searchItems,
    model: resp.model ?? 'unknown',
  };
}

export function perplexityCost(resp: PerplexityResponseLike, searchCalls: number): { costUsd: number; priceVersion: string } {
  const vendor = resp.usage?.cost?.total_cost;
  if (typeof vendor === 'number') return { costUsd: round6(vendor), priceVersion: 'vendor' };
  return { costUsd: round6(searchCalls * PERPLEXITY_SEARCH_PER_CALL), priceVersion: `${PRICE_VERSION}-estimate` };
}

export function createPerplexityAdapter(): EngineAdapter {
  return {
    id: 'perplexity',
    version: VERSION,
    capabilities: {
      supportsLocale: ['country', 'region', 'city', 'language'],
      exposesFanOut: true,
      maxConcurrency: 4,
      requestsPerMinute: 30,
    },
    status: () => envStatus('perplexity', ENGINE_DEFAULTS.perplexity.model() ?? `effort:${ENGINE_DEFAULTS.perplexity.effort()}`),
    async run(prompt: string, locale: Locale, opts: RunOptions = {}): Promise<EngineResult> {
      const { PERPLEXITY_API_KEY } = requireEnv('perplexity');
      const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const client = new Perplexity({
        apiKey: PERPLEXITY_API_KEY,
        maxRetries: 0,
        timeout,
        fetch: allowlistedFetch('perplexity', { timeoutMs: timeout }),
      });
      const model = opts.model ?? ENGINE_DEFAULTS.perplexity.model();
      const body = {
        input: prompt,
        ...(model ? { model } : { effort: ENGINE_DEFAULTS.perplexity.effort() }),
        language_preference: locale.language,
        tools: [
          {
            type: 'web_search',
            search_type: ENGINE_DEFAULTS.perplexity.searchType(),
            user_location: {
              country: locale.country,
              ...(locale.region ? { region: locale.region } : {}),
              ...(locale.city ? { city: locale.city } : {}),
            },
          },
        ],
        tool_choice: 'required',
        ...(opts.maxSearches ? { max_steps: opts.maxSearches + 1 } : {}),
        store: false,
      };
      const started = Date.now();
      let resp: PerplexityResponseLike;
      try {
        resp = (await client.post('/v1/agent', { body, signal: opts.signal })) as PerplexityResponseLike;
      } catch (err) {
        throw toEngineError(err, 'perplexity');
      }
      const latencyMs = Date.now() - started;
      const parsed = parsePerplexityResponse(resp);
      const cost = perplexityCost(resp, parsed.searchCalls);
      if (resp.status === 'failed' || resp.error) {
        throw new EngineError(`perplexity: run failed: ${resp.error?.message ?? 'unknown'}`, 'transient', { costUsd: cost.costUsd });
      }
      if (!parsed.text.trim()) throw new EngineError('perplexity: empty answer', 'no_answer', { costUsd: cost.costUsd });
      return {
        engine: 'perplexity',
        text: parsed.text,
        citations: buildCitations(parsed.citations),
        fanOutQueries: parsed.fanOutQueries,
        model: parsed.model,
        locale,
        usage: {
          inputTokens: resp.usage?.input_tokens,
          outputTokens: resp.usage?.output_tokens,
          searchCalls: parsed.searchCalls,
          ...cost,
        },
        latencyMs,
        raw: trimRaw(resp),
        adapterVersion: VERSION,
      };
    },
    async healthCheck() {
      try {
        const { PERPLEXITY_API_KEY } = requireEnv('perplexity');
        const client = new Perplexity({ apiKey: PERPLEXITY_API_KEY, maxRetries: 0, timeout: 15_000, fetch: allowlistedFetch('perplexity') });
        await client.models.list();
        return { ok: true };
      } catch (err) {
        return { ok: false, detail: toEngineError(err, 'perplexity').message };
      }
    },
  };
}
