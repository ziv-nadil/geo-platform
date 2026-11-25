import { enqueueDaily } from '@/lib/engines/pipeline/enqueue';
import { checkCronAuth, cronError, notConfigured } from '@/lib/engines/pipeline/cron';
import { getSql } from '@/lib/engines/pipeline/db';
import { engineStatuses } from '@/lib/engines/registry';

export const maxDuration = 300;

/** Daily: plan today's runs for every active org (idempotent). Optional ?org=<uuid>. */
async function handle(req: Request): Promise<Response> {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const db = getSql();
  if (!db.ok) return notConfigured(db.missing);
  const org = new URL(req.url).searchParams.get('org');
  if (org && !/^[0-9a-f-]{36}$/i.test(org)) return Response.json({ status: 'bad_request' }, { status: 400 });
  try {
    const report = await enqueueDaily(db.sql, { orgId: org ?? undefined, statuses: engineStatuses() });
    return Response.json({ status: 'ok', ...report });
  } catch (err) {
    return cronError(err);
  }
}

export const GET = handle;
export const POST = handle;
