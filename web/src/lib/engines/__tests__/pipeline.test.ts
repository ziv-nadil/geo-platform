import { describe, expect, it } from 'vitest';
import { classifyBot, userAgentFilters } from '../crawlers/bots';
import { pollWindow, toCrawlerRows } from '../crawlers/cloudflare';
import { allowlistedFetch, EgressBlockedError, isAllowed } from '../http';
import { corePromptIds, planRuns, requeueDelayMs, staggerWeekday, sweepWeekdays, type PlanPrompt } from '../pipeline/cadence';
import { budgetState, orgBudget } from '../pipeline/enqueue';
import { kindForStatus, parseRetryAfter, toEngineError, withRetry } from '../retry';
import { EngineError } from '../types';

const prompts: PlanPrompt[] = Array.from({ length: 30 }, (_, i) => ({
  id: `p${String(i).padStart(2, '0')}`,
  tier: 'tail',
  funnelStage: i % 3 === 0 ? 'decision' : 'awareness',
  createdAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
}));
const ORG = '00000000-0000-0000-0000-000000000001';
const engines = ['chatgpt', 'claude', 'google_aio', 'google_ai_mode'] as const;

function dayFor(weekday: number): Date {
  const d = new Date(Date.UTC(2026, 10, 22)); // a Sunday
  d.setUTCDate(d.getUTCDate() + weekday);
  return d;
}

describe('cadence', () => {
  it('every engine runs twice a week (Mon+Thu + org stagger), 1 run per prompt, other days nothing', () => {
    const [d1, d2] = sweepWeekdays(ORG);
    expect(d2 - d1).toBe(3);
    const days = Array.from({ length: 7 }, (_, w) => planRuns({ orgId: ORG, prompts, engines: [...engines], date: dayFor(w) }));
    expect(days.filter((r) => r.length > 0)).toHaveLength(2);
    expect(days[d1]).toHaveLength(30 * 4);
    expect(days[d2]).toHaveLength(30 * 4);
    expect(days[(d1 + 1) % 7]).toHaveLength(0);
  });

  it('fallback core = first 25, decision-stage first; explicit tiers win', () => {
    const core = corePromptIds(prompts);
    expect(core.size).toBe(25);
    for (const p of prompts.filter((x) => x.funnelStage === 'decision')) expect(core.has(p.id)).toBe(true);
    const explicit = corePromptIds(prompts.map((p, i) => ({ ...p, tier: i < 2 ? 'core' : 'tail' })));
    expect([...explicit]).toEqual(['p00', 'p01']);
  });

  it('baseline: every engine, 5 runs for LLM engines, 1 for SERP', () => {
    const b = planRuns({ orgId: ORG, prompts: prompts.slice(0, 2), engines: [...engines], date: dayFor(0), baseline: true });
    expect(b).toHaveLength(2 * (5 + 5 + 1 + 1));
    expect(b.every((r) => r.trigger === 'baseline')).toBe(true);
  });

  it('budget guard pauses LLM engines only', () => {
    const w = staggerWeekday(ORG);
    const p = planRuns({ orgId: ORG, prompts, engines: [...engines], date: dayFor(w), llmPaused: true });
    expect(p).toHaveLength(60);
    expect(p.every((r) => r.engine.startsWith('google_'))).toBe(true);
    expect(budgetState(50, 100)).toBe('ok');
    expect(budgetState(80, 100)).toBe('warning');
    expect(budgetState(100, 100)).toBe('paused');
    expect(orgBudget({ engine_budget_usd: 300 })).toBe(300);
  });

  it('requeue delays grow and honour retry-after', () => {
    expect(requeueDelayMs(1)).toBe(120_000);
    expect(requeueDelayMs(5)).toBe(1_800_000);
    expect(requeueDelayMs(1, 600_000)).toBe(600_000);
  });
});

