import 'server-only';
import { checkCronAuth, cronError, notConfigured } from '@/lib/engines/pipeline/cron';
import { getSql } from '@/lib/engines/pipeline/db';
import { isolationMode } from '../isolation/mode';
import { dispatchConfig, dispatchForOrgs } from './dispatch';
import { dueOrgs, runForOrg, type JobType } from './types';

/**
 * Shared cron handler for credentialed jobs.
 *   per_client: select due orgs, dispatch one client-job.yml run per org (environment client-<slug>). Nothing here
 *               touches a client secret or an LLM.
 *   shared:     legacy inline loop (one org at a time, same functions the runner calls).
 */
export async function handleJobCron(
  type: JobType,
  req: Request,
  opts: { requiredEnv?: string[]; skip?: () => Response | null; budgetMs?: number } = {},
): Promise<Response> {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const skipped = opts.skip?.();
  if (skipped) return skipped;
  const db = getSql();
  if (!db.ok) return notConfigured(db.missing);
  const mode = isolationMode();
  try {
    if (mode === 'per_client') {
      const cfg = dispatchConfig();
      if ('status' in cfg) return notConfigured(cfg.missing);
      const orgs = await dueOrgs(type);
      const dispatched = await dispatchForOrgs(cfg, type, orgs);
      return Response.json({ status: 'ok', mode, type, orgs: dispatched.length, dispatched });
    }
    const missing = (opts.requiredEnv ?? []).filter((k) => !process.env[k]?.trim());
    if (missing.length) return notConfigured(missing);
    const orgs = await dueOrgs(type);
    const started = Date.now();
    const budget = opts.budgetMs ?? 240_000;
    const results: Record<string, unknown>[] = [];
    for (const o of orgs) {
      const left = budget - (Date.now() - started);
      if (left < 10_000) break; // remaining orgs run next tick
      results.push({ orgId: o.orgId, ...(await runForOrg(type, o.orgId, { deadlineMs: left })) });
    }
    return Response.json({ status: 'ok', mode, type, orgs: results.length, results });
  } catch (err) {
    return cronError(err);
  }
}
