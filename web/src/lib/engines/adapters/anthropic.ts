/**
 * Claude surface: Anthropic Messages API + web_search server tool (methodology section 2.4).
 * Default model is the cheapest current Claude model (claude-haiku-5-5), which takes the basic
 * `web_search_20250305` tool version; both are env-overridable.
 */
import Anthropic from '@anthropic-ai/sdk';
import { buildCitations, type RawCitation } from '../../analysis/citations';
import {
  ANTHROPIC_PRICES,
  ANTHROPIC_WEB_SEARCH_PER_CALL,
  DEFAULT_TIMEOUT_MS,
  ENGINE_DEFAULTS,
  PRICE_VERSION,
  priceFor,
} from '../config';
import { allowlistedFetch } from '../http';
import { toEngineError } from '../retry';
import { EngineError, type EngineAdapter, type EngineResult, type Locale, type RunOptions } from '../types';
import { envStatus, requireEnv, round6, trimRaw } from './common';
import type { ParsedEngineOutput } from './openai';

const VERSION = 'anthropic-messages@1';
const MAX_CONTINUATIONS = 2;

export interface AnthropicMessageLike {
  model?: string;
  stop_reason?: string | null;
  content?: Array<{
    type: string;
    text?: string;
    name?: string;
    input?: unknown;
    citations?: Array<{ type: string; url?: string; title?: string | null; cited_text?: string }> | null;
    content?: unknown;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    server_tool_use?: { web_search_requests?: number } | null;
  };
}

export function parseAnthropicMessage(msg: AnthropicMessageLike): ParsedEngineOutput {
  let text = '';
  const cited: RawCitation[] = [];
  const consulted: RawCitation[] = [];
  const queries: string[] = [];
  let toolUses = 0;
  for (const block of msg.content ?? []) {
    if (block.type === 'text' && typeof block.text === 'string') {
      const start = text.length;
      text += block.text;
      for (const c of block.citations ?? []) {
        if (c.type !== 'web_search_result_location' || !c.url) continue;
        cited.push({
          url: c.url,
          title: c.title ?? undefined,
          snippet: c.cited_text,
          cited: true,
          spans: [{ start, end: text.length }],
        });
      }
    } else if (block.type === 'server_tool_use' && block.name === 'web_search') {
      toolUses++;
      const q = (block.input as { query?: unknown } | undefined)?.query;
      if (typeof q === 'string' && q && !queries.includes(q)) queries.push(q);
    } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content as Array<{ type?: string; url?: string; title?: string }>) {
        if (r?.type === 'web_search_result' && r.url) consulted.push({ url: r.url, title: r.title, cited: false });
      }
    }
  }
  return {
    text: text.trim(),
    citations: [...cited, ...consulted],
    fanOutQueries: queries,
    searchCalls: msg.usage?.server_tool_use?.web_search_requests ?? toolUses,
    model: msg.model ?? 'unknown',
  };
}

export function anthropicCost(model: string, usage: NonNullable<AnthropicMessageLike['usage']>[], searchCalls: number): number {
  const p = priceFor(ANTHROPIC_PRICES, model);
  let total = 0;
  for (const u of usage) {
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;
    const input = u.input_tokens ?? 0;
    const promptTokens = input + cacheRead + cacheWrite;
    const long = promptTokens > 100_000 && p.inputOver100k !== undefined;
    const inRate = long ? p.inputOver100k! : p.input;
    const outRate = long ? (p.outputOver100k ?? p.output) : p.output;
    total +=
      (input * inRate + cacheWrite * inRate * 1.25 + cacheRead * (p.cachedInput ?? inRate) + (u.output_tokens ?? 0) * outRate) / 1e6;
  }
  return round6(total + searchCalls * ANTHROPIC_WEB_SEARCH_PER_CALL);
}

