import 'server-only';
import { withService } from '../db';
import { createSupabaseAdminClient } from '../supabase/admin';
import { reportTables, toCsv, validPeriod } from '@/lib/reports/aggregate';
import { collectReport } from './collect';
import { renderReportPdf } from './pdf';

export type GenerateResult = { ok: true; reportId: string } | { ok: false; error: string; missing?: string[] };

/** Build, persist (reports row) and store (private `reports` bucket: pdf + one CSV per table) a client report. */
export async function generateReport(args: { orgId: string; userId: string | null; from: string; to: string; title?: string }): Promise<GenerateResult> {
  const v = validPeriod(args.from, args.to);
  if (!v.ok) return { ok: false, error: v.error };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: 'not_configured', missing: ['SUPABASE_SECRET_KEY'] };

  const org = await withService(async (sql) => (await sql`select name from public.organizations where id = ${args.orgId}`)[0] as { name: string } | undefined);
  if (!org) return { ok: false, error: 'not_found' };
  const title = (args.title?.trim() || `Visibility report ${args.from} – ${args.to}`).slice(0, 120);

  const reportId = await withService(async (sql) => {
    const [r] = await sql`
      insert into public.reports (org_id, title, report_type, period_start, period_end, status, created_by)
      values (${args.orgId}, ${title}, 'visibility', ${args.from}, ${args.to}, 'running', ${args.userId}) returning id`;
    return r.id as string;
  });

  try {
    const data = await withService((sql) => collectReport(sql, args.orgId, args.from, args.to));
    const base = `${args.orgId}/${reportId}`;
    const files: { path: string; body: Buffer | string; type: string }[] = [{ path: `${base}/report.pdf`, body: await renderReportPdf({ title, orgName: org.name, data }), type: 'application/pdf' }];
    for (const t of reportTables(data)) files.push({ path: `${base}/${t.name}.csv`, body: toCsv(t), type: 'text/csv' });
    for (const f of files) {
      const { error } = await admin.storage.from('reports').upload(f.path, f.body, { contentType: f.type, upsert: true });
      if (error) throw new Error(`storage: ${error.message}`);
    }
    await withService((sql) => sql`update public.reports set status = 'succeeded', storage_path = ${base}, data = ${sql.json(data as never)} where id = ${reportId}`);
    return { ok: true, reportId };
  } catch (e) {
    await withService((sql) => sql`update public.reports set status = 'failed' where id = ${reportId}`).catch(() => undefined);
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : 'error' };
  }
}
