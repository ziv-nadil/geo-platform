import { json, notConfiguredResponse, requireOrgAccess, isUuid } from '@/lib/server/auth';
import { withService } from '@/lib/server/db';
import { createSupabaseAdminClient } from '@/lib/server/supabase/admin';
import { ownedPath } from '@/lib/server/storage-path';

const TABLES = new Set(['kpis', 'engines', 'trend', 'gaps', 'competitor_movers']);

/** GET /api/reports/:id/download?format=pdf|csv&table=<name> (viewer+) -> 307 to a 60s signed URL in the private bucket. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return json({ error: 'not_found' }, 404);
  const [rep] = await withService((sql) => sql`select org_id, storage_path, status::text as status from public.reports where id = ${id}`);
  if (!rep) return json({ error: 'not_found' }, 404);
  const auth = await requireOrgAccess(rep.org_id as string, 'viewer');
  if (!auth.ok) return auth.response;
  if (rep.status !== 'succeeded' || !rep.storage_path) return json({ error: 'not_ready' }, 409);
  const base = ownedPath(rep.org_id as string, rep.storage_path);
  if (!base) return json({ error: 'not_found' }, 404);

  const url = new URL(request.url);
  const csv = url.searchParams.get('format') === 'csv';
  const table = url.searchParams.get('table') ?? 'kpis';
  if (csv && !TABLES.has(table)) return json({ error: 'invalid_table' }, 400);
  const file = csv ? `${table}.csv` : 'report.pdf';
  const admin = createSupabaseAdminClient();
  if (!admin) return notConfiguredResponse(['SUPABASE_SECRET_KEY']);
  const { data, error } = await admin.storage.from('reports').createSignedUrl(`${base}/${file}`, 60, { download: `beacon-${csv ? table : 'report'}.${csv ? 'csv' : 'pdf'}` });
  if (error || !data) return json({ error: 'not_found' }, 404);
  return Response.redirect(data.signedUrl, 307);
}
