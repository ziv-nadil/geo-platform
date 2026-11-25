/**
 * ChatGPT surface: OpenAI Responses API + web_search tool (methodology section 2.1).
 */
import OpenAI from 'openai';
import { buildCitations, type RawCitation } from '../../analysis/citations';
import {
  DEFAULT_TIMEOUT_MS,
  ENGINE_DEFAULTS,
  OPENAI_PRICES,
  OPENAI_WEB_SEARCH_PER_CALL,
  PRICE_VERSION,
  priceFor,
  tokenCost,
} from '../config';
import { allowlistedFetch } from '../http';
import { toEngineError } from '../retry';
import { EngineError, type EngineAdapter, type EngineResult, type Locale, type RunOptions } from '../types';
import { envStatus, requireEnv, round6, trimRaw } from './common';

const VERSION = 'openai-responses@1';

/** Minimal structural view of a Responses API result (fields we read). */
export interface OpenAIResponseLike {
  model?: string;
  status?: string;
  output?: Array<{
    type: string;
    status?: string;
    action?: { type?: string; query?: string; queries?: string[]; sources?: Array<{ type?: string; url: string }>; url?: string | null };
    content?: Array<{
      type: string;
      text?: string;
      annotations?: Array<{ type: string; url?: string; title?: string; start_index?: number; end_index?: number }>;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  incomplete_details?: { reason?: string } | null;
}

export interface ParsedEngineOutput {
  text: string;
  citations: RawCitation[];
  fanOutQueries: string[];
  searchCalls: number;
  model: string;
}

export function parseOpenAIResponse(resp: OpenAIResponseLike): ParsedEngineOutput {
  const texts: string[] = [];
  const cited: RawCitation[] = [];
  const consulted: RawCitation[] = [];
  const queries: string[] = [];
  let searchCalls = 0;
  let offset = 0;
  for (const item of resp.output ?? []) {
    if (item.type === 'web_search_call') {
      searchCalls++;
      const a = item.action;
      if (a?.query) queries.push(a.query);
      for (const q of a?.queries ?? []) if (q && !queries.includes(q)) queries.push(q);
      for (const s of a?.sources ?? []) if (s?.url) consulted.push({ url: s.url, cited: false });
    } else if (item.type === 'message') {
      for (const part of item.content ?? []) {
        if (part.type !== 'output_text' || typeof part.text !== 'string') continue;
        if (texts.length) offset += 2; // joined with "\n\n"
        for (const ann of part.annotations ?? []) {
          if (ann.type !== 'url_citation' || !ann.url) continue;
          const spans =
            typeof ann.start_index === 'number' && typeof ann.end_index === 'number'
              ? [{ start: offset + ann.start_index, end: offset + ann.end_index }]
              : undefined;
          cited.push({ url: ann.url, title: ann.title, cited: true, spans });
        }
        texts.push(part.text);
        offset += part.text.length;
      }
    }
  }
  return {
    text: texts.join('\n\n'),
    citations: [...cited, ...consulted],
    fanOutQueries: queries,
    searchCalls,
    model: resp.model ?? 'unknown',
  };
}

export function openaiCost(model: string, resp: OpenAIResponseLike, searchCalls: number): number {
  const p = priceFor(OPENAI_PRICES, model);
  const u = resp.usage ?? {};
  return round6(
    tokenCost(p, u.input_tokens ?? 0, u.output_tokens ?? 0, u.input_tokens_details?.cached_tokens ?? 0) +
      searchCalls * OPENAI_WEB_SEARCH_PER_CALL,
  );
}

function userLocation(locale: Locale) {
  return {
    type: 'approximate' as const,
    country: locale.country,
    ...(locale.city ? { city: locale.city } : {}),
    ...(locale.region ? { region: locale.region } : {}),
    ...(locale.timezone ? { timezone: locale.timezone } : {}),
  };
}

export function createOpenAIAdapter(): EngineAdapter {
  return {
    id: 'chatgpt',
    version: VERSION,
    capabilities: {
      supportsLocale: ['country', 'region', 'city', 'timezone'],
      exposesFanOut: true,
      maxConcurrency: 4,
      requestsPerMinute: 20,
    },
    status: () => envStatus('chatgpt', ENGINE_DEFAULTS.chatgpt.model()),
    async run(prompt: string, locale: Locale, opts: RunOptions = {}): Promise<EngineResult> {
      const { OPENAI_API_KEY } = requireEnv('chatgpt');
      const model = opts.model ?? ENGINE_DEFAULTS.chatgpt.model();
      const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const client = new OpenAI({
        apiKey: OPENAI_API_KEY,
        maxRetries: 0,
        timeout,
        fetch: allowlistedFetch('openai', { timeoutMs: timeout }),
      });
      const started = Date.now();
      let resp: OpenAIResponseLike;
      try {
        resp = (await client.responses.create(
          {
            model,
            input: prompt,
            reasoning: { effort: ENGINE_DEFAULTS.chatgpt.reasoningEffort() },
            tools: [{ type: 'web_search', user_location: userLocation(locale) }],
            tool_choice: 'required',
            include: ['web_search_call.action.sources'],
            store: false,
          },
          { signal: opts.signal },
        )) as unknown as OpenAIResponseLike;
      } catch (err) {
        throw toEngineError(err, 'openai');
      }
      const latencyMs = Date.now() - started;
      const parsed = parseOpenAIResponse(resp);
      const costUsd = openaiCost(model, resp, parsed.searchCalls);
      if (!parsed.text.trim()) {
        throw new EngineError(
          `openai: empty answer (status ${resp.status ?? '?'}${resp.incomplete_details?.reason ? `, ${resp.incomplete_details.reason}` : ''})`,
          resp.incomplete_details?.reason === 'content_filter' ? 'content_blocked' : 'no_answer',
          { costUsd },
        );
      }
      return {
        engine: 'chatgpt',
        text: parsed.text,
        citations: buildCitations(parsed.citations),
        fanOutQueries: parsed.fanOutQueries,
        model: parsed.model,
        locale,
        usage: {
          inputTokens: resp.usage?.input_tokens,
          outputTokens: resp.usage?.output_tokens,
          searchCalls: parsed.searchCalls,
          costUsd,
          priceVersion: PRICE_VERSION,
        },
        latencyMs,
        raw: trimRaw(resp),
        adapterVersion: VERSION,
      };
    },
    async healthCheck() {
      try {
        const { OPENAI_API_KEY } = requireEnv('chatgpt');
        const client = new OpenAI({ apiKey: OPENAI_API_KEY, maxRetries: 0, timeout: 15_000, fetch: allowlistedFetch('openai') });
        await client.models.retrieve(ENGINE_DEFAULTS.chatgpt.model());
        return { ok: true };
      } catch (err) {
        return { ok: false, detail: toEngineError(err, 'openai').message };
      }
    },
  };
}
