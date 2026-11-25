import { pollCloudflare } from '@/lib/engines/crawlers/cloudflare';
import { checkCronAuth, cronError, notConfigured } from '@/lib/engines/pipeline/cron';
import { getSql } from '@/lib/engines/pipeline/db';

export const maxDuration = 300;

/** Hourly: Cloudflare GraphQL AI-crawler analytics into crawler_hits. */
async function handle(req: Request): Promise<Response> {
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
