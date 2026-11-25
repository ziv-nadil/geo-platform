import { auditEvent, checkOrigin, json, notConfiguredResponse, rateLimited, requireOrgAccess } from '@/lib/server/auth';
import { generateReport } from '@/lib/server/reports/generate';

export const maxDuration = 60;

/** POST /api/reports  body { orgId, from, to, title? } (member+) -> { reportId } */
export async function POST(request: Request) {
  const bad = checkOrigin(request);
  if (bad) return bad;
  const b = (await request.json().catch(() => null)) as { orgId?: string; from?: string; to?: string; title?: string } | null;
  const auth = await requireOrgAccess(b?.orgId ?? '', 'member');
  if (!auth.ok) return auth.response;
  if (rateLimited(`report:${auth.orgId}`, 10, 60_000)) return json({ error: 'rate_limited' }, 429);
  const r = await generateReport({ orgId: auth.orgId, userId: auth.userId, from: b?.from ?? '', to: b?.to ?? '', title: b?.title });
  if (!r.ok) return r.error === 'not_configured' ? notConfiguredResponse(r.missing ?? []) : json({ error: r.error }, r.error === 'not_found' ? 404 : 400);
  await auditEvent({ orgId: auth.orgId, caller: auth, action: 'report.generated', targetType: 'report', targetId: r.reportId, metadata: { from: b?.from ?? null, to: b?.to ?? null } });
  return json({ reportId: r.reportId });
}
