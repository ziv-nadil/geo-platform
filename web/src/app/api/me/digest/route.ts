import { checkOrigin, json, requireUser } from '@/lib/server/auth';
import { withService } from '@/lib/server/db';

/** GET/PUT /api/me/digest: the caller's weekly-digest opt-out. PUT body { optOut: boolean }. */
export async function GET() {
  const a = await requireUser();
  if (!a.ok) return a.response;
  const [p] = await withService((sql) => sql`select digest_opt_out from public.profiles where id = ${a.userId}`);
  return json({ optOut: !!p?.digest_opt_out });
}

export async function PUT(request: Request) {
  const bad = checkOrigin(request);
  if (bad) return bad;
  const a = await requireUser();
  if (!a.ok) return a.response;
  const b = (await request.json().catch(() => null)) as { optOut?: unknown } | null;
  const optOut = b?.optOut;
  if (typeof optOut !== "boolean") return json({ error: 'invalid_request' }, 400);
  await withService((sql) => sql`update public.profiles set digest_opt_out = ${optOut} where id = ${a.userId}`);
  return json({ optOut });
}
