import { checkCronAuth, cronError, notConfigured } from '@/lib/engines/pipeline/cron';
import { getSql } from '@/lib/engines/pipeline/db';
import { runAlerts } from '@/lib/server/notify/alerts';

export const maxDuration = 300;

async function handle(req: Request): Promise<Response> {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const db = getSql();
  if (!db.ok) return notConfigured(db.missing);
  try {
    return Response.json({ status: 'ok', ...(await runAlerts(db.sql)) });
  } catch (err) {
    return cronError(err);
  }
}

export const GET = handle;
export const POST = handle;
