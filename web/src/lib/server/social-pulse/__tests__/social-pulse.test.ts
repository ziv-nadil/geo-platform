import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildAnalysisPrompt, parseInsights } from '../analyze';
import { approveSuggestion, type ApproveDeps } from '../approve';
import { checkBudget, dueNow, estimateRunUsd, staggerHour } from '../budget';
import { killSwitchOn } from '../config';
import { normalizeItem, prepareItems, type SocialItem } from '../normalize';
import { buildManifest, parseInteraction, titleBlocks, verifySlackSignature } from '../slack';

const item = (n: number, over: Partial<SocialItem> = {}): SocialItem => ({ platform: 'reddit', id: `p${n}`, url: `https://reddit.com/r/x/${n}`, title: `Post ${n}`, text: `body ${n}`, author: null, createdAt: null, score: n, ...over });

describe('clustering input/output shape', () => {
  const items = [item(0), item(1), item(2, { platform: 'x', url: 'https://x.com/a/status/2' })];
  const good = { insights: [{ title: 'Pricing worries', summary: 'People compare prices.', sentiment: 'negative', source_ids: [0, 2, 99], titles: [
    { title: 'How much does GEO tooling cost in 2026?', rationale: 'Matches pricing prompt', prompt: 'best geo tool' },
    { title: 'GEO tool pricing compared honestly', rationale: 'r', prompt: 'not tracked' },
    { title: 'What to budget for AI search visibility', rationale: 'r', prompt: '' }] }] };

  it('numbers posts, fences them as untrusted, and lists tracked prompts', () => {
    const p = buildAnalysisPrompt({ brand: 'Acme', keywords: ['acme'], prompts: ['best geo tool'], competitors: ['Rival'], items });
    expect(p.user).toContain('[0] (reddit)'); expect(p.user).toContain('[2] (x)'); expect(p.user).toContain('<posts>'); expect(p.user).toContain('- best geo tool');
    expect(p.system).toMatch(/exactly 3 content title/); expect(p.system).toMatch(/untrusted/);
  });
  it('keeps 3 titles, maps source ids to real urls only, links unknown prompts to null', () => {
    const out = parseInsights(good, items, ['best geo tool']);
    expect(out).toHaveLength(1);
    expect(out[0].sources.map((s) => s.url)).toEqual(['https://reddit.com/r/x/0', 'https://x.com/a/status/2']);
    expect(out[0].titles).toHaveLength(3);
    expect(out[0].titles.map((t) => t.prompt)).toEqual(['best geo tool', null, null]);
  });
  it('drops insights with fewer than 3 titles or no valid sources, caps at 5, tolerates garbage', () => {
    expect(parseInsights({ insights: [{ ...good.insights[0], titles: good.insights[0].titles.slice(0, 2) }] }, items)).toEqual([]);
    expect(parseInsights({ insights: [{ ...good.insights[0], source_ids: [50] }] }, items)).toEqual([]);
    expect(parseInsights({ insights: Array(8).fill(good.insights[0]) }, items)).toHaveLength(5);
    expect(parseInsights(null, items)).toEqual([]); expect(parseInsights({ insights: 'x' }, items)).toEqual([]);
  });
});

describe('items: normalize, 24h window, dedupe, cap', () => {
  it('normalizes each platform and rejects unusable rows', () => {
    expect(normalizeItem('reddit', { id: 'a', title: 'T', body: 'B', url: 'https://reddit.com/a', upVotes: 3, numberOfComments: 2 })?.score).toBe(5);
    expect(normalizeItem('x', { id: '1', text: 'hi', url: 'https://x.com/u/status/1', likeCount: 1, retweetCount: 1, author: { userName: 'u' } })?.author).toBe('u');
    expect(normalizeItem('linkedin', { id: 'l', content: 'post', linkedinUrl: 'https://linkedin.com/posts/l', engagement: { likes: 4 } })?.score).toBe(4);
    expect(normalizeItem('x', { id: '1', text: '', url: 'https://x.com' })).toBeNull();
    expect(normalizeItem('x', { id: '1', text: 'a', url: 'javascript:alert(1)' })).toBeNull();
  });
  it('drops old, seen and duplicate items and caps best-first', () => {
    const now = new Date('2026-11-25T12:00:00Z');
    const list = [item(1, { createdAt: '2026-11-25T10:00:00Z' }), item(2, { createdAt: '2026-11-23T10:00:00Z' }), item(3), item(3), item(4), item(5)];
    const out = prepareItems(list, { seen: new Set(['reddit:p4']), maxItems: 2, now });
    expect(out.map((i) => i.id)).toEqual(['p5', 'p3']);
  });
});

