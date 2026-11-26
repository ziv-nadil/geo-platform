import { withService } from '@/lib/server/db';
import { indexNowKey } from '@/lib/server/indexing';

/** IndexNow key file. Serve it at https://<client-host>/<key>.txt (proxy or file in their repo). Returns the key if it belongs to a known org. */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const k = key.replace(/\.txt$/, '');
  if (!/^[a-f0-9]{32}$/.test(k) || !indexNowKey('x')) return new Response('Not found', { status: 404 });
  const orgs = await withService((sql) => sql`select id from public.organizations`);
  const hit = orgs.some((o) => indexNowKey(o.id as string) === k);
  return hit ? new Response(k, { headers: { 'content-type': 'text/plain; charset=utf-8' } }) : new Response('Not found', { status: 404 });
}