describe('retry and error mapping', () => {
  it('retries only retryable kinds, with backoff and retry-after', async () => {
    const sleeps: number[] = [];
    let n = 0;
    const r = await withRetry(
      async () => {
        n++;
        if (n < 3) throw new EngineError('429', 'rate_limited', { retryAfterMs: 5000 });
        return 'ok';
      },
      { sleep: async (ms) => void sleeps.push(ms), random: () => 0.5 },
    );
    expect(r).toBe('ok');
    expect(sleeps).toEqual([5000, 5000]);
    let m = 0;
    await expect(
      withRetry(async () => {
        m++;
        throw new EngineError('bad', 'invalid_request');
      }, { sleep: async () => {} }),
    ).rejects.toMatchObject({ kind: 'invalid_request' });
    expect(m).toBe(1);
  });

  it('maps statuses and SDK-shaped errors', () => {
    expect(kindForStatus(401)).toBe('auth');
    expect(kindForStatus(429)).toBe('rate_limited');
    expect(kindForStatus(503)).toBe('transient');
    expect(kindForStatus(400)).toBe('invalid_request');
    expect(parseRetryAfter(new Headers({ 'retry-after': '3' }))).toBe(3000);
    const e = toEngineError({ status: 429, message: 'slow down', headers: { 'retry-after-ms': '250' } }, 'openai');
    expect(e).toMatchObject({ kind: 'rate_limited', retryAfterMs: 250 });
    expect(toEngineError(Object.assign(new Error('x'), { name: 'AbortError' }), 'v').kind).toBe('timeout');
  });
});

describe('egress allowlist', () => {
  it('only https to the integration hosts', async () => {
    expect(isAllowed('openai', 'https://api.openai.com/v1/responses')).toBe(true);
    expect(isAllowed('openai', 'http://api.openai.com/v1/responses')).toBe(false);
    expect(isAllowed('openai', 'https://api.openai.com.evil.com/')).toBe(false);
    const f = allowlistedFetch('anthropic', { fetchImpl: (async () => new Response('ok')) as unknown as typeof fetch });
    await expect(f('https://169.254.169.254/latest')).rejects.toBeInstanceOf(EgressBlockedError);
    expect(await (await f('https://api.anthropic.com/v1/messages')).text()).toBe('ok');
  });
});

describe('crawlers', () => {
  it('classifies AI bots, specific tokens first', () => {
    expect(classifyBot('Mozilla/5.0 AppleWebKit/537.36; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot')).toMatchObject({ bot: 'OAI-SearchBot', purpose: 'search' });
    expect(classifyBot('Mozilla/5.0 (compatible; Claude-SearchBot/1.0)')?.bot).toBe('Claude-SearchBot');
    expect(classifyBot('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)')?.bot).toBe('ClaudeBot');
    expect(classifyBot('Mozilla/5.0 (compatible; bingbot/2.0)')?.bot).toBe('Bingbot');
    expect(classifyBot('Mozilla/5.0 (Macintosh) Safari/605.1.15')).toBeNull();
    expect(userAgentFilters().length).toBeGreaterThan(10);
  });

  it('aggregates GraphQL groups into rows and drops non-AI user agents', () => {
    const rows = toCrawlerRows([
      { count: 5, dimensions: { datetimeHour: '2026-11-25T01:00:00Z', userAgent: 'GPTBot/1.2', clientRequestPath: '/pricing', edgeResponseStatus: 200 } },
      { count: 2, dimensions: { datetimeHour: '2026-11-25T01:00:00Z', userAgent: 'Mozilla/5.0 GPTBot/1.1', clientRequestPath: '/pricing', edgeResponseStatus: 200 } },
      { count: 9, dimensions: { datetimeHour: '2026-11-25T01:00:00Z', userAgent: 'Mozilla/5.0 Chrome', clientRequestPath: '/', edgeResponseStatus: 200 } },
    ]);
    expect(rows).toEqual([{ ts: '2026-11-25T01:00:00Z', bot: 'GPTBot', bot_operator: 'OpenAI', path: '/pricing', status: 200, hits: 7 }]);
  });

  it('poll window: last full hour, resumes from last_until, capped at 24h', () => {
    const now = new Date('2026-11-25T05:42:00Z');
    expect(pollWindow(null, now)).toEqual({ since: new Date('2026-11-25T04:00:00Z'), until: new Date('2026-11-25T05:00:00Z') });
    expect(pollWindow('2026-11-25T02:00:00Z', now)!.since.toISOString()).toBe('2026-11-25T02:00:00.000Z');
    expect(pollWindow('2026-11-01T00:00:00Z', now)!.since.toISOString()).toBe('2026-11-24T05:00:00.000Z');
    expect(pollWindow('2026-11-25T05:00:00Z', now)).toBeNull();
  });
});