describe('budget guard', () => {
  const base = { killSwitch: false, monthSpentUsd: 0, monthlyBudgetUsd: 10, runsToday: 0, maxRunsPerDay: 3 };
  it('allows a run within budget and caps its charge', () => {
    const v = checkBudget(base, 'reddit', 30);
    expect(v.ok).toBe(true); if (v.ok) expect(v.maxTotalChargeUsd).toBeCloseTo(estimateRunUsd('reddit', 30) * 2, 3);
  });
  it('blocks on kill switch, daily run cap, and monthly budget', () => {
    expect(checkBudget({ ...base, killSwitch: true }, 'x', 30)).toMatchObject({ ok: false, reason: 'kill_switch' });
    expect(checkBudget({ ...base, runsToday: 3 }, 'x', 30)).toMatchObject({ ok: false, reason: 'daily_runs' });
    expect(checkBudget({ ...base, monthSpentUsd: 10 }, 'x', 30)).toMatchObject({ ok: false, reason: 'monthly_budget' });
    expect(checkBudget({ ...base, monthSpentUsd: 9.99 }, 'reddit', 50)).toMatchObject({ ok: false, reason: 'monthly_budget' });
  });
  it('limits the charge to what is left of the month', () => {
    const v = checkBudget({ ...base, monthSpentUsd: 9.9 }, 'x', 30);
    expect(v.ok && v.maxTotalChargeUsd).toBeLessThanOrEqual(0.1 + 1e-9);
  });
  it('reads the global kill switch from env', () => {
    expect(killSwitchOn({ SOCIAL_PULSE_DISABLED: '1' })).toBe(true); expect(killSwitchOn({})).toBe(false); expect(killSwitchOn({ SOCIAL_PULSE_DISABLED: 'off' })).toBe(false);
  });
  it('staggers orgs across hours and runs each once a day', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const h = staggerHour(id);
    expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(24);
    const at = (hour: number) => new Date(Date.UTC(2026, 10, 25, hour, 5));
    expect(dueNow(id, null, at(h))).toBe(true);
    if (h > 0) expect(dueNow(id, null, at(h - 1))).toBe(false);
    expect(dueNow(id, '2026-11-25', at(h))).toBe(false);
  });
});

