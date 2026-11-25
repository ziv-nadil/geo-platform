/**
 * Integration test against a real Postgres with all migrations applied (e.g. the database that
 * supabase/tests/local/run.sh builds). Skipped unless TEST_DATABASE_URL is set:
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5433/beacon_validate pnpm test
 * Engines are faked (no vendor network); SQL, claiming, analysis and persistence are real.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCitations } from '../../analysis/citations';
import { parseOpenAIResponse } from '../adapters/openai';
import { createSql, type Sql } from '../pipeline/db';
import { enqueueDaily } from '../pipeline/enqueue';
import { processBatch } from '../pipeline/worker';
import { ENGINE_IDS, EngineError, type EngineAdapter, type EngineId, type EngineResult, type EngineStatus } from '../types';
import { ANSWER_TEXT, openaiResponse } from './fixtures';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const allConfigured = Object.fromEntries(ENGINE_IDS.map((e) => [e, { status: 'configured', model: 'fake' }])) as Record<EngineId, EngineStatus>;

function fakeAdapter(id: EngineId, behaviour: 'ok' | 'rate_limited' | 'not_configured'): EngineAdapter {
  return {
    id,
    version: 'fake@1',
    capabilities: { supportsLocale: [], exposesFanOut: true, maxConcurrency: 3, requestsPerMinute: 1000 },
    status: () => (behaviour === 'not_configured' ? { status: 'not_configured', missing: ['FAKE_KEY'] } : { status: 'configured', model: 'fake' }),
    async run(_prompt, locale): Promise<EngineResult> {
      if (behaviour === 'rate_limited') throw new EngineError('slow down', 'rate_limited', { costUsd: 0.001 });
      return {
        engine: id,
        text: ANSWER_TEXT,
        citations: buildCitations(parseOpenAIResponse(openaiResponse).citations),
        fanOutQueries: ['best crm'],
        model: `${id}-fake-model`,
        locale,
        usage: { inputTokens: 100, outputTokens: 50, searchCalls: 1, costUsd: 0.02, priceVersion: 'test' },
        latencyMs: 12,
        raw: { fake: true },
        adapterVersion: 'fake@1',
      };
    },
    async healthCheck() {
      return { ok: true };
    },
  };
}

d('pipeline against Postgres', () => {
  let sql: Sql;
  const org = randomUUID();
  const brand = randomUUID();
  const comp = randomUUID();

  beforeAll(async () => {
    sql = createSql(url!);
    await sql`insert into public.organizations (id, name, slug, plan, status) values (${org}, 'Test Org', ${`t-${org.slice(0, 8)}`}, 'growth', 'active')`;
    await sql`insert into public.brands (id, org_id, name, domain, aliases, is_primary, context_terms) values (${brand}, ${org}, 'Acme CRM', 'acmecrm.com', ${['Acme']}, true, ${['crm']})`;
    await sql`insert into public.competitors (id, org_id, name, domain) values (${comp}, ${org}, 'HubSpot', 'hubspot.com')`;
    for (const t of ['best crm for mid-size teams', 'acme crm vs hubspot']) {
      await sql`insert into public.prompts (org_id, brand_id, text, funnel_stage, locale, country) values (${org}, ${brand}, ${t}, 'decision', 'en-US', 'US')`;
    }
    await sql`insert into public.org_engines (org_id, engine_id, enabled) values (${org}, 'chatgpt', true), (${org}, 'claude', true), (${org}, 'gemini', true)`;
  });

  afterAll(async () => {
    await sql`delete from public.organizations where id = ${org}`;
    await sql.end();
  });

  it('enqueue: baseline for a new org, idempotent on re-run', async () => {
    const now = new Date();
    const r1 = await enqueueDaily(sql, { orgId: org, now, statuses: allConfigured });
    expect(r1.orgs[0]).toMatchObject({ baseline: true, engines: ['chatgpt', 'claude', 'gemini'], planned: 2 * 3 * 5, inserted: 30 });
    const r2 = await enqueueDaily(sql, { orgId: org, now, statuses: allConfigured });
    expect(r2.orgs[0].inserted).toBe(0);
    // make all runs due now
    await sql`update public.prompt_runs set next_attempt_at = now() - interval '1 minute' where org_id = ${org}`;
  });

  it('worker: success writes response/mentions/citations; 429 requeues; not_configured skips', async () => {
    const getAdapter = (id: EngineId) =>
      fakeAdapter(id, id === 'claude' ? 'rate_limited' : id === 'gemini' ? 'not_configured' : 'ok');
    const rep = await processBatch(sql, { limit: 50, getAdapter, pickJudge: () => null });
    expect(rep.claimed).toBe(30);
    expect(rep).toMatchObject({ succeeded: 10, requeued: 10, skipped: 10, failed: 0 });

    const runs = await sql<{ engine_id: string; status: string; attempts: number; cost_usd: string | null; error: string | null }[]>`
      select engine_id, status, attempts, cost_usd::text, error from public.prompt_runs where org_id = ${org}`;
    const ok = runs.filter((r) => r.engine_id === 'chatgpt');
    expect(ok.every((r) => r.status === 'succeeded' && Number(r.cost_usd) === 0.02)).toBe(true);
    const rl = runs.filter((r) => r.engine_id === 'claude');
    expect(rl.every((r) => r.status === 'queued' && r.attempts === 1 && r.error?.startsWith('rate_limited'))).toBe(true);
    expect(rl.every((r) => Number(r.cost_usd) === 0.001)).toBe(true);
    const nc = runs.filter((r) => r.engine_id === 'gemini');
    expect(nc.every((r) => r.status === 'skipped' && r.error === 'not_configured: missing FAKE_KEY')).toBe(true);

    const [resp] = await sql<{ n: number; mentioned: number; owned: number }[]>`
      select count(*)::int n, count(*) filter (where brand_mentioned)::int mentioned, count(*) filter (where owned_cited)::int owned
      from public.responses where org_id = ${org}`;
    expect(resp).toEqual({ n: 10, mentioned: 10, owned: 10 });
    const ments = await sql<{ entity_type: string; n: number }[]>`
      select entity_type::text, count(*)::int n from public.mentions where org_id = ${org} group by 1 order by 1`;
    expect(ments).toEqual([{ entity_type: 'brand', n: 10 }, { entity_type: 'competitor', n: 10 }]);
    const cites = await sql<{ source_type: string; category: string; cited: boolean }[]>`
      select distinct source_type::text, category, cited from public.citations where org_id = ${org} order by 2`;
    expect(cites).toContainEqual({ source_type: 'owned', category: 'owned', cited: true });
    expect(cites).toContainEqual({ source_type: 'earned', category: 'review_aggregator', cited: true });
    expect(cites).toContainEqual({ source_type: 'ugc', category: 'ugc_social', cited: false });

    // Second batch: nothing due (requeued runs wait for their backoff).
    const rep2 = await processBatch(sql, { limit: 50, getAdapter, pickJudge: () => null });
    expect(rep2.claimed).toBe(0);
  });

  it('budget guard skips scheduled LLM runs once the month budget is spent', async () => {
    await sql`update public.organizations set settings = ${sql.json({ engine_budget_usd: 0.1 })} where id = ${org}`;
    await sql`update public.prompt_runs set next_attempt_at = now() - interval '1 minute' where org_id = ${org} and status = 'queued'`;
    const rep = await processBatch(sql, { limit: 50, getAdapter: (id) => fakeAdapter(id, 'ok'), pickJudge: () => null });
    expect(rep.skipped).toBe(10);
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int n from public.prompt_runs where org_id = ${org} and error like 'budget_exceeded%'`;
    expect(n).toBe(10);
  });
});
