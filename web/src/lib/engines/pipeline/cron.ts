import { timingSafeEqual } from 'node:crypto';

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Missing CRON_SECRET = not_configured
 * (503), never an open endpoint.
 */
export function checkCronAuth(req: Request): Response | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ status: 'not_configured', missing: ['CRON_SECRET'] }, { status: 503 });
  const got = req.headers.get('authorization') ?? '';
  const want = `Bearer ${secret}`;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ status: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export function notConfigured(missing: string[]): Response {
  return Response.json({ status: 'not_configured', missing }, { status: 503 });
}

export function cronError(err: unknown): Response {
  // No stack traces or connection strings in responses.
  const msg = err instanceof Error ? err.message.replace(/postgres(ql)?:\/\/\S+/gi, '[db-url]').slice(0, 300) : 'error';
  console.error('[cron]', msg);
  return Response.json({ status: 'error', error: msg }, { status: 500 });
}