describe('Slack signature verification', () => {
  const secret = '8f742231b10e8888abcd99yyyzzz85a5';
  const body = 'payload=%7B%22type%22%3A%22block_actions%22%7D';
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);
  const sign = (t: string, b: string, s = secret) => `v0=${createHmac('sha256', s).update(`v0:${t}:${b}`).digest('hex')}`;
  it('accepts a valid signature', () => expect(verifySlackSignature({ signingSecret: secret, timestamp: ts, signature: sign(ts, body), rawBody: body, now })).toBe(true));
  it('rejects a wrong secret, tampered body, missing headers and malformed signature', () => {
    expect(verifySlackSignature({ signingSecret: secret, timestamp: ts, signature: sign(ts, body, 'other'), rawBody: body, now })).toBe(false);
    expect(verifySlackSignature({ signingSecret: secret, timestamp: ts, signature: sign(ts, body), rawBody: body + 'x', now })).toBe(false);
    expect(verifySlackSignature({ signingSecret: secret, timestamp: null, signature: sign(ts, body), rawBody: body, now })).toBe(false);
    expect(verifySlackSignature({ signingSecret: secret, timestamp: ts, signature: 'v0=abc', rawBody: body, now })).toBe(false);
    expect(verifySlackSignature({ signingSecret: '', timestamp: ts, signature: sign(ts, body, ''), rawBody: body, now })).toBe(false);
  });
  it('rejects replays older than 5 minutes', () => {
    const old = String(now / 1000 - 301);
    expect(verifySlackSignature({ signingSecret: secret, timestamp: old, signature: sign(old, body), rawBody: body, now })).toBe(false);
  });
  it('parses block_actions payloads and ignores other types', () => {
    const p = { type: 'block_actions', api_app_id: 'A123', user: { id: 'U1', username: 'sam' }, channel: { id: 'C1' }, message: { ts: '1.2' }, actions: [{ action_id: 'sp_approve', value: 'abc' }] };
    expect(parseInteraction(`payload=${encodeURIComponent(JSON.stringify(p))}`)).toMatchObject({ apiAppId: 'A123', userName: 'sam', channelId: 'C1', actions: [{ actionId: 'sp_approve', value: 'abc' }] });
    expect(parseInteraction(`payload=${encodeURIComponent(JSON.stringify({ type: 'view_submission' }))}`)).toBeNull();
    expect(parseInteraction('nope')).toBeNull();
  });
  it('builds the manifest with the interactivity url and approve buttons per title', () => {
    expect(buildManifest('https://app.example.com/', 'Acme').settings.interactivity.request_url).toBe('https://app.example.com/api/slack/interactions');
    const b = titleBlocks([{ id: 'x', title: 'T', rationale: 'R' }]);
    expect(b[0]).toMatchObject({ accessory: { action_id: 'sp_approve', value: 'x' } });
  });
});

describe('approval flow', () => {
  const claimed = { id: 's1', title: 'A good title', promptText: 'p', label: 'Social pulse: x' };
  const mk = (over: Partial<ApproveDeps> = {}) => ({
    claim: vi.fn().mockResolvedValue(claimed), makeGap: vi.fn().mockResolvedValue('gap1'),
    create: vi.fn().mockResolvedValue({ ok: true, data: { itemId: 'item1', words: 1800, notes: [] } }), finish: vi.fn().mockResolvedValue(undefined), ...over,
  });
  it('approval (app or Slack) creates the gap, runs the content pipeline and records the item', async () => {
    const d = mk();
    expect(await approveSuggestion(d as unknown as ApproveDeps, 's1', { via: 'slack', by: 'sam' })).toEqual({ status: 'created', itemId: 'item1' });
    expect(d.claim).toHaveBeenCalledWith('s1', { via: 'slack', by: 'sam' });
    expect(d.create).toHaveBeenCalledWith('gap1', claimed);
    expect(d.finish).toHaveBeenCalledWith('s1', { status: 'created', gapId: 'gap1', itemId: 'item1' });
  });
  it('is idempotent: a second decision does not create content again', async () => {
    const d = mk({ claim: vi.fn().mockResolvedValue(null) });
    expect(await approveSuggestion(d as unknown as ApproveDeps, 's1', { via: 'app', by: 'u' })).toEqual({ status: 'already_decided' });
    expect(d.create).not.toHaveBeenCalled();
  });
  it('records a pipeline failure (including not-configured) instead of throwing', async () => {
    const d = mk({ create: vi.fn().mockResolvedValue({ ok: false, error: 'Writing is not configured', notConfigured: ['ANTHROPIC_API_KEY'] }) });
    expect(await approveSuggestion(d as unknown as ApproveDeps, 's1', { via: 'app', by: 'u' })).toEqual({ status: 'failed', error: 'Writing is not configured', notConfigured: ['ANTHROPIC_API_KEY'] });
    expect(d.finish).toHaveBeenCalledWith('s1', { status: 'failed', gapId: 'gap1', error: 'Writing is not configured' });
    const t = mk({ create: vi.fn().mockRejectedValue(new Error('boom')) });
    expect(await approveSuggestion(t as unknown as ApproveDeps, 's1', { via: 'app', by: 'u' })).toMatchObject({ status: 'failed', error: 'boom' });
  });
});
