import 'server-only';
import { pollCloudflare } from '@/lib/engines/crawlers/cloudflare';
import { getSql } from '@/lib/engines/pipeline/db';
import { processBatch } from '@/lib/engines/pipeline/worker';
import { loadSettings, plannerDue } from '../content-pipeline/planner';
import { runPlannerForOrg } from '../content-pipeline/run';
import { withService } from '../db';
import { assertJobOrg } from '../isolation/job-context';
import { dueNow } from '../social-pulse/budget';
import { runPulseForOrg } from '../social-pulse/pulse';
import type { JobType } from './job-types';
import { approveVideo, buildAssets, createVideoDraft, eligibleArticles, uploadVideo } from '../youtube/run';

/**
 * Credentialed job types, one org per job (isolation.md §3.1). The cron routes call `dueOrgs` and then either run
 * `runForOrg` inline (ISOLATION_MODE=shared) or dispatch one client-job.yml run per org (per_client). The per-client
 * runner (./runner.ts) calls `runForOrg` for exactly the org of its GitHub environment.
 */
export { JOB_TYPES, isJobType, type JobType } from './job-types';

export type OrgRef = { orgId: string; slug: string };

async function orgsWithSlugs(sqlRows: { org_id: string }[]): Promise<OrgRef[]> {
  if (!sqlRows.length) return [];
  const ids = [...new Set(sqlRows.map((r) => r.org_id))];
  const rows = await withService((sql) => sql`select id, slug from public.organizations where id = any(${ids}::uuid[]) and status in ('active', 'onboarding')`);
  return rows.map((r) => ({ orgId: r.id as string, slug: r.slug as string }));
}

/** Orgs whose job of `type` is due now. Selection only: no secrets, no LLM. */
export async function dueOrgs(type: JobType): Promise<OrgRef[]> {
  switch (type) {
    case 'content': {
      const orgs = await withService((sql) => sql`select distinct g.org_id from public.content_gaps g where g.status = 'open'`);
      const due: { org_id: string }[] = [];
      for (const o of orgs) {
        const s = await withService((sql) => loadSettings(sql, o.org_id as string));
        if (plannerDue(s.cadence, s.lastPlannedAt)) due.push({ org_id: o.org_id as string });
      }
      return orgsWithSlugs(due);
    }
    case 'social-pulse': {
      const orgs = await withService((sql) => sql`select org_id, last_run_on::text as last_run_on from public.social_pulse_settings where enabled`);
      return orgsWithSlugs(orgs.filter((o) => dueNow(o.org_id as string, (o.last_run_on as string | null) ?? null)).map((o) => ({ org_id: o.org_id as string })));
    }
    case 'youtube': {
      const rows = await withService((sql) => sql`select distinct org_id from public.youtube_channels where status = 'connected'`);
      return orgsWithSlugs(rows.map((r) => ({ org_id: r.org_id as string })));
    }
    case 'monitoring': {
      const rows = await withService((sql) => sql`
        select distinct org_id from public.prompt_runs where status = 'queued' and (next_attempt_at is null or next_attempt_at <= now())
        union select distinct org_id from public.secret_refs where field_id = 'cf_api_token'`);
      return orgsWithSlugs(rows.map((r) => ({ org_id: r.org_id as string })));
    }
  }
}

/** Runs one job for one org. Inside a job context it refuses any other org. */
export async function runForOrg(type: JobType, orgId: string, opts: { jobId?: string; deadlineMs?: number } = {}): Promise<Record<string, unknown>> {
  assertJobOrg(orgId, `${type} job`);
  switch (type) {
    case 'content':
      return { ...(await runPlannerForOrg((fn) => withService(fn), orgId)) };
    case 'social-pulse':
      return { ...(await runPulseForOrg(orgId)) };
    case 'youtube':
      return youtubeTick(orgId, opts.deadlineMs ?? 230_000);
    case 'monitoring': {
      const db = getSql();
      if (!db.ok) return { status: 'not_configured', missing: db.missing };
      const crawlers = await pollCloudflare(db.sql, { orgId, jobId: opts.jobId });
      const runs = await processBatch(db.sql, { orgId, limit: 50, deadlineMs: opts.deadlineMs ?? 240_000 });
      return { status: 'ok', crawlers, runs };
    }
  }
}

/** One org's YouTube tick (was the body of /api/cron/youtube). */
async function youtubeTick(orgId: string, budgetMs: number): Promise<Record<string, unknown>> {
  const run = <T,>(fn: Parameters<typeof withService<T>>[0]) => withService(fn);
  const started = Date.now();
  const [c] = await withService((sql) => sql`select mode, daily_limit from public.youtube_channels where org_id = ${orgId} and status = 'connected'`);
  if (!c) return { status: 'skipped', message: 'no connected channel' };
  const r: Record<string, unknown> = { status: 'ok', orgId };
  for (const v of await withService((sql) => sql`select id from public.youtube_videos where org_id = ${orgId} and status = 'rendered' order by created_at limit 2`)) {
    const u = await uploadVideo(run, orgId, v.id as string); r[`upload:${v.id}`] = u.ok ? 'ok' : u.error;
  }
  for (const v of await withService((sql) => sql`select id from public.youtube_videos where org_id = ${orgId} and status = 'approved' order by approved_at limit 1`)) {
    if (Date.now() - started > budgetMs * 0.85) break;
    const b = await buildAssets(run, orgId, v.id as string); r[`assets:${v.id}`] = b.ok ? 'ok' : b.error;
  }
  if (c.mode === 'auto') for (const v of await withService((sql) => sql`select id from public.youtube_videos where org_id = ${orgId} and status = 'draft' and error is null limit 3`)) await approveVideo(run, orgId, v.id as string, null);
  const [{ n }] = await withService((sql) => sql`select count(*)::int as n from public.youtube_videos where org_id = ${orgId} and status <> 'rejected' and created_at > now() - interval '24 hours'`);
  if ((n as number) < (c.daily_limit as number) && Date.now() - started < budgetMs * 0.75) {
    const [item] = await eligibleArticles(run, orgId, 1);
    if (item) { const d = await createVideoDraft(run, orgId, item.id as string); r.draft = d.ok ? d.data.videoId : d.error; }
  }
  return r;
}
