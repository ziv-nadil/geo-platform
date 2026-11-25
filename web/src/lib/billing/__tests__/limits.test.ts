import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkLimit, evaluateLimit, type PlanLimits } from '../limits';

const starter: PlanLimits = { planId: 'starter', planName: 'Starter', seats: 5, prompts: 100, engines: 4 };
const agency: PlanLimits = { planId: 'agency', planName: 'Agency', seats: null, prompts: null, engines: null };

describe('evaluateLimit', () => {
  it('allows up to and including the limit', () => {
    expect(evaluateLimit('seats', starter, 4).ok).toBe(true);
    expect(evaluateLimit('prompts', starter, 90, 10).ok).toBe(true);
  });
  it('blocks past the limit with a friendly upgrade message', () => {
    const r = evaluateLimit('seats', starter, 5);
    expect(r).toMatchObject({ ok: false, code: 'plan_limit', kind: 'seats', limit: 5, current: 5 });
    expect(!r.ok && r.message).toMatch(/Starter plan includes 5 seats.*Upgrade/);
    expect(evaluateLimit('prompts', starter, 95, 10).ok).toBe(false);
    expect(evaluateLimit('engines', starter, 4).ok).toBe(false);
  });
  it('treats null as unlimited', () => {
    expect(evaluateLimit('prompts', agency, 1_000_000, 500).ok).toBe(true);
  });
});

describe('checkLimit (DB-backed)', () => {
  beforeEach(() => vi.stubEnv('BILLING_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('is a no-op when billing is disabled', async () => {
    vi.stubEnv('BILLING_ENABLED', 'false');
    expect(await checkLimit((async () => { throw new Error('no db'); }) as never, 'o', 'seats')).toEqual({ ok: true });
  });

  it('reads plan limits and usage through the query helper', async () => {
    const sql = (async (strings: TemplateStringsArray) => {
      const q = strings.join('?');
      if (q.includes('from public.organizations')) return [{ id: 'starter', name: 'Starter', seat_limit: 5, prompt_limit: 100, engine_limit: 4 }];
      return [{ seats: 5, prompts: 10, engines: 2 }];
    }) as never;
    expect((await checkLimit(sql, 'org', 'seats')).ok).toBe(false);
    expect((await checkLimit(sql, 'org', 'prompts', 90)).ok).toBe(true);
    expect((await checkLimit(sql, 'org', 'engines', 3)).ok).toBe(false);
  });
});
