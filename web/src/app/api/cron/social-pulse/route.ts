import { checkCronAuth, cronError, notConfigured } from '@/lib/engines/pipeline/cron';
import { getSql } from '@/lib/engines/pipeline/db';
import { withService } from '@/lib/server/db';
import { dueNow } from '@/lib/server/social-pulse/budget';
import { killSwitchOn } from '@/lib/server/social-pulse/config';
import { runPulseForOrg } from '@/lib/server/social-pulse/pulse';

export const maxDuration = 300;

/** Hourly tick. Each enabled org has a stable UTC hour (hash of its id), so runs are staggered and each org runs once a day. */
async function handle(req: Request): Promise<Response> {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  if (killSwitchOn()) return Response.json({ status: 'skipped', message: 'SOCIAL_PULSE_DISABLED' });
  const db = getSql();
  if (!db.ok) return notConfigured(db.missing);
  const missing = ['APIFY_TOKEN', 'ANTHROPIC_API_KEY'].filter((k) => !process.env[k]?.trim());
  if (missing.length) return notConfigured(missing);
  try {
    const orgs = await withService((sql) => sql`select org_id, last_run_on::text as last_run_on from public.social_pulse_settings where enabled`);
    const results: { orgId: string; status: string; message?: string }[] = [];
    const started = Date.now();
    for (const o of orgs) {
      if (Date.now() - started > 240_000) break;
      const orgId = o.org_id as string;
      if (!dueNow(orgId, (o.last_run_on as string | null) ?? null)) continue;
      const r = await runPulseForOrg(orgId);
      results.push({ orgId, status: r.status, message: 'message' in r ? r.message : undefined });
    }
    return Response.json({ status: 'ok', orgs: results.length, results });
  } catch (err) {
    return cronError(err);
  }
}

export const GET = handle;
export const POST = handle;
