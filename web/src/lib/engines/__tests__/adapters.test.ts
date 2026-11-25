import { afterEach, describe, expect, it } from 'vitest';
import { buildCitations } from '../../analysis/citations';
import { anthropicCost, createAnthropicAdapter, parseAnthropicMessage } from '../adapters/anthropic';
import { buildTask, createDataForSeoAdapter, locationCodeFor, parseDataForSeo } from '../adapters/dataforseo';
import { geminiCost, parseGeminiResponse, resolveGroundingRedirects } from '../adapters/gemini';
import { createOpenAIAdapter, openaiCost, parseOpenAIResponse } from '../adapters/openai';
import { parsePerplexityResponse, perplexityCost } from '../adapters/perplexity';
import { engineStatuses } from '../registry';
import { EngineError } from '../types';
import * as fx from './fixtures';

const ENV_KEYS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'PERPLEXITY_API_KEY', 'GEMINI_API_KEY', 'DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('OpenAI Responses parsing', () => {
  it('extracts text, cited vs consulted sources, fan-out queries and search calls', () => {
    const p = parseOpenAIResponse(fx.openaiResponse);
    expect(p.text).toBe(fx.ANSWER_TEXT);
    expect(p.fanOutQueries).toEqual(['best CRM for mid-size teams 2026', 'Acme CRM reviews']);
    expect(p.searchCalls).toBe(2);
    expect(p.model).toBe('gpt-5.4-mini-2026-03-17');
    const cites = buildCitations(p.citations);
    const g2 = cites.find((c) => c.domain === 'g2.com')!;
    expect(g2.cited).toBe(true);
    expect(g2.urlCanonical).toBe('https://g2.com/categories/crm');
    expect(g2.spans).toEqual([{ start: 0, end: 45 }]);
    // acmecrm.com/pricing appears consulted (no utm) and cited (with utm): one row, cited.
    const acme = cites.filter((c) => c.domain === 'acmecrm.com');
    expect(acme).toHaveLength(1);
    expect(acme[0].cited).toBe(true);
    expect(cites.find((c) => c.domain === 'reddit.com')!.cited).toBe(false);
  });

  it('computes cost from tokens and search calls', () => {
    // (10000*0.75 + 2000*0.075 + 900*4.5)/1e6 + 2*0.01
    expect(openaiCost('gpt-5.4-mini', fx.openaiResponse, 2)).toBeCloseTo(0.0317, 4);
  });
});

describe('Perplexity Agent API parsing', () => {
  it('maps [n] markers to search results as cited, others consulted, and uses vendor cost', () => {
    const p = parsePerplexityResponse(fx.perplexityResponse);
    expect(p.text).toContain('Acme CRM');
    expect(p.searchCalls).toBe(2);
    expect(p.fanOutQueries).toEqual(['best crm mid-size teams']);
    const cites = buildCitations(p.citations);
    expect(cites.find((c) => c.domain === 'acmecrm.com')!.cited).toBe(true);
    expect(cites.find((c) => c.domain === 'capterra.com')!.cited).toBe(true);
    expect(cites.find((c) => c.domain === 'youtube.com')!.cited).toBe(false);
    expect(perplexityCost(fx.perplexityResponse, 2)).toEqual({ costUsd: 0.008, priceVersion: 'vendor' });
  });

  it('treats all sources as cited when the answer has no markers or annotations', () => {
    const resp = structuredClone(fx.perplexityResponse);
    resp.output[1].content![0].text = 'Acme CRM is a top pick.';
    const cites = buildCitations(parsePerplexityResponse(resp).citations);
    expect(cites.every((c) => c.cited)).toBe(true);
  });
});

describe('Anthropic web search parsing', () => {
  it('joins text blocks, maps citations to spans, keeps consulted results', () => {
    const p = parseAnthropicMessage(fx.anthropicMessage);
    expect(p.text).toBe('Top options: Acme CRM is well reviewed for support, while HubSpot leads on marketing.');
    expect(p.fanOutQueries).toEqual(['best CRM mid-size team']);
    expect(p.searchCalls).toBe(1);
    const cites = buildCitations(p.citations);
    const tr = cites.find((c) => c.domain === 'trustradius.com')!;
    expect(tr.cited).toBe(true);
    expect(tr.snippet).toBe('Acme CRM support is great');
    expect(p.text.slice(tr.spans![0].start, tr.spans![0].end)).toBe('Acme CRM is well reviewed for support');
    expect(cites.find((c) => c.domain === 'acmecrm.com')!.cited).toBe(false);
  });

  it('prices Haiku 5.5 tokens plus $10/1k searches', () => {
    // 15000*0.10/1e6 + 800*0.50/1e6 + 0.01
    expect(anthropicCost('claude-haiku-5-5', [fx.anthropicMessage.usage], 1)).toBeCloseTo(0.0119, 5);
  });
});

