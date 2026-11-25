import { checkCronAuth, cronError, notConfigured } from '@/lib/engines/pipeline/cron';
import { getSql } from '@/lib/engines/pipeline/db';
import { processBatch } from '@/lib/engines/pipeline/worker';

export const maxDuration = 300;

/** Every few minutes: claim and process a batch of due runs. Optional ?limit=1..50. */
async function handle(req: Request): Promise<Response> {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const db = getSql();
  if (!db.ok) return notConfigured(db.missing);
  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get('limit') ?? 20) || 20));
  try {
    const report = await processBatch(db.sql, { limit, deadlineMs: 240_000 });
    return Response.json({ status: 'ok', ...report });
  } catch (err) {
    return cronError(err);
  }
}

export const GET = handle;
export const POST = handle;
