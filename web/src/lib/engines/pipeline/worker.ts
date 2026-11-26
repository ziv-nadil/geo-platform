/**
 * Worker: claim a batch of due runs (FOR UPDATE SKIP LOCKED), execute them with per-engine
 * concurrency, analyse, and persist. Safe to run concurrently and to re-run after a crash:
 * stale 'running' rows are reclaimed after 10 minutes.
 */
import { analyzeResponse } from '../../analysis/analyze';
import { pickJudge as defaultPickJudge, type LlmJudge } from '../../analysis/judge';
import { ENGINE_DEFAULTS, MAX_ATTEMPTS } from '../config';
import { isAsyncAdapter } from '../adapters/dataforseo';
import { getAdapter as defaultGetAdapter } from '../registry';
import { withRetry } from '../retry';
import { EngineError, LLM_ENGINES, isEngineId, type EngineAdapter, type EngineId, type EngineResult } from '../types';
import { requeueDelayMs } from './cadence';
import type { Sql } from './db';
import { budgetState, orgBudget, orgMonthToDateCost } from './enqueue';
import {
  loadDomainCache,
  loadOrgContext,
  loadPrompt,
  markFailed,
  markSkipped,
  markSubmitted,
  postponePoll,
  requeue,
  saveSuccess,
  type ClaimedRun,
  type OrgContext,
} from './persist';

export interface WorkerDeps {
  getAdapter?: (id: EngineId) => EngineAdapter;
  pickJudge?: (engine: EngineId) => LlmJudge | null;
  now?: () => Date;
}

export interface WorkerReport {
  claimed: number;
  succeeded: number;
  failed: number;
  requeued: number;
  skipped: number;
  submitted: number;
  pending: number;
  costUsd: number;
  errors: Array<{ runId: string; engine: string; error: string }>;
}

const STALE_MINUTES = 10;
const POLL_FIRST_MS = 5 * 60_000;
const POLL_AGAIN_MS = 3 * 60_000;
const ASYNC_GIVE_UP_MS = 24 * 3600_000;

export async function claimRuns(sql: Sql, limit: number, orgId?: string): Promise<ClaimedRun[]> {
  const orgFilter = orgId ? sql`and org_id = ${orgId}` : sql``;
  await sql`
    update public.prompt_runs set status = 'queued', next_attempt_at = now()
    where status = 'running' and external_job_id is null and started_at < now() - ${`${STALE_MINUTES} minutes`}::interval`;
  return sql<ClaimedRun[]>`
    with due as (
      select id from public.prompt_runs
      where ((status = 'queued' and (next_attempt_at is null or next_attempt_at <= now()))
         or (status = 'running' and external_job_id is not null and next_attempt_at <= now()))
      ${orgFilter}
      order by (trigger = 'manual') desc, coalesce(next_attempt_at, run_at)
      limit ${limit}
      for update skip locked
    )
    update public.prompt_runs p set
      status = 'running',
      started_at = case when p.external_job_id is null then now() else p.started_at end,
      attempts = case when p.external_job_id is null then p.attempts + 1 else p.attempts end,
      next_attempt_at = case when p.external_job_id is null then null else now() + interval '2 minutes' end
    from due where p.id = due.id
    returning p.id, p.org_id, p.prompt_id, p.engine_id, p.trigger, p.attempts, p.external_job_id, p.cost_usd::text, p.run_at`;
}

