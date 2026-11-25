/**
 * Daily enqueue: for every active org, plan today's runs and insert them as queued prompt_runs.
 * Idempotent through prompt_runs_idem_idx (prompt, engine, run_date, run_index, trigger).
 */
import { configuredEngines } from '../registry';
import { ENGINE_IDS, LLM_ENGINES, isEngineId, type EngineId, type EngineStatus } from '../types';
import { planRuns, type PlanPrompt, type PlannedRun } from './cadence';
import type { Sql } from './db';

export const DEFAULT_MONTHLY_BUDGET_USD = 150;

export interface OrgEnqueueReport {
  orgId: string;
  planned: number;
  inserted: number;
  engines: EngineId[];
  baseline: boolean;
  monthToDateUsd: number;
  budgetUsd: number;
  budgetState: 'ok' | 'warning' | 'paused';
}

export interface EnqueueReport {
  date: string;
  orgs: OrgEnqueueReport[];
  notConfigured: Partial<Record<EngineId, string[]>>;
}

export function budgetState(spent: number, budget: number): OrgEnqueueReport['budgetState'] {
  if (budget <= 0) return 'ok';
  if (spent >= budget) return 'paused';
  if (spent >= 0.8 * budget) return 'warning';
  return 'ok';
}

export async function orgMonthToDateCost(sql: Sql, orgId: string, now: Date): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [row] = await sql<{ total: string | null }[]>`
    select coalesce(sum(cost_usd), 0)::text as total from public.prompt_runs
    where org_id = ${orgId} and run_at >= ${monthStart} and cost_usd is not null`;
  return Number(row?.total ?? 0);
}

export function orgBudget(settings: unknown): number {
  const fromOrg = Number((settings as Record<string, unknown> | null)?.engine_budget_usd);
  if (Number.isFinite(fromOrg) && fromOrg > 0) return fromOrg;
  const fromEnv = Number(process.env.ENGINE_MONTHLY_BUDGET_USD);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MONTHLY_BUDGET_USD;
}

export async function enqueueDaily(
  sql: Sql,
  opts: { now?: Date; orgId?: string; statuses?: Record<EngineId, EngineStatus> } = {},
): Promise<EnqueueReport> {
  const now = opts.now ?? new Date();
  const configured = new Set<EngineId>(
    opts.statuses ? ENGINE_IDS.filter((e) => opts.statuses![e].status === 'configured') : configuredEngines(),
  );
  const notConfigured: EnqueueReport['notConfigured'] = {};
  if (opts.statuses) {
    for (const e of ENGINE_IDS) {
      const s = opts.statuses[e];
      if (s.status === 'not_configured') notConfigured[e] = s.missing;
    }
  }

  const orgs = await sql<{ id: string; settings: unknown }[]>`
    select id, settings from public.organizations
    where status = 'active' ${opts.orgId ? sql`and id = ${opts.orgId}` : sql``}`;
  const active = await sql<{ id: string; active: boolean }[]>`select id, active from public.engines`;
  const globallyActive = new Set(active.filter((e) => e.active).map((e) => e.id));

  const reports: OrgEnqueueReport[] = [];
  for (const org of orgs) {
    const orgEngines = await sql<{ engine_id: string; enabled: boolean }[]>`
      select engine_id, enabled from public.org_engines where org_id = ${org.id}`;
    const wanted = orgEngines.length
      ? orgEngines.filter((r) => r.enabled).map((r) => r.engine_id)
      : [...globallyActive];
    const engines = wanted.filter(isEngineId).filter((e) => globallyActive.has(e) && configured.has(e));

    const prompts = await sql<{ id: string; tier: 'core' | 'tail'; funnel_stage: string | null; created_at: Date }[]>`
      select id, tier, funnel_stage::text, created_at from public.prompts
      where org_id = ${org.id} and active order by created_at`;
    const [{ n: priorRuns }] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.prompt_runs where org_id = ${org.id} and status = 'succeeded'`;
    const [{ n: priorBaseline }] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.prompt_runs where org_id = ${org.id} and trigger = 'baseline'`;

    const spent = await orgMonthToDateCost(sql, org.id, now);
    const budget = orgBudget(org.settings);
    const state = budgetState(spent, budget);
    const baseline = priorRuns === 0 && priorBaseline === 0 && process.env.ENGINE_BASELINE !== 'off';

    const planPrompts: PlanPrompt[] = prompts.map((p) => ({
      id: p.id,
      tier: p.tier,
      funnelStage: p.funnel_stage,
      createdAt: new Date(p.created_at).toISOString(),
    }));
    const plan = planRuns({ orgId: org.id, prompts: planPrompts, engines, date: now, baseline, llmPaused: state === 'paused' });
    const inserted = await insertRuns(sql, org.id, plan, now);
    reports.push({
      orgId: org.id,
      planned: plan.length,
      inserted,
      engines,
      baseline,
      monthToDateUsd: Math.round(spent * 100) / 100,
      budgetUsd: budget,
      budgetState: state,
    });
  }
  return { date: now.toISOString().slice(0, 10), orgs: reports, notConfigured };
}

/** Spread LLM runs over the day so per-engine rate limits are not hit in one burst. */
function scheduledAt(run: PlannedRun, i: number, now: Date): Date {
  const spreadMin = LLM_ENGINES.includes(run.engine) ? (i % 240) * 2 : 0; // up to 8 h
  return new Date(now.getTime() + spreadMin * 60_000);
}

export async function insertRuns(sql: Sql, orgId: string, plan: readonly PlannedRun[], now: Date): Promise<number> {
  if (!plan.length) return 0;
  let inserted = 0;
  for (let i = 0; i < plan.length; i += 500) {
    const chunk = plan.slice(i, i + 500).map((r, j) => {
      const at = scheduledAt(r, i + j, now);
      return {
        org_id: orgId,
        prompt_id: r.promptId,
        engine_id: r.engine,
        run_date: r.runDate,
        run_index: r.runIndex,
        trigger: r.trigger,
        status: 'queued',
        run_at: at,
        scheduled_at: at,
        next_attempt_at: at,
      };
    });
    const rows = await sql`
      insert into public.prompt_runs ${sql(chunk, 'org_id', 'prompt_id', 'engine_id', 'run_date', 'run_index', 'trigger', 'status', 'run_at', 'scheduled_at', 'next_attempt_at')}
      on conflict (prompt_id, engine_id, run_date, run_index, trigger) where run_date is not null do nothing
      returning id`;
    inserted += rows.length;
  }
  return inserted;
}
