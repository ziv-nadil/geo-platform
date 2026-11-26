import { pollCloudflare } from '@/lib/engines/crawlers/cloudflare';
import { checkCronAuth, cronError, notConfigured } from '@/lib/engines/pipeline/cron';
import { getSql } from '@/lib/engines/pipeline/db';
import { isolationMode } from '@/lib/server/isolation/mode';
import { handleJobCron } from '@/lib/server/jobs/cron';

export const maxDuration = 300;

/**
 * Hourly monitoring tick. per_client: dispatches one `monitoring` client job per org (Cloudflare crawler poll with that
 * client's own token + that org's queued prompt runs). shared: legacy inline Cloudflare poll for all orgs.
 */
async function handle(req: Request): Promise<Response> {
  if (isolationMode() === 'per_client') return handleJobCron('monitoring', req);
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const db = getSql();
  if (!db.ok) return notConfigured(db.missing);
  try {
    const orgs = await pollCloudflare(db.sql);
    return Response.json({ status: 'ok', orgs });
  } catch (err) {
    return cronError(err);
  }
}

export const GET = handle;
export const POST = handle;
