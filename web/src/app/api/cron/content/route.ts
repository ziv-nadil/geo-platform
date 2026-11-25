import { checkCronAuth, cronError, notConfigured } from '@/lib/engines/pipeline/cron';
import { getSql } from '@/lib/engines/pipeline/db';
import { withService } from '@/lib/server/db';
import { plannerDue, loadSettings } from '@/lib/server/content-pipeline/planner';
import { runPlannerForOrg } from '@/lib/server/content-pipeline/run';

export const maxDuration = 300;

/** Planner cron: per org, honours content_settings (cadence off/daily/weekly; mode approve/auto). Auto mode only ever creates CMS drafts. */
async function handle(req: Request): Promise<Response> {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const db = getSql();
  if (!db.ok) return notConfigured(db.missing);
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return notConfigured(['ANTHROPIC_API_KEY']);
  try {
    const orgs = await withService((sql) => sql`select distinct g.org_id from public.content_gaps g where g.status = 'open'`);
    const results = [];
    const started = Date.now();
    for (const o of orgs) {
      if (Date.now() - started > 240_000) break; // leave headroom under maxDuration; remaining orgs run next tick
      const orgId = o.org_id as string;
      const s = await withService((sql) => loadSettings(sql, orgId));
      if (!plannerDue(s.cadence, s.lastPlannedAt)) continue;
      results.push(await runPlannerForOrg((fn) => withService(fn), orgId));
    }
    return Response.json({ status: 'ok', orgs: results.length, results });
  } catch (err) {
    return cronError(err);
  }
}

export const GET = handle;
export const POST = handle;