export function createAnthropicAdapter(): EngineAdapter {
  return {
    id: 'claude',
    version: VERSION,
    capabilities: {
      supportsLocale: ['country', 'region', 'city', 'timezone'],
      exposesFanOut: true,
      maxConcurrency: 1,
      requestsPerMinute: 50,
    },
    status: () => envStatus('claude', ENGINE_DEFAULTS.claude.model()),
    async run(prompt: string, locale: Locale, opts: RunOptions = {}): Promise<EngineResult> {
      const { ANTHROPIC_API_KEY } = requireEnv('claude');
      const model = opts.model ?? ENGINE_DEFAULTS.claude.model();
      const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const client = new Anthropic({
        apiKey: ANTHROPIC_API_KEY,
        maxRetries: 0,
        timeout,
        fetch: allowlistedFetch('anthropic', { timeoutMs: timeout }),
      });
      const tool = {
        type: ENGINE_DEFAULTS.claude.webSearchTool(),
        name: 'web_search' as const,
        max_uses: opts.maxSearches ?? ENGINE_DEFAULTS.claude.maxUses(),
        user_location: {
          type: 'approximate' as const,
          country: locale.country,
          ...(locale.region ? { region: locale.region } : {}),
          ...(locale.city ? { city: locale.city } : {}),
          ...(locale.timezone ? { timezone: locale.timezone } : {}),
        },
      };
      const started = Date.now();
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
      const usages: NonNullable<AnthropicMessageLike['usage']>[] = [];
      const allContent: NonNullable<AnthropicMessageLike['content']> = [];
      let last: AnthropicMessageLike | undefined;
      try {
        for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
          const msg = await client.messages.create(
            {
              model,
              max_tokens: 4096,
              // Neutral instruction only: never mention the brand (methodology section 2).
              system: 'Search the web before answering. Answer the user directly.',
              output_config: { effort: 'low' },
              tools: [tool] as Anthropic.ToolUnion[],
              messages,
            },
            { signal: opts.signal },
          );
          last = msg as unknown as AnthropicMessageLike;
          if (last.usage) usages.push(last.usage);
          allContent.push(...(last.content ?? []));
          if (msg.stop_reason !== 'pause_turn') break;
          // Server tool turn paused: send the partial assistant turn back so the server continues.
          messages.push({ role: 'assistant', content: msg.content as unknown as Anthropic.ContentBlockParam[] });
        }
      } catch (err) {
        throw toEngineError(err, 'anthropic');
      }
      const latencyMs = Date.now() - started;
      const merged: AnthropicMessageLike = { ...last, content: allContent };
      const parsed = parseAnthropicMessage(merged);
      const searchCalls = usages.reduce((s, u) => s + (u.server_tool_use?.web_search_requests ?? 0), 0) || parsed.searchCalls;
      const costUsd = anthropicCost(model, usages, searchCalls);
      if (last?.stop_reason === 'refusal') throw new EngineError('anthropic: refusal', 'content_blocked', { costUsd });
      if (!parsed.text) throw new EngineError(`anthropic: empty answer (stop_reason ${last?.stop_reason})`, 'no_answer', { costUsd });
      return {
        engine: 'claude',
        text: parsed.text,
        citations: buildCitations(parsed.citations),
        fanOutQueries: parsed.fanOutQueries,
        model: parsed.model,
        locale,
        usage: {
          inputTokens: usages.reduce((s, u) => s + (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), 0),
          outputTokens: usages.reduce((s, u) => s + (u.output_tokens ?? 0), 0),
          searchCalls,
          costUsd,
          priceVersion: PRICE_VERSION,
        },
        latencyMs,
        raw: trimRaw(merged),
        adapterVersion: VERSION,
      };
    },
    async healthCheck() {
      try {
        const { ANTHROPIC_API_KEY } = requireEnv('claude');
        const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 0, timeout: 15_000, fetch: allowlistedFetch('anthropic') });
        await client.models.retrieve(ENGINE_DEFAULTS.claude.model());
        return { ok: true };
      } catch (err) {
        return { ok: false, detail: toEngineError(err, 'anthropic').message };
      }
    },
  };
}