describe('Gemini grounding parsing', () => {
  it('resolves redirects, falls back to chunk domain, marks unsupported chunks consulted', async () => {
    const fakeFetch = (async (url: string) => {
      if (url.endsWith('/AAA')) return new Response(null, { status: 302, headers: { location: 'https://acmecrm.com/onboarding?utm_source=x' } });
      throw new Error('network');
    }) as unknown as typeof fetch;
    const uris = fx.geminiResponse.candidates[0].groundingMetadata.groundingChunks.map((c) => c.web.uri);
    const resolved = await resolveGroundingRedirects(uris, fakeFetch);
    expect(resolved.get(uris[0])).toBe('https://acmecrm.com/onboarding?utm_source=x');
    const p = parseGeminiResponse(fx.geminiResponse, resolved);
    expect(p.fanOutQueries).toEqual(['acme crm onboarding', 'hubspot free tier']);
    const cites = buildCitations(p.citations);
    expect(cites.map((c) => c.urlCanonical)).toEqual(['https://acmecrm.com/onboarding', 'https://hubspot.com', 'https://forbes.com']);
    expect(cites.map((c) => c.cited)).toEqual([true, true, false]);
    expect(p.text.slice(cites[1].spans![0].start, cites[1].spans![0].end)).toBe('HubSpot has a free tier.');
  });

  it('bills grounding per search query', () => {
    // (2550*0.75 + 300*3.75)/1e6 + 2*0.014
    expect(geminiCost('gemini-3.8-flash', fx.geminiResponse, 2)).toBeCloseTo(0.0310375, 5);
  });
});

describe('DataForSEO parsing', () => {
  it('AI Overview present: text + all references cited + vendor cost', () => {
    const p = parseDataForSeo(fx.dfsAioPresent, 'google_aio');
    expect(p.aioPresent).toBe(true);
    expect(p.text).toContain('Acme CRM');
    expect(p.costUsd).toBe(0.0012);
    const cites = buildCitations(p.citations);
    expect(cites.map((c) => c.domain).sort()).toEqual(['acmecrm.com', 'g2.com']);
    expect(cites.every((c) => c.cited)).toBe(true);
    // organic results are not AI citations
    expect(cites.some((c) => c.domain === 'hubspot.com')).toBe(false);
  });

  it('AI Overview absent: empty text, aioPresent false (trigger rate, not an error)', () => {
    const p = parseDataForSeo(fx.dfsAioAbsent, 'google_aio');
    expect(p.aioPresent).toBe(false);
    expect(p.text).toBe('');
  });

  it('AI Mode answer and references', () => {
    const p = parseDataForSeo(fx.dfsAiMode, 'google_ai_mode');
    expect(p.text).toContain('startups');
    expect(buildCitations(p.citations)[0].domain).toBe('reddit.com');
  });

  it('builds tasks with location/language/device and async AIO loading', () => {
    expect(buildTask('google_aio', 'best crm', { country: 'GB', language: 'en-GB' })).toEqual({
      keyword: 'best crm',
      location_code: 2826,
      language_code: 'en',
      device: 'desktop',
      load_async_ai_overview: true,
      depth: 10,
    });
    expect(locationCodeFor({ country: 'US', language: 'en', locationCode: 1023191 })).toBe(1023191);
    expect(() => locationCodeFor({ country: 'ZZ', language: 'en' })).toThrow(EngineError);
  });

  it('collect() reports pending for queued tasks and parses ready ones', async () => {
    process.env.DATAFORSEO_LOGIN = 'l';
    process.env.DATAFORSEO_PASSWORD = 'p';
    const realFetch = globalThis.fetch;
    let body: unknown = fx.dfsPending;
    globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
    try {
      const a = createDataForSeoAdapter('google_aio');
      const loc = { country: 'US', language: 'en' };
      expect(await a.collect('11251234-1535-0066-0000-abcdef123456', loc)).toEqual({ pending: true });
      body = fx.dfsAioPresent;
      const r = await a.collect('11251234-1535-0066-0000-abcdef123456', loc);
      expect('pending' in r).toBe(false);
      if (!('pending' in r)) expect(r.usage).toMatchObject({ costUsd: 0.0012, priceVersion: 'vendor' });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('not configured', () => {
  it('adapters fail with not_configured listing env vars; registry reports status', async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    await expect(createOpenAIAdapter().run('q', { country: 'US', language: 'en' })).rejects.toMatchObject({
      kind: 'not_configured',
      missing: ['OPENAI_API_KEY'],
    });
    await expect(createAnthropicAdapter().run('q', { country: 'US', language: 'en' })).rejects.toMatchObject({ kind: 'not_configured' });
    const st = engineStatuses();
    expect(st.google_aio).toEqual({ status: 'not_configured', missing: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'] });
    process.env.GEMINI_API_KEY = 'x';
    expect(engineStatuses().gemini.status).toBe('configured');
  });
});
