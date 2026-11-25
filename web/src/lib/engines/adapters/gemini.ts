/**
 * Gemini surface: Gemini API generateContent + google_search grounding (methodology section 2.3).
 * Grounding chunk URIs are vertexaisearch redirect links; we resolve them to the real URL (HEAD,
 * no auto-follow, read Location) and fall back to the chunk's domain/title when that fails.
 */
import { GoogleGenAI } from '@google/genai';
import { buildCitations, type RawCitation } from '../../analysis/citations';
import {
  DEFAULT_TIMEOUT_MS,
  ENGINE_DEFAULTS,
  GEMINI_GROUNDING_PER_QUERY,
  GEMINI_PRICES,
  PRICE_VERSION,
  priceFor,
  tokenCost,
} from '../config';
import { allowlistedFetch } from '../http';
import { toEngineError } from '../retry';
import { EngineError, type EngineAdapter, type EngineResult, type Locale, type RunOptions } from '../types';
import { envStatus, requireEnv, round6, trimRaw } from './common';
import type { ParsedEngineOutput } from './openai';

const VERSION = 'gemini-grounding@1';

export interface GeminiResponseLike {
  modelVersion?: string;
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: Array<{ web?: { uri?: string; title?: string; domain?: string } }>;
      groundingSupports?: Array<{
        segment?: { startIndex?: number; endIndex?: number; text?: string };
        groundingChunkIndices?: number[];
      }>;
    };
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    toolUsePromptTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

export const REDIRECT_HOST = 'vertexaisearch.cloud.google.com';

export function isGroundingRedirect(uri: string): boolean {
  try {
    return new URL(uri).hostname === REDIRECT_HOST;
  } catch {
    return false;
  }
}

/** Map a grounding segment to character offsets in `text` (the API's indices may be UTF-8 bytes). */
function segmentSpan(text: string, seg: { startIndex?: number; endIndex?: number; text?: string }, from: number) {
  if (seg.text) {
    const at = text.indexOf(seg.text, Math.max(0, from - seg.text.length));
    const idx = at >= 0 ? at : text.indexOf(seg.text);
    if (idx >= 0) return { start: idx, end: idx + seg.text.length };
  }
  if (typeof seg.endIndex === 'number') return { start: seg.startIndex ?? 0, end: Math.min(seg.endIndex, text.length) };
  return undefined;
}

/**
 * Pure parse. `resolved` maps redirect URI -> real URL (from resolveGroundingRedirects); missing
 * entries fall back to `https://<domain>` so domain-level share still works.
 */
export function parseGeminiResponse(resp: GeminiResponseLike, resolved: ReadonlyMap<string, string> = new Map()): ParsedEngineOutput {
  const cand = resp.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
  const gm = cand?.groundingMetadata;
  const chunks = gm?.groundingChunks ?? [];
  const chunkUrl = chunks.map((c) => {
    const uri = c.web?.uri ?? '';
    const real = resolved.get(uri);
    if (real) return real;
    if (uri && !isGroundingRedirect(uri)) return uri;
    const domain = (c.web?.domain ?? c.web?.title ?? '').trim().toLowerCase();
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? `https://${domain}` : '';
  });
  const spansByChunk = new Map<number, Array<{ start: number; end: number }>>();
  let cursor = 0;
  for (const s of gm?.groundingSupports ?? []) {
    const span = s.segment ? segmentSpan(text, s.segment, cursor) : undefined;
    if (span) cursor = span.end;
    for (const i of s.groundingChunkIndices ?? []) {
      if (!span) continue;
      const arr = spansByChunk.get(i) ?? [];
      arr.push(span);
      spansByChunk.set(i, arr);
    }
  }
  const citations: RawCitation[] = [];
  chunks.forEach((c, i) => {
    const url = chunkUrl[i];
    if (!url) return;
    citations.push({
      url,
      title: c.web?.title,
      // A chunk referenced by any support is cited; unreferenced chunks were consulted only.
      cited: spansByChunk.has(i) || (gm?.groundingSupports ?? []).length === 0,
      spans: spansByChunk.get(i),
    });
  });
  const queries = [...new Set((gm?.webSearchQueries ?? []).filter(Boolean))];
  return { text, citations, fanOutQueries: queries, searchCalls: queries.length, model: resp.modelVersion ?? 'unknown' };
}

export function geminiCost(model: string, resp: GeminiResponseLike, searchQueries: number): number {
  const p = priceFor(GEMINI_PRICES, model);
  const u = resp.usageMetadata ?? {};
  const input = (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0);
  const output = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
  return round6(tokenCost(p, input, output, u.cachedContentTokenCount ?? 0) + searchQueries * GEMINI_GROUNDING_PER_QUERY);
}

