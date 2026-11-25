import { checkCronAuth, cronError, notConfigured } from '@/lib/engines/pipeline/cron';
import { getSql } from '@/lib/engines/pipeline/db';
import { runDigest } from '@/lib/server/notify/digest';

export const maxDuration = 300;

async function handle(req: Request): Promise<Response> {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const missing = process.env.RESEND_API_KEY?.trim() ? [] : ['RESEND_API_KEY'];
  if (missing.length) return notConfigured(missing);
  const db = getSql();
  if (!db.ok) return notConfigured(db.missing);
  try {
    return Response.json({ status: 'ok', ...(await runDigest(db.sql)) });
  } catch (err) {
    return cronError(err);
  }
}

export const GET = handle;
export const POST = handle;