async function runWithLimit<T>(items: readonly T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

export async function processBatch(
  sql: Sql,
  opts: { limit?: number; deadlineMs?: number; orgId?: string } & WorkerDeps = {},
): Promise<WorkerReport> {
  const getAdapter = opts.getAdapter ?? defaultGetAdapter;
  const pickJudge = opts.pickJudge ?? defaultPickJudge;
  const deadline = Date.now() + (opts.deadlineMs ?? 240_000);
  const report: WorkerReport = { claimed: 0, succeeded: 0, failed: 0, requeued: 0, skipped: 0, submitted: 0, pending: 0, costUsd: 0, errors: [] };

  const runs = await claimRuns(sql, opts.limit ?? 20, opts.orgId);
  report.claimed = runs.length;
  const orgCache = new Map<string, Promise<OrgContext>>();
  const budgetCache = new Map<string, Promise<boolean>>();
  const org = (id: string) => {
    if (!orgCache.has(id)) orgCache.set(id, loadOrgContext(sql, id));
    return orgCache.get(id)!;
  };
  const llmPaused = (id: string, settings: Record<string, unknown>) => {
    if (!budgetCache.has(id)) {
      budgetCache.set(
        id,
        orgMonthToDateCost(sql, id, opts.now?.() ?? new Date()).then((spent) => budgetState(spent, orgBudget(settings)) === 'paused'),
      );
    }
    return budgetCache.get(id)!;
  };

  const byEngine = new Map<string, ClaimedRun[]>();
  for (const r of runs) byEngine.set(r.engine_id, [...(byEngine.get(r.engine_id) ?? []), r]);

  const one = async (run: ClaimedRun) => {
    if (!isEngineId(run.engine_id)) return void (await markSkipped(sql, run.id, `unknown engine ${run.engine_id}`), report.skipped++);
    const engine = run.engine_id;
    const adapter = getAdapter(engine);
    const st = adapter.status();
    if (st.status === 'not_configured') {
      await markSkipped(sql, run.id, `not_configured: missing ${st.missing.join(', ')}`);
      report.skipped++;
      return;
    }
    if (Date.now() > deadline) {
      await requeue(sql, run.id, 'deadline: deferred to next batch', 0);
      report.requeued++;
      return;
    }
    const ctx = await org(run.org_id);
    if (!ctx.brand) {
      await markSkipped(sql, run.id, 'no brand configured for org');
      report.skipped++;
      return;
    }
    if (LLM_ENGINES.includes(engine) && run.trigger !== 'manual' && (await llmPaused(run.org_id, ctx.settings))) {
      await markSkipped(sql, run.id, 'budget_exceeded: monthly engine budget reached');
      report.skipped++;
      return;
    }
    const prompt = await loadPrompt(sql, run.org_id, run.prompt_id);
    if (!prompt) {
      await markSkipped(sql, run.id, 'prompt not found');
      report.skipped++;
      return;
    }

    let result: EngineResult;
    try {
      const useQueue =
        isAsyncAdapter(adapter) && run.trigger !== 'manual' && ENGINE_DEFAULTS.dataforseo.mode() === 'standard';
      if (useQueue && isAsyncAdapter(adapter)) {
        if (!run.external_job_id) {
          const { jobId, costUsd } = await adapter.submit(prompt.text, prompt.locale, { tag: run.id });
          await markSubmitted(sql, run.id, jobId, costUsd, POLL_FIRST_MS);
          report.submitted++;
          report.costUsd += costUsd;
          return;
        }
        const got = await adapter.collect(run.external_job_id, prompt.locale);
        if ('pending' in got) {
          if (Date.now() - new Date(run.run_at).getTime() > ASYNC_GIVE_UP_MS) {
            await markFailed(sql, run.id, 'dataforseo task not ready after 24h');
            report.failed++;
          } else {
            await postponePoll(sql, run.id, POLL_AGAIN_MS);
            report.pending++;
          }
          return;
        }
        result = got;
      } else {
        result = await withRetry(() => adapter.run(prompt.text, prompt.locale), { maxAttempts: 2, maxDelayMs: 10_000 });
      }
    } catch (err) {
      const ee = err instanceof EngineError ? err : new EngineError(String(err), 'transient');
      const spent = ee.costUsd ?? 0;
      report.costUsd += spent;
      report.errors.push({ runId: run.id, engine, error: ee.message });
      const asyncExpired = !!run.external_job_id && Date.now() - new Date(run.run_at).getTime() > ASYNC_GIVE_UP_MS;
      if (ee.kind === 'not_configured') {
        await markSkipped(sql, run.id, `not_configured: missing ${(ee.missing ?? []).join(', ')}`);
        report.skipped++;
      } else if (ee.retryable && !asyncExpired && (run.attempts < MAX_ATTEMPTS || !!run.external_job_id)) {
        await requeue(sql, run.id, `${ee.kind}: ${ee.message}`, requeueDelayMs(run.attempts, ee.retryAfterMs), spent);
        report.requeued++;
      } else {
        await markFailed(sql, run.id, `${ee.kind}: ${ee.message}`, spent);
        report.failed++;
      }
      return;
    }

    try {
      const cache = await loadDomainCache(sql, result.citations.map((c) => c.domain));
      const analysis = await analyzeResponse({
        engine,
        text: result.text,
        citations: result.citations,
        brand: ctx.brand,
        competitors: ctx.competitors,
        classify: { cached: cache },
        judge: pickJudge(engine),
      });
      await saveSuccess(sql, run, result, analysis);
      report.succeeded++;
      report.costUsd += result.usage.costUsd + analysis.judgeCostUsd;
    } catch (err) {
      // Engine spend already happened: record it, keep the error visible, retry analysis later.
      const msg = `analysis/persist: ${(err as Error).message ?? String(err)}`;
      report.errors.push({ runId: run.id, engine, error: msg });
      if (run.attempts < MAX_ATTEMPTS) {
        await requeue(sql, run.id, msg, requeueDelayMs(run.attempts), result.usage.costUsd);
        report.requeued++;
      } else {
        await markFailed(sql, run.id, msg, result.usage.costUsd);
        report.failed++;
      }
    }
  };

  await Promise.all(
    [...byEngine.entries()].map(([engine, list]) => {
      const limit = isEngineId(engine) ? getAdapter(engine).capabilities.maxConcurrency : 1;
      return runWithLimit(list, limit, one);
    }),
  );
  report.costUsd = Math.round(report.costUsd * 1e5) / 1e5;
  return report;
}