// Small process-level cache: redirect URIs are stable for a while and repeat across runs.
const redirectCache = new Map<string, string>();
const REDIRECT_CACHE_MAX = 5000;

export async function resolveGroundingRedirects(
  uris: readonly string[],
  fetchImpl: typeof fetch = allowlistedFetch('gemini_redirect', { timeoutMs: 8000 }),
  concurrency = 6,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const todo = [...new Set(uris.filter(isGroundingRedirect))];
  for (const u of todo) {
    const hit = redirectCache.get(u);
    if (hit) out.set(u, hit);
  }
  const pending = todo.filter((u) => !out.has(u));
  let i = 0;
  const worker = async () => {
    while (i < pending.length) {
      const uri = pending[i++];
      try {
        let res = await fetchImpl(uri, { method: 'HEAD', redirect: 'manual' });
        if (res.status === 405) res = await fetchImpl(uri, { method: 'GET', redirect: 'manual' });
        const loc = res.headers.get('location');
        if (loc && /^https?:\/\//i.test(loc)) {
          out.set(uri, loc);
          if (redirectCache.size >= REDIRECT_CACHE_MAX) redirectCache.delete(redirectCache.keys().next().value as string);
          redirectCache.set(uri, loc);
        }
      } catch {
        // Fall back to the chunk domain in parseGeminiResponse.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
  return out;
}

export function createGeminiAdapter(): EngineAdapter {
  return {
    id: 'gemini',
    version: VERSION,
    capabilities: {
      supportsLocale: ['language'],
      exposesFanOut: true,
      maxConcurrency: 2,
      requestsPerMinute: 10,
    },
    status: () => envStatus('gemini', ENGINE_DEFAULTS.gemini.model()),
    async run(prompt: string, locale: Locale, opts: RunOptions = {}): Promise<EngineResult> {
      const { GEMINI_API_KEY } = requireEnv('gemini');
      const model = opts.model ?? ENGINE_DEFAULTS.gemini.model();
      const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const ai = new GoogleGenAI({
        apiKey: GEMINI_API_KEY,
        httpOptions: {
          timeout,
          retryOptions: { attempts: 1 },
          fetch: allowlistedFetch('gemini', { timeoutMs: timeout }),
        },
      });
      const started = Date.now();
      let resp: GeminiResponseLike;
      try {
        resp = (await ai.models.generateContent({
          model,
          contents: prompt,
          config: { tools: [{ googleSearch: {} }], abortSignal: opts.signal },
        })) as unknown as GeminiResponseLike;
      } catch (err) {
        throw toEngineError(err, 'gemini');
      }
      const latencyMs = Date.now() - started;
      const uris = (resp.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
        .map((c) => c.web?.uri ?? '')
        .filter(Boolean);
      const resolved = await resolveGroundingRedirects(uris);
      const parsed = parseGeminiResponse(resp, resolved);
      const costUsd = geminiCost(model, resp, parsed.searchCalls);
      const finish = resp.candidates?.[0]?.finishReason;
      if (resp.promptFeedback?.blockReason || finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT') {
        throw new EngineError(`gemini: blocked (${resp.promptFeedback?.blockReason ?? finish})`, 'content_blocked', { costUsd });
      }
      if (!parsed.text) throw new EngineError(`gemini: empty answer (finishReason ${finish ?? '?'})`, 'no_answer', { costUsd });
      return {
        engine: 'gemini',
        text: parsed.text,
        citations: buildCitations(parsed.citations),
        fanOutQueries: parsed.fanOutQueries,
        model: parsed.model === 'unknown' ? model : parsed.model,
        locale,
        usage: {
          inputTokens: (resp.usageMetadata?.promptTokenCount ?? 0) + (resp.usageMetadata?.toolUsePromptTokenCount ?? 0),
          outputTokens: (resp.usageMetadata?.candidatesTokenCount ?? 0) + (resp.usageMetadata?.thoughtsTokenCount ?? 0),
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
        const { GEMINI_API_KEY } = requireEnv('gemini');
        const ai = new GoogleGenAI({
          apiKey: GEMINI_API_KEY,
          httpOptions: { timeout: 15_000, retryOptions: { attempts: 1 }, fetch: allowlistedFetch('gemini') },
        });
        await ai.models.get({ model: ENGINE_DEFAULTS.gemini.model() });
        return { ok: true };
      } catch (err) {
        return { ok: false, detail: toEngineError(err, 'gemini').message };
      }
    },
  };
}
